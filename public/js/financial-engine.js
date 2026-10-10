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
  // less the tax a fund actually pays in accumulation, which is less than 15% of the
  // return: income (3% a year) is taxed at 15% but franking credits on its Australian
  // shares (about 30% of a balanced fund) offset much of that, and gains held over a year
  // are taxed at 10% (the one-third discount), here as if all realised every year. That's
  // about 7% of earnings, so ≈ 5.9% a year. Still cautious: no tax-free retirement phase.
  // The one place this is set: FP_ASSUMPTIONS.superReturn (calculations.js) follows it.
  const SUPER_EXTRA_FEES = 0.0065;
  const SUPER_BEFORE_TAX = 0.07 - SUPER_EXTRA_FEES;
  const SUPER_FRANKING = Math.min(0.03, 0.04 * 0.30) * 0.75 * 0.30 / 0.70;
  const SUPER_TAX = (0.03 + SUPER_FRANKING) * 0.15 - SUPER_FRANKING + (SUPER_BEFORE_TAX - 0.03) * 0.10;
  const SUPER_RETURN = SUPER_BEFORE_TAX - SUPER_TAX;
  const SUPER_TAX_SHARE = SUPER_TAX / SUPER_BEFORE_TAX;   // ≈ 7.2% of earnings
  if (typeof FP_ASSUMPTIONS !== 'undefined') FP_ASSUMPTIONS.superReturn = SUPER_RETURN;
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
  // 296 tax on that month's earnings (worked back to before the fund's own tax).
  function superGrow(bal, rS) {
    const earned = bal * rS;
    if (!(bal > DIV296[0].over) || !(earned > 0)) return bal + earned;
    const before = earned / (1 - SUPER_TAX_SHARE);
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

  // Franking credits: Australian companies have already paid 30% tax on the dividends
  // they pay, and you're credited with it. The credit is added to your income and then
  // taken off your tax, so on any rate below 30% part of it comes back (all of it on a
  // 0% rate, as a refund). Only Australian shares carry them. ausShare: the share of your
  // investments in Australian shares (0–1). Their dividends are taken as about 4% a year,
  // about three-quarters franked, within the 3% total income above.
  const AUS_DIV_YIELD = 0.04, FRANKED_SHARE = 0.75, COMPANY_TAX = 0.30;
  function frankingCredit(ausShare) {
    const a = Number.isFinite(ausShare) ? Math.min(1, Math.max(0, ausShare)) : 0;
    const franked = Math.min(INCOME_YIELD, AUS_DIV_YIELD * a) * FRANKED_SHARE;
    return franked * COMPANY_TAX / (1 - COMPANY_TAX);
  }
  function outsideSuperReturn(marginalRate, ausShare) {
    const t = Number.isFinite(marginalRate) && marginalRate >= 0 && marginalRate < 1 ? marginalRate : DEFAULT_MARGINAL_RATE;
    // Dividends and their credits are taxed; the credits are then paid back against tax.
    return INVEST_RETURN - INCOME_YIELD * t + frankingCredit(ausShare) * (1 - t);
  }
  // How much is in Australian shares: the person's answer if they gave one ('none' |
  // 'some' | 'most', or a 0–1 number), else a typical diversified mix (about 40%) when
  // their savings are in shares/ETFs or a mix, and none for cash or an offset.
  const AUS_SHARE_ANSWERS = { none: 0, some: 0.4, most: 0.7 };
  function ausShareFor(savingsType, answer) {
    if (answer != null && answer !== '') {
      if (Object.prototype.hasOwnProperty.call(AUS_SHARE_ANSWERS, answer)) return AUS_SHARE_ANSWERS[answer];
      const n = Number(answer); if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
    }
    return savingsType === 'etfs' || savingsType === 'mix' ? 0.4 : 0;
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
  // employerRate: what your employer pays, when it's more than the 12% guarantee (some
  // universities 17%, some public service 15.4%). Still capped at the concessional cap.
  function sgNetMonthly(gross, employerRate) {
    if (!(gross > 0)) return 0;
    const sgRate = employerRate > 0 ? employerRate : typeof FP_ASSUMPTIONS !== 'undefined' && FP_ASSUMPTIONS.sgRate > 0 ? FP_ASSUMPTIONS.sgRate : 0.12;
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
    const ausShare = Number.isFinite(i.ausShare) ? Math.min(1, Math.max(0, i.ausShare)) : 0;
    const outsideReturn = Number.isFinite(i.outsideReturn) ? i.outsideReturn : outsideSuperReturn(marginalRate, ausShare);
    const superBalance = Math.max(0, finiteOr(i.superBalance, 0));
    let partner = null;
    const p = i.partner;
    if (p && finiteOr(p.superBalance, 0) > 0) {
      const known = finiteOr(p.age, 0) > 0 && p.age < 120;
      // Partner's age unknown: assume the same as yours (Pro's cards say so in small print).
      partner = { superBalance: Number(p.superBalance), age: known ? Number(p.age) : age, ageAssumed: !known, grossIncome: grossFrom(p) };
    }
    const superInsurance = Math.max(0, finiteOr(i.superInsurance, 0));
    const pensionValue = Math.max(0, finiteOr(i.pensionValue, 0));
    // Employer super rate (0–1), only when it's above the 12% guarantee; 30% at most.
    const er = finiteOr(i.employerSuperRate, 0);
    const employerSuperRate = er > 0.12 ? Math.min(0.30, er) : null;
    return { age, savings, monthlySavings, target, superBalance, gross, marginalRate, outsideReturn, partner, superInsurance, pensionValue, employerSuperRate };
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
    const own = n.age != null && n.superBalance > 0 ? { bal: n.superBalance, sg: sgNetMonthly(n.gross, n.employerSuperRate), unlock: Math.max(0, Math.round((PRESERVATION_AGE - n.age) * 12)) } : null;
    const pt = n.partner && n.partner.age != null ? { bal: n.partner.superBalance, sg: sgNetMonthly(n.partner.grossIncome), unlock: Math.max(0, Math.round((PRESERVATION_AGE - n.partner.age) * 12)) } : null;
    // Age Pension line only (agePensionPlan): the pension's value from 67 (25× a year's
    // pension) joins like a pot that "unlocks" then. It doesn't grow once paid.
    const pen = n.pensionValue > 0 && n.age != null ? (() => { const k = Math.max(0, Math.round((PENSION_AGE - n.age) * 12)); return { bal: n.pensionValue / Math.pow(1 + rS, k), sg: 0, unlock: k, pension: true }; })() : null;
    const pots = [own, pt, pen].filter(Boolean);
    const superPath = wantSuperPath ? [] : null;
    let out = n.savings, month = null, savingsOnly = null, outsideAt60 = null;
    const superAt = {};   // each pot's balance on its unlock month
    for (let m = 0; m <= PLAN_MAX_MONTHS; m++) {
      for (const s of pots) if (m === s.unlock && !s.pension) superAt[s === own ? 'own' : 'partner'] = s.bal;
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
      for (const s of pots) {
        if (s.pension) { if (m < s.unlock) s.bal *= 1 + rS; continue; }
        s.bal = Math.max(0, superGrow(s.bal, rS) + (month === null ? s.sg : 0) - (s === own ? premiumMonthly(n, m, month) : 0));
      }
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

  // The headline. Stopping work early means money has to last longer, so the freedom
  // number is planned on a safer withdrawal rate (safeWithdrawalRate): 25× spending from
  // 60, 26.7× from 50, 28.6× before 50. The stopping age depends on the number, so this
  // finds the multiple that agrees with the age it gives, taking the more cautious one
  // when a date sits right on 50 or 60. inputs.safeRate === false keeps plain 25×.
  // Adds: baseTarget (25× spending), targetMultiple, withdrawalRate.
  function freedomPlan(inputs, opts) {
    const n0 = planInputs(inputs);
    const base = n0 ? n0.target : null;
    const mg = mortgageFor(inputs, n0);
    const at = mult => mg ? planWithMortgage(inputs, opts, base, mult, mg)
      : planAt(mult === 1 ? inputs : Object.assign({}, inputs, { target: base * mult, annualSpend: undefined }), opts);
    const multFor = p => p.valid && p.freedomAgeExact != null ? 0.04 / safeWithdrawalRate(p.freedomAgeExact) : 1;
    let plan = at(1), mult = 1;
    if (plan.valid && !(inputs && inputs.safeRate === false)) {
      for (let i = 0; i < 4; i++) {
        const want = multFor(plan);
        if (want === mult) break;
        const next = at(want);
        if (want < mult && multFor(next) > want) break;   // on a boundary: keep the cautious one
        plan = next; mult = want;
      }
    }
    if (plan.valid) Object.assign(plan, { baseTarget: base, targetMultiple: mult, withdrawalRate: 0.04 / mult });
    return plan;
  }

  // A mortgage that ends. Today's spending includes the repayments, but they stop when the
  // loan is paid off. So the freedom number counts spending without them (25× the rest),
  // plus whatever is still owing on the day you'd stop work: paying the remaining loan from
  // savings comes to the same thing as keeping up the repayments. The loan runs in today's
  // money (the repayment is fixed, so it shrinks with inflation), at the live mortgage rate
  // unless given, with any offset cutting the interest. Needs the repayment: without it
  // (or if it doesn't cover the interest) nothing changes.
  //   inputs.mortgage: { balance, repayMonthly, offset, rate (yearly, e.g. 0.062), spendMult }
  function mortgageFor(inputs, n) {
    const m = inputs && inputs.mortgage;
    if (!n || !m) return null;
    const balance = Number(m.balance), repay = Number(m.repayMonthly);
    if (!(balance > 0) || !(repay > 0)) return null;
    const live = typeof FP_ASSUMPTIONS !== 'undefined' && FP_ASSUMPTIONS.mortgageRate > 0 ? FP_ASSUMPTIONS.mortgageRate / 100 : 0.062;
    const rate = Number.isFinite(Number(m.rate)) && Number(m.rate) > 0 ? Number(m.rate) : live;
    const infl = typeof FP_ASSUMPTIONS !== 'undefined' && FP_ASSUMPTIONS.longRunInflation > 0 ? FP_ASSUMPTIONS.longRunInflation : 0.025;
    const offset = Math.max(0, Number(m.offset) || 0), i = rate / 12;
    if (repay <= Math.max(0, balance - offset) * i) return null;   // never paid off: leave it be
    const owing = [balance];   // nominal balance month by month until it's paid off
    while (owing[owing.length - 1] > 0 && owing.length < 1200) {
      const b = owing[owing.length - 1];
      owing.push(Math.max(0, b + Math.max(0, b - offset) * i - repay));
    }
    const payoffMonth = owing.length - 1;
    const realOwing = mm => mm >= payoffMonth ? 0 : owing[mm] / Math.pow(1 + infl, mm / 12);
    const spendMult = Number(m.spendMult) > 0 ? Number(m.spendMult) : 1;
    return { balance, repay, rate, offset, payoffMonth, realOwing, cut: repay * 12 * 25 * spendMult };
  }
  // The first month m where the plan, with the loan still owing at m added on, reaches
  // freedom by m. The month freedom comes falls as the owing falls, so search between the
  // date without any loan and the date with the whole loan.
  function planWithMortgage(inputs, opts, base, mult, mg) {
    const spendPart = Math.max(0, base - mg.cut) * mult;
    const run = mm => planAt(Object.assign({}, inputs, { target: spendPart + mg.realOwing(mm), annualSpend: undefined }), opts);
    const monthsOf = p => p.valid ? (p.months == null ? Infinity : p.months) : Infinity;
    const noLoan = run(mg.payoffMonth);
    if (!noLoan.valid) return noLoan;
    let lo = monthsOf(noLoan), hi = Math.min(PLAN_MAX_MONTHS, monthsOf(run(0)));
    if (!(lo <= hi)) hi = lo;
    if (monthsOf(run(lo)) <= lo) hi = lo;
    else { while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (monthsOf(run(mid)) <= mid) hi = mid; else lo = mid; } }
    const plan = run(hi);
    if (plan.valid) {
      const now = (opts && opts.now) || new Date();
      plan.mortgage = { payoffMonth: mg.payoffMonth, payoffYear: new Date(now.getFullYear(), now.getMonth() + mg.payoffMonth, 1).getFullYear(),
        owingAtFreedom: plan.months != null ? mg.realOwing(plan.months) : null, repayMonthly: mg.repay };
    }
    return plan;
  }
  // One line for under the date when the mortgage is counted, or null.
  function mortgageNote(plan) {
    const mo = plan && plan.valid && plan.mortgage;
    if (!mo) return null;
    const owing = mo.owingAtFreedom > 1000 ? ` You'd still owe about ${fmtM(mo.owingAtFreedom)} when you stop work, so that's added on.` : '';
    return `Your mortgage is paid off around ${mo.payoffYear} on $${Math.round(mo.repayMonthly).toLocaleString('en-AU')} a month, so your freedom number counts the repayments only until then.${owing}`;
  }

  function planAt(inputs, opts) {
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
      sgMonthly: sgNetMonthly(n.gross, n.employerSuperRate) / 0.85,   // before contributions tax, as Pro shows it
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
    const sgOwn = own > 0 ? sgNetMonthly(n.gross, n.employerSuperRate) : 0, sgPt = pt ? sgNetMonthly(pt.grossIncome) : 0;
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

  // The freedom date if today's Age Pension rules still apply from 67 (shown as a second
  // line beside the headline, never in it: the rules can change before then). On the same
  // 25× basis as the headline: from 67, a year's pension stands in for 25× itself. The
  // pension is means-tested on what you hold, and in the assets-test taper more savings can
  // mean less pension, so this finds the smallest amount of your own money that, with the
  // pension it earns, reaches the freedom number. Today's rates and limits, today's dollars.
  // opts: { homeowner (default true), couple (default: has a partner) }.
  // Returns null without an age or the pension tables, else { plan, pensionAnnual, ownAt67 }.
  function agePensionPlan(inputs, opts) {
    const n = planInputs(inputs);
    if (!n || n.age == null || typeof calculateAgePension !== 'function') return null;
    const o = opts || {};
    const homeowner = o.homeowner !== false, couple = o.couple != null ? !!o.couple : !!n.partner;
    const pensionOn = c => calculateAgePension(c, 0, homeowner, couple, c).annualPension || 0;
    const T = n.target;
    // Scan up in $1,000 steps for the first amount that's enough, then tighten to $10.
    let lo = 0, hi = null;
    for (let c = 0; c <= T; c += 1000) { if (c + 25 * pensionOn(c) >= T) { hi = c; break; } lo = c; }
    if (hi === null || hi === 0) { if (hi === null) return { plan: freedomPlan(inputs), pensionAnnual: 0, ownAt67: T }; }
    else { while (hi - lo > 10) { const mid = (lo + hi) / 2; if (mid + 25 * pensionOn(mid) >= T) hi = mid; else lo = mid; } }
    const pensionAnnual = pensionOn(hi);
    const plan = freedomPlan(Object.assign({}, inputs, { pensionValue: Math.min(T, 25 * pensionAnnual) }));
    return { plan, pensionAnnual, ownAt67: hi };
  }

  // Aged care costs, year by year, in today's dollars (the What if…? scenario). A starting
  // point from the official fees (AGED_CARE in tax-engine.js), never a quote.
  //   type: 'home' (Support at Home) | 'residential' (an aged care home)
  //   means: 'full' (full pensioner) | 'part' (part pensioner or Seniors Health Card) |
  //          'self' (self-funded, no card): sets the means-tested shares. 'part' takes the
  //          middle of each range, as the real figure depends on a means assessment.
  //   years: years in care. level: Support at Home classification 1–8. Home care assumes
  //   30% clinical and personal care (free), 30% independence and 40% everyday living
  //   services, after the 10% that goes to care management.
  //   roomPrice, payBy: 'lump' | 'daily' | 'mix' (lumpAmount for a mix). Full pensioners
  //   are taken as low-means residents: the government supports the room.
  // Returns { years: [{ cost, parts }], total, lumpSum, refund, perYear } or null.
  function agedCareCosts(o) {
    const A = typeof AGED_CARE !== 'undefined' ? AGED_CARE : null;
    if (!A || !o) return null;
    const years = Math.max(1, Math.min(15, Math.round(o.years || 3)));
    const means = o.means === 'full' || o.means === 'self' ? o.means : 'part';
    const out = [];
    let lumpSum = 0, retained = 0, nonClinicalPaid = 0;
    if (o.type === 'home') {
      const level = Math.max(1, Math.min(8, Math.round(o.level || 4)));
      const services = A.homeBudgets[level - 1] * 0.9;
      const c = A.homeContrib[means];
      const yearly = services * (0.3 * c[0] + 0.3 * c[1] + 0.4 * c[2]);
      for (let y = 0; y < years; y++) {
        const pay = Math.max(0, Math.min(yearly, A.nonClinicalLifetimeCap - nonClinicalPaid));
        nonClinicalPaid += pay;
        out.push({ cost: pay, parts: { contributions: pay } });
      }
      return { type: 'home', level, budget: A.homeBudgets[level - 1], years: out, total: out.reduce((t, y) => t + y.cost, 0), lumpSum: 0, refund: 0, perYear: out[0].cost };
    }
    const share = means === 'full' ? 0 : means === 'part' ? 0.5 : 1;
    const basic = A.basicDailyFee * 365;
    const hotelling = A.hotellingMaxDaily * 365 * share;
    const nonClinicalYear = A.nonClinicalMaxDaily * 365 * share;
    const price = Math.max(0, Number(o.roomPrice) || 0);
    let daily = 0;
    if (means !== 'full') {
      if (o.payBy === 'lump') lumpSum = price;
      else if (o.payBy === 'mix') lumpSum = Math.min(price, Math.max(0, Number(o.lumpAmount) || 0));
      daily = (price - lumpSum) * A.mpir;
    }
    for (let y = 0; y < years; y++) {
      const nc = y < A.nonClinicalYearsCap ? Math.max(0, Math.min(nonClinicalYear, A.nonClinicalLifetimeCap - nonClinicalPaid)) : 0;
      nonClinicalPaid += nc;
      const keep = y < A.radRetentionYears ? lumpSum * A.radRetention : 0;   // comes off the refund
      retained += keep;
      out.push({ cost: basic + hotelling + nc + daily, parts: { basic, hotelling, nonClinical: nc, accommodation: daily, retention: keep } });
    }
    return { type: 'residential', years: out, total: out.reduce((t, y) => t + y.cost, 0), lumpSum, refund: Math.max(0, lumpSum - retained), retained, perYear: out[0].cost };
  }

  // Plain-English lines for under a headline date (the same words on every page).
  // Why an early date plans on more than 25×, or null.
  function cushionNote(plan) {
    if (!plan || !plan.valid || !(plan.targetMultiple > 1)) return null;
    const x = String(Math.round(25 * plan.targetMultiple * 10) / 10);
    const early = plan.withdrawalRate < 0.0375;
    return `Stopping work ${early ? 'before 50' : 'in your 50s'} means your money may need to last ${early ? '45' : '35'} years or more, so this date plans on ${x}× your yearly spending (${fmtM(plan.target)}) instead of 25×.`;
  }
  // The Age Pension line (agePensionPlan's result against the headline), or null when it
  // wouldn't bring the date forward by at least six months.
  function agePensionLine(pp, headline, homeowner) {
    if (!pp || !pp.plan || !pp.plan.valid || !(pp.pensionAnnual > 0) || !headline || !headline.valid) return null;
    if (headline.months != null && pp.plan.months != null && headline.months - pp.plan.months < 6) return null;
    if (pp.plan.months == null) return null;
    const when = pp.plan.alreadyFree ? 'now' : `around ${pp.plan.freedomYear}${pp.plan.freedomAge != null ? `, age ${pp.plan.freedomAge}` : ''}`;
    return `If today’s Age Pension rules still apply when you’re 67: ${when}. That counts about $${Math.round(pp.pensionAnnual / 100) * 100 >= 1000 ? (Math.round(pp.pensionAnnual / 100) * 100).toLocaleString('en-AU') : Math.round(pp.pensionAnnual)} a year of pension from 67${homeowner === false ? ', as a renter' : homeowner === true ? ', as a homeowner' : ''}. The rules can change before then, so your main date doesn’t rely on it.`;
  }

  // Reads the "anything else?" note for figures FirePath can use. Only clear patterns are
  // taken (a number next to the right words); anything else is left as a note. Pages show
  // what was counted, so nothing changes a date without the person seeing it.
  //   mortgageRepayMonthly ("mortgage repayments $2,400 a month", "$600 a week on the home loan")
  //   employerSuperRate    ("my employer pays 15% super", "17% super")
  //   superInsurance       ("super insurance about $800 a year")
  //   ausShare             ("about half my investments are in Australian shares", "none in Aussie shares")
  // Returns { …values, counted: [{ key, text }] }.
  function noteFacts(text) {
    const t = String(text || '').replace(/ /g, ' ');
    const out = { counted: [] };
    if (!t.trim()) return out;
    const money = v => Number(String(v).replace(/[,\s$k]/gi, '')) * (/k$/i.test(String(v).trim()) ? 1000 : 1);
    const perMonth = (v, per) => /week|wk/i.test(per) ? v * 52 / 12 : /fortnight|fn|f\/n/i.test(per) ? v * 26 / 12 : /year|yr|annual/i.test(per) ? v / 12 : v;
    const AMT = String.raw`\$?\s*(\d[\d,]*(?:\.\d+)?\s*k?)`, PER = String.raw`(?:a|an|per|each|\/|every)?\s*(week|wk|fortnight|fn|f\/n|month|mth|mo|year|yr|annum)`;
    // Mortgage repayments: words then amount, or amount then words.
    let m = t.match(new RegExp(String.raw`(?:mortgage|home\s*loan)(?:\s*re)?(?:\s*payments?)?[^\d$\n.]{0,25}?` + AMT + String.raw`\s*` + PER, 'i'))
      || t.match(new RegExp(AMT + String.raw`\s*` + PER + String.raw`[^\n.]{0,20}?(?:mortgage|home\s*loan)`, 'i'));
    if (m) {
      const v = perMonth(money(m[1]), m[2]);
      if (v >= 100 && v <= 50000) { out.mortgageRepayMonthly = Math.round(v); out.counted.push({ key: 'mortgage', text: `Mortgage repayments $${Math.round(v).toLocaleString('en-AU')} a month` }); }
    }
    // Employer super rate above 12%.
    m = t.match(/(\d{2}(?:\.\d+)?)\s*%\s*(?:employer\s*)?super/i) || t.match(/super[^\d\n.]{0,30}?(\d{2}(?:\.\d+)?)\s*%/i);
    if (m) {
      const r = Number(m[1]);
      if (r > 12 && r <= 30) { out.employerSuperRate = r / 100; out.counted.push({ key: 'employer', text: `Employer super ${r}%` }); }
    }
    // Insurance through super (yearly unless said otherwise).
    m = t.match(new RegExp(String.raw`insurance[^\d$\n.]{0,30}?` + AMT + String.raw`(?:\s*` + PER + ')?', 'i'));
    if (m && /super/i.test(t)) {
      const v = m[2] ? perMonth(money(m[1]), m[2]) * 12 : money(m[1]);
      if (v >= 50 && v <= 20000) { out.superInsurance = Math.round(v); out.counted.push({ key: 'insurance', text: `Super insurance $${Math.round(v).toLocaleString('en-AU')} a year` }); }
    }
    // How much is in Australian shares.
    m = t.match(/(none|no|nothing|a little|little|some|a quarter|a third|half|most|mostly|nearly all|almost all|all|\d{1,3}\s*%)[^\n.]{0,40}?(?:australian|aussie|asx)\s*shares/i);
    if (m) {
      const w = m[1].toLowerCase(), pct = w.match(/(\d{1,3})/);
      const share = pct ? Math.min(100, Number(pct[1])) / 100
        : /^(none|no|nothing)$/.test(w) ? 0 : /little/.test(w) ? 0.15 : /quarter/.test(w) ? 0.25 : /third/.test(w) ? 0.33
        : /some/.test(w) ? 0.4 : /half/.test(w) ? 0.5 : /most|nearly|almost/.test(w) ? 0.7 : 1;
      out.ausShare = share;
      out.counted.push({ key: 'aus', text: share === 0 ? 'No Australian shares' : `About ${Math.round(share * 100)}% in Australian shares` });
    }
    return out;
  }

  // A saved plan (an fp_profiles row, or FirePathNext.deviceProfile()) as freedomPlan
  // inputs, so Journey, Freedom gap and Pro read a saved plan the same way.
  // take_home_income is the household's monthly take-home; partner_income is the
  // partner's own take-home per pay_cycle.
  function planInputsFromProfile(p) {
    p = p || {};
    const perMonth = v => !(v > 0) ? 0 : p.pay_cycle === 'weekly' ? v * 52 / 12 : p.pay_cycle === 'fortnightly' ? v * 26 / 12 : v;
    const partnerMonthly = perMonth(p.partner_income);
    const facts = noteFacts(p.context);
    return {
      age: p.age, savings: p.current_savings || 0, monthlySavings: p.savings_monthly || 0,
      target: p.freedom_number, superBalance: p.super_balance || 0,
      grossIncome: p.gross_income > 0 ? p.gross_income : null,
      takeHomeMonthly: Math.max(0, (p.take_home_income || 0) - partnerMonthly),
      partner: p.partner_super > 0 ? { superBalance: p.partner_super, age: p.partner_age, takeHomeMonthly: partnerMonthly } : null,
      // From the saved answers, or the "anything else?" note (noteFacts).
      superInsurance: p.super_insurance > 0 ? p.super_insurance : facts.superInsurance || 0,
      ausShare: ausShareFor(p.savings_type, p.aus_share != null ? p.aus_share : facts.ausShare),
      employerSuperRate: p.employer_super_rate > 0 ? p.employer_super_rate : facts.employerSuperRate || null,
      mortgage: p.mortgage_remaining > 0 && facts.mortgageRepayMonthly > 0
        ? { balance: p.mortgage_remaining, repayMonthly: facts.mortgageRepayMonthly, offset: p.offset_amount || 0, rate: p.offset_interest_rate > 0 ? p.offset_interest_rate / 100 : null, spendMult: p.retirement_spend_multiplier || 1 }
        : null
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
    if (n.age != null && n.superBalance > 0) pots.push({ bal: n.superBalance, sg: sgNetMonthly(n.gross, n.employerSuperRate), unlock: Math.max(0, Math.round((PRESERVATION_AGE - n.age) * 12)) });
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
    // Same freedom number as the headline (including the safer rate for early stopping).
    const head = freedomPlan(inputs);
    const n = planInputs(head.valid && head.targetMultiple > 1 ? Object.assign({}, inputs, { target: head.target, annualSpend: undefined }) : inputs);
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
 
  return { fmtM, niceHours, monthlyRate, SUPER_RETURN, SUPER_EXTRA_FEES, SUPER_TAX_SHARE, PRESERVATION_AGE, PENSION_AGE, INCOME_YIELD, DEFAULT_MARGINAL_RATE, MC, simulateDrawdown, simulateTimeToTarget, projectPortfolio, solveMonthsToTarget, recommendNextStep, solveFreedomAge, freedomPlan, freedomRange, coastPoint, agePensionPlan, cushionNote, agePensionLine, agedCareCosts, mortgageNote, noteFacts, superGrow, DIV296, projectAccessible, planInputsFromProfile, outsideSuperReturn, frankingCredit, ausShareFor, safeWithdrawalRate, computeFreedomPicture, formatTimeSince, compareSnapshots };
})();