/**
 * FirePath — Moves
 * =================
 * One place that decides what's worth showing a person. Every page that suggests a
 * next step (free calculator, Journey, Strategy, Learn, tools, articles) asks this
 * file instead of keeping its own rules.
 *
 *   const s = FirePathMoves.situationFromProfile(profile);   // or situationFromInputs({...})
 *   const { moves } = FirePathMoves.rank(s);                 // biggest modelled effect first, max 3 by default
 *   const p = FirePathMoves.plan(s, statuses);               // Pro journey: open / done / dismissed + progress
 *
 * A "move" is an option that the maths says would change this person's numbers. Pages
 * present them as general information ("here's what each change would do"), never as
 * instructions or "best for you" — titles describe the option, not a command. Each one
 * says when it applies, when it must NEVER be shown, its impact (years sooner or
 * dollars, worked out with the real maths), a tool to model it and an article to
 * understand it. Moves follow a sensible order — high-interest debt, then a cash
 * buffer, then investing idle cash, saving more, tax and super, then planning the
 * drawdown — and anything with no real benefit for this person isn't shown.
 *
 * Needs js/financial-engine.js. Uses js/tax-engine.js and js/calculations.js when the
 * page loads them (tax moves are skipped without them). Pure: no network, no DOM.
 */
window.FirePathMoves = (function () {
  const E = () => window.FirePathEngine;
  const has = name => typeof window[name] === 'function';
  const REAL = 0.07;

  // ── The person's situation ────────────────────────────────
  // All money is household, in today's dollars. Monthly unless named otherwise.
  // Unknowns stay null — a rule that needs a fact we don't have doesn't fire.
  function finish(s) {
    const spendMonthly = s.takeHomeMonthly != null && s.savingsMonthly != null ? Math.max(0, s.takeHomeMonthly - s.savingsMonthly) : null;
    const mult = s.retirementSpendMultiplier || 1;
    const freedomNumber = s.freedomNumber || (spendMonthly != null ? spendMonthly * 12 * mult * 25 : null);
    const out = Object.assign({}, s, { spendMonthly, freedomNumber });
    // What they can actually spend from: savings, plus super once its owner is 60.
    out.accessibleSavings = (s.currentSavings || 0)
      + (s.age != null && s.age >= 60 ? (s.superBalance || 0) : 0)
      + (s.hasPartner && (s.partnerAge != null ? s.partnerAge : s.age) >= 60 ? (s.partnerSuper || 0) : 0);
    out.alreadyFree = freedomNumber > 0 && out.accessibleSavings >= freedomNumber;
    out.savingsRate = s.takeHomeMonthly > 0 && s.savingsMonthly != null ? s.savingsMonthly / s.takeHomeMonthly : null;
    // On the shared plan when the engine has it, so "years sooner" matches the headline date.
    out.yearsToFree = out.alreadyFree ? 0 : yearsOr(out, null, () => yearsTo(freedomNumber, out.accessibleSavings, s.savingsMonthly || 0, REAL));
    out.freedomAge = s.age != null && out.yearsToFree != null ? s.age + out.yearsToFree : null;
    out.stage = out.alreadyFree ? 'free'
      : !(s.savingsMonthly > 0) && !(s.currentSavings > 0) ? 'starting'
      : out.yearsToFree != null && out.yearsToFree <= 10 ? 'close'
      : 'building';
    out.bufferMonths = spendMonthly > 0 && s.cashSavings != null ? s.cashSavings / spendMonthly : null;
    out.marginalRate = s.grossIncome > 0 && has('calculateMarginalRate') ? calculateMarginalRate(s.grossIncome) : null;
    return out;
  }

  // From the free calculator (or any tool) — the person's own typed numbers.
  function situationFromInputs(i) {
    i = i || {};
    const num = v => (v === '' || v == null || isNaN(+v)) ? null : +v;
    const s = {
      age: num(i.age), takeHomeMonthly: num(i.takeHomeMonthly), savingsMonthly: num(i.savingsMonthly),
      currentSavings: num(i.currentSavings) || 0, savingsType: i.savingsType || null,
      superBalance: num(i.superBalance) || 0, partnerSuper: num(i.partnerSuper) || 0,
      hasPartner: !!i.hasPartner, partnerAge: num(i.partnerAge), partnerTakeHomeMonthly: num(i.partnerTakeHomeMonthly),
      dependants: num(i.dependants) || 0, housing: normaliseHousing(i.housing, num(i.mortgageRemaining)),
      mortgageRemaining: num(i.mortgageRemaining) || 0, consumerDebt: num(i.consumerDebt) || 0,
      consumerDebtKnown: num(i.consumerDebt) != null,   // a blank debt field is unknown, not "no debt"
      emergencyFund: typeof i.emergencyFund === 'boolean' ? i.emergencyFund : null,
      retirementSpendMultiplier: num(i.retirementSpendMultiplier) || 1, freedomNumber: num(i.freedomNumber),
      persona: i.persona || null,
    };
    s.cashSavings = s.savingsType === 'cash' ? s.currentSavings : s.savingsType === 'mix' ? s.currentSavings / 3 : null;
    s.grossIncome = num(i.grossIncome) || ownGross(s);
    return finish(s);
  }

  // From a Pro member's saved plan (fp_profiles row — see saveProfile in firepath_pro.html).
  function situationFromProfile(p) {
    p = p || {};
    const cycleToMonthly = (v, cycle) => !v ? 0 : cycle === 'weekly' ? v * 52 / 12 : cycle === 'fortnightly' ? v * 26 / 12 : v;
    return situationFromInputs({
      age: p.age, takeHomeMonthly: p.take_home_income, savingsMonthly: p.savings_monthly,
      currentSavings: p.current_savings, savingsType: p.savings_type, superBalance: p.super_balance,
      partnerSuper: p.partner_super, hasPartner: !!(p.partner_age || p.partner_income > 0 || p.partner_super > 0),
      partnerAge: p.partner_age, partnerTakeHomeMonthly: cycleToMonthly(p.partner_income, p.pay_cycle),
      dependants: p.dependants, housing: p.housing_status, mortgageRemaining: p.mortgage_remaining,
      consumerDebt: p.debt_total, emergencyFund: p.has_emergency_fund,
      retirementSpendMultiplier: p.retirement_spend_multiplier, freedomNumber: p.freedom_number,
      grossIncome: p.gross_income, persona: p.persona,
    });
  }

  function normaliseHousing(h, mortgage) {
    const v = String(h || '').toLowerCase();
    if (/rent/.test(v)) return 'renting';
    if (/own|mortgage|buy/.test(v)) return mortgage > 0 || /mortgage/.test(v) ? 'mortgage' : 'owner';
    if (mortgage > 0) return 'mortgage';
    return v ? 'other' : null;
  }

  // The person's own gross pay (household take-home less the partner's share).
  function ownGross(s) {
    if (!has('estimateGrossFromNet') || !(s.takeHomeMonthly > 0)) return null;
    const own = Math.max(0, s.takeHomeMonthly - (s.partnerTakeHomeMonthly || 0)) * 12;
    return own > 0 ? estimateGrossFromNet(own) : null;
  }

  // Years until savings pay the target at `rate` (real). null = more than 100 years.
  function yearsTo(target, start, monthly, rate) {
    if (!(target > 0)) return null;
    if (start >= target) return 0;
    if (!(monthly > 0) && !(start > 0 && rate > 0)) return null;
    const r = Math.pow(1 + rate, 1 / 12) - 1;
    let bal = start;
    for (let m = 1; m <= 1200; m++) { bal = bal * (1 + r) + monthly; if (bal >= target) return m / 12; }
    return null;
  }

  // The same plan every page's headline uses (FirePathEngine.freedomPlan: savings outside
  // super, then super from 60, after tax), built from the situation. `over` changes some
  // of its inputs for a "what if". undefined = the engine (or a usable number) isn't
  // there, so callers fall back to the simple yearsTo timeline.
  function planYears(s, over) {
    const eng = E();
    if (!eng || typeof eng.freedomPlan !== 'function' || !(s.freedomNumber > 0)) return undefined;
    const ownTakeHome = s.takeHomeMonthly != null ? Math.max(0, s.takeHomeMonthly - (s.partnerTakeHomeMonthly || 0)) : null;
    const inputs = Object.assign({
      age: s.age, savings: s.currentSavings || 0, monthlySavings: s.savingsMonthly || 0, target: s.freedomNumber,
      superBalance: s.superBalance || 0, grossIncome: s.grossIncome || null, takeHomeMonthly: ownTakeHome,
      partner: s.hasPartner && s.partnerSuper > 0 ? { superBalance: s.partnerSuper, age: s.partnerAge, takeHomeMonthly: s.partnerTakeHomeMonthly || 0 } : null,
    }, over || {});
    let p = null;
    try { p = eng.freedomPlan(inputs); } catch (e) { return undefined; }
    return p && p.valid ? p.years : undefined;
  }
  function yearsOr(s, over, fallback) { const y = planYears(s, over); return y !== undefined ? y : fallback(); }

  const rateFor = type => {
    const A = window.FP_ASSUMPTIONS || {};
    return type === 'cash' ? (A.bankRealReturn != null ? A.bankRealReturn : 0.0087)
      : type === 'offset' ? (A.offsetRealReturn != null ? A.offsetRealReturn : 0.022)
      : type === 'mix' ? (A.mixRealReturn != null ? A.mixRealReturn : 0.034)
      : REAL;
  };
  const yearsText = y => y >= 1 ? `${Math.round(y * 10) / 10} years sooner` : `${Math.max(1, Math.round(y * 12))} months sooner`;
  const money = n => '$' + Math.round(n).toLocaleString('en-AU');

  // ── The moves ─────────────────────────────────────────────
  // tier: the sensible order to tackle things in (lower first).
  // applies(s) → false, or { impact: { years? , dollars?, text } , why }.
  // Free tools need no account; Pro ones are marked so pages can label them.
  const MOVES = [
    { id: 'clear-debt', tier: 1, title: 'Paying off high-interest debt', plan: 'Free',
      tool: { href: '/hearmeout?scenario=loan', label: 'See what paying it off does' }, article: 'debt-vs-invest',
      applies(s) {
        if (!(s.consumerDebt > 0) || s.alreadyFree) return false;
        return { why: `Cards and personal loans usually cost 15–20% a year, which is more than investing reliably earns. Every dollar of your ${money(s.consumerDebt)} you pay off saves that interest, guaranteed.`,
          impact: { text: 'Each dollar paid off saves the 15–20% a year it would cost in interest' } };
      } },
    { id: 'build-buffer', tier: 2, title: 'Having a three-month cash buffer', plan: 'Free',
      tool: null, article: null,
      applies(s) {
        if (s.alreadyFree || !(s.spendMonthly > 0)) return false;
        const short = s.emergencyFund === false || (s.bufferMonths != null && s.bufferMonths < 3);
        if (!short) return false;
        const target = s.spendMonthly * 3;
        return { why: `About three months of spending (${money(target)}) in an easy-to-reach account means a surprise bill or job loss won’t force you to sell investments at a bad time.`,
          impact: { text: `Three months of spending: about ${money(target)}` } };
      } },
    { id: 'invest-idle-cash', tier: 3, title: 'Investing cash you don’t need soon', plan: 'Free',
      tool: { href: '/firepath', label: 'Compare bank vs investing' }, article: 'what-is-an-index-fund',
      applies(s) {
        if (s.alreadyFree || s.consumerDebt > 0) return false;                 // debt first
        if (!['cash', 'mix', 'offset'].includes(s.savingsType)) return false; // already invested
        if (s.savingsType === 'offset') return false;                          // offset vs invest is its own move
        if (s.bufferMonths != null && s.bufferMonths < 3) return false;        // buffer first
        const now = yearsOr(s, { outsideReturn: rateFor(s.savingsType) }, () => yearsTo(s.freedomNumber, s.currentSavings, s.savingsMonthly || 0, rateFor(s.savingsType)));
        const inv = yearsOr(s, null, () => yearsTo(s.freedomNumber, s.currentSavings, s.savingsMonthly || 0, REAL));
        if (inv == null) return false;
        const gain = now == null ? null : now - inv;
        if (gain != null && gain < 0.25) return false;
        return { why: 'Money in the bank barely keeps up with prices. Past your buffer, a diversified fund has grown far faster over the long run in the past.',
          impact: gain == null ? { text: 'Could turn "out of reach" into a real date' } : { years: gain, text: `Could mean reaching your number ${yearsText(gain)} than keeping it all in the bank` } };
      } },
    { id: 'start-saving', tier: 3, title: 'Starting with a small, automatic amount', plan: 'Free',
      tool: { href: '/hearmeout', label: 'See what $50 a week grows into' }, article: 'good-savings-rate',
      applies(s) {
        if (s.alreadyFree || s.savingsMonthly > 0 || s.consumerDebt > 0 || (s.age != null && s.age >= 60)) return false;
        return { why: 'Even a small amount, set up to move automatically on payday, gets compounding going. It builds the habit, too.',
          impact: { text: 'A first step towards a real date' } };
      } },
    { id: 'save-more', tier: 4, title: 'Saving a little more each week', plan: 'Free',
      tool: { href: '/hearmeout', label: 'Try different amounts' }, article: 'extra-50-a-week-impact',
      applies(s) {
        if (s.alreadyFree || !(s.savingsMonthly > 0) || s.consumerDebt > 0) return false;
        const base = s.yearsToFree;
        const more = yearsOr(s, { monthlySavings: s.savingsMonthly + 50 * 52 / 12 }, () => yearsTo(s.freedomNumber, s.currentSavings, s.savingsMonthly + 50 * 52 / 12, REAL));
        if (more == null) return false;
        const gain = base == null ? null : base - more;
        if (gain != null && gain < 0.25) return false;
        return { why: 'An extra $50 a week, invested, grows along with everything else you’re saving.',
          impact: gain == null ? { text: 'Could turn "out of reach" into a real date' } : { years: gain, text: `$50 a week more could mean reaching your number ${yearsText(gain)}` } };
      } },
    { id: 'spend-less', tier: 4, title: 'Spending 10% less', plan: 'Free',
      tool: { href: '/firepath', label: 'Try it in the calculator' }, article: 'how-much-is-enough',
      applies(s) {
        if (s.alreadyFree || !(s.spendMonthly > 0) || s.consumerDebt > 0) return false;
        const cut = s.spendMonthly * 0.1;
        const after = yearsOr(s, { target: s.freedomNumber * 0.9, monthlySavings: (s.savingsMonthly || 0) + cut }, () => yearsTo(s.freedomNumber * 0.9, s.currentSavings, (s.savingsMonthly || 0) + cut, REAL));
        if (after == null) return false;
        const gain = s.yearsToFree == null ? null : s.yearsToFree - after;
        if (gain != null && gain < 0.25) return false;
        return { why: 'Spending less works twice: more to invest now, and a smaller number to reach.',
          impact: gain == null ? { text: 'Could turn "out of reach" into a real date' } : { years: gain, text: `${money(cut)} a month less could mean reaching your number ${yearsText(gain)}` } };
      } },
    { id: 'salary-sacrifice', tier: 5, title: 'Salary sacrificing into super', plan: 'Pro',
      tool: { href: '/tax_pro', label: 'Work out your numbers' }, article: 'salary-sacrifice-explained',
      applies(s) {
        if (s.alreadyFree || s.consumerDebt > 0 || !has('calculateSalarySacrifice')) return false;
        if (!(s.savingsMonthly > 0) || (s.bufferMonths != null && s.bufferMonths < 3)) return false;   // basics first
        if (s.age != null && s.age >= 67) return false;
        if (!(s.marginalRate >= 0.30)) return false;      // below ~30% the tax saving is small or nil
        const r = calculateSalarySacrifice(s.grossIncome, 5000);
        if (!r || r.capRoom < 1000) return false;          // employer super already fills the cap
        const better = r.taxSaved - r.superTax;
        if (better < 300) return false;
        return { why: `On your ${Math.round(s.marginalRate * 100)}% tax rate, money sacrificed into super is taxed at 15% instead. You can’t get to it until 60, so it’s money you won’t be able to use before then.`,
          impact: { dollars: better, text: `$5,000 a year sacrificed could mean about ${money(better)} less tax` } };
      } },
    { id: 'offset-vs-invest', tier: 5, title: 'Offset account vs investing', plan: 'Pro',
      tool: { href: '/tax_pro', label: 'Compare for your rate' }, article: 'debt-vs-invest',
      applies(s) {
        if (s.housing !== 'mortgage' || !(s.mortgageRemaining > 0) || s.alreadyFree) return false;
        return { why: 'Every dollar in an offset saves you your mortgage rate in interest, tax-free and guaranteed. Investing may earn more over time, with more ups and downs. It depends on your tax rate.',
          impact: { text: 'Guaranteed interest saved vs likely higher growth' } };
      } },
    { id: 'work-less', tier: 6, title: 'Working less could be an option', plan: 'Free',
      tool: { href: '/freedom-gap', label: 'See your freedom gap' }, article: 'what-is-coast-fire',
      applies(s) {
        if (s.alreadyFree || s.age == null || s.age >= 65 || !(s.currentSavings > 0)) return false;
        const grown = E().projectPortfolio(s.currentSavings, 0, 65 - s.age, REAL);
        if (grown < s.freedomNumber) return false;
        return { why: 'Your savings would reach your freedom number by 65 even if you never added another dollar. So part-time work could cover today’s costs.',
          impact: { text: 'On track for your number by 65 without saving more' } };
      } },
    { id: 'bridge-to-60', tier: 6, title: 'The years before you can use super', plan: 'Free',
      tool: { href: '/freedom-gap', label: 'See the gap' }, article: 'before-super-access',
      applies(s) {
        if (s.age == null || s.age >= 60 || !(s.superBalance > 0) || s.freedomAge == null || s.freedomAge >= 60) return false;
        return { why: s.alreadyFree
            ? `You've reached your number at ${Math.round(s.age)}, before you can get to your super at 60. Your savings outside super will need to carry you until then.`
            : `You could be free around ${Math.round(s.freedomAge)}, before you can get to your super at 60. Your savings outside super will need to carry you until then.`,
          impact: { text: `${Math.round(60 - s.freedomAge)} years to bridge` } };
      } },
    { id: 'stress-test', tier: 7, title: 'Whether your money will last', plan: 'Free',
      tool: { href: '/withdrawal', label: 'Open the Withdrawal planner' }, article: 'four-percent-rule-australia',
      applies(s) {
        const close = s.alreadyFree || (s.yearsToFree != null && s.yearsToFree <= 10) || (s.age != null && s.age >= 55);
        if (!close || !(s.currentSavings > 0)) return false;
        return { why: 'Markets don’t return the average every year. The Withdrawal planner shows whether your plan holds up if markets have a bad run in your first years of drawing down.',
          impact: { text: 'Odds across 2,000 possible market outcomes' } };
      } },
    { id: 'age-pension', tier: 7, title: 'What the Age Pension could add', plan: 'Free',
      tool: { href: '/freedom-gap', label: 'See what it adds' }, article: 'is-my-super-enough',
      applies(s) {
        if (s.age == null || s.age < 55) return false;
        if (!has('calculateAgePension')) return { why: 'From 67, the Age Pension may top up what your savings pay.', impact: { text: 'Means-tested from 67' } };
        const assets = (s.currentSavings || 0) + (s.superBalance || 0) + (s.partnerSuper || 0);
        // When this person reaches 67, is their partner 67 too? If not, only this person's
        // half of the couple rate is paid and the partner's super isn't counted yet.
        const partnerAt67 = s.partnerAge != null ? 67 + (s.partnerAge - s.age) : 67;
        const couple = s.hasPartner ? { partnerEligible: partnerAt67 >= 67, partnerSuper: s.partnerSuper || 0 } : undefined;
        const p = calculateAgePension(assets, 0, s.housing !== 'renting', s.hasPartner, undefined, couple).annualPension;
        if (!(p > 0)) return false;
        return { why: 'From 67, the Age Pension may top up what your savings pay. It’s means-tested on what you own and earn then.',
          impact: { dollars: p, text: `About ${money(p)} a year on today's figures` } };
      } },
    { id: 'spouse-contribution', tier: 8, title: 'Adding to your partner\'s super', plan: 'Pro',
      tool: { href: '/tax_pro', label: 'Check the offset' }, article: 'spouse-contribution-offset',
      applies(s) {
        if (!s.hasPartner || s.alreadyFree) return false;
        const partnerAnnual = (s.partnerTakeHomeMonthly || 0) * 12;
        if (!(partnerAnnual > 0) || partnerAnnual > 37000) return false;   // the offset phases out by ~$40k income
        return { why: 'If your partner earns under about $40,000, putting money into their super can earn you a tax offset of up to $540.',
          impact: { dollars: 540, text: 'Up to $540 tax offset' } };
      } },
  ];

  // ── Ranking ───────────────────────────────────────────────
  // Safety first (debt, buffer), then the biggest real impact, then the sensible order.
  function score(m) {
    const yrs = m.impact.years || 0;
    const dollarsAsYears = m.impact.dollars ? Math.min(2, m.impact.dollars / 3000) : 0;   // rough comparability
    return (m.tier <= 2 ? 1000 : 0) + (yrs + dollarsAsYears) * 10 - m.tier;
  }

  function rank(situation, opts) {
    const s = situation && situation.stage ? situation : situationFromInputs(situation);
    const limit = (opts && opts.limit) || 3;
    const all = [];
    for (const def of MOVES) {
      let res = false;
      try { res = def.applies(s); } catch (e) { res = false; }
      if (!res) continue;
      all.push({ id: def.id, title: def.title, plan: def.plan, tier: def.tier, tool: def.tool, article: def.article, why: res.why, impact: res.impact });
    }
    all.sort((a, b) => score(b) - score(a));
    return { situation: s, moves: all.slice(0, limit), all };
  }

  // ── Already done, going by the numbers ────────────────────
  // { moveId: reason } for moves the person's own figures show are already in place.
  // Conservative: a fact we don't have never counts as done.
  const INVESTED_TYPES = ['etfs'];          // savings held invested (not cash, offset or a mix)
  function autoDone(situation) {
    const s = situation && situation.stage ? situation : situationFromInputs(situation);
    const out = {};
    if (s.consumerDebtKnown && s.consumerDebt === 0) out['clear-debt'] = 'Your plan shows no high-interest debt';
    if (s.emergencyFund === true || (s.bufferMonths != null && s.bufferMonths >= 3)) out['build-buffer'] = 'Your plan shows a cash buffer of three months or more';
    if (s.savingsMonthly > 0) out['start-saving'] = 'Your plan shows you’re already saving each month';
    if (INVESTED_TYPES.includes(s.savingsType) && s.currentSavings > 0) out['invest-idle-cash'] = 'Your plan shows your savings are already invested';
    return out;
  }

  // ── Pro journey: where each option stands ─────────────────
  // statuses: { [moveId]: { status: 'doing'|'done'|'dismissed', done_at, updated_at } } (fp_moves rows).
  // Who wins, per move:  marked done → done · marked "Not for me" → dismissed ·
  // the numbers show it's done → done (auto) · applies now → open · otherwise not shown.
  // So a move marked done stays done even if it no longer applies; a "doing" or
  // dismissed move that no longer applies drops out (bringing it back would show nothing).
  // open keeps rank() order exactly; 'doing' is a flag for the page, not a re-sort.
  // opts.limit caps `open` only (default: all); progress always counts everything.
  function plan(situation, statuses, opts) {
    const s = situation && situation.stage ? situation : situationFromInputs(situation);
    const st = statuses || {};
    const statusOf = id => (st[id] && typeof st[id] === 'object' ? st[id] : null);
    const auto = autoDone(s);
    const ranked = rank(s, { limit: MOVES.length }).all;
    const applies = new Set(ranked.map(m => m.id));
    const open = [], done = [], dismissed = [];
    for (const def of MOVES) {
      const row = statusOf(def.id);
      const status = row && row.status;
      if (status === 'done') done.push({ id: def.id, title: def.title, auto: false, done_at: row.done_at || null });
      else if (status === 'dismissed' && applies.has(def.id)) dismissed.push({ id: def.id, title: def.title });
      // The numbers tick an option off only if the person was working on it ("On it"):
      // someone who never had a card debt hasn't "done" paying one off, so it isn't
      // counted as progress — it just doesn't apply to them.
      else if (status === 'doing' && auto[def.id]) done.push({ id: def.id, title: def.title, auto: true, reason: auto[def.id] });
    }
    const settled = new Set(done.map(d => d.id).concat(dismissed.map(d => d.id)));
    for (const m of ranked) {
      if (settled.has(m.id)) continue;
      const row = statusOf(m.id);
      open.push(Object.assign({}, m, { status: row && row.status === 'doing' ? 'doing' : null, updated_at: row && row.updated_at || null }));
    }
    // Most recently marked first; ones spotted from the numbers after, in the usual order.
    done.sort((a, b) => (a.auto - b.auto) || String(b.done_at || '').localeCompare(String(a.done_at || '')));
    const limit = opts && opts.limit > 0 ? opts.limit : open.length;
    return { situation: s, open: open.slice(0, limit), done, dismissed, progress: { done: done.length, total: open.length + done.length } };
  }

  // ── Articles: never recommend one that doesn't fit ────────
  // `tags` is an article's "for" metadata (src/content/learn, served at /learn/articles.json).
  // Unknown facts don't exclude — only a known mismatch does.
  function articleFits(tags, s) {
    if (!tags) return true;
    if (tags.ages && s.age != null && (s.age < tags.ages[0] || s.age > tags.ages[1])) return false;
    if (tags.housing && s.housing && s.housing !== 'other' && !tags.housing.includes(s.housing)) return false;
    if (tags.partner === true && s.hasPartner === false) return false;
    if (tags.partner === false && s.hasPartner === true) return false;
    if (tags.kids === true && !(s.dependants > 0)) return false;
    if (tags.minGross && s.grossIncome != null && s.grossIncome < tags.minGross) return false;
    if (tags.maxGross && s.grossIncome != null && s.grossIncome > tags.maxGross) return false;
    if (tags.maxSuper && s.superBalance != null && s.superBalance > tags.maxSuper) return false;
    return true;
  }

  // ── Free users: remember the situation on this device only ─
  const KEY = 'fp_situation';
  function remember(inputs) { try { localStorage.setItem(KEY, JSON.stringify(Object.assign({ savedAt: Date.now() }, inputs))); } catch (e) {} }
  function recall() { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && Date.now() - v.savedAt < 180 * 864e5 ? v : null; } catch (e) { return null; } }
  function forget() { try { localStorage.removeItem(KEY); } catch (e) {} }

  return { MOVES, situationFromInputs, situationFromProfile, rank, autoDone, plan, articleFits, yearsTo, planYears, remember, recall, forget };
})();
