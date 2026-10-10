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
    + '\n;this.__api = { calculateTax, calculateSalarySacrifice, calculateMarginalRate, estimateGrossFromNet, calculateAgePension, fmt, fmtM, fmtDollars, yearsToGoal, yearsToGoalCapped, monthlyRate, projectSuperTo60, FP_ASSUMPTIONS, TAX_CONFIG };';
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
const planFor = (p, extra) => E.freedomPlan(Object.assign({ age: p.age, savings: p.savings, monthlySavings: p.mSav, target: fireNum(p), superBalance: p.super, takeHomeMonthly: p.takeHome }, extra || {}));
// The hand checks below are plain 25× (safeRate: false); the safer rate is tested on its own.
const PLAIN = { safeRate: false };

// Independent check, by brute force: for each possible stopping month, save until then,
// then pay spending (freedom number ÷ 25 a year) from savings outside super, adding each
// super pot when its owner turns 60 (super untouched, no more SG, once you stop). Free on
// the first month the money never runs out before the last pot unlocks and the pooled
// total then reaches the freedom number. Exhaustive and slow, which is the point.
function bruteBridge(o) {
  const gross = o.takeHome ? X.estimateGrossFromNet(o.takeHome * 12) : 0;
  const rO = 0.07 - 0.03 * (gross ? X.calculateMarginalRate(gross) : 0.30);
  const iO = Math.pow(1 + rO, 1 / 12) - 1, iS = Math.pow(1 + E.SUPER_RETURN, 1 / 12) - 1;
  const sg = gross ? Math.min(gross * 0.12, 32500) / 12 * 0.85 : 0;
  const spend = o.target / 25 / 12;
  const pots = [{ bal: o.super || 0, sg, unlock: (60 - o.age) * 12 }];
  if (o.partner) pots.push({ bal: o.partner.super, sg: 0, unlock: (60 - o.partner.age) * 12 });
  for (let m = 0; m <= 1200; m++) {
    let out = o.savings; const bal = pots.map(p => p.bal);
    for (let t = 0; t < m; t++) { out = out * (1 + iO) + o.mSav; pots.forEach((p, j) => { bal[j] = bal[j] * (1 + iS) + p.sg; }); }
    const end = Math.max(m, ...pots.map(p => p.unlock));
    const inPool = pots.map(p => m >= p.unlock);
    pots.forEach((p, j) => { if (inPool[j]) { out += bal[j]; bal[j] = 0; } });
    let ok = true;
    for (let t = m; t < end; t++) {
      out = out * (1 + iO) - spend;
      pots.forEach((p, j) => { if (!inPool[j]) { bal[j] *= 1 + iS; if (t + 1 >= p.unlock) { out += bal[j]; bal[j] = 0; inPool[j] = true; } } });
      if (out < -1e-6) { ok = false; break; }
    }
    if (ok && out >= o.target - 1e-6) return m;
  }
  return null;
}
const handCheck = p => bruteBridge({ age: p.age, takeHome: p.takeHome, mSav: p.mSav, savings: p.savings, super: p.super, target: fireNum(p) });

test('freedom plan: 45-year-old with $250k super is free at 62, with super', () => {
  // Gross ≈ $74,294 (take-home $60k), marginal rate 32% → outside return 7% − 3% × 32% = 6.04%.
  // At 60 (15 years): savings ≈ $351k, super ≈ $770k (5.89% + SG $631/mo net) = $1.12M,
  // short of $1.26M; together they get there 20 months later: 200 months, age 61.7.
  const p = PEOPLE[1], plan = planFor(p);
  near(plan.outsideReturn, 0.0604, 1e-9, 'outside-super return');
  near(plan.superAt60, 769748, 500, 'super at 60');
  near(plan.outsideAt60, 350778, 500, 'savings at 60');
  assert.equal(plan.months, 200);
  assert.equal(plan.months, handCheck(p));
  assert.equal(plan.freedomAge, 62);
  assert.equal(plan.phase, 'with-super');
  assert.equal(plan.reachable, true);
  assert.equal(plan.alreadyFree, false);
  near(plan.savingsOnlyYears, 32.4, 0.1, 'savings alone');   // the old free-calculator answer (age 74+)
});

test('freedom plan: 58-year-old with $600k super is free at 62', () => {
  // Gross ≈ $109,589, 32% → 6.04%. At 60: $401k + $696k = $1.10M < $1.35M; 52 months in all.
  const p = PEOPLE[3], plan = planFor(p);
  near(plan.superAt60, 696428, 500, 'super at 60');
  assert.equal(plan.months, 52);
  assert.equal(plan.months, handCheck(p));
  assert.equal(plan.freedomAge, 62);
  assert.equal(plan.phase, 'with-super');
});

