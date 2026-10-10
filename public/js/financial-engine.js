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
    if (debt > 0) return { type: 'learn', topic: 'debt-vs-invest', url: '/learn/debt-vs-invest', title: 'Should I pay off debt or invest first?', headline: 'What paying off high-interest debt does.', reason: 'Credit cards often cost about 20% a year and personal loans 7–15%, often higher than the 7% long-run return assumed for shares. This looks at both sides.' };
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
  // Cash in a high-interest savings account over the long run: about 0.5% a year above
  // inflation after tax (bank rates have roughly kept pace with prices; today's rates are
  // below inflation, which would be too harsh to project for decades).
  const CASH_REAL_RETURN = 0.005;
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
  // senior ('single' | 'couple', from 67): worked back with SAPTO and the seniors' Medicare threshold.
  function grossFrom(o, senior) {
    const g = finiteOr(o && o.grossIncome, 0);
    if (g > 0) return g;
    const th = finiteOr(o && o.takeHomeMonthly, 0);
    if (th > 0 && typeof estimateGrossFromNet === 'function') { try { return estimateGrossFromNet(th * 12, 60, senior ? { senior } : undefined) || 0; } catch (e) {} }
    return 0;
  }
  // employerRate: what your employer pays, when it's more than the 12% guarantee (some
  // universities 17%, some public service 15.4%). Still capped at the concessional cap.
  // Division 293: over $250,000 of income plus concessional contributions, an extra 15% on
  // the contributions (on the part over the threshold), so they go in at 70c, not 85c.
  // employerRate 0 = no employer super (self-employed). ownYear: your own deductible contributions.
  function sgNetMonthly(gross, employerRate, ownYear) {
    const own = ownYear > 0 ? ownYear : 0;
    if (!(gross > 0) && !(own > 0)) return 0;
    const sgRate = Number.isFinite(employerRate) && employerRate >= 0 ? employerRate : typeof FP_ASSUMPTIONS !== 'undefined' && FP_ASSUMPTIONS.sgRate > 0 ? FP_ASSUMPTIONS.sgRate : 0.12;
    const cap = typeof TAX_CONFIG !== 'undefined' && TAX_CONFIG.concessionalCap > 0 ? TAX_CONFIG.concessionalCap : 32500;
    const c = Math.min(Math.max(0, gross) * sgRate + own, cap);
    const div293 = 0.15 * Math.min(c, Math.max(0, gross + c - 250000));
    return (c * 0.85 - div293) / 12;   // 15% contributions tax (plus Division 293 if it applies)
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
    const age = finiteOr(i.age, 0) >= 15 && i.age < 110 ? Number(i.age) : null;   // a working-age adult, else unknown
    const gross = grossFrom(i, age != null && age >= PENSION_AGE ? (i.partner ? 'couple' : 'single') : null);
    // From 67 (Age Pension age) the seniors and pensioners tax offset can apply too.
    const senior = age != null && age >= PENSION_AGE ? (i.partner ? 'couple' : 'single') : null;
    const marginalRate = Number.isFinite(i.marginalRate) ? i.marginalRate
      : gross > 0 && typeof calculateMarginalRate === 'function' ? calculateMarginalRate(gross, undefined, senior ? { senior } : undefined) : DEFAULT_MARGINAL_RATE;
    const ausShare = Number.isFinite(i.ausShare) ? Math.min(1, Math.max(0, i.ausShare)) : 0;
    // Where the savings sit (i.savingsType): most everyday Australians keep them in the bank,
    // so 'cash' grows at a long-run cash return; 'offset' saves mortgage interest (tax-free);
    // 'mix' is an even blend; 'etfs' (or not said, on pages that don't ask) is invested.
    const savingsType = i.savingsType || null;
    const invested = outsideSuperReturn(marginalRate, ausShare);
    const offsetR = typeof FP_ASSUMPTIONS !== 'undefined' && Number.isFinite(FP_ASSUMPTIONS.offsetRealReturn) ? FP_ASSUMPTIONS.offsetRealReturn : 0.022;
    // A mix: bank, offset and investments; without a mortgage there's no offset to hold.
    const hasMortgage = typeof i.hasMortgage === 'boolean' ? i.hasMortgage : null;
    const byType = savingsType === 'cash' ? CASH_REAL_RETURN : savingsType === 'offset' ? offsetR
      : savingsType === 'mix' ? (hasMortgage === false ? (CASH_REAL_RETURN + invested) / 2 : (CASH_REAL_RETURN + offsetR + invested) / 3) : invested;
    const outsideReturn = Number.isFinite(i.outsideReturn) ? i.outsideReturn : byType;
    const superBalance = Math.max(0, finiteOr(i.superBalance, 0));
    let partner = null;
    const p = i.partner;
    // A partner counts with super or pay: one who works but has no super yet still gets employer super.
    if (p && (finiteOr(p.superBalance, 0) > 0 || finiteOr(p.takeHomeMonthly, 0) > 0 || finiteOr(p.grossIncome, 0) > 0)) {
      const known = finiteOr(p.age, 0) > 0 && p.age < 120;
      // Partner's age unknown: assume the same as yours (Pro's cards say so in small print).
      partner = { superBalance: Math.max(0, finiteOr(p.superBalance, 0)), selfEmployed: !!p.selfEmployed, age: known ? Number(p.age) : age, ageAssumed: !known, grossIncome: grossFrom(p, (known ? Number(p.age) : age) >= PENSION_AGE ? 'couple' : null) };
    }
    const superInsurance = Math.max(0, finiteOr(i.superInsurance, 0));
    const pensionValue = Math.max(0, finiteOr(i.pensionValue, 0));
    // Employer super rate (0–1), only when it's above the 12% guarantee; 30% at most.
    const er = finiteOr(i.employerSuperRate, 0);
    // Self-employed (from the note): no employer super. ownSuperYear: what you put in yourself
    // each year (claimed as a deduction, so taxed 15% going in, within the same cap).
    const selfEmployed = !!i.selfEmployed;
    const employerSuperRate = selfEmployed ? 0 : er > 0.12 ? Math.min(0.30, er) : null;
    const ownSuperYear = Math.max(0, finiteOr(i.ownSuperYear, 0));
    // Bridge spending a year (default: the freedom number ÷ 25), anything due on the day
    // you stop (upfrontAt(month) → $), and the earliest month freedom may land.
    const spendYear = Number.isFinite(i.spendYear) && i.spendYear >= 0 ? i.spendYear : target / 25;
    const upfrontAt = typeof i.upfrontAt === 'function' ? i.upfrontAt : () => 0;
    const notBefore = Math.max(0, Math.round(finiteOr(i.notBeforeMonth, 0)));
    // Age Pension line: pensionOn(assets) → a year's pension on those assets (agePensionPlan).
    const pensionOn = typeof i.pensionOn === 'function' ? i.pensionOn : null;
    return { age, savings, monthlySavings, target, superBalance, gross, marginalRate, outsideReturn, partner, superInsurance, pensionValue, pensionOn, employerSuperRate, ownSuperYear, selfEmployed, hasMortgage, spendYear, upfrontAt, notBefore, savingsType };
  }

  // Stopping work at month `start`, with `out` outside super and the super pots as they
  // stand then: does it work? Month by month from then, spending (n.spendYear) comes out
  // of savings outside super first and then out of super that has unlocked, which keeps
  // earning super's return until it's needed. Running short with nothing unlocked means it
  // doesn't work. It works as soon as, on stopping or when a pot unlocks, the money you can
  // reach is the freedom number: any pot still locked then is extra. So more money, or a pot
  // that unlocks later, can never make a date later.
  //   pots: [{ bal, unlock (month from today), own, pension }]. Returns { ok, at, pensionAt, assetsAt67 }.
  function stopWorks(n, start, out, pots, rO, rS, scale) {
    const f = scale > 0 ? scale : 1;
    const spend = n.spendYear / 12;
    let o = out;
    const b = pots.map(p => p.bal * (p.pension ? 1 : f));
    const last = pots.reduce((t, p) => Math.max(t, p.unlock), start);
    const pen = pots.findIndex(p => p.pension);
    const unlocks = new Set(pots.map(p => p.unlock));
    for (let t = start; ; t++) {
      if (t === start || unlocks.has(t)) {
        let reach = o;
        for (let i = 0; i < pots.length; i++) if (pots[i].unlock <= t) reach += b[i];
        if (reach >= n.target - 1e-6) {
          // The Age Pension (agePensionPlan): what it would be on the money held then.
          let pensionAt = null, assetsAt67 = null;
          if (pen >= 0 && pots[pen].unlock <= t && n.pensionOn) {
            assetsAt67 = Math.max(0, reach - b[pen]);
            pensionAt = n.pensionOn(assetsAt67);
          }
          return { ok: true, at: t, pensionAt, assetsAt67 };
        }
      }
      if (t >= last) return { ok: false };
      o = o * (1 + rO) - spend;
      for (let i = 0; i < pots.length; i++) {
        const p = pots[i];
        if (p.pension) { if (t < p.unlock) b[i] *= 1 + rS; continue; }
        b[i] = Math.max(0, superGrow(b[i], rS) - (p.own ? premiumMonthly(n, t, start) : 0));
      }
      if (o < 0) {
        // Savings have run out: the rest comes from super that's unlocked (the pension last).
        let short = -o; o = 0;
        const order = pots.map((p, i) => i).filter(i => pots[i].unlock <= t + 1).sort((x, y) => (pots[x].pension ? 1 : 0) - (pots[y].pension ? 1 : 0));
        for (const i of order) { const take = Math.min(short, b[i]); b[i] -= take; short -= take; if (short <= 1e-9) break; }
        if (short > 1e-6) return { ok: false };
      }
    }
  }

  // The month-by-month plan. While working, savings grow with your saving and super with
  // employer contributions; the freedom date is the first month (not before n.notBefore)
  // from which stopping works (stopWorks), after paying anything due that day (a mortgage
  // still owing). Returns the month (null = not within 100 years), the balances on the way,
  // and, if asked, extraAt(m, scale): what the super side is worth in month m (the freedom
  // number less the outside money needed then), for the market range.
  function walkPlan(n, wantSuperPath) {
    const rO = monthlyRate(n.outsideReturn), rS = monthlyRate(SUPER_RETURN);
    // Super only counts once its owner is 60, so without an age it can't be counted.
    // Your own super: today's balance, or none yet but employer super coming in from pay.
    // From Age Pension age, income is taken as a pension or investments, not wages: no
    // employer super then.
    const working = n.age != null && n.age < PENSION_AGE;
    const own = n.age != null && (n.superBalance > 0 || (n.gross > 0 && working)) ? { bal: n.superBalance, own: true, sg: working ? sgNetMonthly(n.gross, n.employerSuperRate, n.ownSuperYear) : 0, unlock: Math.max(0, Math.round((PRESERVATION_AGE - n.age) * 12)) } : null;
    const ptWorking = n.partner && n.partner.age != null && n.partner.age < PENSION_AGE;
    const pt = n.partner && n.partner.age != null ? { bal: n.partner.superBalance, sg: ptWorking ? sgNetMonthly(n.partner.grossIncome, n.partner.selfEmployed ? 0 : undefined) : 0, unlock: Math.max(0, Math.round((PRESERVATION_AGE - n.partner.age) * 12)) } : null;
    // Age Pension line only (agePensionPlan): the pension's value from 67 (25× a year's
    // pension) joins like a pot that "unlocks" then. It doesn't grow once paid.
    const pen = n.pensionValue > 0 && n.age != null ? (() => { const k = Math.max(0, Math.round((PENSION_AGE - n.age) * 12)); return { bal: n.pensionValue / Math.pow(1 + rS, k), sg: 0, unlock: k, pension: true }; })() : null;
    const pots = [own, pt, pen].filter(Boolean);
    // Balances month by month while still working (index m = the start of month m).
    const outs = [], bals = [];
    let out = n.savings;
    const live = pots.map(p => p.bal);
    for (let m = 0; m <= PLAN_MAX_MONTHS; m++) {
      outs.push(out); bals.push(live.slice());
      out = out * (1 + rO) + n.monthlySavings;
      for (let i = 0; i < pots.length; i++) {
        const p = pots[i];
        if (p.pension) { if (m < p.unlock) live[i] *= 1 + rS; continue; }
        live[i] = Math.max(0, superGrow(live[i], rS) + p.sg - (p.own ? premiumMonthly(n, m, null) : 0));
      }
    }
    const potsAt = m => pots.map((p, i) => ({ bal: bals[m][i], unlock: p.unlock, own: !!p.own, pension: !!p.pension }));
    const tryAt = m => stopWorks(n, m, outs[m] - n.upfrontAt(m), potsAt(m), rO, rS);
    // Working longer only adds money and brings unlocks closer, so the first month that
    // works can be found by halving the range.
    let month = null, found = null;
    const first = Math.min(n.notBefore, PLAN_MAX_MONTHS);
    const r0 = tryAt(first);
    if (r0.ok) { month = first; found = r0; }
    else if (tryAt(PLAN_MAX_MONTHS).ok) {
      let lo = first, hi = PLAN_MAX_MONTHS;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tryAt(mid).ok) hi = mid; else lo = mid; }
      month = hi; found = tryAt(hi);
    }
    // Balances to show: each super pot on its unlock month, and savings outside super when
    // you turn 60 (after any bridge years, if you'd have stopped by then).
    const superAt = {};
    let outsideAt60 = null;
    const ownIdx = pots.indexOf(own), ptIdx = pots.indexOf(pt);
    const after = month == null ? null : (() => {
      // The years after stopping, month by month, as stopWorks runs them, to read off balances.
      const rec = { outs: [], bals: [] };
      let o = outs[month] - n.upfrontAt(month);
      const b = bals[month].slice();
      const end = Math.max(month, ...pots.map(p => p.unlock));
      for (let t = month; t <= end; t++) {
        rec.outs[t] = o; rec.bals[t] = b.slice();
        o = o * (1 + rO) - n.spendYear / 12;
        for (let i = 0; i < pots.length; i++) {
          const p = pots[i];
          if (p.pension) { if (t < p.unlock) b[i] *= 1 + rS; continue; }
          b[i] = Math.max(0, superGrow(b[i], rS) - (p.own ? premiumMonthly(n, t, month) : 0));
        }
        if (o < 0) { let short = -o; o = 0; for (let i = 0; i < pots.length; i++) { if (pots[i].pension || pots[i].unlock > t + 1) continue; const take = Math.min(short, b[i]); b[i] -= take; short -= take; } }
      }
      return rec;
    })();
    const balAt = (idx, k) => after && k >= month ? (after.bals[k] ? after.bals[k][idx] : null) : bals[Math.min(k, PLAN_MAX_MONTHS)][idx];
    if (own) { superAt.own = balAt(ownIdx, own.unlock); outsideAt60 = after && own.unlock >= month ? (after.outs[own.unlock] != null ? after.outs[own.unlock] : null) : outs[Math.min(own.unlock, PLAN_MAX_MONTHS)]; }
    if (pt) superAt.partner = balAt(ptIdx, pt.unlock);
    // Savings alone, for "before super" comparisons.
    let savingsOnly = null;
    if (n.target > 0) for (let m = 0; m <= PLAN_MAX_MONTHS; m++) if (outs[m] >= n.target) { savingsOnly = m; break; }
    // For the market range: the outside money needed in month m (pots scaled by the market's
    // move), found by halving, and remembered.
    let extraAt = null;
    if (wantSuperPath) {
      const memo = new Map(), lastNeed = new Map();   // per scale: an array by month
      const tol = Math.max(1, n.target * 5e-4);   // a range only needs to be close
      const exact = (m, scale) => {
        const mm = Math.min(m, PLAN_MAX_MONTHS), sc = scale || 1;
        let arr = memo.get(sc);
        if (!arr) { arr = new Float64Array(PLAN_MAX_MONTHS + 1).fill(NaN); memo.set(sc, arr); }
        if (!Number.isNaN(arr[mm])) return arr[mm];
        const ps = potsAt(mm), works = x => stopWorks(n, mm, x, ps, rO, rS, scale).ok;
        let lo = 0, hi = n.target;
        if (works(0)) hi = 0;
        else {
          // Start near last month's answer (it moves little month to month), widening as needed.
          const prev = lastNeed.get(scale || 1);
          if (prev != null) {
            const d = Math.max(tol * 8, n.target * 0.01);
            lo = Math.max(0, prev - d); hi = prev + d;
            if (lo > 0 && works(lo)) { hi = lo; lo = 0; }
            if (!works(hi)) { lo = hi; hi = n.target; }
          }
          if (!works(hi)) { lo = hi; hi = n.target * 4 + n.spendYear * 100; }
          while (hi - lo > tol) { const mid = (lo + hi) / 2; if (works(mid)) hi = mid; else lo = mid; }
        }
        lastNeed.set(scale || 1, hi);
        const v = n.target - hi - n.upfrontAt(mm);
        arr[mm] = v;
        return v;
      };
      // Worked out exactly every 6 months and on (and just before) each unlock, where it jumps;
      // in between it changes smoothly, so it's blended.
      const special = new Set();
      pots.forEach(p => { special.add(p.unlock); special.add(p.unlock - 1); });
      const isGrid = m => m % 6 === 0 || special.has(m) || m >= PLAN_MAX_MONTHS;
      extraAt = (m, scale) => {
        const mm = Math.min(m, PLAN_MAX_MONTHS);
        if (isGrid(mm)) return exact(mm, scale);
        let g0 = mm - 1; while (!isGrid(g0)) g0--;
        let g1 = mm + 1; while (!isGrid(g1)) g1++;
        const t = (mm - g0) / (g1 - g0);
        return exact(g0, scale) * (1 - t) + exact(g1, scale) * t;
      };
    }
    return { month, savingsOnly, extraAt, own, pt, superAt, outsideAt60, pensionAt: found ? found.pensionAt : null, assetsAt67: found ? found.assetsAt67 : null };
  }

  // The headline. Stopping work early means money has to last longer, so the freedom
  // number is planned on a safer withdrawal rate (safeWithdrawalRate): 25× spending from
  // 60, 26.7× in your 50s, 28.6× before 50. Each band is tried on its own terms (never
  // landing before the band starts) and the earliest date that falls inside its own band
  // wins, so the multiple always agrees with the age it gives. A date can land exactly on
  // 50 or 60. inputs.safeRate === false keeps plain 25×.
  // A mortgage that ends (inputs.mortgage, see mortgageFor) is left out of spending and
  // paid out of savings on the day you stop, if any is still owing.
  // Adds: baseTarget (25× spending), targetMultiple, withdrawalRate, spendYear, mortgage.
  function freedomPlan(inputs, opts) {
    const n0 = planInputs(inputs);
    const base = n0 ? n0.target : null;
    let mg = mortgageFor(inputs, n0);
    // Repayments as big as all your spending can't be right: leave the mortgage out and say so.
    const mortgageCheck = !!(mg && n0 && mg.cut >= n0.target);
    if (mortgageCheck) mg = null;
    const spendPart = n0 ? Math.max(0, base - (mg ? mg.cut : 0)) : 0;
    const run = (mult, notBefore) => planAt(Object.assign({}, inputs, {
      target: spendPart * mult, annualSpend: undefined, spendYear: spendPart / 25,
      upfrontAt: mg ? mg.realOwing : undefined, notBeforeMonth: notBefore || 0 }), opts);
    let plan, mult = 1;
    if (!n0) plan = planAt(inputs, opts);
    else if (n0.age == null || (inputs && inputs.safeRate === false)) plan = run(1, 0);
    else {
      const bands = [{ mult: 0.04 / safeWithdrawalRate(40), from: -Infinity, to: 50 },
                     { mult: 0.04 / safeWithdrawalRate(55), from: 50, to: 60 },
                     { mult: 1, from: 60, to: Infinity }];
      let best = null;
      for (const band of bands) {
        if (n0.age >= band.to) continue;
        const start = Math.max(0, Math.ceil((band.from - n0.age) * 12 - 1e-9));
        const p = run(band.mult, start);
        if (!p.valid || p.months == null) { if (band.to === Infinity && !best) best = { p, mult: band.mult }; continue; }
        const ageThen = n0.age + p.months / 12;
        if (ageThen < band.to - 1e-9 && (!best || best.p.months == null || p.months < best.p.months)) best = { p, mult: band.mult };
      }
      plan = best ? best.p : run(1, 0);
      mult = best ? best.mult : 1;
    }
    if (plan.valid) {
      if (mortgageCheck) plan.mortgageCheck = true;
      const owing = mg && plan.months != null ? mg.realOwing(plan.months) : 0;
      Object.assign(plan, { baseTarget: base, targetMultiple: mult, withdrawalRate: 0.04 / mult,
        spendYear: spendPart / 25, target: spendPart * mult + owing });
      if (mg) {
        const now = (opts && opts.now) || new Date();
        const fin = Number.isFinite(mg.payoffMonth);
        plan.mortgage = { payoffMonth: fin ? mg.payoffMonth : null, payoffYear: fin ? new Date(now.getFullYear(), now.getMonth() + mg.payoffMonth, 1).getFullYear() : null,
          payoffAge: fin && n0.age != null ? n0.age + mg.payoffMonth / 12 : null, neverPaid: mg.neverPaid, inOffset: mg.inOffset && Number(inputs.mortgage.offset) > 0,
          owingAtFreedom: plan.months != null ? owing : null, repayMonthly: mg.repay };
      }
    }
    // Already Age Pension age: the pension isn't a guess about future rules, so the date
    // counts it (today's rules, once you stop work). inputs.homeowner / rentFortnight as in
    // agePensionPlan. Under 67 it stays a separate line beside the date.
    if (plan.valid && n0 && n0.age != null && n0.age >= PENSION_AGE && !(inputs && (inputs.pensionValue || inputs.noAutoPension)) && typeof calculateAgePension === 'function') {
      const pp = agePensionPlan(Object.assign({}, inputs, { noAutoPension: true }), { homeowner: inputs.homeowner !== false, rentFortnight: inputs.rentFortnight || 0 });
      const later = m => m == null ? Infinity : m;
      if (pp && pp.pensionMax > 0 && pp.plan.valid && later(pp.plan.months) < later(plan.months)) {
        pp.plan.pensionIncluded = Math.max(pp.pensionAnnual, 1);
        pp.plan.pensionRises = pp.pensionMax - pp.pensionAnnual > 1000;
        return pp.plan;
      }
    }
    return plan;
  }

  // A mortgage that ends. Today's spending includes the repayments, but they stop when the
  // loan is paid off. So the freedom number counts spending without them (25× the rest),
  // plus whatever is still owing on the day you'd stop work: paying the remaining loan from
  // savings comes to the same thing as keeping up the repayments. The loan runs in today's
  // money (the repayment is fixed, so it shrinks with inflation), at the live mortgage rate
  // unless given, with any offset cutting the interest. When the savings themselves sit in the
  // offset (savingsType 'offset' or 'mix'), their return already counts the interest saved, so
  // the loan runs without it (otherwise the same money would count twice). If the repayment
  // doesn't cover the interest the loan never shrinks, and the plan still pays off whatever is
  // owing when you stop. Needs the repayment: without it nothing changes.
  //   inputs.mortgage: { balance, repayMonthly, offset, rate (yearly, e.g. 0.062), spendMult }
  function mortgageFor(inputs, n) {
    const m = inputs && inputs.mortgage;
    if (!n || !m) return null;
    const balance = Number(m.balance), repay = Number(m.repayMonthly);
    if (!(balance > 0) || !(repay > 0)) return null;
    const live = typeof FP_ASSUMPTIONS !== 'undefined' && FP_ASSUMPTIONS.mortgageRate > 0 ? FP_ASSUMPTIONS.mortgageRate / 100 : 0.062;
    const rate = Number.isFinite(Number(m.rate)) && Number(m.rate) > 0 ? Number(m.rate) : live;
    const infl = typeof FP_ASSUMPTIONS !== 'undefined' && FP_ASSUMPTIONS.longRunInflation > 0 ? FP_ASSUMPTIONS.longRunInflation : 0.025;
    const inOffset = n.savingsType === 'offset' || n.savingsType === 'mix';
    const offset = inOffset ? 0 : Math.max(0, Number(m.offset) || 0), i = rate / 12;
    const owing = [balance];   // nominal balance month by month until it's paid off
    while (owing[owing.length - 1] > 0 && owing.length <= PLAN_MAX_MONTHS) {
      const b = owing[owing.length - 1];
      owing.push(Math.max(0, b + Math.max(0, b - offset) * i - repay));
    }
    const neverPaid = owing[owing.length - 1] > 0;
    const payoffMonth = neverPaid ? Infinity : owing.length - 1;
    const realOwing = mm => mm >= payoffMonth ? 0 : owing[Math.min(mm, owing.length - 1)] / Math.pow(1 + infl, mm / 12);
    const spendMult = Number(m.spendMult) > 0 ? Number(m.spendMult) : 1;
    return { balance, repay, rate, offset, inOffset, neverPaid, payoffMonth, realOwing, cut: repay * 12 * 25 * spendMult };
  }
  // One line for under the date when the mortgage is counted, or null.
  function mortgageNote(plan) {
    if (plan && plan.valid && plan.mortgageCheck) return 'Your mortgage repayments look bigger than your spending, so the mortgage isn\'t counted. It\'s worth checking the figures in your note.';
    const mo = plan && plan.valid && plan.mortgage;
    if (!mo) return null;
    const repay = `$${Math.round(mo.repayMonthly).toLocaleString('en-AU')} a month`;
    const loan = mo.neverPaid ? `Your repayments of ${repay} don't cover the interest, so the loan isn't shrinking.`
      : mo.payoffAge != null && mo.payoffAge > 90 ? `On ${repay}, your mortgage wouldn't be paid off until after you're 90.`
      : mo.inOffset ? `On ${repay}, your mortgage would be paid off around ${mo.payoffYear}, or sooner with your savings in the offset.`
      : `On ${repay}, your mortgage would be paid off around ${mo.payoffYear}.`;
    const from = plan.freedomAgeExact != null && plan.freedomAgeExact >= PRESERVATION_AGE ? 'your savings and super' : 'your savings';
    const owing = mo.owingAtFreedom > 1000
      ? ` Your freedom number leaves the repayments out, and the plan pays off the ${fmtM(mo.owingAtFreedom)} still owing (in today's dollars) from ${from} ${plan.alreadyFree ? 'now' : `when you stop, around ${plan.freedomYear}`}.`
      : ' Your freedom number leaves the repayments out.';
    return loan + owing;
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
      sgMonthly: n.gross > 0 ? Math.min(n.gross * (Number.isFinite(n.employerSuperRate) ? n.employerSuperRate : (typeof FP_ASSUMPTIONS !== 'undefined' && FP_ASSUMPTIONS.sgRate) || 0.12), typeof TAX_CONFIG !== 'undefined' && TAX_CONFIG.concessionalCap > 0 ? TAX_CONFIG.concessionalCap : 32500) / 12 : 0,   // before any tax, as Pro shows it
      accessibleNow,
      // Age Pension line: the pension on what you'd hold at 67 (or now, from 67), and that amount.
      pensionAnnual: w.pensionAt, pensionAssets: w.assetsAt67, pensionValue: n.pensionValue,
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
    const sgOwn = n.age < PENSION_AGE ? sgNetMonthly(n.gross, n.employerSuperRate, n.ownSuperYear) : 0, sgPt = pt && pt.age < PENSION_AGE ? sgNetMonthly(pt.grossIncome, pt.selfEmployed ? 0 : undefined) : 0;
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

  // The freedom date if today's Age Pension rules still apply from 67 (a line beside the
  // date until you're 67; in the date from 67). On the same 25× basis as the headline: from
  // 67, a year's pension stands in for 25× itself. The pension is means-tested on what you
  // hold, and in the assets-test taper more savings mean less pension. But money spent down
  // from there earns more pension as it falls, so it settles where savings plus 25× the
  // pension cover your spending: anyone holding at least the smallest amount that works is
  // covered. So this finds that smallest amount of your own money. The pension shown is the
  // one on what you'd actually hold then (it rises as you draw your savings down).
  // A couple where the partner isn't 67 yet when you are: only your half is paid until then
  // (cautious: their super isn't left out of the test).
  // opts: { homeowner (default true), couple (default: has a partner), rentFortnight (renters) }.
  // Returns null without an age or the pension tables, else
  // { plan, pensionAnnual, pensionStart, ownAt67, gainMonths, rentFortnight }.
  function agePensionPlan(inputs, opts) {
    const n = planInputs(inputs);
    if (!n || n.age == null || typeof calculateAgePension !== 'function') return null;
    const o = opts || {};
    const homeowner = o.homeowner !== false, couple = o.couple != null ? !!o.couple : !!n.partner;
    const partnerYounger = couple && n.partner && n.partner.age != null && n.partner.age + Math.max(0, PENSION_AGE - n.age) < PENSION_AGE;
    // Renters: Rent Assistance on the rent they pay (opts.rentFortnight), as today.
    const extra = Object.assign({}, !homeowner && o.rentFortnight > 0 ? { rentFortnight: o.rentFortnight } : {}, partnerYounger ? { partnerEligible: false } : {});
    const pensionOn = c => calculateAgePension(c, 0, homeowner, couple, c, extra).annualPension || 0;
    // Any loan still owing is paid off on the day you stop (as in the headline), so the
    // repayments never count here.
    const mg = mortgageFor(inputs, n);
    const T = mg ? Math.max(0, n.target - mg.cut) : n.target;
    // Scan up in $1,000 steps for the first amount that's enough, then tighten to $10.
    let lo = 0, hi = null;
    for (let c = 0; c <= T; c += 1000) { if (c + 25 * pensionOn(c) >= T) { hi = c; break; } lo = c; }
    const rentFortnight = extra.rentFortnight || 0;
    if (hi === null) return { plan: freedomPlan(inputs), pensionAnnual: 0, ownAt67: T, gainMonths: 0, rentFortnight };
    if (hi > 0) { while (hi - lo > 10) { const mid = (lo + hi) / 2; if (mid + 25 * pensionOn(mid) >= T) hi = mid; else lo = mid; } }
    const full = pensionOn(hi);
    const plan = freedomPlan(Object.assign({}, inputs, { pensionValue: Math.min(T, 25 * full), pensionOn }));
    const ok = plan.valid && plan.months != null;
    // What the pension itself changes: the same plan checked at 67 with no pension (money
    // grows from 60 to 67 either way, and that shouldn't be put down to the pension).
    const none = freedomPlan(Object.assign({}, inputs, { pensionValue: 1e-9 }));
    const gainMonths = ok ? (none.valid && none.months != null ? none.months : PLAN_MAX_MONTHS) - plan.months : 0;
    const start = ok && plan.pensionAnnual != null ? plan.pensionAnnual : 0;
    return { plan, pensionAnnual: ok ? Math.max(start, 0) : 0, pensionStart: start, pensionMax: full, ownAt67: ok && plan.pensionAssets != null ? plan.pensionAssets : hi, gainMonths, rentFortnight, partnerYounger };
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
    if (plan && plan.valid && plan.pensionIncluded > 0)
      return plan.pensionIncluded < 100
        ? `You're already Age Pension age, so this date counts the Age Pension your savings would earn on today's rules as you draw them down (none at first).`
        : `You're already Age Pension age, so this date counts about $${(Math.round(plan.pensionIncluded / 100) * 100).toLocaleString('en-AU')} a year of Age Pension on today's rules${plan.pensionRises ? ' to start, more as your savings are drawn down' : ''} (less while you're earning).`;
    if (!plan || !plan.valid || !(plan.targetMultiple > 1) || plan.alreadyFree) return null;
    const x = String(Math.round(25 * plan.targetMultiple * 10) / 10);
    const early = plan.withdrawalRate < 0.0375;
    return `Stopping work ${early ? 'before 50' : 'in your 50s'} means your money may need to last ${early ? '45' : '35'} years or more, so this date plans on ${x}× your yearly spending (${fmtM(plan.spendYear * 25 * plan.targetMultiple)}) instead of 25×.`;
  }
  // The one line under the date: of everything worth saying about this person's date, the
  // note that changes it most. Already Age Pension age always wins (it explains a "now");
  // otherwise each note is scored by how many months it moves the date. The rest come back
  // as `others` (pages put them behind "More about this date").
  // Debt (inputs.consumerDebt or opts.consumerDebt, cards and personal loans) isn't in the
  // date itself; its note says what paying it off first would do, and the investing note
  // then talks about after that. Under 50, the Age Pension line (rules decades away) is never
  // the main line, only behind "More about this date".
  //   opts: { homeowner, rentFortnight, consumerDebt }. Returns { main: { key, text }, others: [...] } or null.
  function headlineNotes(inputs, plan, opts) {
    if (!plan || !plan.valid || !inputs) return null;
    const o = opts || {};
    const months = p => p && p.valid && p.months != null ? p.months : null;
    const gap = (a, b) => a != null && b != null ? Math.abs(a - b) : 0;
    const notes = [];
    if (plan.pensionIncluded > 0) notes.push({ key: 'pension67', text: cushionNote(plan), score: Infinity });
    else {
      const debt = Math.max(0, Number(o.consumerDebt != null ? o.consumerDebt : inputs.consumerDebt) || 0);
      const afterDebt = debt > 0 && !plan.alreadyFree ? debtFirstInputs(inputs, debt) : null;
      if (debt > 0 && !plan.alreadyFree) {
        const dn = debtNote(plan, afterDebt, debt);
        // High-interest debt comes first under 50 when it changes the date; from 50 (when the
        // Age Pension matters more) it competes like the rest. A small effect stays behind "More".
        const dGap = afterDebt ? gap(months(plan), months(freedomPlan(afterDebt))) : Infinity;
        const young = plan.inputs && plan.inputs.age != null && plan.inputs.age < 50;
        if (dn) notes.push({ key: 'debt', text: dn, score: dGap < 3 ? -1 : young ? 1e9 : dGap });
      }
      // Invested: the Australian share they told us, else a typical mix (a cash saver's 0 is just the default).
      const stated = inputs.ausShareStated !== undefined ? inputs.ausShareStated : (inputs.savingsType === 'cash' || inputs.savingsType === 'offset' || !inputs.savingsType ? null : inputs.ausShare);
      const base = afterDebt || inputs;
      const asIs = afterDebt ? freedomPlan(afterDebt) : plan;
      const inv = freedomPlan(Object.assign({}, base, { savingsType: 'etfs', ausShare: ausShareFor('etfs', stated) }));
      // Short of a three-month cash buffer (of what's in the bank): invest only what's added beyond it.
      const n = asIs.inputs || {};
      const cash = n.savingsType === 'mix' ? n.savings / 3 : n.savings;
      const buffer = !afterDebt && n.savingsType && n.savingsType !== 'etfs' && plan.baseTarget > 0 && cash < plan.baseTarget / 25 / 12 * 3;
      const sv = savingsNote(asIs, inv, { afterDebt: !!afterDebt, buffer });
      if (sv) notes.push({ key: 'savings', text: sv, score: gap(months(asIs), months(inv)) });
      if (!plan.alreadyFree) {
        const pp = agePensionPlan(inputs, { homeowner: o.homeowner, rentFortnight: o.rentFortnight });
        const line = agePensionLine(pp, plan, o.homeowner, { rentFortnight: o.rentFortnight });
        const young = plan.inputs && plan.inputs.age != null && plan.inputs.age < 50;
        if (line) notes.push({ key: 'pension', text: line, score: young ? -1 : gap(months(plan), months(pp && pp.plan)) });
      }
      const mn = mortgageNote(plan);
      if (mn) notes.push({ key: 'mortgage', text: mn, score: gap(months(plan), months(freedomPlan(Object.assign({}, inputs, { mortgage: null })))) });
      const cn = cushionNote(plan);
      if (cn) notes.push({ key: 'cushion', text: cn, score: gap(months(plan), months(freedomPlan(Object.assign({}, inputs, { safeRate: false })))) });
    }
    if (!notes.length) return null;
    const order = ['pension67', 'debt', 'savings', 'pension', 'mortgage', 'cushion'];
    notes.sort((a, b) => (b.score - a.score) || (order.indexOf(a.key) - order.indexOf(b.key)));
    // Nothing but a far-off Age Pension line: nothing goes under the date.
    if (notes[0].score < 0) return null;
    const strip = n => ({ key: n.key, text: n.text });
    return { main: strip(notes[0]), others: notes.slice(1).map(strip) };
  }

  // The plan if cards and personal loans were paid off first: savings go to the debt, and
  // what's left is cleared from monthly saving at a typical card rate (20% a year). The
  // months spent clearing it show up as savings starting below zero, worth the saving it
  // takes. null when the saving doesn't cover the interest.
  const DEBT_RATE = 0.20;
  function debtFirstInputs(inputs, debt) {
    const savings = Math.max(0, Number(inputs.savings) || 0), monthly = Math.max(0, Number(inputs.monthlySavings) || 0);
    if (savings >= debt) return Object.assign({}, inputs, { savings: savings - debt });
    let left = debt - savings, k = 0;
    const r = DEBT_RATE / 12;
    if (!(monthly > left * r)) return null;
    while (left > 0 && k < PLAN_MAX_MONTHS) { left = left * (1 + r) - monthly; k++; }
    return Object.assign({}, inputs, { savings: -(k * monthly + Math.min(0, left)) });
  }
  function debtNote(plan, afterDebtInputs, debt) {
    const amt = `$${Math.round(debt).toLocaleString('en-AU')}`;
    if (!afterDebtInputs) return `This date doesn't count your ${amt} of debt, and what you save each month doesn't cover its interest at a typical card rate.`;
    const p = freedomPlan(afterDebtInputs);
    if (!p.valid || p.months == null) return `This date doesn't count your ${amt} of debt. Paying it off first could put your date out of reach on today's numbers.`;
    if (plan.months != null && (p.months - plan.months < 3 || (p.freedomYear === plan.freedomYear && p.freedomAge === plan.freedomAge)))
      return `This date doesn't count your ${amt} of debt. Paying it off first would only add a few months.`;
    return `This date doesn't count your ${amt} of debt. Paying it off first could push it back to around ${p.freedomYear}${p.freedomAge != null ? `, age ${p.freedomAge}` : ''}.`;
  }

  // Savings counted as cash (or a mix): what the same plan would give if they were invested,
  // as information, not advice. investedPlan: freedomPlan with savingsType 'etfs'. null when
  // the savings are already invested or investing wouldn't move the date by six months.
  // opts: { afterDebt (invest once debt is paid off), buffer (short of three months in the bank) }.
  function savingsNote(plan, investedPlan, opts) {
    const so = opts || {};
    const type = plan && plan.valid && plan.inputs ? plan.inputs.savingsType : null;
    if (type !== 'cash' && type !== 'mix') return null;
    if (!investedPlan || !investedPlan.valid || investedPlan.months == null) return null;
    if (plan.months != null && plan.months - investedPlan.months < 6) return null;
    if (plan.freedomYear === investedPlan.freedomYear && plan.freedomAge === investedPlan.freedomAge) return null;
    const where = type === 'cash' ? 'cash in the bank' : plan.inputs.hasMortgage === false ? 'a mix of bank and investments' : 'a mix of bank, offset and investments';
    const when = investedPlan.alreadyFree ? 'now' : `around ${investedPlan.freedomYear}${investedPlan.freedomAge != null ? `, age ${investedPlan.freedomAge}` : ''}`;
    // Within about five years of stopping, a fall in shares has little time to recover.
    const close = plan.months != null && plan.months <= 60 ? ' Shares can also fall, which matters more this close to stopping.' : '';
    const how = so.afterDebt ? 'Invested in shares once your debt is paid off' : so.buffer ? 'Investing what you add beyond a three-month buffer' : 'Invested in shares';
    return `Your savings are counted as ${where}. ${how}, this could be ${when}.${close}`;
  }

  // The Age Pension line (agePensionPlan's result against the headline), or null when it
  // wouldn't bring the date forward by at least six months.
  // opts.rentFortnight: renters' rent (so the line can say Rent Assistance is counted).
  function agePensionLine(pp, headline, homeowner, opts) {
    if (!pp || !pp.plan || !pp.plan.valid || !(pp.pensionMax > 0) || !headline || !headline.valid) return null;
    if (pp.gainMonths != null && pp.gainMonths < 6) return null;   // the pension itself must move it
    if (headline.months != null && pp.plan.months != null && headline.months - pp.plan.months < 6) return null;
    if (pp.plan.months == null) return null;
    const age = headline.inputs && headline.inputs.age;
    const already = age != null && age >= PENSION_AGE;
    const when = pp.plan.alreadyFree ? 'now' : `around ${pp.plan.freedomYear}${pp.plan.freedomAge != null ? `, age ${pp.plan.freedomAge}` : ''}`;
    const amount = Math.round(pp.pensionAnnual / 100) * 100;
    const rises = pp.pensionMax - pp.pensionAnnual > 1000;   // more pension as savings are drawn down
    const pensionWords = amount < 100 ? 'the pension your savings would earn as you draw them down (none at first)'
      : rises ? `about $${amount.toLocaleString('en-AU')} a year of pension to start, more as your savings are drawn down` : `about $${amount.toLocaleString('en-AU')} a year of pension`;
    const rentBit = homeowner === false ? ((opts && opts.rentFortnight > 0) || pp.rentFortnight > 0 ? ', as a renter, with Rent Assistance' : ', as a renter (add your rent in the note to count Rent Assistance)') : homeowner === true ? ', as a homeowner' : '';
    if (already) {
      return `You're already Age Pension age. On today's rules, with the pension your money could cover you ${when === 'now' ? 'now' : when}. That counts ${pensionWords}${rentBit} (less while you're earning). Your main date doesn't rely on it.`;
    }
    return `If today’s Age Pension rules still apply when you’re 67: ${when}. That counts ${pensionWords} from 67${rentBit}. The rules can change before then, so your main date doesn’t rely on it.`;
  }


  // Reads the "anything else?" note for figures FirePath can use. Only clear patterns are
  // taken (a number next to the right words); anything else is left as a note. Pages show
  // what was counted, so nothing changes a date without the person seeing it.
  //   mortgageRepayMonthly ("mortgage repayments $2,400 a month", "$600 a week on the home loan")
  //   employerSuperRate    ("my employer pays 15% super", "17% super")
  //   superInsurance       ("super insurance about $800 a year")
  //   ausShare             ("about half my investments are in Australian shares", "none in Aussie shares")
  //   rentMonthly          ("I pay $520 a week rent", "rent $2,200 a month")
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
    // Rent (renters: for Rent Assistance with the Age Pension). "rent", not "current"/"parent".
    m = t.match(new RegExp(String.raw`\brent\b[^\d$\n.]{0,20}?` + AMT + String.raw`\s*` + PER, 'i'))
      || t.match(new RegExp(AMT + String.raw`\s*` + PER + String.raw`[^\n.\d]{0,15}?\brent\b`, 'i'));
    if (m) {
      const v = perMonth(money(m[1]), m[2]);
      if (v >= 100 && v <= 30000) { out.rentMonthly = Math.round(v); out.counted.push({ key: 'rent', text: `Rent $${Math.round(v * 12 / 52).toLocaleString('en-AU')} a week` }); }
    }
    // Employer super rate above 12% ("my employer pays 17% super", "17 percent super",
    // "employer contributes 15.4%"). Not a partner's ("my partner's employer pays…"); over 30%
    // is taken as 30% (the cap does the rest).
    const sentences = t.split(/[.!?](?=\s|$)|\n/).filter(x => !/partner|wife|husband|spouse/i.test(x)).join('. ');
    m = sentences.match(/(\d{2}(?:\.\d+)?)\s*(?:%|per\s*cent|percent)\s*(?:employer\s*)?super/i)
      || sentences.match(/super[^\d\n.]{0,30}?(\d{2}(?:\.\d+)?)\s*(?:%|per\s*cent|percent)/i)
      || sentences.match(/employer[^\d\n.]{0,30}?(\d{2}(?:\.\d+)?)\s*(?:%|per\s*cent|percent)/i);
    if (m) {
      const r = Math.min(30, Number(m[1]));
      if (r > 12) { out.employerSuperRate = r / 100; out.counted.push({ key: 'employer', text: `Employer super ${r}%` }); }
    }
    // Insurance through super (yearly unless said otherwise).
    m = t.match(new RegExp(String.raw`insurance[^\d$\n.]{0,30}?` + AMT + String.raw`(?:\s*` + PER + ')?', 'i'));
    if (m && /super/i.test(t)) {
      const v = m[2] ? perMonth(money(m[1]), m[2]) * 12 : money(m[1]);
      if (v >= 50 && v <= 20000) { out.superInsurance = Math.round(v); out.counted.push({ key: 'insurance', text: `Super insurance $${Math.round(v).toLocaleString('en-AU')} a year` }); }
    }
    // Self-employed: no employer pays super ("I'm self-employed", "sole trader", "run my own
    // business", "no employer super"). Not a partner's.
    const own = t.split(/[.!?](?=\s|$)|\n/).filter(x => !/partner|wife|husband|spouse/i.test(x)).join('. ');
    const noEmployer = /self[-\s]?employed|sole\s*trader|(?:run|have|own)\s+(?:my|our)\s+own\s+business|no\s+employer\s+super|no\s*(?:one|body|employer|boss)\s+pays\s+(?:me\s+|my\s+)?super|(?:employer|boss)\s+(?:doesn['’]?t|does\s+not)\s+pay\s+(?:me\s+|my\s+|any\s+)?super|don['’]?t\s+get\s+(?:any\s+)?(?:employer\s+)?super/i;
    if (noEmployer.test(own) && !/employer\s+(?:pays|contributes)\s+\d/i.test(own)) {
      out.selfEmployed = true;
      delete out.employerSuperRate; out.counted = out.counted.filter(c => c.key !== 'employer');
      out.counted.push({ key: 'selfemployed', text: 'Self-employed: no employer super' });
    }
    // A partner who is self-employed: no employer super for them either.
    const partnerBits = t.split(/[.!?](?=\s|$)|\n/).filter(x => /partner|wife|husband|spouse/i.test(x)).join('. ');
    if (noEmployer.test(partnerBits)) { out.partnerSelfEmployed = true; out.counted.push({ key: 'partnerself', text: 'Partner self-employed: no employer super for them' }); }
    // Super you put in yourself each year ("I put in about $10,000 a year myself", "I add
    // $5k a year to super", "personal contributions $8,000 a year").
    m = own.match(new RegExp(String.raw`(?:i|we)\s+(?:put|add|pay|contribute|chuck|salary\s*sacrifice)(?:\s+in)?[^\d$\n.]{0,25}?` + AMT + String.raw`\s*` + PER + String.raw`[^\n.]{0,30}`, 'i'))
      || own.match(new RegExp(String.raw`personal\s+(?:super\s+)?contributions?[^\d$\n.]{0,20}?` + AMT + String.raw`\s*` + PER, 'i'));
    if (m && /super|myself|contribut|sacrifice/i.test(m[0])) {
      const v = perMonth(money(m[1]), m[2]) * 12;
      if (v >= 500 && v <= 60000) { out.ownSuperYear = Math.round(v); out.counted.push({ key: 'ownsuper', text: `You add $${Math.round(v).toLocaleString('en-AU')} a year to super` }); }
    }
    // How much is in Australian shares: in a sentence about shares, ETFs or investments, the
    // first amount word and whether it's about Australian or overseas shares ("none of my
    // shares are Australian", "all my ETFs are international", "mostly Aussie shares").
    const AMTW = String.raw`(nearly all|almost all|a little|a quarter|a third|none|nothing|mostly|most|some|half|all|no|\d{1,3}\s*(?:%|per\s*cent|percent))`;
    const shareWords = /shares|etfs?|investments?|portfolio|stocks|invested/i;
    const AUS = /\b(?:australian|aussie|asx)\b/i, INTL = /\b(?:international|overseas|global|foreign|world)\b/i;
    for (const sen of t.split(/[.!?](?=\s|$)|\n/)) {
      if (!shareWords.test(sen) || !(AUS.test(sen) || INTL.test(sen))) continue;
      const q = sen.match(new RegExp(String.raw`\b` + AMTW + String.raw`(?=\b|\s|%)`, 'i'));
      if (!q) continue;
      const w = q[1].toLowerCase(), pct = w.match(/(\d{1,3})/);
      let share = pct ? Math.min(100, Number(pct[1])) / 100
        : /^(none|no|nothing)$/.test(w) ? 0 : /little/.test(w) ? 0.15 : /quarter/.test(w) ? 0.25 : /third/.test(w) ? 0.33
        : /some/.test(w) ? 0.4 : /half/.test(w) ? 0.5 : /most|nearly|almost/.test(w) ? 0.7 : 1;
      // Which kind the amount is about: the first of the two named after it (or anywhere).
      const after = sen.slice(q.index);
      let ia = after.search(AUS), ii = after.search(INTL);
      if (ia < 0 && ii < 0) { ia = sen.search(AUS); ii = sen.search(INTL); }   // "Australian shares: none"
      const aboutIntl = ia < 0 || (ii >= 0 && ii < ia);
      if (aboutIntl) share = Math.round((1 - share) * 100) / 100;
      out.ausShare = share;
      out.counted.push({ key: 'aus', text: share === 0 ? 'No Australian shares' : `About ${Math.round(share * 100)}% in Australian shares` });
      break;
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
      partner: p.partner_super > 0 || partnerMonthly > 0 ? { superBalance: p.partner_super || 0, age: p.partner_age, takeHomeMonthly: partnerMonthly, selfEmployed: !!facts.partnerSelfEmployed } : null,
      // From the saved answers, or the "anything else?" note (noteFacts).
      superInsurance: p.super_insurance > 0 ? p.super_insurance : facts.superInsurance || 0,
      ausShare: ausShareFor(p.savings_type, p.aus_share != null ? p.aus_share : facts.ausShare),
      savingsType: p.savings_type || 'cash',
      homeowner: !/rent/i.test(p.housing_status || ''),
      rentFortnight: /rent/i.test(p.housing_status || '') && facts.rentMonthly > 0 ? facts.rentMonthly * 12 / 26 : 0,
      employerSuperRate: p.employer_super_rate > 0 ? p.employer_super_rate : facts.employerSuperRate || null,
      selfEmployed: !!facts.selfEmployed, ownSuperYear: facts.ownSuperYear || 0,
      ausShareStated: p.aus_share != null ? p.aus_share : facts.ausShare != null ? facts.ausShare : null,
      hasMortgage: p.mortgage_remaining > 0, consumerDebt: p.debt_total > 0 ? p.debt_total : 0,
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
    if (n.age != null && (n.superBalance > 0 || (n.gross > 0 && n.age < PENSION_AGE))) pots.push({ bal: n.superBalance, sg: n.age < PENSION_AGE ? sgNetMonthly(n.gross, n.employerSuperRate, n.ownSuperYear) : 0, unlock: Math.max(0, Math.round((PRESERVATION_AGE - n.age) * 12)) });
    if (n.partner && n.partner.age != null) pots.push({ bal: n.partner.superBalance, sg: n.partner.age < PENSION_AGE ? sgNetMonthly(n.partner.grossIncome, n.partner.selfEmployed ? 0 : undefined) : 0, unlock: Math.max(0, Math.round((PRESERVATION_AGE - n.partner.age) * 12)) });
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
    if (head.valid && head.alreadyFree) return null;
    const mg = head.valid && head.mortgage ? mortgageFor(inputs, planInputs(inputs)) : null;
    const n = planInputs(head.valid ? Object.assign({}, inputs, { target: head.target - (head.mortgage && head.mortgage.owingAtFreedom || 0), annualSpend: undefined,
      spendYear: head.spendYear, mortgage: null, upfrontAt: mg ? mg.realOwing : undefined, pensionValue: head.pensionValue || 0 }) : inputs);
    if (!n) return null;
    const w = walkPlan(n, true);
    if (w.month === 0) return null;
    if (!(n.monthlySavings > 0) && !(n.savings > 0) && w.month == null && !(w.extraAt(PLAN_MAX_MONTHS) > 0)) return null;
    return simulateTimeToTarget(Object.assign({}, opts || {}, {
      startPortfolio: n.savings, monthlySavings: Math.max(0, n.monthlySavings), target: n.target,
      median: n.outsideReturn, extraAt: w.extraAt,
      // Super is invested whatever the savings are: with cash savings, it's what moves the range
      // (a balanced super option moves about 10% a year).
      extraVolatility: n.savingsType === 'cash' || n.savingsType === 'offset' || n.savingsType === 'mix' ? 0.10 : 0,
      // Cash and an offset barely move year to year; a mix moves about a third as much.
      volatility: n.savingsType === 'cash' || n.savingsType === 'offset' ? 0.01 : n.savingsType === 'mix' ? MC.volatility / 3 : undefined
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
  // tax (optional): tax on the part held outside super, paid from the balance each year
  // (retireeTax): { outsideShare, gainShare, age, ausShare, taxableOther(y) }. Super in
  // retirement phase is tax-free, so outsideShare 0 means no tax, as before.
  // One retired year's tax on money held outside super (today's tax rules): dividends
  // (INCOME_YIELD) with franking credits, plus the gain realised by selling to fund the
  // withdrawal beyond the dividends (held over a year: half is taxed). On a low income the
  // tax-free threshold, low income offset and, from 67, SAPTO often bring it to nothing,
  // and spare franking credits come back as a refund (a negative tax). Dividends not
  // needed are reinvested, adding to the cost base.
  //   { outsideValue, costBase, withdrawal (from outside super), age, ausShare, otherTaxable }
  // Returns { tax, costBaseAfter, taxable }.
  function retireeTax(o) {
    const v = Math.max(0, o.outsideValue || 0), w = Math.max(0, o.withdrawal || 0);
    let cost = Math.min(v, Math.max(0, o.costBase || 0));
    const div = v * INCOME_YIELD, credit = v * frankingCredit(o.ausShare);
    const sold = Math.max(0, Math.min(v, w - div));
    const gainShare = v > 0 ? Math.max(0, 1 - cost / v) : 0;
    const gain = sold * gainShare;
    cost = Math.max(0, cost - sold * (1 - gainShare)) + Math.max(0, div - w);
    const taxable = div + credit + gain * 0.5 + Math.max(0, o.otherTaxable || 0);
    const senior = o.age != null && o.age >= PENSION_AGE ? 'single' : null;
    const total = typeof calculateTax === 'function' ? calculateTax(taxable, undefined, senior ? { senior } : undefined).total : taxable * DEFAULT_MARGINAL_RATE;
    return { tax: total - credit, costBaseAfter: cost, taxable };
  }

  function simulateDrawdown({ portfolio, annualSpend, years, paths, seed, median, volatility, otherIncomeByYear, tax }) {
    paths = paths || MC.paths;
    const next = returnSampler(seed == null ? 1 : seed, median, volatility);
    const taxOn = tax && tax.outsideShare > 0;
    let survived = 0;
    const endings = [], depletedYears = [];
    for (let p = 0; p < paths; p++) {
      let bal = portfolio, depleted = null;
      // Untaxed gain in the outside-super part, as a share of it (tracked as a cost base).
      let outCost = taxOn ? portfolio * tax.outsideShare * (1 - Math.min(1, Math.max(0, tax.gainShare || 0))) : 0;
      for (let y = 0; y < years; y++) {
        const other = otherIncomeByYear ? otherIncomeByYear(y, bal) || 0 : 0;
        const draw = Math.max(0, annualSpend - other);
        if (taxOn) {
          const t = retireeTax({ outsideValue: bal * tax.outsideShare, costBase: outCost, withdrawal: draw * tax.outsideShare,
            age: tax.age != null ? tax.age + y : null, ausShare: tax.ausShare, otherTaxable: tax.taxableOther ? tax.taxableOther(y) || 0 : 0 });
          outCost = t.costBaseAfter;
          bal -= draw + t.tax;
        } else bal -= draw;
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
  // extraVolatility (optional): that money (super, invested) moves with the same markets, so
  // each year's market move scales it too (median unchanged), even when the savings are cash.
  // extraAt(m, scale) (optional, from freedomRange): the same, worked out from the plan for
  // month m with super scaled by the markets so far (scale 1 = as planned), so a path only
  // counts as free once its savings can also carry it until super unlocks.
  function simulateTimeToTarget({ startPortfolio, monthlySavings, target, paths, seed, median, volatility, extraByMonth, extraVolatility, extraAt }) {
    paths = paths || MC.paths;
    const rand = seededRandom(seed == null ? 2 : seed);
    const mu = Math.log(1 + (median == null ? MC.median : median)), sigma = volatility == null ? MC.volatility : volatility;
    const sx = extraVolatility > 0 ? extraVolatility : 0;
    const MAX = 50 * 12;
    // Super's market move: each month's figure is worked out for super 40% down, as planned
    // and 60% up, and blended between them (so it can be reused across paths).
    const A = [0.6, 1, 1.6], LA = A.map(Math.log);
    const cache = A.map(() => []);
    const ex = (j, m) => { let v = cache[j][m]; if (v === undefined) { v = extraAt(m, A[j]); cache[j][m] = v; } return v; };
    // lf: the log of super's market move so far (0 = as planned).
    const extra = (m, lf) => {
      if (!extraAt) return (extraByMonth ? (extraByMonth[Math.min(m, extraByMonth.length - 1)] || 0) : 0) * Math.exp(lf);
      if (sx === 0) return ex(1, m);
      const x = lf < LA[0] ? LA[0] : lf > LA[2] ? LA[2] : lf, j = x <= 0 ? 0 : 1, t = (x - LA[j]) / (LA[j + 1] - LA[j]);
      return ex(j, m) * (1 - t) + ex(j + 1, m) * t;
    };
    const months = [];
    for (let p = 0; p < paths; p++) {
      let bal = startPortfolio, m = 0, r = 0, lf = 0, dlf = 0, e = extra(0, 0);
      while (bal + e < target - 1 && m < MAX) {
        if (m % 12 === 0) { const z = normalFrom(rand); r = monthlyRate(Math.exp(mu + sigma * z) - 1); dlf = sx * z / 12; }
        bal = bal * (1 + r) + monthlySavings;
        lf += dlf;
        m++;
        e = extra(m, lf);
      }
      months.push(bal + e >= target - 1 ? m : Infinity);
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
    const p0 = pensionWithWork(inputs, 0);
    const pensionAnnual = p0.annual, pensionWeekly = p0.weekly;
    const gapAfterPension = Math.max(0, gap - pensionAnnual);
    // floor, not round: 99.6% funded must not read as "100% — your portfolio funds it".
    const freedomPct = annualSpend > 0 ? Math.min(100, Math.floor((portfolioIncome / annualSpend) * 100)) : 0;
    // Work to close the gap once the pension is paid: work income counts in the pension's
    // income test (less the Work Bonus), so above that each $1 earned costs about 50c of
    // pension and it takes more work than the gap alone suggests.
    const workNeeded = workToClose(inputs, portfolioIncome);
    return { portfolioIncome, gap, pensionAnnual, pensionWeekly, gapAfterPension, freedomPct, workNeeded };
  }

  // The Age Pension for these inputs with `work` $ a year of work income (Work Bonus and
  // income test applied; renters' rentFortnight for Rent Assistance). 0 if unavailable.
  function pensionWithWork(inputs, work) {
    const { portfolio, isHomeowner, isCouple, pensionAssets, partnerEligible, partnerSuper, rentFortnight } = inputs;
    if (!pensionAvailable()) return { annual: 0, weekly: 0 };
    try {
      const opts = Object.assign({ workIncome: Math.max(0, work || 0) },
        isCouple && partnerEligible != null ? { partnerEligible: !!partnerEligible, partnerSuper: partnerSuper || 0 } : {},
        !isHomeowner && rentFortnight > 0 ? { rentFortnight } : {});
      const p = calculateAgePension(pensionAssets == null ? portfolio : pensionAssets, Math.max(0, work || 0), isHomeowner, !!isCouple, undefined, opts);
      return { annual: p.annualPension || 0, weekly: p.weeklyPension || 0 };
    } catch (e) { return { annual: 0, weekly: 0 }; }
  }
  // Yearly work income that, with the investments' income and the pension it leaves,
  // covers the spending. 0 if nothing's needed.
  function workToClose(inputs, portfolioIncome) {
    const spend = inputs.annualSpend || 0;
    const short = w => spend - portfolioIncome - w - pensionWithWork(inputs, w).annual;
    if (short(0) <= 0) return 0;
    let lo = 0, hi = Math.max(1, spend);
    while (short(hi) > 0 && hi < spend * 4) hi *= 2;
    for (let k = 0; k < 50 && hi - lo > 1; k++) { const mid = (lo + hi) / 2; if (short(mid) > 0) lo = mid; else hi = mid; }
    return hi;
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
 
  return { fmtM, niceHours, monthlyRate, SUPER_RETURN, SUPER_EXTRA_FEES, SUPER_TAX_SHARE, PRESERVATION_AGE, PENSION_AGE, INCOME_YIELD, DEFAULT_MARGINAL_RATE, MC, simulateDrawdown, simulateTimeToTarget, projectPortfolio, solveMonthsToTarget, recommendNextStep, solveFreedomAge, freedomPlan, freedomRange, coastPoint, agePensionPlan, cushionNote, agePensionLine, agedCareCosts, mortgageNote, noteFacts, savingsNote, headlineNotes, superGrow, DIV296, projectAccessible, planInputsFromProfile, outsideSuperReturn, frankingCredit, ausShareFor, CASH_REAL_RETURN, safeWithdrawalRate, computeFreedomPicture, pensionWithWork, retireeTax, formatTimeSince, compareSnapshots };
})();