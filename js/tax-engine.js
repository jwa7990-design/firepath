// js/tax-engine.js
// FirePath Tax Engine — Australian tax calculations
// Auto-switches between 2025-26 and 2026-27 based on today's date
// Update annually: TAX_YEARS object below

const TAX_YEARS = {
  '2025-26': {
    year: '2025-26',
    brackets: [
      { min: 0,      max: 18200,    rate: 0 },
      { min: 18201,  max: 45000,    rate: 0.16 },
      { min: 45001,  max: 135000,   rate: 0.30 },
      { min: 135001, max: 190000,   rate: 0.37 },
      { min: 190001, max: Infinity, rate: 0.45 }
    ],
    medicareLevy: 0.02,
    medicareLevyThreshold: 27222,
    lito: { maxOffset: 700, fullOffsetTo: 37500, phaseOut1End: 45000, phaseOut2Start: 45000, phaseOut2End: 66667 },
    concessionalCap: 30000,
    nonConcessionalCap: 120000,
    superTaxRate: 0.15,
    sgRate: 0.12,
    agePension: {
      eligibilityAge: 67,
      singleFortnight: 1200.90,
      coupleFortnight: 1810.40,
      assetsTestSingleHomeowner: { full: 321500, nil: 695500 },
      assetsTestCoupleHomeowner: { full: 481500, nil: 1045500 },
      incomeTestFreeArea: 212,
      taperRate: 0.50
    }
  },
  '2026-27': {
    year: '2026-27',
    brackets: [
      { min: 0,      max: 18200,    rate: 0 },
      { min: 18201,  max: 45000,    rate: 0.15 },
      { min: 45001,  max: 135000,   rate: 0.30 },
      { min: 135001, max: 190000,   rate: 0.37 },
      { min: 190001, max: Infinity, rate: 0.45 }
    ],
    medicareLevy: 0.02,
    medicareLevyThreshold: 29207,
    lito: { maxOffset: 700, fullOffsetTo: 37500, phaseOut1End: 45000, phaseOut2Start: 45000, phaseOut2End: 66667 },
    concessionalCap: 32500,
    nonConcessionalCap: 130000,
    superTaxRate: 0.15,
    sgRate: 0.12,
    agePension: {
      eligibilityAge: 67,
      singleFortnight: 1200.90,
      coupleFortnight: 1810.40,
      assetsTestSingleHomeowner: { full: 321500, nil: 695500 },
      assetsTestCoupleHomeowner: { full: 481500, nil: 1045500 },
      incomeTestFreeArea: 212,
      taperRate: 0.50
    }
  }
};

// Auto-select tax year based on today's date
function getCurrentTaxYear() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // 1-indexed
  if (year > 2026 || (year === 2026 && month >= 7)) return '2026-27';
  return '2025-26';
}

const TAX_CONFIG = TAX_YEARS[getCurrentTaxYear()];

function calculateTax(grossIncome) {
  if (!grossIncome || grossIncome <= 0) return { tax: 0, medicare: 0, lito: 0, total: 0, takeHome: 0, effectiveRate: 0 };
  let tax = 0;
  for (const bracket of TAX_CONFIG.brackets) {
    if (grossIncome > bracket.min) {
      const taxable = Math.min(grossIncome, bracket.max) - bracket.min + (bracket.min === 0 ? 0 : 1);
      tax += taxable * bracket.rate;
    }
  }
  let lito = 0;
  const l = TAX_CONFIG.lito;
  if (grossIncome <= l.fullOffsetTo) {
    lito = l.maxOffset;
  } else if (grossIncome <= l.phaseOut1End) {
    lito = l.maxOffset - (grossIncome - l.fullOffsetTo) * 0.05;
  } else if (grossIncome <= l.phaseOut2End) {
    lito = Math.max(0, 325 - (grossIncome - l.phaseOut2Start) * 0.015);
  }
  lito = Math.max(0, lito);
  tax = Math.max(0, tax - lito);
  const medicare = grossIncome > TAX_CONFIG.medicareLevyThreshold ? grossIncome * TAX_CONFIG.medicareLevy : 0;
  const total = tax + medicare;
  const takeHome = grossIncome - total;
  const effectiveRate = grossIncome > 0 ? total / grossIncome : 0;
  return { tax: Math.round(tax), medicare: Math.round(medicare), lito: Math.round(lito), total: Math.round(total), takeHome: Math.round(takeHome), effectiveRate };
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

function calculateAgePension(assets, income, isHomeowner = true, isCouple = false) {
  const threshold = isCouple ? TAX_CONFIG.agePension.assetsTestCoupleHomeowner : TAX_CONFIG.agePension.assetsTestSingleHomeowner;
  const maxPension = (isCouple ? TAX_CONFIG.agePension.coupleFortnight : TAX_CONFIG.agePension.singleFortnight) * 26;
  const assetsReduction = Math.max(0, assets - threshold.full) * (0.78 * 26 / 250);
  const pensionAfterAssets = Math.max(0, maxPension - assetsReduction);
  const annualIncomeFree = TAX_CONFIG.agePension.incomeTestFreeArea * 26;
  const incomeReduction = Math.max(0, income - annualIncomeFree) * TAX_CONFIG.agePension.taperRate;
  const pensionAfterIncome = Math.max(0, maxPension - incomeReduction);
  const annualPension = Math.min(pensionAfterAssets, pensionAfterIncome);
  const fortnightlyPension = Math.round(annualPension / 26);
  const weeklyPension = Math.round(annualPension / 52);
  return { annualPension: Math.round(annualPension), fortnightlyPension, weeklyPension, maxAnnual: Math.round(maxPension), assetsReduction: Math.round(assetsReduction), incomeReduction: Math.round(incomeReduction) };
}