test('freedom plan: everyone matches the independent hand check', () => {
  for (const p of PEOPLE) assert.equal(planFor(p, PLAIN).months, handCheck(p), p.name);
  // The 35- and 28-year-olds stop well before 60: their savings bridge the years until
  // super unlocks (48 and 43, against 55 and 50 on savings alone).
  for (const [p, age, bridge] of [[PEOPLE[0], 48, 12.2], [PEOPLE[2], 43, 16.7]]) {
    const plan = planFor(p, PLAIN);
    assert.equal(plan.freedomAge, age, p.name);
    assert.equal(plan.phase, 'with-super', p.name);
    near(plan.bridgeYears, bridge, 0.1, p.name + ' bridge years');
    assert.ok(plan.months < plan.savingsOnlyYears * 12, p.name + ' sooner than savings alone');
  }
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
  const locked = E.freedomPlan({ age: 50, savings: 100000, monthlySavings: 1000, target: 1e6, superBalance: 1.5e6, safeRate: false });
  assert.equal(locked.alreadyFree, false);   // $100k can't pay $40k a year for 10 years
  assert.equal(locked.months, bruteBridge({ age: 50, savings: 100000, mSav: 1000, target: 1e6, super: 1.5e6 }));
  assert.ok(locked.months > 0 && locked.months < 120, 'once savings can bridge to 60, before super unlocks');
});

