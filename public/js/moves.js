/**
 * FirePath — Moves
 * =================
 * One place that decides what's worth showing a person. Every page that suggests a
 * next step (free calculator, Journey, Strategy, Learn, tools, articles) asks this
 * file instead of keeping its own rules.
 *
 *   const s = FirePathMoves.situationFromProfile(profile);   // or situationFromInputs({...})
 *   const { moves } = FirePathMoves.rank(s);                 // best first, max 3 by default
 *
 * A "move" is something that would genuinely improve this person's outcome. Each one
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
    out.yearsToFree = out.alreadyFree ? 0 : yearsTo(freedomNumber, out.accessibleSavings, s.savingsMonthly || 0, REAL);
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
    { id: 'clear-debt', tier: 1, title: 'Clear high-interest debt first', plan: 'Free',
      tool: { href: '/hearmeout?scenario=loan', label: 'Model paying it off' }, article: 'debt-vs-invest',
      applies(s) {
        if (!(s.consumerDebt > 0) || s.alreadyFree) return false;
        return { why: `Cards and personal loans usually cost 15–20% a year — more than any investment reliably earns. Paying off your ${money(s.consumerDebt)} is a guaranteed return.`,
          impact: { text: 'A guaranteed 15–20% return on every dollar' } };
      } },
    { id: 'build-buffer', tier: 2, title: 'Build a three-month cash buffer', plan: 'Free',
      tool: null, article: null,
      applies(s) {
        if (s.alreadyFree || !(s.spendMonthly > 0)) return false;
        const short = s.emergencyFund === false || (s.bufferMonths != null && s.bufferMonths < 3);
        if (!short) return false;
        const target = s.spendMonthly * 3;
        return { why: `About three months of spending (${money(target)}) in an easy-to-reach account means a surprise bill or job loss never forces you to sell investments at a bad time.`,
          impact: { text: `Target: ${money(target)}` } };
      } },
    { id: 'invest-idle-cash', tier: 3, title: 'Put idle cash to work', plan: 'Free',
      tool: { href: '/firepath', label: 'Compare bank vs investing' }, article: 'what-is-an-index-fund',
      applies(s) {
        if (s.alreadyFree || s.consumerDebt > 0) return false;                 // debt first
        if (!['cash', 'mix', 'offset'].includes(s.savingsType)) return false; // already invested
        if (s.savingsType === 'offset') return false;                          // offset vs invest is its own move
        if (s.bufferMonths != null && s.bufferMonths < 3) return false;        // buffer first
        const now = yearsTo(s.freedomNumber, s.currentSavings, s.savingsMonthly || 0, rateFor(s.savingsType));
        const inv = yearsTo(s.freedomNumber, s.currentSavings, s.savingsMonthly || 0, REAL);
        if (inv == null) return false;
        const gain = now == null ? null : now - inv;
        if (gain != null && gain < 0.25) return false;
        return { why: 'Money in the bank barely keeps up with inflation. Above your buffer, investing in a diversified fund has historically grown far faster over the long run.',
          impact: gain == null ? { text: 'Turns "out of reach" into a real date' } : { years: gain, text: `${yearsText(gain)} than keeping it all in the bank` } };
      } },
    { id: 'start-saving', tier: 3, title: 'Start with a small, automatic amount', plan: 'Free',
      tool: { href: '/hearmeout', label: 'See what $50 a week grows into' }, article: 'good-savings-rate',
      applies(s) {
        if (s.alreadyFree || s.savingsMonthly > 0 || s.consumerDebt > 0 || (s.age != null && s.age >= 60)) return false;
        return { why: 'Even a small amount, set up to move automatically on payday, gets compounding started — and builds the habit that matters most.',
          impact: { text: 'The first step to a real date' } };
      } },
    { id: 'save-more', tier: 4, title: 'Save a little more each week', plan: 'Free',
      tool: { href: '/hearmeout', label: 'Try different amounts' }, article: 'extra-50-a-week-impact',
      applies(s) {
        if (s.alreadyFree || !(s.savingsMonthly > 0) || s.consumerDebt > 0) return false;
        const base = s.yearsToFree;
        const more = yearsTo(s.freedomNumber, s.currentSavings, s.savingsMonthly + 50 * 52 / 12, REAL);
        if (more == null) return false;
        const gain = base == null ? null : base - more;
        if (gain != null && gain < 0.25) return false;
        return { why: 'An extra $50 a week, invested, compounds alongside everything else you\'re saving.',
          impact: gain == null ? { text: 'Turns "out of reach" into a real date' } : { years: gain, text: `$50 a week more: ${yearsText(gain)}` } };
      } },
    { id: 'spend-less', tier: 4, title: 'Trim spending by 10%', plan: 'Free',
      tool: { href: '/firepath', label: 'Try it in the calculator' }, article: 'how-much-is-enough',
      applies(s) {
        if (s.alreadyFree || !(s.spendMonthly > 0) || s.consumerDebt > 0) return false;
        const cut = s.spendMonthly * 0.1;
        const after = yearsTo(s.freedomNumber * 0.9, s.currentSavings, (s.savingsMonthly || 0) + cut, REAL);
        if (after == null) return false;
        const gain = s.yearsToFree == null ? null : s.yearsToFree - after;
        if (gain != null && gain < 0.25) return false;
        return { why: 'Spending less works twice: more to invest now, and a smaller number to reach.',
          impact: gain == null ? { text: 'Turns "out of reach" into a real date' } : { years: gain, text: `${money(cut)} a month less: ${yearsText(gain)}` } };
      } },
    { id: 'salary-sacrifice', tier: 5, title: 'Salary sacrifice into super', plan: 'Pro',
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
        return { why: `On your ${Math.round(s.marginalRate * 100)}% tax rate, money sacrificed into super is taxed at 15% instead. It's locked until 60, so it suits money you won't need before then.`,
          impact: { dollars: better, text: `$5,000 a year sacrificed: about ${money(better)} less tax` } };
      } },
    { id: 'offset-vs-invest', tier: 5, title: 'Offset account or invest?', plan: 'Pro',
      tool: { href: '/tax_pro', label: 'Compare for your rate' }, article: 'debt-vs-invest',
      applies(s) {
        if (s.housing !== 'mortgage' || !(s.mortgageRemaining > 0) || s.alreadyFree) return false;
        return { why: 'Every dollar in an offset saves your mortgage rate, tax-free and guaranteed. Investing may earn more over time, with more ups and downs — it depends on your tax rate.',
          impact: { text: 'A guaranteed return vs a higher expected one' } };
      } },
    { id: 'work-less', tier: 6, title: 'You may be able to work less', plan: 'Free',
      tool: { href: '/freedom-gap', label: 'See your freedom gap' }, article: 'what-is-coast-fire',
      applies(s) {
        if (s.alreadyFree || s.age == null || s.age >= 65 || !(s.currentSavings > 0)) return false;
        const grown = E().projectPortfolio(s.currentSavings, 0, 65 - s.age, REAL);
        if (grown < s.freedomNumber) return false;
        return { why: 'Your savings would reach your number by 65 even if you never added another dollar — so part-time work could cover today\'s costs.',
          impact: { text: 'Coast FIRE: no more saving needed for 65' } };
      } },
    { id: 'bridge-to-60', tier: 6, title: 'Plan the years before super unlocks', plan: 'Free',
      tool: { href: '/freedom-gap', label: 'Model the gap' }, article: 'before-super-access',
      applies(s) {
        if (s.age == null || s.age >= 60 || !(s.superBalance > 0) || s.freedomAge == null || s.freedomAge >= 60) return false;
        return { why: s.alreadyFree
            ? `You've reached your number at ${Math.round(s.age)}, before super unlocks at 60 — so your savings outside super need to carry you until then.`
            : `You could be free around ${Math.round(s.freedomAge)}, before super unlocks at 60 — so your savings outside super need to carry you until then.`,
          impact: { text: `${Math.round(60 - s.freedomAge)} years to bridge` } };
      } },
    { id: 'stress-test', tier: 7, title: 'Stress-test your withdrawals', plan: 'Free',
      tool: { href: '/withdrawal', label: 'Run the stress test' }, article: 'four-percent-rule-australia',
      applies(s) {
        const close = s.alreadyFree || (s.yearsToFree != null && s.yearsToFree <= 10) || (s.age != null && s.age >= 55);
        if (!close || !(s.currentSavings > 0)) return false;
        return { why: 'Markets don\'t return the average every year. Check your plan survives a bad run in the first years of drawing down.',
          impact: { text: 'Odds across 2,000 market futures' } };
      } },
    { id: 'age-pension', tier: 7, title: 'Count the Age Pension', plan: 'Free',
      tool: { href: '/freedom-gap', label: 'See what it adds' }, article: 'is-my-super-enough',
      applies(s) {
        if (s.age == null || s.age < 55) return false;
        if (!has('calculateAgePension')) return { why: 'From 67, the Age Pension can top up what your savings pay.', impact: { text: 'Means-tested from 67' } };
        const assets = (s.currentSavings || 0) + (s.superBalance || 0) + (s.partnerSuper || 0);
        const p = calculateAgePension(assets, 0, s.housing !== 'renting', s.hasPartner).annualPension;
        if (!(p > 0)) return false;
        return { why: 'At 67, the Age Pension can top up what your savings pay — and it\'s means-tested on what you have then.',
          impact: { dollars: p, text: `About ${money(p)} a year on today's figures` } };
      } },
    { id: 'spouse-contribution', tier: 8, title: 'Boost your partner\'s super', plan: 'Pro',
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

  return { MOVES, situationFromInputs, situationFromProfile, rank, articleFits, yearsTo, remember, recall, forget };
})();
