// FirePath freedom-date tests: the one shared headline (FirePathEngine.freedomPlan), its
// market range, the formatting guards, and that every page's headline runs through it.
// Run with npm test (loaded from engine.test.cjs) or: node tests/freedom.test.cjs

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', 'public');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function load(date) {
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [date])); }
    static now() { return new RealDate(date).getTime(); }
  }
  const ctx = { console: { log() {}, warn() {} }, Math, JSON, Object, Number, String, Array, isNaN, parseInt, parseFloat, Infinity, Date: FixedDate };
  ctx.window = ctx;
  vm.createContext(ctx);
  const src = ['tax-engine.js', 'calculations.js', 'financial-engine.js'].map(f => read('js/' + f)).join('\n;\n')
    + '\n;this.__api = { calculateTax, calculateMarginalRate, estimateGrossFromNet, calculateAgePension, fmt, fmtM, fmtDollars, yearsToGoal, yearsToGoalCapped, monthlyRate, projectSuperTo60, FP_ASSUMPTIONS, TAX_CONFIG };';
  vm.runInContext(src, ctx);
  return { ctx, X: ctx.__api, E: ctx.FirePathEngine };
}

const { ctx, X, E } = load('2026-10-07T12:00:00+10:00');
const near = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg || ''} expected ≈${expected}, got ${actual}`);

// The audit's sample people (scratchpad/people.cjs): single, monthly figures, savings invested.
const PEOPLE = [
  { name: '35, $6k/mo, saves $2k, $100k, $80k super', age: 35, takeHome: 6000, mSav: 2000, savings: 100000, super: 80000 },
  { name: '45, $5k/mo, saves $800, $50k, $250k super', age: 45, takeHome: 5000, mSav: 800, savings: 50000, super: 250000 },
  { name: '28, $4.5k/mo, saves $1.5k, $20k, $30k super', age: 28, takeHome: 4500, mSav: 1500, savings: 20000, super: 30000 },
  { name: '58, $7k/mo, saves $2.5k, $300k, $600k super', age: 58, takeHome: 7000, mSav: 2500, savings: 300000, super: 600000 },
];
const fireNum = p => (p.takeHome - p.mSav) * 12 * 25;
const planFor = p => E.freedomPlan({ age: p.age, savings: p.savings, monthlySavings: p.mSav, target: fireNum(p), superBalance: p.super, takeHomeMonthly: p.takeHome });

// Independent check: closed-form future values, then month by month after 60.
function handCheck(p) {
  const gross = X.estimateGrossFromNet(p.takeHome * 12);
  const rO = 0.07 - 0.03 * X.calculateMarginalRate(gross);
  const iO = Math.pow(1 + rO, 1 / 12) - 1, iS = Math.pow(1 + E.SUPER_RETURN, 1 / 12) - 1;
  const sg = Math.min(gross * 0.12, 32500) / 12 * 0.85;
  const fv = (P, c, i, n) => P * Math.pow(1 + i, n) + c * (Math.pow(1 + i, n) - 1) / i;
  const unlock = (60 - p.age) * 12, target = fireNum(p);
  for (let m = 0; m <= 1200; m++) {
    const out = fv(p.savings, p.mSav, iO, m);
    const sup = m >= unlock ? fv(p.super, sg, iS, m) : 0;
    if (out + sup >= target) return m;
  }
  return null;
}

test('freedom plan: 45-year-old with $250k super is free at 62, with super', () => {
  // Gross ≈ $74,294 (take-home $60k), marginal rate 32% → outside return 7% − 3% × 32% = 6.04%.
  // At 60 (15 years): savings ≈ $351k, super ≈ $723k (5.40% + SG $631/mo net) = $1.07M,
  // short of $1.26M; together they get there 28 months later: 208 months, age 62.3.
  const p = PEOPLE[1], plan = planFor(p);
  near(plan.outsideReturn, 0.0604, 1e-9, 'outside-super return');
  near(plan.superAt60, 722670, 500, 'super at 60');
  near(plan.outsideAt60, 350778, 500, 'savings at 60');
  assert.equal(plan.months, 208);
  assert.equal(plan.months, handCheck(p));
  assert.equal(plan.freedomAge, 62);
  assert.equal(plan.phase, 'with-super');
  assert.equal(plan.reachable, true);
  assert.equal(plan.alreadyFree, false);
  near(plan.savingsOnlyYears, 32.4, 0.1, 'savings alone');   // the old free-calculator answer (age 74+)
});

test('freedom plan: 58-year-old with $600k super is free at 62', () => {
  // Gross ≈ $109,589, 32% → 6.04%. At 60: $401k + $690k = $1.09M < $1.35M; 53 months in all.
  const p = PEOPLE[3], plan = planFor(p);
  near(plan.superAt60, 690040, 500, 'super at 60');
  assert.equal(plan.months, 53);
  assert.equal(plan.months, handCheck(p));
  assert.equal(plan.freedomAge, 62);
  assert.equal(plan.phase, 'with-super');
});

test('freedom plan: everyone matches the independent hand check', () => {
  for (const p of PEOPLE) assert.equal(planFor(p).months, handCheck(p), p.name);
  // Savings alone get the 35- and 28-year-olds there before 60.
  assert.equal(planFor(PEOPLE[0]).phase, 'savings');
  assert.equal(planFor(PEOPLE[2]).phase, 'savings');
});

test('freedom plan: no income known → no SG and a 30% tax rate (6.1%)', () => {
  const p = PEOPLE[1];
  const plan = E.freedomPlan({ age: p.age, savings: p.savings, monthlySavings: p.mSav, target: fireNum(p), superBalance: p.super });
  near(plan.outsideReturn, 0.061, 1e-9);
  assert.equal(plan.sgMonthly, 0);
  assert.ok(plan.months > planFor(p).months, 'without SG it takes longer');
});

test('freedom plan: 62 with enough super is already free; under 60 it is not', () => {
  const free = E.freedomPlan({ age: 62, savings: 100000, monthlySavings: 1000, target: 1e6, superBalance: 1.5e6 });
  assert.equal(free.alreadyFree, true);
  assert.equal(free.years, 0);
  const locked = E.freedomPlan({ age: 50, savings: 100000, monthlySavings: 1000, target: 1e6, superBalance: 1.5e6 });
  assert.equal(locked.alreadyFree, false);
  assert.equal(locked.months, 120);   // the day super unlocks at 60
});

test('freedom plan: partner super unlocks at the partner\'s own 60', () => {
  const base = { age: 50, savings: 200000, monthlySavings: 0, target: 1e6, superBalance: 0 };
  const older = E.freedomPlan(Object.assign({}, base, { partner: { superBalance: 900000, age: 60 } }));
  assert.equal(older.alreadyFree, true);                     // 200k + 900k now
  const younger = E.freedomPlan(Object.assign({}, base, { partner: { superBalance: 900000, age: 55 } }));
  assert.equal(younger.months, 60);                          // their 60th, 5 years on
  const unknown = E.freedomPlan(Object.assign({}, base, { partner: { superBalance: 900000 } }));
  assert.equal(unknown.partnerAgeAssumed, true);             // assumed your age: 10 years on
  assert.equal(unknown.months, 120);
});

test('freedom plan: invalid input is "fill in your numbers", never "already free"', () => {
  for (const bad of [
    { age: 40, savings: 1000, monthlySavings: 100, target: NaN },
    { age: 40, savings: 1000, monthlySavings: 100, target: 0 },
    { age: 40, savings: 1000, monthlySavings: 100, annualSpend: 0 },
    { age: 40, savings: NaN, monthlySavings: 100, target: 1e6 },
    { age: 40, savings: 1000, monthlySavings: Infinity, target: 1e6 },
    {},
  ]) {
    const p = E.freedomPlan(bad);
    assert.equal(p.valid, false, JSON.stringify(bad));
    assert.equal(p.alreadyFree, false);
    assert.equal(p.years, null);
  }
  assert.equal(E.freedomRange({ target: NaN }), null);
  // Never reached: null, not a date.
  const never = E.freedomPlan({ age: 30, savings: 0, monthlySavings: 0, target: 1e6 });
  assert.equal(never.valid, true);
  assert.equal(never.reachable, false);
  assert.equal(never.freedomAge, null);
});

test('freedom plan: Monte Carlo range wraps the headline date', () => {
  for (const p of PEOPLE) {
    const plan = planFor(p);
    const r = E.freedomRange({ age: p.age, savings: p.savings, monthlySavings: p.mSav, target: fireNum(p), superBalance: p.super, takeHomeMonthly: p.takeHome });
    assert.ok(r.early <= plan.months && plan.months <= r.late, `${p.name}: ${r.early} ≤ ${plan.months} ≤ ${r.late}`);
    assert.ok(Math.abs(r.likely - plan.months) <= 12, `${p.name}: median ${r.likely} near ${plan.months}`);
  }
});

test('projectAccessible matches the plan: reaches the target on the freedom date', () => {
  const p = PEOPLE[1], plan = planFor(p);
  const inputs = { age: p.age, savings: p.savings, monthlySavings: p.mSav, target: fireNum(p), superBalance: p.super, takeHomeMonthly: p.takeHome };
  assert.ok(E.projectAccessible(inputs, plan.years) >= fireNum(p));
  assert.ok(E.projectAccessible(inputs, (plan.months - 1) / 12) < fireNum(p));
});

test('safe withdrawal rate by retirement age (not used by the headline yet)', () => {
  assert.equal(E.safeWithdrawalRate(65), 0.04);
  assert.equal(E.safeWithdrawalRate(60), 0.04);
  assert.equal(E.safeWithdrawalRate(59), 0.0375);
  assert.equal(E.safeWithdrawalRate(50), 0.0375);
  assert.equal(E.safeWithdrawalRate(49.9), 0.035);
  assert.equal(E.safeWithdrawalRate(35), 0.035);
  assert.equal(E.safeWithdrawalRate(NaN), 0.04);
  // The headline freedom number is still 25×.
  assert.equal(planFor(PEOPLE[0]).target, (6000 - 2000) * 12 * 25);
});

test('formatting: NaN and Infinity show "—", never "NaNyr NaNmo" or "$InfinityM"', () => {
  assert.equal(X.fmt(NaN), '—');
  assert.equal(X.fmt(Infinity), '—');
  assert.equal(X.fmt(undefined), '—');
  assert.equal(X.fmt(null), '100+ yrs');
  assert.equal(X.fmt(0), 'Already there!');
  assert.equal(X.fmt(12.5), '12yr 6mo');
  assert.equal(X.fmtM(Infinity), '—');
  assert.equal(X.fmtM(-Infinity), '—');
  assert.equal(X.fmtM(NaN), '—');
  assert.equal(X.fmtM(1500000), '$1.5M');
  assert.equal(X.fmtDollars(Infinity), '—');
  assert.equal(E.fmtM(Infinity), '—');
  // A NaN goal is not "Already there!".
  assert.equal(X.yearsToGoal(NaN, 1000, 100, 0.07), null);
  assert.equal(X.yearsToGoal(1e6, NaN, 100, 0.07), null);
  assert.equal(X.yearsToGoalCapped(NaN, 1000, 100, 0.07), 9999);
});

test('super at 60 (tax pages and Pro): 5.40% after fees and tax, SG capped, monthly (1+r)^(1/12)', () => {
  // Age 35, $80k super, $90k gross: SG $10,800 → $765/mo after 15% tax, for 300 months at 5.3975%.
  const r = X.projectSuperTo60(80000, 35, 90000);
  const i = Math.pow(1 + X.FP_ASSUMPTIONS.superReturn, 1 / 12) - 1;
  const n = 300, f = Math.pow(1 + i, n), c = 90000 * 0.12 / 12 * 0.85;
  near(r.balance, 80000 * f + c * (f - 1) / i, 1);
  near(r.balance, 772000, 3000, 'about $772k, not the old $1.08M');
  // SG stops growing at the concessional cap.
  near(X.projectSuperTo60(0, 59, 1e6).sgMonthly, 32500 / 12, 0.01);
  // tax.html and tax_pro.html use it, with no r/12 compounding left.
  for (const f of ['tax.html', 'tax_pro.html']) {
    const src = read(f);
    assert.ok(src.includes('projectSuperTo60(proProfile.super_balance || 0, proProfile.age, gross, r.netSuperGain / 12)'), f);
    assert.ok(!/0\.07\s*\/\s*12/.test(src) && !/rate\s*\/\s*12/.test(src), f + ' still compounds at r/12');
  }
});

test('age pension in solveFreedomAge: younger partner → half the couple rate', () => {
  // User 66 → 67 next year; partner 58. Only the user's half of the couple rate is paid.
  const both = E.solveFreedomAge(66, 300000, 0, 40000, true, 0.07, true, 0, { superBalance: 0, age: 66 });
  const gap = E.solveFreedomAge(66, 300000, 0, 40000, true, 0.07, true, 0, { superBalance: 0, age: 58 });
  assert.ok(both && both.pensionIncome > 0);
  // Both 67+: free at 67 on ~$48.5k of couple pension. Partner 58: only half, so it's later.
  assert.equal(both.age, 67);
  assert.ok(gap.age > both.age, `with a 58-year-old partner, later than 67 (got ${gap.age})`);
  assert.ok(gap.pensionIncome < both.pensionIncome * 0.6);
  // computeFreedomPicture passes the same options through.
  const full = E.computeFreedomPicture({ portfolio: 300000, annualSpend: 60000, isHomeowner: true, isCouple: true });
  const half = E.computeFreedomPicture({ portfolio: 300000, annualSpend: 60000, isHomeowner: true, isCouple: true, partnerEligible: false, partnerSuper: 0 });
  near(half.pensionAnnual, full.pensionAnnual / 2, 2);
  // The younger partner's accumulation super isn't means-tested.
  const withSuper = E.computeFreedomPicture({ portfolio: 300000, annualSpend: 60000, isHomeowner: true, isCouple: true, pensionAssets: 900000, partnerEligible: false, partnerSuper: 600000 });
  near(withSuper.pensionAnnual, half.pensionAnnual, 2);
});

// ── Cross-page consistency ──────────────────────────────────
// Runs each page's own input mapping (lifted from the page source) into the shared plan,
// so a page that stops using freedomPlan, or feeds it differently, fails here.
function grab(src, re, what) { const m = src.match(re); assert.ok(m, 'could not find ' + what); return m[1] || m[0]; }

const FREE = read('firepath.html'), PRO = read('firepath_pro.html'), GAP = read('freedom-gap.html'), JOURNEY = read('journey.html');

test('every headline page runs through FirePathEngine.freedomPlan and freedomRange', () => {
  assert.ok(FREE.includes('const plan = FirePathEngine.freedomPlan(_planInputs);'));
  assert.ok(FREE.includes('const y07 = yHead;'), 'free calculator headline is the plan');
  assert.ok(FREE.includes('FirePathEngine.freedomRange(_planInputs)'));
  assert.ok(/const plan = FirePathEngine\.freedomPlan\(planIn\);/.test(PRO), 'Pro hydrate');
  assert.ok(/const plan=FirePathEngine\.freedomPlan\(planIn\);/.test(PRO), 'Pro analyse');
  assert.ok(PRO.includes('FirePathEngine.freedomRange(calcData.planInputs)'));
  assert.ok(GAP.includes('E.freedomPlan({'));
  assert.ok(JOURNEY.includes('Engine.freedomPlan(planInputs, { now })'));
  assert.ok(JOURNEY.includes('Engine.freedomRange(planInputs)'));
});

const freePageInputs = (() => {
  const obj = grab(FREE, /_planInputs = (\{[\s\S]*?\n {4}\});/, 'free page _planInputs');
  return new Function('age', 'savings', 'mSav', 'fireNum', 'superBal', 'toMonthly', 'income', 'pSuper', 'pAge', 'pI', 'return ' + obj);
})();
vm.runInContext('var savedProfileData = null;\n'
  + grab(PRO, /(function ownGrossIncome[\s\S]*?\n  \})/, 'Pro ownGrossIncome') + '\n'
  + grab(PRO, /(function freedomPlanInputs[\s\S]*?\n  \})/, 'Pro freedomPlanInputs')
  + '\nthis.__pro = freedomPlanInputs;', ctx);
vm.runInContext('var fmtM = FirePathEngine.fmtM, isCouple = false, partnerSuper = 0, partnerAge = null, planIncome = { grossIncome: null, takeHomeMonthly: 0, partnerTakeHomeMonthly: 0 };\n'
  + grab(GAP, /(function freedomDateLine[\s\S]*?\n  \})/, 'Freedom gap freedomDateLine')
  + '\nthis.__gap = freedomDateLine; this.__setGapIncome = v => { planIncome = v; };', ctx);

test('cross-page: the four sample people get the same freedom age on every page', () => {
  for (const p of PEOPLE) {
    const fire = fireNum(p);
    const profile = { age: p.age, take_home_income: p.takeHome, savings_monthly: p.mSav, current_savings: p.savings, super_balance: p.super, freedom_number: fire, pay_cycle: 'monthly' };
    const expected = planFor(p).freedomAge;

    const free = E.freedomPlan(freePageInputs(p.age, p.savings, p.mSav, fire, p.super, x => x, p.takeHome, 0, null, 0)).freedomAge;
    const pro = E.freedomPlan(ctx.__pro(p.age, p.super, p.takeHome, p.savings, p.mSav, fire, null)).freedomAge;
    const journey = E.freedomPlan(E.planInputsFromProfile(profile)).freedomAge;
    const pi = E.planInputsFromProfile(profile);   // Freedom gap reads the saved plan the same way
    ctx.__setGapIncome({ grossIncome: pi.grossIncome, takeHomeMonthly: pi.takeHomeMonthly, partnerTakeHomeMonthly: 0 });
    const line = ctx.__gap(p.age, p.savings, p.mSav, fire / 25, p.super);
    const gap = Number((line.match(/age (\d+)/) || [])[1]);

    assert.deepEqual({ free, pro, gap, journey }, { free: expected, pro: expected, gap: expected, journey: expected }, p.name);
  }
});

test('cross-page: a partner\'s super counts the same way on the free page and Pro', () => {
  const p = PEOPLE[1], fire = fireNum(p);
  const free = E.freedomPlan(freePageInputs(p.age, p.savings, p.mSav, fire, p.super, x => x, p.takeHome, 300000, 55, 4000));
  const partner = { superBal: 300000, age: 55, ageAssumed: false, annualGross: X.estimateGrossFromNet(4000 * 12) };
  const pro = E.freedomPlan(ctx.__pro(p.age, p.super, p.takeHome, p.savings, p.mSav, fire, partner));
  assert.equal(free.months, pro.months);
  assert.ok(free.months < planFor(p).months, 'partner super brings it forward');
});
