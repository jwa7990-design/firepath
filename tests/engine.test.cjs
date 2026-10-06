// FirePath calculation tests — run with:  npm test  (or node tests/engine.test.cjs)
// Loads the real browser scripts (tax-engine.js, financial-engine.js, calculations.js)
// into one sandbox, the same way a page does, then checks them against worked examples.
// Expected values are worked by hand from the published ATO / Services Australia rules
// noted beside each test, so a wrong figure in the engine fails here.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(date) {
  const RealDate = Date;
  // Freeze "today" so the tax year the engine picks is deterministic.
  class FixedDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [date])); }
    static now() { return new RealDate(date).getTime(); }
  }
  const ctx = { console: { log() {}, warn() {} }, Math, JSON, Object, Number, String, Array, isNaN, parseInt, parseFloat, Infinity, Date: FixedDate };
  ctx.window = ctx;
  vm.createContext(ctx);
  // Top-level const/function declarations share one global lexical scope across scripts,
  // exactly like classic <script> tags, when run in the same context.
  const src = ['tax-engine.js', 'calculations.js', 'financial-engine.js']
    .map(f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8')).join('\n;\n')
    + '\n;this.__api = { TAX_YEARS, TAX_CONFIG, AGE_PENSION, getCurrentTaxYear, calculateTax, helpRepayment, medicareLevySurcharge, calculateMarginalRate, calculateSalarySacrifice, estimateGrossFromNet, deemedIncome, calculateAgePension, fmtM, fmtDollars, fmt, yearsToGoal, monthlyRate, compoundWithContributions, FP_ASSUMPTIONS, realRate };';
  vm.runInContext(src, ctx);
  return Object.assign({}, ctx.__api, { Engine: ctx.FirePathEngine });
}

