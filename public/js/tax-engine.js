// js/tax-engine.js
// FirePath Tax Engine — Australian tax, super and Age Pension calculations.
//
// Two kinds of figures live here, and they change on different calendars:
//   TAX_YEARS    — income tax, Medicare levy, LITO, super caps. Change each 1 July.
//   AGE_PENSION  — pension rates and means-test limits. Change 20 March, 1 July
//                  and 20 September. Update `effectiveFrom` when you update them.
// tests/engine.test.js checks the calculations against worked examples — run it
// after changing any figure:  node tests/engine.test.js

const TAX_YEARS = {
  '2025-26': {
    year: '2025-26',
    // Upper edge of each bracket; each bracket starts where the previous one ends.
    brackets: [
      { min: 0,      max: 18200,    rate: 0 },
      { min: 18200,  max: 45000,    rate: 0.16 },
      { min: 45000,  max: 135000,   rate: 0.30 },
      { min: 135000, max: 190000,   rate: 0.37 },
      { min: 190000, max: Infinity, rate: 0.45 }
    ],
    medicareLevy: 0.02,
    // Low-income threshold for a single person (ATO, raised retrospectively for 2025-26).
    // Between this and 1.25× it the levy phases in at 10c per dollar over.
    medicareLevyThreshold: 28011,
    lito: { maxOffset: 700, fullOffsetTo: 37500, phaseOut1End: 45000, phaseOut2Start: 45000, phaseOut2End: 66667 },
    concessionalCap: 30000,
    nonConcessionalCap: 120000,
    superTaxRate: 0.15,
    sgRate: 0.12
  },
  '2026-27': {
    year: '2026-27',
    // Legislated cut: the 16% rate falls to 15% from 1 July 2026 (and 14% from 1 July 2027).
    brackets: [
      { min: 0,      max: 18200,    rate: 0 },
      { min: 18200,  max: 45000,    rate: 0.15 },
      { min: 45000,  max: 135000,   rate: 0.30 },
      { min: 135000, max: 190000,   rate: 0.37 },
      { min: 190000, max: Infinity, rate: 0.45 }
    ],
    medicareLevy: 0.02,
    // 2026-27 low-income thresholds are set in the May 2027 Budget. Until then this
    // carries the latest legislated figure (2025-26) — slightly conservative.
    medicareLevyThreshold: 28011,
    lito: { maxOffset: 700, fullOffsetTo: 37500, phaseOut1End: 45000, phaseOut2Start: 45000, phaseOut2End: 66667 },
    concessionalCap: 32500,
    nonConcessionalCap: 130000,
    superTaxRate: 0.15,
    sgRate: 0.12
  }
};

// Age Pension — DSS "Social Security Payment Parameters", 20 September 2026 indexation.
// Assets full-pension thresholds and the income free area are the 1 July 2026 figures
// (they reconcile exactly with the 20 September cut-offs: cut-off = threshold + max rate ÷ taper).
const AGE_PENSION = {
  effectiveFrom: '2026-09-20',
  eligibilityAge: 67,
  // Maximum fortnightly rate incl. pension + energy supplements. Couple = combined.
  singleFortnight: 1237.70,
  coupleFortnight: 1866.00,
  assets: {
    // Full pension up to `full`; reduces $3/fortnight per $1,000 above it.
    single: { homeowner: { full: 333000, nil: 745750 }, nonHomeowner: { full: 600000, nil: 1012750 } },
    couple: { homeowner: { full: 499000, nil: 1121000 }, nonHomeowner: { full: 766000, nil: 1388000 } },
    taperPerDollarFortnight: 3 / 1000
  },
  income: {
    // Fortnightly income free area; pension reduces 50c per dollar above it.
    freeArea: { single: 226, couple: 396 },
    taper: 0.50
  },
  // Centrelink doesn't count what your investments actually pay or what you draw down —
  // it "deems" financial assets to earn these rates (20 Sep 2026 – 19 Mar 2027).
  deeming: {
    lowerRate: 0.0175,
    upperRate: 0.0375,
    threshold: { single: 66800, couple: 110600 }
  }
};