test('freedom plan: partner super unlocks at the partner\'s own 60 (savings bridge until then)', () => {
  const base = { age: 50, savings: 200000, monthlySavings: 0, target: 1e6, superBalance: 0, safeRate: false };
  const older = E.freedomPlan(Object.assign({}, base, { partner: { superBalance: 900000, age: 60 } }));
  assert.equal(older.alreadyFree, true);                     // 200k + 900k now
  const younger = E.freedomPlan(Object.assign({}, base, { partner: { superBalance: 900000, age: 55 } }));
  assert.equal(younger.months, bruteBridge({ age: 50, savings: 200000, mSav: 0, target: 1e6, super: 0, partner: { super: 900000, age: 55 } }));
  assert.equal(younger.alreadyFree, true);                   // $200k pays $40k a year for 5 years, then their super
  const unknown = E.freedomPlan(Object.assign({}, base, { partner: { superBalance: 900000 } }));
  assert.equal(unknown.partnerAgeAssumed, true);             // assumed your age: 10 years of bridging
  assert.equal(unknown.months, bruteBridge({ age: 50, savings: 200000, mSav: 0, target: 1e6, super: 0, partner: { super: 900000, age: 50 } }));
  assert.ok(unknown.months > younger.months);
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

test('safe withdrawal rate by retirement age, and the headline plans on it', () => {
  assert.equal(E.safeWithdrawalRate(65), 0.04);
  assert.equal(E.safeWithdrawalRate(60), 0.04);
  assert.equal(E.safeWithdrawalRate(59), 0.0375);
  assert.equal(E.safeWithdrawalRate(50), 0.0375);
  assert.equal(E.safeWithdrawalRate(49.9), 0.035);
  assert.equal(E.safeWithdrawalRate(35), 0.035);
  assert.equal(E.safeWithdrawalRate(NaN), 0.04);
  // The headline plans on the rate for the age it gives: 25× from 60, more before.
  for (const p of PEOPLE) {
    const plan = planFor(p), plain = planFor(p, PLAIN);
    assert.equal(plan.baseTarget, fireNum(p));
    near(plan.target, fireNum(p) * plan.targetMultiple, 1);
    assert.ok(plan.months >= plain.months, p.name + ': never sooner than plain 25×');
    if (plain.freedomAgeExact >= 60) assert.equal(plan.targetMultiple, 1, p.name);
    // The multiple matches the stopping age (or is the cautious one on a boundary).
    assert.ok(plan.targetMultiple >= 0.04 / E.safeWithdrawalRate(plan.freedomAgeExact) - 1e-9, p.name);
  }
  // The 35-year-old would stop at 48 on 25×; at 28.6× it's later, still before 60.
  const p0 = planFor(PEOPLE[0]);
  assert.ok(p0.targetMultiple > 1 && p0.freedomAgeExact > 48, 'early stopper plans on more');
  assert.equal(planFor(PEOPLE[0], PLAIN).target, (6000 - 2000) * 12 * 25);
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

test('super at 60 (tax pages and Pro): 5.89% after fees and tax, SG capped, monthly (1+r)^(1/12)', () => {
  // One super rate everywhere: calculations.js follows the engine's.
  assert.equal(X.FP_ASSUMPTIONS.superReturn, E.SUPER_RETURN);
  near(E.SUPER_RETURN, 0.0589, 0.0001);
  near(E.SUPER_TAX_SHARE, 0.072, 0.001, 'about 7% tax on earnings');
  // Age 35, $80k super, $90k gross: SG $10,800 → $765/mo after 15% tax, for 300 months at 5.89%.
  const r = X.projectSuperTo60(80000, 35, 90000);
  const i = Math.pow(1 + X.FP_ASSUMPTIONS.superReturn, 1 / 12) - 1;
  const n = 300, f = Math.pow(1 + i, n), c = 90000 * 0.12 / 12 * 0.85;
  near(r.balance, 80000 * f + c * (f - 1) / i, 1);
  near(r.balance, 844000, 3000, 'about $844k');
  // SG stops growing at the concessional cap.
  near(X.projectSuperTo60(0, 59, 1e6).sgMonthly, 32500 / 12, 0.01);
  // tax_pro.html uses it, with no r/12 compounding left.
  for (const f of ['tax_pro.html']) {
    const src = read(f);
    assert.ok(src.includes('projectSuperTo60(proProfile.super_balance || 0, proProfile.age, gross, r.netSuperGain / 12, employerRate())'), f);
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
vm.runInContext('var savedProfileData = null, superInsurance = 0, savingsType = "cash", ausAnswer = null, employerRate = null;   // no insurance, cash: the cross-page comparisons\n'
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

// Debt: the freedom date doesn't take debt off savings on any page (the free calculator's
// rule). Freedom gap used to net it off first, so someone with debt got a later date there.
const OPTIONS = read('freedom-options.html');
const gapDateCall = (() => {
  const args = grab(GAP, /story \+= freedomDateLine\(([^)]*)\);/, 'Freedom gap freedomDateLine call');
  return new Function('freedomDateLine', 'currentAge', 'portfolio', 'netPortfolio', 'monthlySavings', 'annualSpend', 'superBalance', 'debt',
    'return freedomDateLine(' + args + ');');
})();

test('cross-page: someone with debt gets the same freedom date on every page', () => {
  const p = PEOPLE[0], fire = fireNum(p), debt = 40000;
  const profile = { age: p.age, take_home_income: p.takeHome, savings_monthly: p.mSav, current_savings: p.savings, super_balance: p.super, freedom_number: fire, pay_cycle: 'monthly', debt_total: debt };
  const expected = planFor(p).freedomAge;
  // Taking the debt off first would give a later date, so this test can tell the difference.
  const netted = E.freedomPlan({ age: p.age, savings: p.savings - debt, monthlySavings: p.mSav, target: fire, superBalance: p.super, takeHomeMonthly: p.takeHome }).months;
  assert.ok(netted > planFor(p).months, `netting debt should move the date (${netted} vs ${planFor(p).months} months)`);

  // Free calculator: debt is typed in, but its plan inputs never read it.
  assert.ok(!/debt/i.test(grab(FREE, /_planInputs = (\{[\s\S]*?\n {4}\});/, 'free page _planInputs')), 'free page plan ignores debt');
  const free = E.freedomPlan(freePageInputs(p.age, p.savings, p.mSav, fire, p.super, x => x, p.takeHome, 0, null, 0)).freedomAge;
  // Pro: freedomPlanInputs has no debt input; it's given savings as typed.
  assert.ok(!/debt/i.test(grab(PRO, /(function freedomPlanInputs[\s\S]*?\n  \})/, 'Pro freedomPlanInputs')), 'Pro plan ignores debt');
  const pro = E.freedomPlan(ctx.__pro(p.age, p.super, p.takeHome, p.savings, p.mSav, fire, null)).freedomAge;
  // Your Path: the saved plan, debt_total included, read by planInputsFromProfile.
  const journey = E.freedomPlan(E.planInputsFromProfile(profile)).freedomAge;
  // Freedom gap: the page's own call, with its own netted figure available to it.
  const pi = E.planInputsFromProfile(profile);
  ctx.__setGapIncome({ grossIncome: pi.grossIncome, takeHomeMonthly: pi.takeHomeMonthly, partnerTakeHomeMonthly: 0 });
  const line = gapDateCall(ctx.__gap, p.age, p.savings, Math.max(0, p.savings - debt), p.mSav, fire / 25, p.super, debt);
  const gap = Number((line.match(/age (\d+)/) || [])[1]);

  assert.deepEqual({ free, pro, gap, journey }, { free: expected, pro: expected, gap: expected, journey: expected });
});

test('Freedom options: its freedom ages come from freedomPlan, fed what Freedom gap used', () => {
  assert.ok(!/solveFreedomAge\(/.test(OPTIONS), 'no solveFreedomAge calls left');
  assert.ok(OPTIONS.includes('window.FirePathEngine.freedomPlan('), 'uses the shared plan');
  // The handoff carries savings before debt and the saved plan's pay.
  assert.ok(/savings: portfolio, grossIncome: planIncome\.grossIncome/.test(GAP), 'Freedom gap hands over savings before debt');
  assert.ok(/age, savings: ci\.savings, monthlySavings, annualSpend, superBalance,/.test(OPTIONS), 'Freedom options plans on those savings');
});

test('coastPoint: the first month you could stop saving and still be free by 65', () => {
  for (const p of PEOPLE) {
    const inputs = { age: p.age, savings: p.savings, monthlySavings: p.mSav, target: fireNum(p), superBalance: p.super, takeHomeMonthly: p.takeHome };
    const c = E.coastPoint(inputs);
    const head = E.freedomPlan(inputs);
    if (!c) continue;
    // Never later than the headline (being free means you can stop saving).
    assert.ok(c.months <= head.months, `${p.name}: coast ${c.months} ≤ free ${head.months}`);
    // Brute force: walk the same balances and confirm the month before doesn't qualify.
    if (c.months > 0) {
      const n = head.inputs, rO = E.monthlyRate(n.outsideReturn), rS = E.monthlyRate(E.SUPER_RETURN);
      const sg = Math.min(n.gross * 0.12, ctx.__api.TAX_CONFIG.concessionalCap || 32500) / 12 * 0.85;
      let out = n.savings, sup = n.superBalance;
      for (let m = 0; m < c.months - 1; m++) { out = out * (1 + rO) + n.monthlySavings; sup = sup * (1 + rS) + sg; }
      const before = E.freedomPlan(Object.assign({}, inputs, { age: p.age + (c.months - 1) / 12, savings: out, superBalance: sup, monthlySavings: 0 }));
      assert.ok(!(before.reachable && before.freedomAgeExact <= 65), `${p.name}: month before coast doesn't qualify`);
    }
  }
  // Already free → coast is now; no age → no answer.
  assert.equal(E.coastPoint({ age: 40, savings: 2e6, monthlySavings: 0, target: 1e6 }).months, 0);
  assert.equal(E.coastPoint({ savings: 1000, monthlySavings: 100, target: 1e6 }), null);
});

test('superInsurance: premiums come out of super while working (+16 months), never past 70', () => {
  const p = PEOPLE[0];
  const inputs = { age: p.age, savings: p.savings, monthlySavings: p.mSav, target: fireNum(p), superBalance: p.super, takeHomeMonthly: p.takeHome };
  const base = E.freedomPlan(inputs), none = E.freedomPlan(Object.assign({}, inputs, { superInsurance: 0 }));
  assert.equal(none.months, base.months, 'blank or $0 changes nothing');
  const ins = E.freedomPlan(Object.assign({}, inputs, { superInsurance: 1500 }));
  assert.ok(ins.months >= base.months, 'premiums never bring the date forward');
  assert.ok(ins.superAt60 < base.superAt60, 'super at 60 is lower');
  // Premiums stop 16 months after freedom: super at 60 with premiums is lower by roughly
  // the premiums paid (85c per $, grown), not by premiums all the way to 60.
  const yrsPaid = Math.min(60 - p.age, ins.years + 16 / 12);
  const maxCost = 1500 * 0.85 * yrsPaid * Math.pow(1 + E.SUPER_RETURN, 60 - p.age);
  assert.ok(base.superAt60 - ins.superAt60 <= maxCost, 'cost bounded by premiums actually paid');
  // A 70-year-old pays nothing.
  const old = { age: 70, savings: 100000, monthlySavings: 1000, target: 2e6, superBalance: 300000 };
  assert.equal(E.freedomPlan(Object.assign({}, old, { superInsurance: 2000 })).months, E.freedomPlan(old).months);
  // Saved profiles carry it.
  assert.equal(E.planInputsFromProfile({ freedom_number: 1e6, super_insurance: 800 }).superInsurance, 800);
});

test('Division 296: extra tax on the share of super earnings over $3M (and $10M)', () => {
  const m = E.monthlyRate(E.SUPER_RETURN);
  // Under $3M: no change.
  assert.equal(E.superGrow(2e6, m), 2e6 * (1 + m));
  // $4M: a quarter is over $3M, so 15% extra on a quarter of the pre-tax earnings.
  const earned = 4e6 * m;
  near(E.superGrow(4e6, m), 4e6 + earned - (earned / (1 - E.SUPER_TAX_SHARE)) * 0.15 * 0.25, 0.01);
  // $12M: both tiers.
  const e12 = 12e6 * m, pre = e12 / (1 - E.SUPER_TAX_SHARE);
  near(E.superGrow(12e6, m), 12e6 + e12 - pre * 0.15 * (9 / 12) - pre * 0.10 * (2 / 12), 0.01);
  // A big balance grows less than it would without the tax, so super at 60 is lower.
  const i = { age: 45, savings: 800000, monthlySavings: 5000, target: 4e6, superBalance: 2500000, grossIncome: 250000 };
  let plain = 2500000; for (let k = 0; k < 180; k++) plain = plain * (1 + m) + 0;
  assert.ok(E.freedomPlan(i).superAt60 < plain + 180 * 3000, 'Division 296 slows growth');
});

test('franking credits: Australian shares lift the after-tax return outside super', () => {
  // 40% Australian shares: franked dividends = min(3%, 4% × 0.4) × 75% = 1.2%; credit = 1.2% × 30/70.
  const credit = 0.012 * 0.3 / 0.7;
  near(E.frankingCredit(0.4), credit, 1e-12);
  assert.equal(E.frankingCredit(0), 0);
  // The credit is taxed with the dividend, then paid back: worth credit × (1 − tax rate).
  near(E.outsideSuperReturn(0.32, 0.4) - E.outsideSuperReturn(0.32, 0), credit * 0.68, 1e-12);
  // On a 0% rate it all comes back (a refund).
  near(E.outsideSuperReturn(0, 0.4), 0.07 + credit, 1e-12);
  // Answers and defaults: none / some / most, else a typical mix only for shares or a mix.
  assert.equal(E.ausShareFor('etfs', 'none'), 0);
  assert.equal(E.ausShareFor('cash', 'most'), 0.7);
  assert.equal(E.ausShareFor('etfs'), 0.4);
  assert.equal(E.ausShareFor('mix', null), 0.4);
  assert.equal(E.ausShareFor('cash'), 0);
  assert.equal(E.ausShareFor('offset'), 0);
  // Saved plans carry it, and it brings a date forward (never back).
  const pi = E.planInputsFromProfile({ age: 35, freedom_number: 1.2e6, current_savings: 100000, savings_monthly: 2000, savings_type: 'etfs', aus_share: 0.7 });
  assert.equal(pi.ausShare, 0.7);
  const p = PEOPLE[0], without = planFor(p), withF = planFor(p, { ausShare: 0.7 });
  assert.ok(withF.months <= without.months && withF.outsideReturn > without.outsideReturn);
});

test('employer super above 12%: more super, sooner date, less salary sacrifice room', () => {
  const p = PEOPLE[0];
  const std = planFor(p), uni = planFor(p, { employerSuperRate: 0.17 });
  assert.ok(uni.superAt60 > std.superAt60, 'more super at 60');
  assert.ok(uni.months <= std.months, 'never later');
  near(uni.sgMonthly, std.sgMonthly * 17 / 12, 1, 'employer super scales with the rate');
  // 12% or less, or blank, is the standard guarantee.
  assert.equal(planFor(p, { employerSuperRate: 0.10 }).months, std.months);
  // Still capped at the concessional cap: a $300k earner at 17% hits the cap either way.
  const big = { age: 40, savings: 100000, monthlySavings: 4000, target: 3e6, superBalance: 400000, grossIncome: 300000 };
  assert.equal(E.freedomPlan(Object.assign({}, big, { employerSuperRate: 0.17 })).sgMonthly, E.freedomPlan(big).sgMonthly);
  // Super at 60 and salary sacrifice room use it too.
  assert.ok(X.projectSuperTo60(80000, 35, 90000, 0, 0.17).balance > X.projectSuperTo60(80000, 35, 90000).balance);
  const room = rate => X.calculateSalarySacrifice(120000, 10000, undefined, 0, rate ? { employerRate: rate } : undefined).capRoom;
  assert.equal(room(), 32500 - 120000 * 0.12);
  assert.equal(room(0.17), Math.max(0, 32500 - 120000 * 0.17));
  // Saved plans carry it.
  assert.equal(E.planInputsFromProfile({ freedom_number: 1e6, employer_super_rate: 0.154 }).employerSuperRate, 0.154);
});
