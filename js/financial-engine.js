/**
 * FirePath — Financial Engine
 * =============================
 * Owns objective financial calculations only — "given these inputs, what are the
 * numbers." No opinion about which cards to show, what wording to use, or which
 * options are relevant to a given person — that's each page's own product logic,
 * built on top of what this file returns.
 *
 * Requires js/calculations.js to be loaded first (for calculateAgePension). Load
 * this file after it:
 *   <script src="js/calculations.js"></script>
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
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
    return '$' + Math.round(n);
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
 
  // Compounds a starting portfolio forward with ongoing monthly contributions.
  function projectPortfolio(startPortfolio, monthlySavings, years, rate) {
    rate = rate == null ? 0.07 : rate;
    let bal = startPortfolio;
    const r = rate / 12;
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
    const r = rate / 12;
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
  function recommendNextStep(savingsType, persona, sRate, superBal, debt, age, hasEmergencyFund) {
    if (sRate === 0) return { type: 'learn', topic: 'what-is-fire', track: 'foundation', title: 'What is FIRE and is it realistic for me?', reason: 'You\'re not saving yet — this is worth understanding before anything else.' };
    if (hasEmergencyFund === false) return { type: 'learn', topic: 'emergency-fund', track: 'foundation', title: 'Why an emergency fund comes before investing', reason: 'You told us you don\'t have money set aside for emergencies yet — worth understanding why this usually comes before optimising anything else.' };
    if (persona === 'fire') return { type: 'tool', name: 'Withdrawal Modeling', url: 'withdrawal.html', reason: 'Worth stress-testing how long your portfolio actually lasts once you stop working.' };
    if (debt > 0 && superBal > 0) return { type: 'ask', name: 'Ask FirePath', url: 'ask-firepath.html', reason: `Ask what happens if you paid down debt faster, or salary sacrificed more into super.` };
    if (superBal > 0 && age && age < 45) return { type: 'learn', topic: 'two-phase', track: 'foundation', title: 'Your two-phase freedom timeline', reason: `With super locked until 60, understanding how your two timelines interact is worth exploring.` };
    if (savingsType === 'cash') return { type: 'ask', name: 'Ask FirePath', url: 'ask-firepath.html', reason: 'Ask what happens if that cash was invested instead — a real, calculated answer.' };
    if (savingsType === 'etfs') return { type: 'ask', name: 'Ask FirePath', url: 'ask-firepath.html', reason: 'Ask what happens if you saved a bit more each month.' };
    if (savingsType === 'offset') return { type: 'explore', name: 'Scenario Explorer', url: 'hearmeout.html?scenario=loan', reason: 'Compare what your offset is really doing against investing that same money.' };
    if (savingsType === 'mix') return { type: 'learn', topic: 'diversification', track: '5', title: 'What diversification actually means', reason: 'With a mix of savings types, this explores how to think about what you\'re holding and why.' };
    return { type: 'learn', topic: 'compounding', track: 'foundation', title: 'How compound interest actually works', reason: 'The single most important concept behind your freedom number — worth really understanding.' };
  }
 
  // Finds the youngest age (from currentAge) at which portfolio income — plus the Age
  // Pension once age 67 is reached — covers targetSpend. Returns null if not reached by 90.
  function solveFreedomAge(currentAge, startPortfolio, monthlySavings, targetSpend, homeowner, rate) {
    rate = rate == null ? 0.07 : rate;
    const CEILING_AGE = 90;
    for (let age = Math.ceil(currentAge); age <= CEILING_AGE; age++) {
      const yearsOut = age - currentAge;
      const portfolio = projectPortfolio(startPortfolio, monthlySavings, yearsOut, rate);
      const portfolioIncome = portfolio * 0.04;
      let pensionIncome = 0;
      if (age >= 67 && typeof calculateAgePension === 'function') {
        try { pensionIncome = calculateAgePension(portfolio, portfolioIncome, homeowner, false).annualPension || 0; } catch (e) {}
      }
      if (portfolioIncome + pensionIncome >= targetSpend) {
        return { age, portfolio: Math.round(portfolio), portfolioIncome: Math.round(portfolioIncome), pensionIncome: Math.round(pensionIncome) };
      }
    }
    return null;
  }
 
  // The "today's snapshot" — portfolio income, gap, pension estimate, gap after pension,
  // and freedom percentage — all derived consistently from the same inputs. Both Freedom
  // Gap and Freedom Options need this exact bundle; previously each derived it separately.
  function computeFreedomPicture(inputs) {
    const { portfolio, annualSpend, isHomeowner, withdrawalRate } = inputs;
    const rate = withdrawalRate == null ? 0.04 : withdrawalRate;
    const portfolioIncome = portfolio * rate;
    const gap = Math.max(0, annualSpend - portfolioIncome);
    let pensionAnnual = 0, pensionWeekly = 0;
    if (typeof calculateAgePension === 'function') {
      try {
        const pension = calculateAgePension(portfolio, portfolioIncome, isHomeowner, false);
        pensionAnnual = pension.annualPension || 0;
        pensionWeekly = pension.weeklyPension || 0;
      } catch (e) {}
    }
    const gapAfterPension = Math.max(0, gap - pensionAnnual);
    const freedomPct = annualSpend > 0 ? Math.min(100, Math.round((portfolioIncome / annualSpend) * 100)) : 0;
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
 
  return { fmtM, niceHours, projectPortfolio, solveMonthsToTarget, recommendNextStep, solveFreedomAge, computeFreedomPicture, formatTimeSince, compareSnapshots };
})();