// Pick the tax year for a date (defaults to today). Past the last year we have figures
// for, keep using the newest one but flag it so the UI/console can say so.
function getCurrentTaxYear(date) {
  const d = date || new Date();
  const startYear = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; // FY starts 1 July
  const key = `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
  if (TAX_YEARS[key]) return key;
  const known = Object.keys(TAX_YEARS).sort();
  return startYear < parseInt(known[0], 10) ? known[0] : known[known.length - 1];
}

const TAX_CONFIG = (function () {
  const key = getCurrentTaxYear();
  const cfg = Object.assign({}, TAX_YEARS[key]);
  const today = new Date();
  const fyStart = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  cfg.stale = parseInt(key, 10) !== fyStart;
  if (cfg.stale && typeof console !== 'undefined') console.warn(`FirePath tax engine: no figures for the current financial year — using ${key}. Update TAX_YEARS in js/tax-engine.js.`);
  // Older call sites read pension figures off TAX_CONFIG.
  cfg.agePension = AGE_PENSION;
  return cfg;
})();

function incomeTax(grossIncome, cfg) {
  let tax = 0;
  for (const b of cfg.brackets) {
    if (grossIncome > b.min) tax += (Math.min(grossIncome, b.max) - b.min) * b.rate;
  }
  return tax;
}

function lowIncomeOffset(grossIncome, cfg) {
  const l = cfg.lito;
  if (grossIncome <= l.fullOffsetTo) return l.maxOffset;
  if (grossIncome <= l.phaseOut1End) return l.maxOffset - (grossIncome - l.fullOffsetTo) * 0.05;
  if (grossIncome <= l.phaseOut2End) return Math.max(0, 325 - (grossIncome - l.phaseOut2Start) * 0.015);
  return 0;
}

// Medicare levy with the low-income phase-in: nothing up to the threshold, then 10c per
// dollar over it until that reaches the full 2% (at 1.25× the threshold). No cliff.
function medicareLevy(grossIncome, cfg) {
  if (grossIncome <= cfg.medicareLevyThreshold) return 0;
  return Math.min((grossIncome - cfg.medicareLevyThreshold) * 0.10, grossIncome * cfg.medicareLevy);
}

function calculateTax(grossIncome, cfg) {
  const c = cfg || TAX_CONFIG;
  if (!grossIncome || grossIncome <= 0) return { tax: 0, medicare: 0, lito: 0, total: 0, takeHome: 0, effectiveRate: 0 };
  const lito = lowIncomeOffset(grossIncome, c);
  const tax = Math.max(0, incomeTax(grossIncome, c) - lito);
  const medicare = medicareLevy(grossIncome, c);
  const total = tax + medicare;
  const takeHome = grossIncome - total;
  return { tax: Math.round(tax), medicare: Math.round(medicare), lito: Math.round(lito), total: Math.round(total), takeHome: Math.round(takeHome), effectiveRate: total / grossIncome };
}

function calculateMarginalRate(grossIncome) {
  for (let i = TAX_CONFIG.brackets.length - 1; i >= 0; i--) {
    if (grossIncome > TAX_CONFIG.brackets[i].min) {
      return TAX_CONFIG.brackets[i].rate + TAX_CONFIG.medicareLevy;
    }
  }
  return 0;
}

// Inverse of calculateTax — finds the annual gross income that produces a given
// annual take-home, via binary search. calculateTax() is monotonic (more gross
// always means more take-home), so this converges reliably and exactly against
// the real tax brackets, rather than approximating with a flat divisor.
function estimateGrossFromNet(targetTakeHome, maxIterations = 60) {
  if (!targetTakeHome || targetTakeHome <= 0) return 0;
  let low = 0;
  let high = targetTakeHome * 2.5; // safe upper bound — effective tax rate never exceeds ~47%
  let guard = 0;
  while (calculateTax(high).takeHome < targetTakeHome && guard < 30) {
    high *= 2;
    guard++;
  }
  for (let i = 0; i < maxIterations; i++) {
    const mid = (low + high) / 2;
    const result = calculateTax(mid);
    if (Math.abs(result.takeHome - targetTakeHome) < 1) return Math.round(mid);
    if (result.takeHome < targetTakeHome) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return Math.round((low + high) / 2);
}

function calculateSalarySacrifice(grossIncome, sacrificeAmount) {
  if (!sacrificeAmount || sacrificeAmount <= 0) return null;
  const cappedSacrifice = Math.min(sacrificeAmount, TAX_CONFIG.concessionalCap);
  const newGross = Math.max(0, grossIncome - cappedSacrifice);
  const before = calculateTax(grossIncome);
  const after = calculateTax(newGross);
  const taxSaved = before.total - after.total;
  const superTax = cappedSacrifice * TAX_CONFIG.superTaxRate;
  const netSuperGain = cappedSacrifice - superTax;
  const takehomeCost = cappedSacrifice - taxSaved;
  const sgContrib = grossIncome * TAX_CONFIG.sgRate;
  const atCapWarning = (sacrificeAmount + sgContrib) > TAX_CONFIG.concessionalCap;
  return { grossIncome, sacrificeAmount: cappedSacrifice, newGross, taxSaved: Math.round(taxSaved), superTax: Math.round(superTax), netSuperGain: Math.round(netSuperGain), takehomeCost: Math.round(takehomeCost), atCapWarning };
}

function calculateOffsetBenefit(mortgageRate, offsetBalance, marginalRate) {
  const offsetReturn = mortgageRate;
  const investReturnAfterTax = 0.07 * (1 - marginalRate);
  const offsetBetter = offsetReturn > investReturnAfterTax;
  const annualSaving = offsetBalance * mortgageRate;
  const annualInvestGain = offsetBalance * investReturnAfterTax;
  const difference = Math.abs(annualSaving - annualInvestGain);
  return { offsetReturn, investReturnAfterTax, offsetBetter, annualSaving: Math.round(annualSaving), annualInvestGain: Math.round(annualInvestGain), difference: Math.round(difference) };
}

// Annual income Centrelink deems a pile of financial assets to earn.
function deemedIncome(financialAssets, isCouple = false) {
  const d = AGE_PENSION.deeming;
  const fa = Math.max(0, financialAssets || 0);
  const threshold = isCouple ? d.threshold.couple : d.threshold.single;
  return Math.min(fa, threshold) * d.lowerRate + Math.max(0, fa - threshold) * d.upperRate;
}

// Age Pension under both means tests; the lower result applies. All amounts annual.
//   assets          — assessable assets (excludes the family home)
//   otherIncome     — assessable income other than deemed income (e.g. wages, rent).
//                     Don't pass portfolio drawdowns: Centrelink deems financial assets
//                     instead of counting what you withdraw.
//   financialAssets — the part of `assets` that's deemed (shares, ETFs, cash, account-
//                     based super in pension phase). Defaults to all of `assets`.
function calculateAgePension(assets, otherIncome = 0, isHomeowner = true, isCouple = false, financialAssets) {
  const P = AGE_PENSION;
  const maxPension = (isCouple ? P.coupleFortnight : P.singleFortnight) * 26;

  const limits = P.assets[isCouple ? 'couple' : 'single'][isHomeowner ? 'homeowner' : 'nonHomeowner'];
  const assetsReduction = Math.max(0, (assets || 0) - limits.full) * P.assets.taperPerDollarFortnight * 26;
  const pensionAfterAssets = Math.max(0, maxPension - assetsReduction);

  const deemed = deemedIncome(financialAssets == null ? assets : financialAssets, isCouple);
  const assessableIncome = deemed + Math.max(0, otherIncome || 0);
  const freeArea = (isCouple ? P.income.freeArea.couple : P.income.freeArea.single) * 26;
  const incomeReduction = Math.max(0, assessableIncome - freeArea) * P.income.taper;
  const pensionAfterIncome = Math.max(0, maxPension - incomeReduction);

  const annualPension = Math.min(pensionAfterAssets, pensionAfterIncome);
  return {
    annualPension: Math.round(annualPension),
    fortnightlyPension: Math.round(annualPension / 26),
    weeklyPension: Math.round(annualPension / 52),
    maxAnnual: Math.round(maxPension),
    assetsReduction: Math.round(assetsReduction),
    incomeReduction: Math.round(incomeReduction),
    deemedIncome: Math.round(deemed),
    bindingTest: pensionAfterAssets <= pensionAfterIncome ? 'assets' : 'income'
  };
}
