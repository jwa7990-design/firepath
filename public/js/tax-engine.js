// js/tax-engine.js
// FirePath Tax Engine — Australian tax, super and Age Pension calculations.
//
// Two kinds of figures live here, and they change on different calendars:
//   TAX_YEARS    — income tax, Medicare levy, LITO, super caps. Change each 1 July.
//   AGE_PENSION  — pension rates and means-test limits. Change 20 March, 1 July
//                  and 20 September. Update `effectiveFrom` when you update them.
// tests/engine.test.cjs checks the calculations against worked examples — run it
// after changing any figure:  npm test

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
    sgRate: 0.12,
    // HELP/HECS (marginal system from 2025-26): 15c per $ over `start`; from `mid`, a
    // fixed amount + 17c per $ over it; from `top`, 10% of all repayment income.
    help: { start: 67000, mid: 125000, midBase: 8700, top: 179285 },
    // Medicare levy surcharge for singles without private hospital cover (income for
    // MLS purposes = taxable income + reportable super contributions, among others).
    mls: [{ from: 101000, rate: 0.01 }, { from: 118000, rate: 0.0125 }, { from: 158000, rate: 0.015 }],
    // Seniors and pensioners tax offset (ATO, 2025-26): for Age Pension age (67) and
    // eligible for a pension even if not paid it. Reduces 12.5c per $ of rebate income
    // over the shade-out; nothing from the cut-out. Couple = each partner.
    sapto: { single: { max: 2230, shadeOut: 34919, cutOut: 52759 }, couple: { max: 1602, shadeOut: 30994, cutOut: 43810 } },
    // Medicare levy low-income threshold for people entitled to SAPTO (single, ATO 2025-26).
    medicareLevyThresholdSenior: 44268
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
    sgRate: 0.12,
    help: { start: 69528, mid: 129717, midBase: 9028, top: 186050 },
    mls: [{ from: 105000, rate: 0.01 }, { from: 123000, rate: 0.0125 }, { from: 164000, rate: 0.015 }],
    // SAPTO 2026-27 (ATO, new tax cuts): thresholds move with the 15% rate; the maximum
    // offsets don't change.
    sapto: { single: { max: 2230, shadeOut: 36034, cutOut: 53874 }, couple: { max: 1602, shadeOut: 31847, cutOut: 44663 } },
    // Not yet published for 2026-27: carries the 2025-26 figure, like the threshold above.
    medicareLevyThresholdSenior: 44268
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
  const atPhaseOut2 = l.maxOffset - (l.phaseOut1End - l.fullOffsetTo) * 0.05;   // $325
  if (grossIncome <= l.phaseOut2End) return Math.max(0, atPhaseOut2 - (grossIncome - l.phaseOut2Start) * 0.015);
  return 0;
}

// Medicare levy with the low-income phase-in: nothing up to the threshold, then 10c per
// dollar over it until that reaches the full 2% (at 1.25× the threshold). No cliff.
// `senior` (entitled to at least $1 of SAPTO) uses the higher seniors' threshold.
function medicareLevy(grossIncome, cfg, senior) {
  const threshold = senior && cfg.medicareLevyThresholdSenior ? cfg.medicareLevyThresholdSenior : cfg.medicareLevyThreshold;
  if (grossIncome <= threshold) return 0;
  return Math.min((grossIncome - threshold) * 0.10, grossIncome * cfg.medicareLevy);
}

// Seniors and pensioners tax offset. status: 'single' | 'couple' (each partner), anything
// else = not eligible (under 67, or not eligible for a pension). rebateIncome ≈ taxable
// income plus reportable super. Simplifications: a couple's cut-out test uses this
// person's own income (the ATO halves the couple's combined income), and moving an
// unused offset to a spouse isn't modelled. Non-refundable: callers cap it at the tax.
function seniorsOffset(rebateIncome, cfg, status) {
  const t = (cfg || TAX_CONFIG).sapto && (cfg || TAX_CONFIG).sapto[status];
  const r = Number(rebateIncome);
  if (!t || !Number.isFinite(r) || r >= t.cutOut) return 0;
  return Math.max(0, t.max - Math.max(0, r - t.shadeOut) * 0.125);
}

