// FirePath calculation tests — run with:  node tests/engine.test.js
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
    + '\n;this.__api = { TAX_YEARS, TAX_CONFIG, AGE_PENSION, getCurrentTaxYear, calculateTax, deemedIncome, calculateAgePension, fmtM, fmtDollars };';
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
