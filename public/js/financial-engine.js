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
    if (n == null || isNaN(n)) return '—';
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
 
  // Picks the single highest-value thing for this person to do next — one ranked
  // pass through the possible reasons, first match wins. Was previously only defined
  // as a page-local copy inside firepath_pro.html; journey.html already assumed it
  // lived here (calls it as window.FirePathEngine.recommendNextStep). Same function,
  // just promoted so both pages share one copy instead of drifting apart.
  //
  // `headline` is a short, imperative framing of the same recommendation — "Build
  // your emergency buffer." rather than a generic "Why this matters" label — meant
  // to be the first thing a person reads on the Next Move card, with `reason` as the
  // supporting sentence underneath it. Added alongside `type`/`reason`, not replacing
  // them, so any older cached call site that only reads `reason` still works.
  function recommendNextStep(savingsType, persona, sRate, superBal, debt, age, hasEmergencyFund) {
    if (sRate === 0) return { type: 'learn', topic: 'what-is-fire', track: 'foundation', title: 'What is FIRE and is it realistic for me?', headline: 'Understand what FIRE actually means for you.', reason: 'You\'re not saving yet — this is worth understanding before anything else.' };
    if (hasEmergencyFund === false) return { type: 'learn', topic: 'emergency-fund', track: 'foundation', title: 'Why an emergency fund comes before investing', headline: 'Build your emergency buffer.', reason: 'You told us you don\'t have money set aside for emergencies yet — worth understanding why this usually comes before optimising anything else.' };
    if (persona === 'fire') return { type: 'tool', name: 'Withdrawal Modeling', url: 'withdrawal.html', headline: 'Stress-test how long your money lasts.', reason: 'Worth stress-testing how long your portfolio actually lasts once you stop working.' };
    if (debt > 0 && superBal > 0) return { type: 'ask', name: 'Ask FirePath', url: 'ask-firepath.html', headline: 'Weigh paying down debt against super.', reason: `Ask what happens if you paid down debt faster, or salary sacrificed more into super.` };
    if (superBal > 0 && age && age < 45) return { type: 'learn', topic: 'two-phase', track: 'foundation', title: 'Your two-phase freedom timeline', headline: 'See how your two timelines interact.', reason: `With super locked until 60, understanding how your two timelines interact is worth exploring.` };
    if (savingsType === 'cash') return { type: 'ask', name: 'Ask FirePath', url: 'ask-firepath.html', headline: 'See what your cash could be doing instead.', reason: 'Ask what happens if that cash was invested instead — a real, calculated answer.' };
    if (savingsType === 'etfs') return { type: 'ask', name: 'Ask FirePath', url: 'ask-firepath.html', headline: 'Find out what a bit more each month buys you.', reason: 'Ask what happens if you saved a bit more each month.' };
    if (savingsType === 'offset') return { type: 'explore', name: 'Scenario Explorer', url: 'hearmeout.html?scenario=loan', headline: 'Compare your offset against investing.', reason: 'Compare what your offset is really doing against investing that same money.' };
    if (savingsType === 'mix') return { type: 'learn', topic: 'diversification', track: '5', title: 'What diversification actually means', headline: 'Understand what you\'re actually holding.', reason: 'With a mix of savings types, this explores how to think about what you\'re holding and why.' };
    return { type: 'learn', topic: 'compounding', track: 'foundation', title: 'How compound interest actually works', headline: 'Get the one concept that changes everything.', reason: 'The single most important concept behind your freedom number — worth really understanding.' };
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
        try { pensionIncome = calculateAgePension(portfolio + superBal, 0, homeowner, !!isCouple).annualPension || 0; } catch (e) {}
      }
      if (portfolioIncome + pensionIncome >= targetSpend) {
        return { age, portfolio: Math.round(portfolio), superBalance: Math.round(superBal), portfolioIncome: Math.round(portfolioIncome), pensionIncome: Math.round(pensionIncome) };
      }
    }
    return null;
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
  function simulateTimeToTarget({ startPortfolio, monthlySavings, target, paths, seed, median, volatility }) {
    paths = paths || MC.paths;
    const next = returnSampler(seed == null ? 2 : seed, median, volatility);
    const MAX = 50 * 12;
    const months = [];
    for (let p = 0; p < paths; p++) {
      let bal = startPortfolio, m = 0, r = 0;
      while (bal < target && m < MAX) {
        if (m % 12 === 0) r = monthlyRate(next());
        bal = bal * (1 + r) + monthlySavings;
        m++;
      }
      months.push(bal >= target ? m : Infinity);
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
    const { portfolio, annualSpend, isHomeowner, withdrawalRate, isCouple, pensionAssets } = inputs;
    const rate = withdrawalRate == null ? 0.04 : withdrawalRate;
    const portfolioIncome = portfolio * rate;
    const gap = Math.max(0, annualSpend - portfolioIncome);
    let pensionAnnual = 0, pensionWeekly = 0;
    if (pensionAvailable()) {
      try {
        const pension = calculateAgePension(pensionAssets == null ? portfolio : pensionAssets, 0, isHomeowner, !!isCouple);
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
 
  return { fmtM, niceHours, monthlyRate, SUPER_RETURN, SUPER_EXTRA_FEES, PRESERVATION_AGE, PENSION_AGE, MC, simulateDrawdown, simulateTimeToTarget, projectPortfolio, solveMonthsToTarget, recommendNextStep, solveFreedomAge, computeFreedomPicture, formatTimeSince, compareSnapshots };
})();