// Total tax on a taxable income, unrounded: bracket tax less LITO (and SAPTO when
// `senior` is 'single' or 'couple'), plus Medicare levy.
// rebateIncome defaults to the taxable income (salary sacrifice adds back to it).
function totalTaxRaw(grossIncome, c, senior, rebateIncome) {
  const sapto = senior ? seniorsOffset(rebateIncome != null ? rebateIncome : grossIncome, c, senior) : 0;
  return Math.max(0, incomeTax(grossIncome, c) - lowIncomeOffset(grossIncome, c) - sapto) + medicareLevy(grossIncome, c, sapto >= 1);
}

// Compulsory HELP repayment for the year on `repaymentIncome` (taxable income plus
// reportable super contributions such as salary sacrifice, among other items).
function helpRepayment(repaymentIncome, cfg) {
  const h = (cfg || TAX_CONFIG).help;
  const r = Number(repaymentIncome);
  if (!h || !Number.isFinite(r) || r <= h.start) return 0;
  if (r > h.top) return r * 0.10;
  if (r > h.mid) return h.midBase + (r - h.mid) * 0.17;
  return (r - h.start) * 0.15;
}

// Medicare levy surcharge (single, no private hospital cover). The rate applies to
// the whole MLS income, not just the part over the threshold.
function medicareLevySurcharge(mlsIncome, cfg) {
  const tiers = (cfg || TAX_CONFIG).mls || [];
  const i = Number(mlsIncome);
  if (!Number.isFinite(i)) return 0;
  let rate = 0;
  for (const t of tiers) if (i > t.from) rate = t.rate;
  return i * rate;
}

// calculateTax(gross, cfg, { help: true, noPrivateCover: true, reportableSuper })
//  • help — has a HELP/HECS debt: the compulsory repayment comes out of take-home.
//  • noPrivateCover — no private hospital cover: Medicare levy surcharge applies.
//  • reportableSuper — salary sacrifice etc., which counts towards HELP and MLS income
//    even though it isn't taxable income.
//  • senior — 'single' or 'couple': 67 or over and eligible for the Age Pension (even if
//    not paid it), so the seniors and pensioners tax offset and its Medicare threshold apply.
function calculateTax(grossIncome, cfg, opts) {
  const c = cfg || TAX_CONFIG;
  grossIncome = Number(grossIncome);
  if (!Number.isFinite(grossIncome) || grossIncome <= 0) return { tax: 0, medicare: 0, lito: 0, sapto: 0, total: 0, takeHome: 0, effectiveRate: 0 };
  const o = opts || {};
  const extraIncome = Math.max(0, Number(o.reportableSuper) || 0);
  const lito = lowIncomeOffset(grossIncome, c);
  const saptoFull = o.senior ? seniorsOffset(grossIncome + extraIncome, c, o.senior) : 0;
  const sapto = Math.min(saptoFull, Math.max(0, incomeTax(grossIncome, c) - lito));   // non-refundable
  const tax = Math.max(0, incomeTax(grossIncome, c) - lito - sapto);
  const medicare = medicareLevy(grossIncome, c, saptoFull >= 1);
  const mls = o.noPrivateCover ? medicareLevySurcharge(grossIncome + extraIncome, c) : 0;
  const help = o.help ? helpRepayment(grossIncome + extraIncome, c) : 0;
  const total = tax + medicare + mls;          // tax proper; HELP is a loan repayment, shown separately
  const takeHome = grossIncome - total - help;
  return { tax: Math.round(tax), medicare: Math.round(medicare), lito: Math.round(lito), sapto: Math.round(sapto), mls: Math.round(mls), help: Math.round(help), total: Math.round(total), takeHome: Math.round(takeHome), effectiveRate: total / grossIncome };
}