const E = load('2026-09-24T12:00:00+10:00');
const near = (actual, expected, tol = 1, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg || ''} expected ≈${expected}, got ${actual}`);

// ── Tax year selection ────────────────────────────────────
test('picks the financial year from the date', () => {
  assert.equal(E.getCurrentTaxYear(new Date('2026-06-30T12:00:00')), '2025-26');
  assert.equal(E.getCurrentTaxYear(new Date('2026-07-01T12:00:00')), '2026-27');
  assert.equal(E.TAX_CONFIG.year, '2026-27');
  assert.equal(E.TAX_CONFIG.stale, false);
});

test('falls back to the newest year (and flags it) when figures run out', () => {
  assert.equal(E.getCurrentTaxYear(new Date('2027-08-01T12:00:00')), '2026-27');
  const later = load('2027-08-01T12:00:00+10:00');
  assert.equal(later.TAX_CONFIG.year, '2026-27');
  assert.equal(later.TAX_CONFIG.stale, true);
});

// ── Income tax + LITO + Medicare ──────────────────────────
test('2025-26: $100,000 → $20,788 income tax + $2,000 Medicare', () => {
  // 26,800 × 16% + 55,000 × 30% = 4,288 + 16,500; LITO nil above $66,667.
  const r = E.calculateTax(100000, E.TAX_YEARS['2025-26']);
  assert.equal(r.tax, 20788);
  assert.equal(r.medicare, 2000);
  assert.equal(r.total, 22788);
});

test('2026-27: $100,000 → $20,520 income tax (15% bracket)', () => {
  const r = E.calculateTax(100000);
  assert.equal(r.tax, 20520);
  assert.equal(r.takeHome, 100000 - 20520 - 2000);
});

test('2026-27: $45,000 → LITO $325 applied', () => {
  // (45,000 − 18,200) × 15% = 4,020; LITO = 700 − (45,000 − 37,500) × 5% = 325.
  const r = E.calculateTax(45000);
  assert.equal(r.lito, 325);
  assert.equal(r.tax, 3695);
  assert.equal(r.medicare, 900);
});

test('no tax under the tax-free threshold after LITO', () => {
  assert.equal(E.calculateTax(18200).tax, 0);
  assert.equal(E.calculateTax(22000).tax, 0); // 3,800 × 15% = 570 < LITO 700
});

test('Medicare levy phases in at 10c per dollar — no cliff', () => {
  const cfg = E.TAX_YEARS['2025-26'];        // threshold $28,011
  assert.equal(E.calculateTax(28011, cfg).medicare, 0);
  assert.equal(E.calculateTax(30000, cfg).medicare, 199); // (30,000 − 28,011) × 10%
  // Full 2% from 1.25× the threshold (~$35,014) upward.
  assert.equal(E.calculateTax(40000, cfg).medicare, 800);
  // Take-home never drops when income rises across the threshold.
  let prev = 0;
  for (let g = 27000; g <= 37000; g += 250) {
    const th = E.calculateTax(g, cfg).takeHome;
    assert.ok(th >= prev, `take-home fell at $${g}`);
    prev = th;
  }
});

// ── Deeming ───────────────────────────────────────────────
test('deeming: single, $100,000 of financial assets', () => {
  // 66,800 × 1.75% + 33,200 × 3.75% = 1,169 + 1,245
  near(E.deemedIncome(100000, false), 2414, 0.01);
});

test('deeming: couple uses the combined threshold', () => {
  // 110,600 × 1.75% + 89,400 × 3.75%
  near(E.deemedIncome(200000, true), 110600 * 0.0175 + 89400 * 0.0375, 0.01);
});

// ── Age Pension ───────────────────────────────────────────
const MAX_SINGLE = 1237.70 * 26;
const MAX_COUPLE = 1866.00 * 26;

test('full pension with no assets or income', () => {
  const r = E.calculateAgePension(0, 0, true, false);
  near(r.annualPension, MAX_SINGLE);
});

test('assets test tapers $3/fortnight per $1,000 (= $78/yr)', () => {
  // $500,000 of non-financial assets (e.g. a car/caravan + contents): no deeming.
  const r = E.calculateAgePension(500000, 0, true, false, 0);
  near(r.assetsReduction, (500000 - 333000) * 0.078);
  near(r.annualPension, MAX_SINGLE - (500000 - 333000) * 0.078);
  assert.equal(r.bindingTest, 'assets');
});

test('assets test reaches nil at the published cut-off ($745,750 single homeowner)', () => {
  assert.ok(E.calculateAgePension(745000, 0, true, false, 0).annualPension > 0);
  assert.equal(E.calculateAgePension(746000, 0, true, false, 0).annualPension, 0);
});

test('non-homeowners get the higher assets limits', () => {
  const owner = E.calculateAgePension(700000, 0, true, false, 0).annualPension;
  const renter = E.calculateAgePension(700000, 0, false, false, 0).annualPension;
  assert.ok(renter > owner, 'renter should receive more at the same assets');
  near(renter, MAX_SINGLE - (700000 - 600000) * 0.078);
});

test('income test uses deemed income, not drawdowns', () => {
  // $300,000 financial assets, single homeowner — assets test gives a full pension,
  // income test: deemed 1,169 + 233,200 × 3.75% = 9,914; free area 226 × 26 = 5,876;
  // reduction (9,914 − 5,876) × 50% = 2,019.
  const r = E.calculateAgePension(300000, 0, true, false);
  near(r.deemedIncome, 9914);
  near(r.incomeReduction, 2019);
  near(r.annualPension, MAX_SINGLE - 2019, 2);
  assert.equal(r.bindingTest, 'income');
});

test('couple rates and limits', () => {
  near(E.calculateAgePension(0, 0, true, true).annualPension, MAX_COUPLE);
  assert.equal(E.calculateAgePension(1122000, 0, true, true, 0).annualPension, 0);
});

test('pension config reconciles: cut-off = full threshold + max rate ÷ taper', () => {
  const P = E.AGE_PENSION;
  const check = (limits, fortnight) => near(limits.full + fortnight / P.assets.taperPerDollarFortnight, limits.nil, 500);
  check(P.assets.single.homeowner, P.singleFortnight);
  check(P.assets.single.nonHomeowner, P.singleFortnight);
  check(P.assets.couple.homeowner, P.coupleFortnight);
  check(P.assets.couple.nonHomeowner, P.coupleFortnight);
});

// ── Financial engine ──────────────────────────────────────
test('solveFreedomAge counts the Age Pension from 67', () => {
  // Nothing saved, nothing saving, $30K/yr target: only the pension can get there.
  const r = E.Engine.solveFreedomAge(60, 0, 0, 30000, true);
  assert.ok(r, 'should reach the target once the pension starts');
  assert.equal(r.age, 67);
  near(r.pensionIncome, MAX_SINGLE, 1);
});

test('computeFreedomPicture: 4% income and pension on the same portfolio', () => {
  const pic = E.Engine.computeFreedomPicture({ portfolio: 500000, annualSpend: 50000, isHomeowner: true });
  assert.equal(pic.portfolioIncome, 20000);
  assert.equal(pic.gap, 30000);
  assert.equal(pic.freedomPct, 40);
  assert.ok(pic.pensionAnnual > 0);
});

// ── Formatting ────────────────────────────────────────────
test('fmtM handles negatives and rounding', () => {
  assert.equal(E.fmtM(1500000), '$1.5M');
  assert.equal(E.fmtM(45000), '$45K');
  assert.equal(E.fmtM(-50000), '-$50K');
  assert.equal(E.Engine.fmtM(-50000), '-$50K');
  assert.equal(E.Engine.fmtM(null), '—');
  assert.equal(E.fmtM(undefined), '—');
});

test('fmtDollars shows exact amounts, compacting only millions', () => {
  assert.equal(E.fmtDollars(20520), '$20,520');
  assert.equal(E.fmtDollars(-1234.4), '-$1,234');
  assert.equal(E.fmtDollars(1500000), '$1.5M');
  assert.equal(E.fmtDollars(1500000, { compact: false }), '$1,500,000');
  assert.equal(E.fmtDollars(NaN), '—');
});

// ── Accuracy fixes (Oct 2026 maths audit) ─────────────────
test('7% a year compounds to exactly 7% — not 7.23% from 7%/12', () => {
  near(Math.pow(1 + E.monthlyRate(0.07), 12) - 1, 0.07, 1e-12);
  // $100k, no contributions, 30 years → 100k × 1.07^30 = $761,226
  near(E.Engine.projectPortfolio(100000, 0, 30), 761226, 1);
  near(E.compoundWithContributions(100000, 0, 0.07, 30), 761226, 1);
  // $1,000/month for 1 year at 0%: exactly $12,000; half-months round consistently
  assert.equal(E.compoundWithContributions(0, 1000, 0, 1), 12000);
  assert.equal(E.compoundWithContributions(0, 100, 0, 0.51), E.Engine.projectPortfolio(0, 100, 0.51, 0));
});

test('year/month and dollar formatting never shows "12mo" or "$1000K"', () => {
  assert.equal(E.fmt(12.97), '13 yrs');
  assert.equal(E.fmt(12.5), '12yr 6mo');
  assert.equal(E.fmt(0.5), '6 months');
  assert.equal(E.fmtM(999600), '$1.0M');
  assert.equal(E.fmtM(999400), '$999K');
  assert.equal(E.Engine.fmtM(999999), '$1.0M');
});

test('yearsToGoal: already there beats "not saving"', () => {
  assert.equal(E.yearsToGoal(1000000, 1200000, 0, 0.07), 0);
  assert.equal(E.yearsToGoal(1000000, 0, 0, 0.07), null);
  // No new savings, but $1M growing at 7% reaches $1.5M on its own: ln(1.5)/ln(1.07) = 5.99 yrs
  near(E.yearsToGoal(1500000, 1000000, 0, 0.07), 6, 0.01);
});

test('true marginal rate includes LITO withdrawal and Medicare phase-in (2026-27)', () => {
  near(E.calculateMarginalRate(15000), 0, 1e-9);        // under tax-free threshold
  near(E.calculateMarginalRate(20000), 0, 1e-9);        // LITO still wipes the tax
  near(E.calculateMarginalRate(30000), 0.25, 1e-9);     // 15% + 10c Medicare phase-in
  near(E.calculateMarginalRate(40000), 0.22, 1e-9);     // 15% + 5c LITO + 2%
  near(E.calculateMarginalRate(50000), 0.335, 1e-9);    // 30% + 1.5c LITO + 2%
  near(E.calculateMarginalRate(100000), 0.32, 1e-9);
  near(E.calculateMarginalRate(250000), 0.47, 1e-9);
});

test('salary sacrifice: employer SG uses up part of the $32,500 cap', () => {
  // $100k: SG $12,000, so only $20,500 of a $32,500 sacrifice is concessional; the
  // $12,000 excess is taxed at 32% less a 15% offset.
  const r = E.calculateSalarySacrifice(100000, 32500);
  assert.equal(r.sgContrib, 12000);
  assert.equal(r.capRoom, 20500);
  assert.equal(r.excess, 12000);
  // before: 20,520 + 2,000 = 22,520. after: tax on 79,500 = 4,020 + 10,350 = 14,370 + 1,590
  // Medicare = 15,960, less 15% × 12,000 = 1,800 offset → 14,160. Saved 8,360.
  assert.equal(r.taxSaved, 8360);
  assert.equal(r.takehomeCost, 24140);
  assert.equal(r.atCapWarning, true);
});

test('salary sacrifice: Division 293 and LISTO', () => {
  // $260k: SG capped at the cap ÷ 12% base → $31,200; room $1,300. Income + contributions
  // already over $250k, so the sacrifice attracts an extra 15% (Div 293) → 30% in total.
  const hi = E.calculateSalarySacrifice(260000, 1300);
  assert.equal(hi.sgContrib, 31200);
  assert.equal(hi.div293, 195);
  assert.equal(hi.superTax, 390);
  // $20k: LISTO refunds the 15% contributions tax (up to $500) → net $10 super tax on $1,000.
  const lo = E.calculateSalarySacrifice(20000, 1000);
  assert.equal(lo.superTax, 10);
  assert.equal(lo.taxSaved, 0);   // no income tax to save below the LITO zero-tax point
});

test('Age Pension: nil at the published cut-off; couples use couple rates', () => {
  assert.equal(E.calculateAgePension(745800, 0, true, false).annualPension, 0);
  assert.ok(E.calculateAgePension(800000, 0, true, true).annualPension > 20000);
  const p = E.Engine.computeFreedomPicture({ portfolio: 800000, annualSpend: 60000, isHomeowner: true, isCouple: true });
  assert.ok(p.pensionAnnual > 20000);
});

test('freedom age: super unlocks at 60 and is means-tested at 67', () => {
  // Age 55, $150k invested, no saving, spend $40k, $400k super. Super alone grows to
  // 400k × 1.0595^5 ≈ $535k at 60; (150k×1.07^5 + 535k) × 4% ≈ $29.8k < $40k, so not
  // free at 60. Freedom comes before 67 with no pension once both have grown enough.
  const r = E.Engine.solveFreedomAge(55, 150000, 0, 40000, true, 0.07, false, 400000);
  assert.ok(r.age > 60 && r.age < 67, `age ${r.age}`);
  assert.equal(r.pensionIncome, 0);
  // Ignoring super would wrongly wait for the pension at 67.
  assert.equal(E.Engine.solveFreedomAge(55, 150000, 0, 40000, true, 0.07, false, 0).age, 67);
});

test('freedom %: 99.6% funded is not shown as 100%', () => {
  const p = E.Engine.computeFreedomPicture({ portfolio: 995000, annualSpend: 40000, isHomeowner: true });
  assert.equal(p.freedomPct, 99);
});

test('live rates: real returns use (1+n)/(1+i)−1 and can be negative', () => {
  near(E.realRate(4.8, 3.9), 0.008662, 1e-6);
  assert.ok(E.realRate(2, 3.9) < 0);
  near(E.FP_ASSUMPTIONS.offsetRealReturn, (1.062 / 1.039) - 1, 1e-9);
});

// ── HELP, Medicare levy surcharge, carry-forward (2026-27) ──
test('HELP repayment: 2026-27 marginal system', () => {
  assert.equal(E.helpRepayment(69528), 0);
  near(E.helpRepayment(80000), 1570.8, 0.01);                    // 15% × 10,472
  near(E.helpRepayment(140000), 9028 + 0.17 * 10283, 0.01);       // second band
  near(E.helpRepayment(200000), 20000, 0.01);                     // 10% of all income
  const r = E.calculateTax(80000, undefined, { help: true });
  assert.equal(r.help, 1571);
  assert.equal(r.takeHome, 80000 - r.total - 1571);
});

test('Medicare levy surcharge applies to the whole income, by tier', () => {
  assert.equal(E.medicareLevySurcharge(105000), 0);
  near(E.medicareLevySurcharge(110000), 1100, 0.01);              // 1% of all of it
  near(E.medicareLevySurcharge(150000), 1875, 0.01);              // 1.25%
  near(E.medicareLevySurcharge(200000), 3000, 0.01);              // 1.5%
  // Salary sacrifice still counts towards MLS income.
  assert.equal(E.calculateTax(100000, undefined, { noPrivateCover: true, reportableSuper: 10000 }).mls, 1100);
});

test('salary sacrifice: carry-forward unused cap lifts the limit', () => {
  // $100k: SG $12,000. With $15,000 carried forward the room is 32,500 + 15,000 − 12,000.
  const r = E.calculateSalarySacrifice(100000, 32500, undefined, 15000);
  assert.equal(r.capRoom, 35500);
  assert.equal(r.excess, 0);
  assert.equal(r.carryForwardUsed, 12000);
  assert.equal(r.atCapWarning, false);
});

// ── Monte Carlo ───────────────────────────────────────────
test('Monte Carlo: with no volatility it matches the plain calculation', () => {
  const mc = E.Engine.simulateTimeToTarget({ startPortfolio: 185000, monthlySavings: 3200, target: 1500000, volatility: 0, paths: 50 });
  assert.equal(mc.likely, 180);             // the hand-worked 15 years
  assert.equal(mc.early, 180);
  const d = E.Engine.simulateDrawdown({ portfolio: 1000000, annualSpend: 40000, years: 30, volatility: 0, paths: 10 });
  assert.equal(d.successRate, 1);
});

test('Monte Carlo: the 4% rule over 30 years succeeds most, but not all, of the time', () => {
  const d = E.Engine.simulateDrawdown({ portfolio: 1000000, annualSpend: 40000, years: 30 });
  assert.ok(d.successRate > 0.85 && d.successRate < 0.99, `success ${d.successRate}`);
  assert.ok(d.p10 < d.p50 && d.p50 < d.p90);
  // Same inputs → same answer (seeded).
  assert.equal(E.Engine.simulateDrawdown({ portfolio: 1000000, annualSpend: 40000, years: 30 }).successRate, d.successRate);
  // Spending 7% a year fails far more often.
  assert.ok(E.Engine.simulateDrawdown({ portfolio: 1000000, annualSpend: 70000, years: 30 }).successRate < 0.6);
});

test('Monte Carlo: freedom date range brackets the steady-7% answer', () => {
  const mc = E.Engine.simulateTimeToTarget({ startPortfolio: 185000, monthlySavings: 3200, target: 1500000 });
  assert.ok(mc.early < 180 && mc.late > 180, JSON.stringify(mc));
  assert.ok(Math.abs(mc.likely - 180) <= 12, `median ${mc.likely}`);
});

test('partner super unlocks at the partner\'s own 60', () => {
  // You 50, partner 58 with $600k super: their super is spendable in 2 years, not 10.
  const withOlderPartner = E.Engine.solveFreedomAge(50, 300000, 1000, 60000, true, 0.07, true, 0, { superBalance: 600000, age: 58 });
  const sameAge = E.Engine.solveFreedomAge(50, 300000, 1000, 60000, true, 0.07, true, 0, { superBalance: 600000, age: 50 });
  assert.ok(withOlderPartner.age < sameAge.age, `${withOlderPartner.age} vs ${sameAge.age}`);
  // Older partner: free at 58 — (642k invested + 914k partner super) × 4% = $62.2k ≥ $60k.
  assert.equal(withOlderPartner.age, 58);
  assert.equal(sameAge.age, 60);
});
