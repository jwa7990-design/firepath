/**
 * FirePath — Financial Engine
 * =============================
 * Owns objective financial calculations only — "given these inputs, what are the
 * numbers." No opinion about which cards to show, what wording to use, or which
 * options are relevant to a given person — that's each page's own product logic,
 * built on top of what this file returns.
 *
 * Requires js/tax-engine.js to be loaded first (for calculateAgePension). Load
 * this file after it:
 *   <script src="js/tax-engine.js"></script>
 *   <script src="js/financial-engine.js"></script>
 *
 * Extracted from freedom-gap.html and freedom-options.html, which had independently
 * duplicated this same math — the real risk being that changing an assumption (the
 * 7% return rate, the 4% withdrawal rate) meant finding and updating it in more than
 * one place. This is now the single place that logic lives.
 */
 
window.FirePathEngine = (function () {
 
  function fmtM(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';   // NaN and ±Infinity too, never "$InfinityM"
    const sign = n < 0 ? '-' : '';
    const a = Math.abs(n);
    if (a >= 999500) return sign + '$' + (a / 1000000).toFixed(1) + 'M';   // 999,600 → $1.0M, not $1000K
    if (a >= 1000) return sign + '$' + Math.round(a / 1000) + 'K';
    return sign + '$' + Math.round(a);
  }
 
  // Rounds a raw hours-needed figure up to the nearest "nice" number people naturally
  // think in (2.5, 5, 7.5, 10, 15, 20...) rather than something like 11 or 17. Always
  // rounds UP so the figure stays conservative — never undersells what's actually needed.
  function niceHours(rawHours) {
    if (rawHours <= 0) return 0;
    const stepsUnder10 = [1, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10];
    const stepsOver10 = [15, 20, 25, 30, 35, 40];
    if (rawHours <= 10) { for (const step of stepsUnder10) { if (rawHours <= step) return step; } }
    for (const step of stepsOver10) { if (rawHours <= step) return step; }
    return Math.ceil(rawHours);
  }
 
  // The monthly rate that compounds to `annualRate` over a year. (annualRate / 12
  // compounds to more: 7% / 12 monthly is 7.23% a year, which overstates every projection.)
  function monthlyRate(annualRate) {
    return Math.pow(1 + annualRate, 1 / 12) - 1;
  }

  // Compounds a starting portfolio forward with ongoing monthly contributions.
  function projectPortfolio(startPortfolio, monthlySavings, years, rate) {
    rate = rate == null ? 0.07 : rate;
    let bal = startPortfolio;
    const r = monthlyRate(rate);
    for (let m = 0; m < Math.round(years * 12); m++) { bal = bal * (1 + r) + monthlySavings; }
    return bal;
  }
 
  // Months from now until a 4%-rule withdrawal off the growing portfolio covers
  // targetSpend — i.e. how long until this portfolio, on its own, funds the target
  // annual spend. Same growth/withdrawal assumptions as computeFreedomPicture (7%
  // default growth, 4% withdrawal), just solved month-by-month instead of at a single
  // point in time, since Journey and the Freedom Unlocked card need "how many months
  // from today" rather than "what does today look like."
  //
  // Was previously only defined as a page-local copy inside ask-firepath.html; every
  // other call site (journey.html, firepath_pro.html) already assumed it lived here.
  // Capped at 40 years out — returns null if the target still isn't reached by then,
  // same "don't pretend to know" convention as solveFreedomAge's 90-year ceiling.
  function solveMonthsToTarget(startPortfolio, monthlySavings, targetSpend, rate) {
    rate = rate == null ? 0.07 : rate;
    const r = monthlyRate(rate);
    let portfolio = startPortfolio;
    for (let m = 0; m <= 40 * 12; m++) {
      if (portfolio * 0.04 >= targetSpend) return m;
      portfolio = portfolio * (1 + r) + monthlySavings;
    }
    return null;
  }
 
  // Picks the single highest-value thing for this person to do next.
  //
  // When js/moves.js is loaded (window.FirePathMoves), this is just the top-ranked move
  // for this person, so Journey, Full Analysis and every other page agree. Pass the
  // person's fp_profiles row (or anything situationFromProfile accepts) as `profile`
  // for the full picture; without it, a minimal profile is built from the positional
  // arguments. The rules further down are only a fallback for pages that don't load
  // moves.js.
  //
  // Return shape (unchanged for older callers): { type, name | title, url | topic,
  // headline, reason }. type 'tool' → open `url`; type 'learn' → read `url` (an
  // article at /learn/<slug>) or, for legacy fallbacks without a url, the Learning Lab
  // `topic`/`track`. Moves also add { moveId, impact (text), article (slug) }.
  function recommendNextStep(savingsType, persona, sRate, superBal, debt, age, hasEmergencyFund, profile) {
    const M = typeof window !== 'undefined' ? window.FirePathMoves : null;
    if (M && typeof M.rank === 'function') {
      try {
        const p = profile || { savings_type: savingsType, persona, super_balance: superBal, debt_total: debt, age, has_emergency_fund: hasEmergencyFund };
        const s = p.stage ? p : M.situationFromProfile(p);
        const { moves } = M.rank(s);
        const top = moves[0];
        if (top) return fromMove(top);
        if (s.alreadyFree) return { type: 'tool', name: 'Open the Withdrawal planner', url: '/withdrawal', headline: 'See if your money will last.', reason: "You've reached your number. The Withdrawal planner shows how a plan holds up if markets have a bad run in the first years of drawing down.", impact: null };
      } catch (e) { /* fall through to the simple rules */ }
    }
    return legacyNextStep(savingsType, persona, sRate, superBal, debt, age, hasEmergencyFund);
  }

  function fromMove(m) {
    const base = { moveId: m.id, headline: m.title, reason: m.why, impact: m.impact && m.impact.text ? m.impact.text : null, article: m.article || null, plan: m.plan };
    if (m.tool) return Object.assign(base, { type: 'tool', name: m.tool.label, title: m.title, url: m.tool.href });
    if (m.article) return Object.assign(base, { type: 'learn', title: m.title, topic: m.article, url: '/learn/' + m.article });
    return Object.assign(base, { type: 'learn', title: m.title, topic: null, url: null });
  }

  // Simple rules for pages without moves.js. Questions go to tools or articles that
  // actually answer them (Ask FirePath can't model debt payoff or cash vs investing).
  function legacyNextStep(savingsType, persona, sRate, superBal, debt, age, hasEmergencyFund) {
    if (sRate === 0) return { type: 'learn', topic: 'what-is-fire', track: 'foundation', title: 'What is FIRE and is it realistic for me?', headline: 'See what FIRE could mean for you.', reason: 'An introduction to the idea, for anyone not saving yet.' };
    if (hasEmergencyFund === false) return { type: 'learn', topic: 'emergency-fund', track: 'foundation', title: 'Why an emergency fund comes before investing', headline: 'Why a cash buffer matters.', reason: 'You told us you don\'t have money set aside for emergencies yet. This looks at why some people build a buffer first, and the trade-offs.' };
    if (debt > 0) return { type: 'learn', topic: 'debt-vs-invest', url: '/learn/debt-vs-invest', title: 'Should I pay off debt or invest first?', headline: 'What paying off high-interest debt does.', reason: 'Cards and personal loans usually cost 15–20% a year, higher than the 7% long-run return assumed for shares. This looks at both sides.' };
    if (persona === 'fire') return { type: 'tool', name: 'Withdrawal planner', url: 'withdrawal.html', headline: 'See if your money will last.', reason: 'Shows how long savings could last once you stop working.' };
    if (superBal > 0 && age && age < 45) return { type: 'learn', topic: 'two-phase', track: 'foundation', title: 'Your savings now, your super at 60', headline: 'See how your savings and super fit together.', reason: `You can’t get to your super until 60. This shows how savings outside super could carry you until then.` };
    if (savingsType === 'cash') return { type: 'learn', topic: 'what-is-an-index-fund', url: '/learn/what-is-an-index-fund', title: 'What is an index fund?', headline: 'How index funds compare with cash.', reason: 'Money in the bank has roughly kept pace with inflation. This explains how index funds work, with their ups and downs.' };
    if (savingsType === 'etfs') return { type: 'tool', name: 'What if…?', url: 'hearmeout.html', headline: 'See what a bit more each month does for you.', reason: 'Try different saving amounts and see how each one moves your date.' };
    if (savingsType === 'offset') return { type: 'explore', name: 'What if…?', url: 'hearmeout.html?scenario=loan', headline: 'Compare your offset against investing.', reason: 'See what your offset saves you compared with investing the same money.' };
    if (savingsType === 'mix') return { type: 'learn', topic: 'diversification', track: '5', title: 'What diversification means', headline: 'Get to know what you’re holding.', reason: 'You’ve got a mix of savings, so this helps you think about what you’re holding and why.' };
    return { type: 'learn', topic: 'compounding', track: 'foundation', title: 'How compound interest works', headline: 'Get your head around compound interest.', reason: 'It’s the idea behind your freedom number.' };
  }
 
  // Finds the youngest age (from currentAge) at which portfolio income — plus the Age
  // Pension once age 67 is reached — covers targetSpend. Returns null if not reached by 90.
  // isCouple: use couple pension rates and limits (portfolio and spend are the couple's combined).
  let warnedNoPension = false;
  function pensionAvailable() {
    if (typeof calculateAgePension === 'function') return true;
    if (!warnedNoPension && typeof console !== 'undefined') console.warn('FirePathEngine: js/tax-engine.js is not loaded on this page, so Age Pension is counted as $0.');
    warnedNoPension = true;
    return false;
  }

  // superBalance: today's super. It grows at the after-earnings-tax super return, counts
  // towards spendable income only from preservation age (60), and is means-tested for
  // the Age Pension from 67 like everything else.
  const PRESERVATION_AGE = 60, PENSION_AGE = 67;
  // Super grows at 7% real less the extra fees a typical super fund charges over a
  // low-cost index fund (median MySuper ≈ 0.85% a year vs ≈ 0.2%: APRA heatmap), then
  // less 15% tax on earnings in accumulation. (0.07 − 0.0065) × 0.85 ≈ 5.40%.
  const SUPER_EXTRA_FEES = 0.0065;
  const SUPER_RETURN = (0.07 - SUPER_EXTRA_FEES) * (1 - 0.15);
  // Insurance through super (superInsurance, $ a year, optional). Premiums come out of
  // your super balance. Funds claim a tax deduction for them, so each $1 of premium costs
  // the balance about 85c. Cover usually lapses after 16 months with no contributions
  // (Protecting Your Super), so premiums run while you work, then 16 more months, and
  // never past 70 (when default cover typically ends).
  const INSURANCE_NET = 0.85, INSURANCE_TAIL_MONTHS = 16, INSURANCE_END_AGE = 70;
  // Division 296 (law from 1 July 2026): with a total super balance over $3M, an extra 15%
  // tax on the share of earnings relating to the part over $3M; over $10M, a further 10%
  // on the share over $10M. Both CPI-indexed, so constant in today's dollars. Per person.
  const DIV296 = [{ over: 3e6, rate: 0.15 }, { over: 10e6, rate: 0.10 }];
  // A month's growth on one person's super: the after-tax return (rS), less any Division
  // 296 tax on that month's earnings (worked back to before the fund's 15%).
  function superGrow(bal, rS) {
    const earned = bal * rS;
    if (!(bal > DIV296[0].over) || !(earned > 0)) return bal + earned;
    const before = earned / 0.85;
    const extra = DIV296.reduce((t, d) => t + (bal > d.over ? before * d.rate * (bal - d.over) / bal : 0), 0);
    return bal + earned - extra;
  }
  function premiumMonthly(n, m, freeMonth) {
    if (!(n.superInsurance > 0) || n.age == null) return 0;
    if (n.age + m / 12 >= INSURANCE_END_AGE) return 0;
    if (freeMonth != null && m >= freeMonth + INSURANCE_TAIL_MONTHS) return 0;
    return n.superInsurance * INSURANCE_NET / 12;
  }

  // partner (optional): { superBalance, age } — the partner's super unlocks when *they*
  // reach 60, which can be years before or after you.
  function solveFreedomAge(currentAge, startPortfolio, monthlySavings, targetSpend, homeowner, rate, isCouple, superBalance, partner) {
    rate = rate == null ? 0.07 : rate;
    const CEILING_AGE = 90;
    const pSuper = partner && partner.superBalance > 0 ? partner.superBalance : 0;
    const pAgeGap = partner && partner.age ? partner.age - currentAge : 0;   // partner is this much older
    for (let age = Math.ceil(currentAge); age <= CEILING_AGE; age++) {
      const yearsOut = age - currentAge;
      const portfolio = projectPortfolio(startPortfolio, monthlySavings, yearsOut, rate);
      const ownSuper = superBalance > 0 ? projectPortfolio(superBalance, 0, yearsOut, SUPER_RETURN) : 0;
      const partnerSuper = pSuper ? projectPortfolio(pSuper, 0, yearsOut, SUPER_RETURN) : 0;
      const superBal = ownSuper + partnerSuper;
      const accessible = portfolio + (age >= PRESERVATION_AGE ? ownSuper : 0)
        + (age + pAgeGap >= PRESERVATION_AGE ? partnerSuper : 0);
      const portfolioIncome = accessible * 0.04;
      let pensionIncome = 0;
      if (age >= PENSION_AGE && pensionAvailable()) {
        // Other income 0: Centrelink deems the portfolio rather than counting drawdowns.
        // A couple where the partner isn't 67 yet: only your half of the couple rate, and
        // their super (still in accumulation) isn't counted. Partner age unknown: both 67+.
        const opts = isCouple && partner && partner.age ? { partnerEligible: age + pAgeGap >= PENSION_AGE, partnerSuper } : undefined;
        try { pensionIncome = calculateAgePension(portfolio + superBal, 0, homeowner, !!isCouple, undefined, opts).annualPension || 0; } catch (e) {}
      }
      if (portfolioIncome + pensionIncome >= targetSpend) {
        return { age, portfolio: Math.round(portfolio), superBalance: Math.round(superBal), portfolioIncome: Math.round(portfolioIncome), pensionIncome: Math.round(pensionIncome) };
      }
    }
    return null;
  }

  // ── Freedom plan: the one headline freedom date ──────────
  // Every page's headline "when could work be optional" comes from freedomPlan(), so the
  // same person gets the same date and age on the free calculator, Pro, Freedom gap and
  // Journey. Two phases, month by month:
  //   1. Before 60, money outside super is the bridge. You're free before 60 once your
  //      savings can pay your spending (freedom number ÷ 25 a year) every year until super
  //      unlocks, AND what's left plus your super at that point reaches the freedom number.
  //      Super keeps growing untouched (no more employer contributions once you stop work).
  //   2. From your 60th birthday your super counts too (your partner's from *their* 60th).
  //      With two pots the bridge runs to each unlock in turn.
  // Super grows at SUPER_RETURN (7% less typical fund fees, less 15% earnings tax), plus
  // employer SG while you're still working — only when the page knows the income (no
  // income, no SG: we don't invent contributions). SG is capped at the concessional cap
  // and taxed 15% on the way in. Same rules as Pro's original twoPhaseTimeline.
  //
  // Money outside super earns 7% real less a tax drag: about 3% of it a year is income
  // (dividends, distributions, interest), taxed at your marginal rate. 7% − 3% × 30% ≈
  // 6.1%. Capital gains tax is ignored until you sell (it isn't due until then, and the
  // 50% discount usually applies), so this is still slightly generous for someone who
  // sells to fund their spending. The marginal rate comes from tax-engine.js when the
  // income is known (rate on today's salary, which overstates it after you stop work),
  // otherwise 30%.
  const INVEST_RETURN = 0.07;
  const INCOME_YIELD = 0.03;
  const DEFAULT_MARGINAL_RATE = 0.30;
  const PLAN_MAX_MONTHS = 100 * 12;   // same horizon as yearsToGoal: null = "100+ yrs"

  function outsideSuperReturn(marginalRate) {
    const t = Number.isFinite(marginalRate) && marginalRate >= 0 && marginalRate < 1 ? marginalRate : DEFAULT_MARGINAL_RATE;
    return INVEST_RETURN - INCOME_YIELD * t;
  }

  // The safe withdrawal rate for someone stopping work at retireAge: 4% (25×) holds up
  // over ~30 years; longer retirements need a lower rate (four-percent-rule-australia:
  // 3–3.5% for 40+ years). Not used by the headline yet — the 25× freedom number stays
  // the default — but there for notes like "retiring at 45, 3.5% (28.6×) is safer".
  function safeWithdrawalRate(retireAge) {
    const a = Number(retireAge);
    if (!Number.isFinite(a) || a >= 60) return 0.04;
    if (a >= 50) return 0.0375;
    return 0.035;
  }

  const finiteOr = (v, d) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? n : d; };

  // Annual gross pay from what the page knows: a gross figure, or a monthly take-home
  // worked back through the tax tables. 0 = unknown (no SG, default tax rate).
  function grossFrom(o) {
    const g = finiteOr(o && o.grossIncome, 0);
    if (g > 0) return g;
    const th = finiteOr(o && o.takeHomeMonthly, 0);
    if (th > 0 && typeof estimateGrossFromNet === 'function') { try { return estimateGrossFromNet(th * 12) || 0; } catch (e) {} }
    return 0;
  }
  function sgNetMonthly(gross) {
    if (!(gross > 0)) return 0;
    const sgRate = typeof FP_ASSUMPTIONS !== 'undefined' && FP_ASSUMPTIONS.sgRate > 0 ? FP_ASSUMPTIONS.sgRate : 0.12;
    const cap = typeof TAX_CONFIG !== 'undefined' && TAX_CONFIG.concessionalCap > 0 ? TAX_CONFIG.concessionalCap : 32500;
    return Math.min(gross * sgRate, cap) / 12 * 0.85;   // 15% contributions tax
  }

  // Cleans the inputs once. Returns null when there's no honest answer to give (no
  // freedom number, or a number that isn't a number) — pages show "fill in your numbers".
  //   age, savings (outside super), monthlySavings, target (the freedom number) or
  //   annualSpend (× 25), superBalance, grossIncome or takeHomeMonthly (your own, for SG
  //   and the tax rate), marginalRate (override), outsideReturn (override, used as is),
  //   partner: { superBalance, age, grossIncome | takeHomeMonthly }.
  function planInputs(inputs) {
    const i = inputs || {};
    const target = i.target != null ? Number(i.target) : Number(i.annualSpend) * 25;
    const savings = finiteOr(i.savings, 0), monthlySavings = finiteOr(i.monthlySavings, 0);
    if (!Number.isFinite(target) || target <= 0) return null;
    if (![i.savings, i.monthlySavings, i.superBalance].every(v => v == null || v === '' || Number.isFinite(Number(v)))) return null;
    const age = finiteOr(i.age, 0) > 0 && i.age < 120 ? Number(i.age) : null;
    const gross = grossFrom(i);
    // From 67 (Age Pension age) the seniors and pensioners tax offset can apply too.
    const senior = age != null && age >= PENSION_AGE ? (i.partner ? 'couple' : 'single') : null;
    const marginalRate = Number.isFinite(i.marginalRate) ? i.marginalRate
      : gross > 0 && typeof calculateMarginalRate === 'function' ? calculateMarginalRate(gross, undefined, senior ? { senior } : undefined) : DEFAULT_MARGINAL_RATE;
    const outsideReturn = Number.isFinite(i.outsideReturn) ? i.outsideReturn : outsideSuperReturn(marginalRate);
    const superBalance = Math.max(0, finiteOr(i.superBalance, 0));
    let partner = null;
    const p = i.partner;
    if (p && finiteOr(p.superBalance, 0) > 0) {
      const known = finiteOr(p.age, 0) > 0 && p.age < 120;
      // Partner's age unknown: assume the same as yours (Pro's cards say so in small print).
      partner = { superBalance: Number(p.superBalance), age: known ? Number(p.age) : age, ageAssumed: !known, grossIncome: grossFrom(p) };
    }
    const superInsurance = Math.max(0, finiteOr(i.superInsurance, 0));
    return { age, savings, monthlySavings, target, superBalance, gross, marginalRate, outsideReturn, partner, superInsurance };
  }

  // How much you'd need outside super at this moment to stop work now: enough to pay your
  // spending until each super pot unlocks (growing at the outside rate meanwhile), then,
  // together with the super that's unlocked, the freedom number. pots: [{bal, k}] with k
  // = months until it unlocks (0 = already unlocked). Super grows untouched until then.
  function outsideNeeded(n, pots, rO, rS) {
    const spend = n.target / 25 / 12;
    const later = pots.filter(p => p.k > 0).sort((a, b) => a.k - b.k);
    const nowSuper = pots.filter(p => p.k <= 0).reduce((t, p) => t + p.bal, 0);
    if (!later.length) return Math.max(0, n.target - nowSuper);
    // Work backwards from the last unlock: at that point the pooled money (outside plus
    // super already unlocked) plus the last pot must reach the freedom number.
    // Month by month only when Division 296 could bite (the pot passes $3M by then).
    const at = (p, k) => {
      const simple = p.bal * Math.pow(1 + rS, k);
      if (!(simple > DIV296[0].over)) return simple;
      let b = p.bal; for (let i = 0; i < k; i++) b = superGrow(b, rS); return b;
    };
    const growth = k => Math.pow(1 + rO, k), annuity = k => rO > 0 ? (growth(k) - 1) / rO : k;
    let need = Math.max(0, n.target - at(later[later.length - 1], later[later.length - 1].k));
    for (let i = later.length - 1; i >= 0; i--) {
      const kHere = later[i].k, kPrev = i > 0 ? later[i - 1].k : 0, span = kHere - kPrev;
      // Pooled money needed at kPrev to pay spending through to kHere and still have `need`.
      need = (need + spend * annuity(span)) / growth(span);
      // At kPrev the pot that unlocked there joins the pool, so outside money needs less.
      if (i > 0) need = Math.max(0, need - at(later[i - 1], kPrev));
    }
    // Before the first unlock only outside money (and any super already unlocked) pays.
    return Math.max(0, Math.min(n.target, need - nowSuper));
  }

  // The month-by-month walk. Returns the month freedom is reached (null = not within
  // 100 years) and, if asked, how much the super side is worth each month (for Monte
  // Carlo: the freedom number less the outside money needed that month).
  function walkPlan(n, wantSuperPath) {
    const rO = monthlyRate(n.outsideReturn), rS = monthlyRate(SUPER_RETURN);
    // Super only counts once its owner is 60, so without an age it can't be counted.
    const own = n.age != null && n.superBalance > 0 ? { bal: n.superBalance, sg: sgNetMonthly(n.gross), unlock: Math.max(0, Math.round((PRESERVATION_AGE - n.age) * 12)) } : null;
    const pt = n.partner && n.partner.age != null ? { bal: n.partner.superBalance, sg: sgNetMonthly(n.partner.grossIncome), unlock: Math.max(0, Math.round((PRESERVATION_AGE - n.partner.age) * 12)) } : null;
    const pots = [own, pt].filter(Boolean);
    const superPath = wantSuperPath ? [] : null;
    let out = n.savings, month = null, savingsOnly = null, outsideAt60 = null;
    const superAt = {};   // each pot's balance on its unlock month
    for (let m = 0; m <= PLAN_MAX_MONTHS; m++) {
      for (const s of pots) if (m === s.unlock) superAt[s === own ? 'own' : 'partner'] = s.bal;
      if (own && m === own.unlock) outsideAt60 = out;
      const need = outsideNeeded(n, pots.map(s => ({ bal: s.bal, k: s.unlock - m })), rO, rS);
      if (superPath) superPath.push(n.target - need);
      if (savingsOnly === null && out >= n.target) savingsOnly = m;
      if (month === null && out >= need) month = m;
      // Keep walking only while something is still needed: the super path for Monte Carlo,
      // or the balances at 60 for display.
      if (month !== null && !wantSuperPath && pots.every(s => m >= s.unlock)) break;
      out = out * (1 + rO) + n.monthlySavings;
      // SG keeps going while you're still working (i.e. until you're free). Your own
      // super also pays any insurance premiums (see premiumMonthly).
      for (const s of pots) s.bal = Math.max(0, superGrow(s.bal, rS) + (month === null ? s.sg : 0) - (s === own ? premiumMonthly(n, m, month) : 0));
    }
    // Savings alone, for "before super" comparisons, if the walk stopped before they got there.
    if (savingsOnly === null && n.target > 0) {
      let b = n.savings;
      for (let m = 0; m <= PLAN_MAX_MONTHS; m++) {
        if (b >= n.target) { savingsOnly = m; break; }
        b = b * (1 + rO) + n.monthlySavings;
        if (!(n.monthlySavings > 0) && !(b > 0 && rO > 0)) break;
      }
    }
    return { month, savingsOnly, superPath, own, pt, superAt, outsideAt60 };
  }

  function freedomPlan(inputs, opts) {
    const n = planInputs(inputs);
    if (!n) return { valid: false, reachable: false, alreadyFree: false, months: null, years: null, freedomAge: null, freedomYear: null };
    const w = walkPlan(n, false);
    const months = w.month;
    const now = (opts && opts.now) || new Date();
    const years = months === null ? null : months / 12;
    const accessibleNow = n.savings + (w.own && w.own.unlock === 0 ? n.superBalance : 0) + (w.pt && w.pt.unlock === 0 ? n.partner.superBalance : 0);
    // Which phase the freedom date falls in: savings alone, or with super counted.
    // (Under the bridge rule super can count before 60: it's what lets savings run down.)
    const superUnlocked = months !== null && !!(w.own || w.pt);
    return {
      valid: true,
      months, years,
      reachable: months !== null,
      alreadyFree: months === 0,
      freedomAge: n.age != null && years !== null ? Math.round(n.age + years) : null,
      freedomAgeExact: n.age != null && years !== null ? n.age + years : null,
      freedomYear: months === null ? null : new Date(now.getFullYear(), now.getMonth() + months, 1).getFullYear(),
      // 'savings': savings outside super reach the number on their own. 'with-super': it
      // takes super (unlocked at 60) to get there.
      phase: months === null ? null : superUnlocked && w.savingsOnly !== months ? 'with-super' : 'savings',
      superCounted: !!superUnlocked && w.savingsOnly !== months,
      superIgnored: n.age == null && (n.superBalance > 0 || !!n.partner),   // no age: super can't be timed, so it's left out
      savingsOnlyYears: w.savingsOnly === null ? null : w.savingsOnly / 12,
      yearsTo60: w.own ? w.own.unlock / 12 : null,
      superAt60: w.superAt.own != null ? w.superAt.own : null,
      partnerSuperAt60: w.superAt.partner != null ? w.superAt.partner : null,
      partnerYearsTo60: w.pt ? w.pt.unlock / 12 : null,
      partnerAgeAssumed: !!(n.partner && n.partner.ageAssumed),
      outsideAt60: w.outsideAt60,
      // Bridge years: stopping before super unlocks means savings pay the way until 60.
      bridgeYears: months !== null && w.own && w.own.unlock > months ? (w.own.unlock - months) / 12 : 0,
      spendPerYear: n.target / 25,
      sgMonthly: sgNetMonthly(n.gross) / 0.85,   // before contributions tax, as Pro shows it
      accessibleNow,
      target: n.target,
      outsideReturn: n.outsideReturn,
      superReturn: SUPER_RETURN,
      marginalRate: n.marginalRate,
      inputs: n
    };
  }

  // The "ease off saving" point: the first month from which you could stop adding to your
  // savings and still reach freedom by `byAge` (65 unless given), on the same plan as the
  // headline. Balances grow exactly as in walkPlan (savings and SG keep going until then),
  // and each month is tested with freedomPlan and no further saving. Returns
  // { months, age, year, savings } (months 0 = already there; savings = the money outside
  // super by then), or null if it never happens before
  // byAge, or without an age.
  function coastPoint(inputs, opts) {
    const n = planInputs(inputs);
    if (!n || n.age == null) return null;
    const byAge = (opts && opts.byAge) || 65;
    const now = (opts && opts.now) || new Date();
    const rO = monthlyRate(n.outsideReturn), rS = monthlyRate(SUPER_RETURN);
    const pt = n.partner && n.partner.age != null ? n.partner : null;
    let out = n.savings, own = n.superBalance || 0, ptBal = pt ? pt.superBalance || 0 : 0;
    const sgOwn = own > 0 ? sgNetMonthly(n.gross) : 0, sgPt = pt ? sgNetMonthly(pt.grossIncome) : 0;
    const last = Math.max(0, Math.round((byAge - n.age) * 12));
    for (let m = 0; m <= last; m++) {
      const later = freedomPlan(Object.assign({}, inputs, {
        age: n.age + m / 12, savings: out, superBalance: own, monthlySavings: 0,
        partner: pt ? Object.assign({}, inputs.partner, { superBalance: ptBal, age: pt.age + m / 12 }) : inputs.partner
      }), { now });
      if (later.reachable && later.freedomAgeExact !== null && later.freedomAgeExact <= byAge + 1e-9) {
        return { months: m, age: n.age + m / 12, year: new Date(now.getFullYear(), now.getMonth() + m, 1).getFullYear(), savings: out };
      }
      out = out * (1 + rO) + n.monthlySavings;
      own = Math.max(0, superGrow(own, rS) + sgOwn - (own > 0 ? premiumMonthly(n, m, null) : 0));
      if (pt) ptBal = superGrow(ptBal, rS) + sgPt;
    }
    return null;
  }

  // A saved plan (an fp_profiles row, or FirePathNext.deviceProfile()) as freedomPlan
  // inputs, so Journey, Freedom gap and Pro read a saved plan the same way.
  // take_home_income is the household's monthly take-home; partner_income is the
  // partner's own take-home per pay_cycle.
  function planInputsFromProfile(p) {
    p = p || {};
    const perMonth = v => !(v > 0) ? 0 : p.pay_cycle === 'weekly' ? v * 52 / 12 : p.pay_cycle === 'fortnightly' ? v * 26 / 12 : v;
    const partnerMonthly = perMonth(p.partner_income);
    return {
      age: p.age, savings: p.current_savings || 0, monthlySavings: p.savings_monthly || 0,
      target: p.freedom_number, superBalance: p.super_balance || 0,
      grossIncome: p.gross_income > 0 ? p.gross_income : null,
      takeHomeMonthly: Math.max(0, (p.take_home_income || 0) - partnerMonthly),
      partner: p.partner_super > 0 ? { superBalance: p.partner_super, age: p.partner_age, takeHomeMonthly: partnerMonthly } : null,
      superInsurance: p.super_insurance > 0 ? p.super_insurance : 0
    };
  }

  // Money you could draw on `years` from now: savings outside super, plus super that has
  // unlocked by then. Same walk as freedomPlan, for charts.
  function projectAccessible(inputs, years) {
    const n = planInputs(inputs);
    if (!n) return null;
    const target = Math.round(Math.max(0, years) * 12);
    const rO = monthlyRate(n.outsideReturn), rS = monthlyRate(SUPER_RETURN);
    const pots = [];
    if (n.age != null && n.superBalance > 0) pots.push({ bal: n.superBalance, sg: sgNetMonthly(n.gross), unlock: Math.max(0, Math.round((PRESERVATION_AGE - n.age) * 12)) });
    if (n.partner && n.partner.age != null) pots.push({ bal: n.partner.superBalance, sg: sgNetMonthly(n.partner.grossIncome), unlock: Math.max(0, Math.round((PRESERVATION_AGE - n.partner.age) * 12)) });
    let out = n.savings;
    for (let m = 0; m < target; m++) {
      out = out * (1 + rO) + n.monthlySavings;
      pots.forEach((s, k) => { s.bal = Math.max(0, superGrow(s.bal, rS) + s.sg - (k === 0 && n.superBalance > 0 ? premiumMonthly(n, m, null) : 0)); });
    }
    return out + pots.reduce((t, s) => t + (target >= s.unlock ? s.bal : 0), 0);
  }

  // The market range around the headline: the same plan with random yearly returns on
  // the money outside super (median = the same after-tax rate the headline uses), and
  // super joining from 60 exactly as in the headline. So the range wraps the headline.
  // Returns simulateTimeToTarget's { early, likely, late, reachedShare } in months, or
  // null when there's no range to show (invalid, already free, or nothing growing).
  function freedomRange(inputs, opts) {
    const n = planInputs(inputs);
    if (!n) return null;
    const w = walkPlan(n, true);
    if (w.month === 0) return null;
    if (!(n.monthlySavings > 0) && !(n.savings > 0) && !w.superPath.some(v => v > 0)) return null;
    return simulateTimeToTarget(Object.assign({}, opts || {}, {
      startPortfolio: n.savings, monthlySavings: Math.max(0, n.monthlySavings), target: n.target,
      median: n.outsideReturn, extraByMonth: w.superPath
    }));
  }

  // ── Monte Carlo ──────────────────────────────────────────
  // Real markets don't return 7% every year. These simulate many possible futures:
  // each year's real return is drawn from a lognormal distribution whose median is 7%
  // (the long-run compound rate) with 15% volatility — roughly a growth portfolio of
  // mostly shares. Seeded, so the same inputs always give the same answer.
  const MC = { paths: 2000, median: 0.07, volatility: 0.15 };

  function seededRandom(seed) {          // mulberry32
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normalFrom(rand) {            // Box–Muller
    let u = 0; while (u === 0) u = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  }
  function returnSampler(seed, median, volatility) {
    const rand = seededRandom(seed);
    const mu = Math.log(1 + (median == null ? MC.median : median));
    const sigma = volatility == null ? MC.volatility : volatility;
    return () => Math.exp(mu + sigma * normalFrom(rand)) - 1;
  }
  const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];

  // How likely is the money to last? Withdraws `annualSpend` (today's dollars) at the
  // start of each year for `years`, then applies that year's return. Returns the share
  // of paths that never run out, plus 10th/50th/90th percentile ending balances and the
  // year money runs out in a bad (10th percentile) path.
  function simulateDrawdown({ portfolio, annualSpend, years, paths, seed, median, volatility, otherIncomeByYear }) {
    paths = paths || MC.paths;
    const next = returnSampler(seed == null ? 1 : seed, median, volatility);
    let survived = 0;
    const endings = [], depletedYears = [];
    for (let p = 0; p < paths; p++) {
      let bal = portfolio, depleted = null;
      for (let y = 0; y < years; y++) {
        const other = otherIncomeByYear ? otherIncomeByYear(y, bal) || 0 : 0;
        bal -= Math.max(0, annualSpend - other);
        if (bal <= 0) { bal = 0; depleted = y; break; }
        bal *= 1 + next();
      }
      if (depleted === null) survived++;
      endings.push(bal);
      depletedYears.push(depleted === null ? Infinity : depleted);
    }
    endings.sort((a, b) => a - b);
    depletedYears.sort((a, b) => a - b);
    const bad = percentile(depletedYears, 0.10);
    return {
      successRate: survived / paths,
      p10: percentile(endings, 0.10), p50: percentile(endings, 0.50), p90: percentile(endings, 0.90),
      badCaseRunsOutYear: Number.isFinite(bad) ? bad : null
    };
  }

  // When might savings reach the target? Simulates monthly saving with yearly random
  // returns (each year's return spread evenly over its months) and reports the 10th,
  // 50th and 90th percentile time, in months, to reach `target`. null = not within 50 years.
  // extraByMonth (optional): money that joins the portfolio on a fixed path — e.g. super
  // once it unlocks at 60, from freedomRange — added to the balance month by month.
  function simulateTimeToTarget({ startPortfolio, monthlySavings, target, paths, seed, median, volatility, extraByMonth }) {
    paths = paths || MC.paths;
    const next = returnSampler(seed == null ? 2 : seed, median, volatility);
    const MAX = 50 * 12;
    const extra = m => extraByMonth ? (extraByMonth[Math.min(m, extraByMonth.length - 1)] || 0) : 0;
    const months = [];
    for (let p = 0; p < paths; p++) {
      let bal = startPortfolio, m = 0, r = 0;
      while (bal + extra(m) < target && m < MAX) {
        if (m % 12 === 0) r = monthlyRate(next());
        bal = bal * (1 + r) + monthlySavings;
        m++;
      }
      months.push(bal + extra(m) >= target ? m : Infinity);
    }
    months.sort((a, b) => a - b);
    const out = q => { const v = percentile(months, q); return Number.isFinite(v) ? v : null; };
    return { early: out(0.10), likely: out(0.50), late: out(0.90), reachedShare: months.filter(Number.isFinite).length / paths };
  }

  // The "today's snapshot" — portfolio income, gap, pension estimate, gap after pension,
  // and freedom percentage — all derived consistently from the same inputs. Both Freedom
  // Gap and Freedom Options need this exact bundle; previously each derived it separately.
  //   pensionAssets: what Centrelink would assess at pension age (portfolio + super, ideally
  //   projected to 67). Defaults to today's portfolio. Callers decide whether the pension
  //   applies yet — it's only paid from 67.
  function computeFreedomPicture(inputs) {
    // partnerEligible / partnerSuper (couples, optional): false when the partner isn't 67 yet
    // at the point assessed — then only half the couple rate is paid and partnerSuper (their
    // accumulation super, included in pensionAssets) isn't counted. Omit for both eligible.
    const { portfolio, annualSpend, isHomeowner, withdrawalRate, isCouple, pensionAssets, partnerEligible, partnerSuper } = inputs;
    const rate = withdrawalRate == null ? 0.04 : withdrawalRate;
    const portfolioIncome = portfolio * rate;
    const gap = Math.max(0, annualSpend - portfolioIncome);
    let pensionAnnual = 0, pensionWeekly = 0;
    if (pensionAvailable()) {
      try {
        const opts = isCouple && partnerEligible != null ? { partnerEligible: !!partnerEligible, partnerSuper: partnerSuper || 0 } : undefined;
        const pension = calculateAgePension(pensionAssets == null ? portfolio : pensionAssets, 0, isHomeowner, !!isCouple, undefined, opts);
        pensionAnnual = pension.annualPension || 0;
        pensionWeekly = pension.weeklyPension || 0;
      } catch (e) {}
    }
    const gapAfterPension = Math.max(0, gap - pensionAnnual);
    // floor, not round: 99.6% funded must not read as "100% — your portfolio funds it".
    const freedomPct = annualSpend > 0 ? Math.min(100, Math.floor((portfolioIncome / annualSpend) * 100)) : 0;
    return { portfolioIncome, gap, pensionAnnual, pensionWeekly, gapAfterPension, freedomPct };
  }
 
  // ── Financial Snapshot Engine helpers ──
  // Actual reads/writes to financial_snapshots live in each page, not here — same
  // boundary as calculateAgePension: this file computes, it doesn't do I/O.
 
  // Flexible time-since phrasing, not a fixed "monthly" cadence — compares against
  // whatever the previous snapshot actually was, however long ago that happened to be.
  function formatTimeSince(previousDate) {
    const now = new Date();
    const prev = new Date(previousDate);
    const diffDays = Math.floor((now - prev) / 86400000);
 
    if (diffDays <= 0) return 'since your last update';
    if (diffDays === 1) return 'since yesterday';
    if (diffDays < 30) return `since ${diffDays} days ago`;
    if (diffDays < 365) {
      const months = Math.round(diffDays / 30.44);
      return `since ${months} month${months !== 1 ? 's' : ''} ago`;
    }
    const years = Math.round(diffDays / 365.25);
    return `since ${years} year${years !== 1 ? 's' : ''} ago`;
  }
 
  // Compares two computeFreedomPicture() results — both are just plain objects, so this
  // works whether "previous" came from a live calculation or a stored snapshot's picture.
  function compareSnapshots(previousPicture, currentPicture) {
    return {
      freedomPctDelta: currentPicture.freedomPct - previousPicture.freedomPct,
      portfolioIncomeDelta: currentPicture.portfolioIncome - previousPicture.portfolioIncome,
      gapDelta: currentPicture.gap - previousPicture.gap
    };
  }
 
  return { fmtM, niceHours, monthlyRate, SUPER_RETURN, SUPER_EXTRA_FEES, PRESERVATION_AGE, PENSION_AGE, INCOME_YIELD, DEFAULT_MARGINAL_RATE, MC, simulateDrawdown, simulateTimeToTarget, projectPortfolio, solveMonthsToTarget, recommendNextStep, solveFreedomAge, freedomPlan, freedomRange, coastPoint, superGrow, DIV296, projectAccessible, planInputsFromProfile, outsideSuperReturn, safeWithdrawalRate, computeFreedomPicture, formatTimeSince, compareSnapshots };
})();