// Tax on the next dollar earned — the true marginal rate, including the LITO being
// withdrawn (5c then 1.5c per dollar) and the Medicare levy phasing in (10c per dollar),
// not just the bracket rate. Measured over the next $100 so it's exact at any income.
// opts.senior as in calculateTax: SAPTO being withdrawn (12.5c per $) counts too.
function calculateMarginalRate(grossIncome, cfg, opts) {
  const c = cfg || TAX_CONFIG;
  const senior = opts && opts.senior;
  grossIncome = Number(grossIncome);
  if (!Number.isFinite(grossIncome) || grossIncome < 0) return 0;
  return Math.max(0, totalTaxRaw(grossIncome + 100, c, senior) - totalTaxRaw(grossIncome, c, senior)) / 100;
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

// Salary sacrifice, following the ATO rules that change the answer:
//  • Employer SG counts towards the concessional cap. SG is paid on salary before
//    sacrifice, up to the maximum contribution base (= cap ÷ SG rate, so SG alone
//    never exceeds the cap). Only the room left (cap − SG) gets the tax concession.
//  • Anything over the cap is excess: it's added back to your taxable income at your
//    marginal rate, with a 15% offset for the tax the fund already paid.
//  • Division 293: income + concessional contributions over $250k → extra 15% on the
//    contributions above that line.
//  • LISTO: if adjusted taxable income is $37,000 or less, the government refunds the
//    15% contributions tax, up to $500. Adjusted taxable income adds salary sacrifice
//    (reportable employer super) back in, so sacrificing can't bring you under the limit.
//  • Carry-forward: unused cap from the previous 5 years can be used this year if your
//    total super balance was under $500k on 30 June last year (pass `carryForward`).
const DIV293_THRESHOLD = 250000;
const LISTO = { incomeLimit: 37000, max: 500 };
const CARRY_FORWARD_BALANCE_LIMIT = 500000;
// opts.senior as in calculateTax. Sacrificed super counts back into SAPTO's rebate
// income, so sacrificing doesn't raise the offset.
function calculateSalarySacrifice(grossIncome, sacrificeAmount, cfg, carryForward, opts) {
  const c = cfg || TAX_CONFIG;
  const senior = opts && opts.senior;
  const extraCap = Math.max(0, Number(carryForward) || 0);
  grossIncome = Math.max(0, Number(grossIncome) || 0);
  sacrificeAmount = Math.min(Number(sacrificeAmount) || 0, grossIncome);
  if (sacrificeAmount <= 0) return null;
  const sgContrib = Math.min(grossIncome * c.sgRate, c.concessionalCap);
  const capRoom = Math.max(0, c.concessionalCap + extraCap - sgContrib);
  const effective = Math.min(sacrificeAmount, capRoom);       // gets the concession
  const excess = sacrificeAmount - effective;                  // taxed at marginal rate
  const newGross = grossIncome - effective;                    // taxable income after sacrifice

  const before = totalTaxRaw(grossIncome, c, senior);
  const after = totalTaxRaw(newGross, c, senior, grossIncome) - excess * c.superTaxRate;   // 15% excess offset
  const taxSaved = before - after;

  const div293 = (income, contribs) => 0.15 * Math.min(contribs, Math.max(0, income + contribs - DIV293_THRESHOLD));
  const extraDiv293 = div293(newGross, Math.min(c.concessionalCap + extraCap, sgContrib + sacrificeAmount)) - div293(grossIncome, sgContrib);
  const listo = (income, contribs) => income <= LISTO.incomeLimit ? Math.min(LISTO.max, contribs * c.superTaxRate) : 0;
  // Adjusted taxable income after sacrifice = taxable income (gross − concessional
  // sacrifice + excess, which is taxed as income) + the sacrifice itself = gross + excess.
  const adjustedIncomeAfter = grossIncome + excess;
  const listoGain = listo(adjustedIncomeAfter, sgContrib + sacrificeAmount) - listo(grossIncome, sgContrib);
  const superTax = sacrificeAmount * c.superTaxRate + extraDiv293 - listoGain;

  return {
    grossIncome, sacrificeAmount, effectiveSacrifice: effective, excess, newGross,
    sgContrib: Math.round(sgContrib), capRoom: Math.round(capRoom),
    taxSaved: Math.round(taxSaved), superTax: Math.round(superTax),
    div293: Math.round(extraDiv293), listo: Math.round(listoGain),
    netSuperGain: Math.round(sacrificeAmount - superTax), takehomeCost: Math.round(sacrificeAmount - taxSaved),
    carryForwardUsed: Math.round(Math.max(0, Math.min(extraCap, sgContrib + effective - c.concessionalCap))),
    atCapWarning: sgContrib + sacrificeAmount > c.concessionalCap + extraCap
  };
}

// Offset vs investing, both as NOMINAL yearly returns (a mortgage rate is nominal):
//  • Offset: every dollar saves the mortgage rate in interest — tax-free and certain.
//  • Investing: 7% real + 2.5% long-run inflation ≈ 9.7% a year, before tax. Roughly 40%
//    of a diversified share return arrives as income (taxed at your marginal rate) and
//    60% as growth (taxed at half your rate thanks to the 50% CGT discount, and only when
//    sold) — so the effective tax is about 70% of your marginal rate. Franking credits
//    would lower it further; that's left out, so the comparison leans slightly to the offset.
const INVEST_NOMINAL_RETURN = (1 + 0.07) * (1 + 0.025) - 1;
const INVEST_TAX_SHARE = 0.4 + 0.6 * 0.5;
function calculateOffsetBenefit(mortgageRate, offsetBalance, marginalRate) {
  const offsetReturn = mortgageRate;
  const investReturnAfterTax = INVEST_NOMINAL_RETURN * (1 - marginalRate * INVEST_TAX_SHARE);
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
//   assets          — assessable assets (excludes the family home). For a couple, the
//                     combined assets of both partners.
//   otherIncome     — assessable income other than deemed income (e.g. wages, rent).
//                     Don't pass portfolio drawdowns: Centrelink deems financial assets
//                     instead of counting what you withdraw.
//   financialAssets — the part of `assets` that's deemed (shares, ETFs, cash, account-
//                     based super in pension phase). Defaults to all of `assets`.
//   opts (couples only):
//     partnerEligible — false when only one partner has reached Age Pension age.
//                       Each member of a couple is paid half the combined couple rate,
//                       so only the eligible partner's half is paid. The couple means
//                       tests still apply to the couple's combined assets and income.
//     partnerSuper    — the younger partner's super still in accumulation phase. It is
//                       exempt from both tests until they reach Age Pension age, so it's
//                       taken out of `assets` (and `financialAssets`) while
//                       partnerEligible is false. Pass it as part of `assets`.
function calculateAgePension(assets, otherIncome = 0, isHomeowner = true, isCouple = false, financialAssets, opts) {
  const P = AGE_PENSION;
  const o = opts || {};
  const onlyOneEligible = !!isCouple && o.partnerEligible === false;
  const fullCoupleOrSingle = (isCouple ? P.coupleFortnight : P.singleFortnight) * 26;

  // Bad input (NaN) must never turn into a full pension: treat it as "can't tell" → nil.
  const num = v => (v == null ? 0 : Number(v));
  let a = num(assets);
  let fa = financialAssets == null ? a : num(financialAssets);
  let inc = num(otherIncome);
  if (Number.isNaN(a) || Number.isNaN(fa) || Number.isNaN(inc)) {
    return { annualPension: 0, fortnightlyPension: 0, weeklyPension: 0, maxAnnual: Math.round(onlyOneEligible ? fullCoupleOrSingle / 2 : fullCoupleOrSingle),
      assetsReduction: 0, incomeReduction: 0, deemedIncome: 0, bindingTest: 'assets', eligiblePartners: isCouple ? (onlyOneEligible ? 1 : 2) : 1, invalid: true };
  }
  if (onlyOneEligible) {
    const exempt = Math.max(0, num(o.partnerSuper) || 0);
    a = Math.max(0, a - exempt);
    fa = Math.max(0, fa - exempt);
  }
  a = Math.max(0, a); fa = Math.max(0, fa); inc = Math.max(0, inc);

  // Means tests work on the combined couple rate; each partner then gets half of it.
  const maxPension = fullCoupleOrSingle;
  const limits = P.assets[isCouple ? 'couple' : 'single'][isHomeowner ? 'homeowner' : 'nonHomeowner'];
  const assetsReduction = Math.max(0, a - limits.full) * P.assets.taperPerDollarFortnight * 26;
  // Past the published cut-off no pension is paid, even where the taper leaves a few dollars.
  const pensionAfterAssets = a >= limits.nil ? 0 : Math.max(0, maxPension - assetsReduction);

  const deemed = deemedIncome(fa, isCouple);
  const assessableIncome = deemed + inc;
  const freeArea = (isCouple ? P.income.freeArea.couple : P.income.freeArea.single) * 26;
  const incomeReduction = Math.max(0, assessableIncome - freeArea) * P.income.taper;
  const pensionAfterIncome = Math.max(0, maxPension - incomeReduction);

  const share = onlyOneEligible ? 0.5 : 1;
  const annualPension = Math.min(pensionAfterAssets, pensionAfterIncome) * share;
  return {
    annualPension: Math.round(annualPension),
    fortnightlyPension: Math.round(annualPension / 26),
    weeklyPension: Math.round(annualPension / 52),
    maxAnnual: Math.round(maxPension * share),
    assetsReduction: Math.round(assetsReduction * share),
    incomeReduction: Math.round(incomeReduction * share),
    deemedIncome: Math.round(deemed),
    bindingTest: pensionAfterAssets <= pensionAfterIncome ? 'assets' : 'income',
    eligiblePartners: isCouple ? (onlyOneEligible ? 1 : 2) : 1
  };
}
