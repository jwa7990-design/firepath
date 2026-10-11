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
// The cross-page people hold ETFs (a typical Australian-share mix).
const ETFS = { savingsType: 'etfs', ausShare: 0.4 };

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
  const build = new Function('age', 'savings', 'mSav', 'fireNum', 'superBal', 'toMonthly', 'income', 'pSuper', 'pAge', 'pI', 'return ' + obj);
  // The page then adds where the savings sit and the Australian-share mix (here: ETFs).
  return (...args) => Object.assign(build(...args), { savingsType: 'etfs', ausShare: E.ausShareFor('etfs') });
})();
vm.runInContext('var savedProfileData = null, superInsurance = 0, savingsType = "etfs", housingStatus = "owner", rentMonthly = 0; function rentFortnight() { return 0; } var _x = 0, ausShareAns = null, employerRate = null, selfEmployed = false, ownSuperYear = 0, partnerSelfEmployed = false, retired = false, mortgageBal = 0; function mortgageInput() { return null; }   // no insurance, cash: the cross-page comparisons\n'
  + grab(PRO, /(function ownGrossIncome[\s\S]*?\n  \})/, 'Pro ownGrossIncome') + '\n'
  + grab(PRO, /(function freedomPlanInputs[\s\S]*?\n  \})/, 'Pro freedomPlanInputs')
  + '\nthis.__pro = freedomPlanInputs;', ctx);
vm.runInContext('var fmtM = FirePathEngine.fmtM, isCouple = false, isHomeowner = true, partnerSuper = 0, partnerAge = null, planIncome = { grossIncome: null, takeHomeMonthly: 0, partnerTakeHomeMonthly: 0 };\n'
  + grab(GAP, /(function freedomDateLine[\s\S]*?\n  \})/, 'Freedom gap freedomDateLine')
  + '\nthis.__gap = freedomDateLine; this.__setGapIncome = v => { planIncome = v; };', ctx);

test('cross-page: the four sample people get the same freedom age on every page', () => {
  for (const p of PEOPLE) {
    const fire = fireNum(p);
    const profile = { age: p.age, take_home_income: p.takeHome, savings_monthly: p.mSav, current_savings: p.savings, super_balance: p.super, freedom_number: fire, pay_cycle: 'monthly', savings_type: 'etfs' };
    const expected = planFor(p, ETFS).freedomAge;

    const free = E.freedomPlan(freePageInputs(p.age, p.savings, p.mSav, fire, p.super, x => x, p.takeHome, 0, null, 0)).freedomAge;
    const pro = E.freedomPlan(ctx.__pro(p.age, p.super, p.takeHome, p.savings, p.mSav, fire, null)).freedomAge;
    const journey = E.freedomPlan(E.planInputsFromProfile(profile)).freedomAge;
    const pi = E.planInputsFromProfile(profile);   // Freedom gap reads the saved plan the same way
    ctx.__setGapIncome({ grossIncome: pi.grossIncome, takeHomeMonthly: pi.takeHomeMonthly, partnerTakeHomeMonthly: 0, ausShare: pi.ausShare, savingsType: pi.savingsType });
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
  const profile = { age: p.age, take_home_income: p.takeHome, savings_monthly: p.mSav, current_savings: p.savings, super_balance: p.super, freedom_number: fire, pay_cycle: 'monthly', savings_type: 'etfs', debt_total: debt };
  const expected = planFor(p, ETFS).freedomAge;
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
  ctx.__setGapIncome({ grossIncome: pi.grossIncome, takeHomeMonthly: pi.takeHomeMonthly, partnerTakeHomeMonthly: 0, ausShare: pi.ausShare, savingsType: pi.savingsType });
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

test('aged care costs: official fees, means-tested shares, room payments and caps', () => {
  const A = ctx.AGED_CARE || vm.runInContext('AGED_CARE', ctx);
  // Self-funded, daily payment on a $500k room: every fee at its maximum.
  const self = E.agedCareCosts({ type: 'residential', means: 'self', years: 5, roomPrice: 500000, payBy: 'daily' });
  near(self.perYear, (A.basicDailyFee + A.hotellingMaxDaily + A.nonClinicalMaxDaily) * 365 + 500000 * A.mpir, 0.01);
  // The non-clinical contribution stops at the lifetime cap or after 4 years.
  const nc = self.years.map(y => y.parts.nonClinical);
  assert.ok(nc.reduce((t, v) => t + v, 0) <= A.nonClinicalLifetimeCap + 0.01);
  assert.equal(nc[4], 0, 'nothing in year 5');
  // Full pensioner: the basic daily fee only; the government supports the room.
  const full = E.agedCareCosts({ type: 'residential', means: 'full', years: 3, roomPrice: 500000, payBy: 'lump' });
  near(full.perYear, A.basicDailyFee * 365, 0.01);
  assert.equal(full.lumpSum, 0);
  // A lump sum comes back less 2% a year, for at most 5 years.
  const lump = E.agedCareCosts({ type: 'residential', means: 'part', years: 7, roomPrice: 500000, payBy: 'lump' });
  near(lump.refund, 500000 * (1 - 0.02 * 5), 0.01);
  // Help at home: a share of the budget by service type (level 4, full pensioner ≈ $2,335).
  near(E.agedCareCosts({ type: 'home', means: 'full', level: 4, years: 2 }).perYear, A.homeBudgets[3] * 0.9 * (0.3 * 0.05 + 0.4 * 0.175), 0.01);
});

test('mortgage: repayments count only until the loan is paid off; what is still owing is added', () => {
  const i = { age: 38, savings: 120000, monthlySavings: 1500, target: 6000 * 12 * 25, superBalance: 150000, takeHomeMonthly: 7500, safeRate: false };
  const plain = E.freedomPlan(i);
  const withLoan = E.freedomPlan(Object.assign({}, i, { mortgage: { balance: 300000, repayMonthly: 2500, rate: 0.062 } }));
  assert.ok(withLoan.months < plain.months, 'sooner once repayments stop');
  // Paid off in about 15.6 years (188 months) at 6.2%.
  assert.equal(withLoan.mortgage.payoffMonth, 188);
  // The number is 25 × spending without repayments, plus the (today's dollars) balance still owing then.
  near(withLoan.target, (6000 - 2500) * 12 * 25 + withLoan.mortgage.owingAtFreedom, 1);
  // The bridge draws real spending without the repayments.
  near(withLoan.spendYear, (6000 - 2500) * 12, 1);
  // Paying the loan off faster (bigger repayments, same spending otherwise) never makes it later.
  const faster = E.freedomPlan(Object.assign({}, i, { mortgage: { balance: 300000, repayMonthly: 3000, rate: 0.062 } }));
  assert.ok(faster.mortgage.payoffMonth < withLoan.mortgage.payoffMonth);
  // A loan already paid off by then needs nothing on the day.
  const small = E.freedomPlan(Object.assign({}, i, { mortgage: { balance: 20000, repayMonthly: 2500, rate: 0.062 } }));
  assert.equal(Math.round(small.mortgage.owingAtFreedom), 0);
  // Repayments that don't cover the interest: the loan never shrinks, and the plan still pays
  // off what's owing on the day you stop (no cliff edge either side of covering the interest).
  const under = E.freedomPlan(Object.assign({}, i, { mortgage: { balance: 300000, repayMonthly: 1540, rate: 0.062 } }));
  const just = E.freedomPlan(Object.assign({}, i, { mortgage: { balance: 300000, repayMonthly: 1560, rate: 0.062 } }));
  assert.ok(under.mortgage.neverPaid && !just.mortgage.neverPaid);
  assert.ok(Math.abs(under.months - just.months) <= 2, `${under.months} vs ${just.months}`);
  assert.match(E.mortgageNote(under), /don't cover the interest/);
  // No repayment given: nothing changes.
  assert.equal(E.freedomPlan(Object.assign({}, i, { mortgage: { balance: 300000 } })).months, plain.months);
  // Saved plans read the repayment from the note.
  const pi = E.planInputsFromProfile({ age: 38, freedom_number: 1.8e6, mortgage_remaining: 300000, context: 'Mortgage repayments $2,500 a month' });
  assert.equal(pi.mortgage.repayMonthly, 2500);
});

test('the note: clear figures are read, anything else is left alone', () => {
  const f = E.noteFacts('Mortgage repayments $2,400 a month. My employer pays 15% super. Super insurance about $800 a year. About half my investments are in Australian shares.');
  assert.equal(f.mortgageRepayMonthly, 2400);
  assert.equal(f.employerSuperRate, 0.15);
  assert.equal(f.superInsurance, 800);
  assert.equal(f.ausShare, 0.5);
  assert.equal(E.noteFacts('we pay $1,100 a fortnight on the home loan').mortgageRepayMonthly, Math.round(1100 * 26 / 12));
  assert.equal(E.noteFacts('mortgage 2.5k a month').mortgageRepayMonthly, 2500);
  assert.equal(E.noteFacts('mortgage $600/week').mortgageRepayMonthly, 2600);
  assert.equal(E.noteFacts('none in aussie shares').ausShare, 0);
  // Not figures FirePath should use.
  assert.equal(E.noteFacts('I have two kids under 5, a mortgage with 22 years left').counted.length, 0);
  assert.equal(E.noteFacts('12% super').counted.length, 0);
  assert.equal(E.noteFacts('').counted.length, 0);
});

test('Age Pension line with a mortgage: sized on spending without repayments once the loan is paid off by 67', () => {
  const i = { age: 50, savings: 150000, monthlySavings: 1500, target: 5000 * 12 * 25, superBalance: 250000, takeHomeMonthly: 6500 };
  const mortgage = { balance: 150000, repayMonthly: 2000, rate: 0.062 };   // paid off in about 8 years, well before 67
  const withLoan = E.agePensionPlan(Object.assign({}, i, { mortgage }), { homeowner: true });
  // The same as someone whose spending simply doesn't include the repayments.
  const noRepay = E.agePensionPlan(Object.assign({}, i, { target: (5000 - 2000) * 12 * 25 }), { homeowner: true });
  // The pension is the one on the money they'd really hold at 67, and with it they get there.
  const target = (5000 - 2000) * 12 * 25 * withLoan.plan.targetMultiple;
  assert.ok(withLoan.ownAt67 + 25 * withLoan.pensionAnnual >= target - 1);
  assert.ok(noRepay.ownAt67 + 25 * noRepay.pensionAnnual >= target - 1);
  assert.ok(Math.abs(withLoan.plan.months - noRepay.plan.months) <= 24);
  // The pension line never comes later than the date without it.
  const head = E.freedomPlan(Object.assign({}, i, { mortgage }));
  assert.ok(withLoan.plan.months <= head.months);
  // A loan still running at 67 is paid off when you stop, as in the headline, so its
  // repayments don't count either (review 2, #22: the line used to be hidden for them).
  const long = { balance: 600000, repayMonthly: 3200, rate: 0.062 };
  const stillOwing = E.agePensionPlan(Object.assign({}, i, { mortgage: long }), { homeowner: true });
  assert.ok(stillOwing.plan.months <= E.freedomPlan(Object.assign({}, i, { mortgage: long })).months);
});

test('the note reads rent (and not "current" or "parents")', () => {
  assert.equal(E.noteFacts('I pay $520 a week rent').rentMonthly, Math.round(520 * 52 / 12));
  assert.equal(E.noteFacts('rent $2,200 a month').rentMonthly, 2200);
  assert.equal(E.noteFacts('my current income is $900 a week').rentMonthly, undefined);
  assert.equal(E.noteFacts('helping my parents $200 a week').rentMonthly, undefined);
  assert.equal(E.noteFacts('I pay $___ a week rent').rentMonthly, undefined);
});

test('no page works out a freedom date with the old simple 7% savings-only formula', () => {
  // Check in, Tax & Strategy and Ask FirePath now use the shared plan.
  const progress = read('progress.html'), tax = read('tax_pro.html'), ask = read('ask-firepath.html');
  assert.ok(!/yearsToGoal\([^)]*0\.07\)/.test(progress), 'Check in');
  assert.ok(progress.includes('function planYearsFor('), 'Check in uses the plan');
  assert.ok(tax.includes('js/financial-engine.js') && tax.includes('E.freedomPlan(Object.assign({}, E.planInputsFromProfile(proProfile)'), 'Tax & Strategy');
  assert.ok(ask.includes('FirePathMoves.planYears(s, over)'), 'Ask FirePath');
  // Freedom gap and Freedom options grow savings at the plan's after-tax return.
  assert.ok(!/projectPortfolio\([^)]*0\.07\)/.test(read('freedom-gap.html')), 'Freedom gap');
});

test('work after 67: the pension falls as you earn, so it takes more work than the gap alone', () => {
  const inputs = { portfolio: 300000, annualSpend: 50000, isHomeowner: true, isCouple: false, pensionAssets: 300000 };
  const pic = E.computeFreedomPicture(inputs);
  assert.ok(pic.gapAfterPension > 0);
  assert.ok(pic.workNeeded > pic.gapAfterPension, 'more than the gap after pension');
  // And it actually closes the gap.
  const short = pic.workNeeded + pic.portfolioIncome + E.pensionWithWork(inputs, pic.workNeeded).annual - 50000;
  assert.ok(short >= -2 && short < 50, `closes the gap (${short})`);
});

test('retiree tax outside super: dividends, half the realised gain, offsets and franking', () => {
  // $1M outside super, 30% untaxed gain, drawing $40k at 50 with a typical mix of Australian shares.
  const t = E.retireeTax({ outsideValue: 1e6, costBase: 7e5, withdrawal: 40000, age: 50, ausShare: 0.4 });
  const div = 1e6 * 0.03, credit = 1e6 * E.frankingCredit(0.4), gain = (40000 - div) * 0.3;
  near(t.taxable, div + credit + gain * 0.5, 0.01);
  near(t.tax, X.calculateTax(t.taxable).total - credit, 0.01);
  // From 67, SAPTO lowers it further.
  assert.ok(E.retireeTax({ outsideValue: 1e6, costBase: 7e5, withdrawal: 40000, age: 68, ausShare: 0.4 }).tax < t.tax);
  // Nothing outside super: no tax, the drawdown is unchanged.
  const base = { portfolio: 1e6, annualSpend: 40000, years: 30, median: 0.07 };
  assert.equal(E.simulateDrawdown(Object.assign({}, base, { tax: { outsideShare: 0 } })).successRate, E.simulateDrawdown(base).successRate);
  // A large drawdown with big untaxed gains pays tax, and lasts less often.
  const big = { portfolio: 2e6, annualSpend: 120000, years: 40, median: 0.07 };
  const taxed = E.simulateDrawdown(Object.assign({}, big, { tax: { outsideShare: 1, gainShare: 0.6, age: 45, ausShare: 0 } }));
  assert.ok(taxed.successRate <= E.simulateDrawdown(big).successRate);
});

// ── Regression tests from the October 2026 independent maths review (15 checkers) ──
test('review: employer super is paid even when super starts at $0 (under 67)', () => {
  const y = { age: 25, savings: 5000, monthlySavings: 600, target: 3000 * 300, superBalance: 0, takeHomeMonthly: 3600 };
  assert.equal(E.freedomPlan(y).months, E.freedomPlan(Object.assign({}, y, { superBalance: 1 })).months);
  assert.ok(E.freedomPlan(y).superAt60 > 100000);
});

test('review: the safer rate lands exactly on a 50 or 60 boundary when that is the first consistent month', () => {
  // Checker 12 (12% employer): 26.7× gives 49.8 (too early for that band), 28.6× gives 50.8; month 204 (exactly 50) works.
  const at50 = E.freedomPlan(E.planInputsFromProfile({ age: 33, take_home_income: 7200, savings_monthly: 1800, current_savings: 70000, super_balance: 120000, savings_type: 'etfs', freedom_number: 5400 * 300, pay_cycle: 'monthly', savings_type: 'etfs' }));
  assert.equal(at50.months, 204);
  near(at50.targetMultiple, 0.04 / 0.0375, 1e-9);
  // Checker 07 (couple, partner 58): exactly 60 at plain 25×.
  const at60 = E.freedomPlan(E.planInputsFromProfile({ age: 50, take_home_income: 9000, savings_monthly: 2000, current_savings: 300000, super_balance: 400000, savings_type: 'etfs', freedom_number: 7000 * 300, pay_cycle: 'monthly', savings_type: 'etfs', partner_super: 250000, partner_age: 58, partner_income: 3500, housing_status: 'owner' }));
  assert.equal(at60.months, 120);
  assert.equal(at60.targetMultiple, 1);
});

test('review: the bridge draws spending with the safer-rate cushion, never a mortgage payout', () => {
  // Checker 02: spends $54k. Owner decision (review 3): stopping before 50, the years before
  // super unlocks draw spending × the same cushion (28.6/25), so $61.7k: month 197 (was 188).
  const p = E.freedomPlan(E.planInputsFromProfile({ age: 30, take_home_income: 6500, savings_monthly: 2000, current_savings: 60000, super_balance: 45000, savings_type: 'etfs', freedom_number: 4500 * 300, pay_cycle: 'monthly', savings_type: 'etfs', context: 'About half of my investments are in Australian shares' }));
  near(p.spendReal, 54000, 1);
  near(p.spendYear, 54000 * 28.57142857 / 25, 1);
  assert.equal(p.months, 197);
});

test('review: a mortgage still owing is paid out of savings on the day you stop', () => {
  // Checkers 03 and 04: the plain 25× dates with the loan cleared at freedom.
  const four = E.freedomPlan(Object.assign(E.planInputsFromProfile({ age: 38, take_home_income: 7500, savings_monthly: 1500, current_savings: 120000, super_balance: 150000, savings_type: 'etfs', freedom_number: 6000 * 300, pay_cycle: 'monthly', savings_type: 'etfs', housing_status: 'mortgage', mortgage_remaining: 300000, context: 'Mortgage repayments $2,500 a month' }), { safeRate: false }));
  assert.equal(four.months, 132);
});

test('review: Division 293 on employer super over $250,000', () => {
  const p = E.freedomPlan({ age: 42, savings: 0, monthlySavings: 0, target: 1e7, superBalance: 100000, grossIncome: 260000 });
  // $31,200 employer super: 15% contributions tax plus 15% Division 293 on all of it ($260k + $31.2k − $250k > $31.2k).
  const sg = 260000 * 0.12;
  near(p.superAt60 > 0 ? 1 : 0, 1, 0);
  near(X.projectSuperTo60(0, 59, 260000).balance, (sg * 0.70 / 12) * ((Math.pow(1 + E.monthlyRate(E.SUPER_RETURN), 12) - 1) / E.monthlyRate(E.SUPER_RETURN)), 5);
});

test('review: from 67, take-home is worked back to gross with the seniors\' rules', () => {
  // Checker 11: $45,600 take-home at 68 (single) → $52,085 gross, not $52,811.
  near(X.estimateGrossFromNet(45600, 60, { senior: 'single' }), 52085, 5);
  const pi = E.planInputsFromProfile({ age: 68, take_home_income: 3800, savings_monthly: 300, current_savings: 150000, super_balance: 250000, freedom_number: 3500 * 300, pay_cycle: 'monthly', savings_type: 'etfs', housing_status: 'owner' });
  near(E.freedomPlan(pi).marginalRate, X.calculateMarginalRate(X.estimateGrossFromNet(45600, 60, { senior: 'single' }), undefined, { senior: 'single' }), 1e-9);
});

test('review: renters\' pension tapers out later with Rent Assistance (no cliff)', () => {
  const at = C => X.calculateAgePension(C, 0, false, false, C, { rentFortnight: 960 }).annualPension;
  assert.ok(at(1012750) > 5000, 'still paid just past the homeowner-style cut-off');
  assert.ok(at(1087000) >= 0 && at(1087000) < 100);
  assert.equal(at(1088000), 0);
});

test('review: the note reads more ways of saying employer super, and not a partner\'s', () => {
  assert.equal(E.noteFacts('employer contributes 17%').employerSuperRate, 0.17);
  assert.equal(E.noteFacts('I get 17 percent super').employerSuperRate, 0.17);
  assert.equal(E.noteFacts('15.4% super').employerSuperRate, 0.154);
  assert.equal(E.noteFacts('my employer pays 35% super').employerSuperRate, 0.30);
  assert.equal(E.noteFacts("My partner's employer pays 17% super.").employerSuperRate, undefined);
});

test('savings count as cash unless invested; the note shows what investing could change', () => {
  const base = { age: 35, take_home_income: 6000, savings_monthly: 2000, current_savings: 100000, super_balance: 80000, freedom_number: 4000 * 300, pay_cycle: 'monthly' };
  const cash = E.freedomPlan(E.planInputsFromProfile(base));                       // no savings_type → cash
  const inv = E.freedomPlan(E.planInputsFromProfile(Object.assign({}, base, { savings_type: 'etfs' })));
  near(cash.outsideReturn, E.CASH_REAL_RETURN, 1e-12);
  assert.ok(cash.months > inv.months, 'cash takes longer');
  const note = E.savingsNote(cash, inv);
  assert.ok(/counted as cash/.test(note) && note.includes(String(inv.freedomYear)));
  assert.equal(E.savingsNote(inv, inv), null, 'nothing to say once invested');
  // Pages that don't ask (homepage) keep the invested assumption.
  assert.equal(E.freedomPlan({ age: 35, savings: 100000, monthlySavings: 2000, target: 1.2e6, superBalance: 80000 }).outsideReturn > 0.05, true);
});

test('already Age Pension age: the main date counts today\'s pension', () => {
  const p = E.freedomPlan(E.planInputsFromProfile({ age: 68, take_home_income: 3800, savings_monthly: 300, current_savings: 150000, super_balance: 250000, freedom_number: 3500 * 300, pay_cycle: 'monthly', housing_status: 'owner', savings_type: 'cash' }));
  assert.ok(p.pensionIncluded > 0);
  assert.equal(p.alreadyFree, true);
  assert.ok(/already Age Pension age/.test(E.cushionNote(p)));
  // Under 67 the date never counts it.
  assert.ok(!(E.freedomPlan(E.planInputsFromProfile({ age: 55, take_home_income: 4500, savings_monthly: 600, current_savings: 40000, super_balance: 220000, freedom_number: 3900 * 300, pay_cycle: 'monthly' })).pensionIncluded > 0));
});

test('one line under the date: the note that moves the date most (67+ always first)', () => {
  const pick = p => { const pi = E.planInputsFromProfile(Object.assign({ pay_cycle: 'monthly' }, p)); const plan = E.freedomPlan(pi); return E.headlineNotes(pi, plan, { homeowner: pi.homeowner, rentFortnight: pi.rentFortnight }); };
  const cash = pick({ age: 35, take_home_income: 6000, savings_monthly: 2000, current_savings: 100000, super_balance: 80000, freedom_number: 4000 * 300 });
  assert.equal(cash.main.key, 'savings');
  const mortgage = pick({ age: 38, take_home_income: 7500, savings_monthly: 1500, current_savings: 120000, super_balance: 150000, savings_type: 'etfs', freedom_number: 6000 * 300, housing_status: 'mortgage', mortgage_remaining: 300000, context: 'Mortgage repayments $2,500 a month' });
  // The mortgage note explains the method, so a line that moves the date leads (review 4);
  // the mortgage note stays behind "More about this date".
  assert.notEqual(mortgage.main.key, 'mortgage');
  assert.ok(mortgage.others.some(n => n.key === 'mortgage'), 'the mortgage note is kept for "More about this date"');
  assert.equal(pick({ age: 68, take_home_income: 3800, savings_monthly: 300, current_savings: 150000, super_balance: 250000, freedom_number: 3500 * 300, housing_status: 'owner' }).main.key, 'pension67');
  assert.equal(pick({ age: 30, take_home_income: 6500, savings_monthly: 2000, current_savings: 60000, super_balance: 45000, savings_type: 'etfs', freedom_number: 4500 * 300 }).main.key, 'cushion');
});


// ── Maths review, round 2 (October 2026): regression tests from the checkers' people ──
test('review 3: the Age Pension as savings are spent down (more money never makes it worse)', () => {
  // #36: a couple, 68 and 72, $910k. Spending the safe 4% plus their pension is a little short
  // today, so savings fall; as they fall the pension rises, and they settle where it covers them.
  const couple = E.planInputsFromProfile({ age: 68, take_home_income: 5000, savings_monthly: 200, current_savings: 180000, savings_type: 'cash', super_balance: 420000,
    freedom_number: 4800 * 12 * 25, pay_cycle: 'monthly', partner_super: 310000, partner_age: 72, partner_income: 2300, housing_status: 'owning' });
  const p = E.freedomPlan(couple);
  assert.ok(p.alreadyFree, 'free now');
  near(p.pensionIncluded, 16458, 60);
  assert.match(E.cushionNote(p), /more as your savings are drawn down/);
  // The spend-down itself: 4% real growth, spending less the pension on what's left, for 40 years.
  let A = 910000;
  for (let y = 0; y < 40; y++) { A = A * 1.04 - (4800 * 12 - ctx.calculateAgePension(A, 0, true, true, A).annualPension); assert.ok(A > 0, `year ${y}`); }
  // #23 at 67 with $600k: covered now the same way.
  const rich = { age: 67, savings: 600000, monthlySavings: 300, target: 3200 * 12 * 25, superBalance: 0, takeHomeMonthly: 3500, savingsType: 'cash', homeowner: true };
  assert.ok(E.freedomPlan(rich).alreadyFree);
  // More savings never make the date later.
  for (const extra of [100000, 300000, 600000]) assert.ok(E.freedomPlan(Object.assign({}, rich, { savings: rich.savings + extra })).alreadyFree);
  // #24: 70, renting, $210k: free now, counting the pension on $210k (about $37,700 with Rent Assistance).
  const widow = E.planInputsFromProfile({ age: 70, take_home_income: 2400, savings_monthly: 100, current_savings: 60000, savings_type: 'cash', super_balance: 150000,
    freedom_number: 2300 * 12 * 25, pay_cycle: 'monthly', housing_status: 'renting', context: 'I pay $420 a week rent.' });
  const w = E.freedomPlan(widow);
  assert.ok(w.alreadyFree);
  near(w.pensionIncluded, 37668, 60);
  assert.equal(E.freedomRange(widow), null, 'no range once free');
  // #28/#30: the line only shows when the pension itself moves the date (money also grows from
  // 60 to 67, and that isn't put down to the pension).
  for (const prof of [
    { age: 42, take_home_income: 8000, savings_monthly: 1500, current_savings: 40000, savings_type: 'cash', super_balance: 140000, freedom_number: 6500 * 12 * 25, pay_cycle: 'weekly', partner_super: 120000, partner_age: 44, partner_income: 900, housing_status: 'renting', context: 'I pay $600 a week rent.' },
    { age: 19, take_home_income: 2600, savings_monthly: 900, current_savings: 4000, savings_type: 'cash', super_balance: 3000, freedom_number: 1700 * 12 * 25, pay_cycle: 'monthly', housing_status: 'renting' },
    { age: 55, take_home_income: 9000, savings_monthly: 2500, current_savings: 400000, savings_type: 'etfs', super_balance: 900000, freedom_number: 6500 * 12 * 25, pay_cycle: 'monthly', housing_status: 'owning' }]) {
    const pi = E.planInputsFromProfile(prof), pp = E.agePensionPlan(pi, { homeowner: pi.homeowner, rentFortnight: pi.rentFortnight });
    const line = E.agePensionLine(pp, E.freedomPlan(pi), pi.homeowner, { rentFortnight: pi.rentFortnight });
    if (line) assert.ok(pp.gainMonths >= 6, `${prof.age}: ${pp.gainMonths}`);
  }
});

test('review 3: after stopping, savings are spent first while super keeps earning; a later pot never makes it worse', () => {
  // #27: 50 with a partner of 38, saving cash. Adding a dollar of partner super used to push the date out 17 months.
  const base = { age: 50, take_home_income: 11000, savings_monthly: 3000, current_savings: 250000, savings_type: 'cash', super_balance: 520000,
    freedom_number: 8000 * 12 * 25, pay_cycle: 'monthly', partner_age: 38, partner_income: 4000, housing_status: 'owning' };
  const at = ps => E.freedomPlan(E.planInputsFromProfile(Object.assign({}, base, { partner_super: ps }))).months;
  const m0 = at(0), m1 = at(1), m1k = at(1000), m100k = at(100000);
  assert.ok(m1 <= m0 && m1k <= m1 && m100k <= m1k, `${m0} ${m1} ${m1k} ${m100k}`);
  // #26: a partner who works but has $0 super still gets employer super (about the same as $1,000).
  const p26 = { age: 34, take_home_income: 10500, savings_monthly: 3500, current_savings: 90000, savings_type: 'etfs', super_balance: 60000,
    freedom_number: 7000 * 12 * 25, pay_cycle: 'monthly', partner_age: 32, partner_income: 4200, housing_status: 'renting' };
  const z = E.freedomPlan(E.planInputsFromProfile(Object.assign({}, p26, { partner_super: 0 }))).months;
  const k = E.freedomPlan(E.planInputsFromProfile(Object.assign({}, p26, { partner_super: 1000 }))).months;
  assert.ok(Math.abs(z - k) <= 1, `${z} vs ${k}`);
  // #39: savings at 60 are never shown below zero (the partner's super carries the last years).
  const p39 = E.freedomPlan(E.planInputsFromProfile({ age: 29, take_home_income: 14000, savings_monthly: 9800, current_savings: 310000, savings_type: 'etfs', super_balance: 75000,
    freedom_number: 4200 * 12 * 25 * 0.8, retirement_spend_multiplier: 0.8, pay_cycle: 'monthly', partner_super: 95000, partner_age: 31, partner_income: 6500, housing_status: 'renting', context: 'Mostly Australian shares.' }));
  assert.ok(p39.outsideAt60 >= 0);
  // #38: 58, renting, living on super from 60 to 67: the pension line lands where the checker found (month 76).
  const p38 = E.planInputsFromProfile({ age: 58, take_home_income: 4300, savings_monthly: 400, current_savings: 22000, savings_type: 'cash', super_balance: 160000,
    freedom_number: 3900 * 12 * 25, pay_cycle: 'monthly', housing_status: 'renting', debt_total: 8000, context: 'I pay $430 a week rent.' });
  const pp38 = E.agePensionPlan(p38, { homeowner: false, rentFortnight: p38.rentFortnight });
  assert.ok(Math.abs(pp38.plan.months - 76) <= 1, `month ${pp38.plan.months}`);
});

test('employer super at any age unless stopped work; a self-employed partner; one partner not yet 67', () => {
  // Owner decision (review 5): employer super has no upper age limit, so a 72-year-old still
  // working gets it; someone who says they've stopped work doesn't (#31/#36).
  const old = { age: 72, savings: 100000, monthlySavings: 0, target: 3000 * 12 * 25, superBalance: 400000, takeHomeMonthly: 4000, savingsType: 'cash', homeowner: true, noAutoPension: true };
  const working = E.freedomPlan(old), noPay = E.freedomPlan(Object.assign({}, old, { takeHomeMonthly: 0 }));
  assert.ok(working.months < noPay.months, `${working.months} vs ${noPay.months}`);
  const stopped = E.freedomPlan(Object.assign({}, old, { retired: true }));
  assert.equal(stopped.inputs.employerSuperRate, 0);
  // #27: "My partner is self-employed" → no employer super for them.
  const f = E.noteFacts('My partner is self-employed and has no employer super.');
  assert.equal(f.partnerSelfEmployed, true);
  assert.equal(f.selfEmployed, undefined);
  const prof = { age: 50, take_home_income: 11000, savings_monthly: 3000, current_savings: 250000, savings_type: 'cash', super_balance: 520000,
    freedom_number: 8000 * 12 * 25, pay_cycle: 'monthly', partner_super: 110000, partner_age: 38, partner_income: 4000, housing_status: 'owning' };
  const withSG = E.freedomPlan(E.planInputsFromProfile(prof));
  const noSG = E.freedomPlan(E.planInputsFromProfile(Object.assign({}, prof, { context: 'My partner is self-employed and has no employer super.' })));
  assert.ok(noSG.partnerSuperAt60 < withSG.partnerSuperAt60 - 100000);
  // #27: at your 67 a partner of 55 isn't eligible: only your half of the couple rate counts.
  const poorer = E.planInputsFromProfile(Object.assign({}, prof, { take_home_income: 5000, savings_monthly: 500, freedom_number: 4500 * 12 * 25 }));
  const pp = E.agePensionPlan(poorer, { homeowner: true });
  assert.ok(pp.partnerYounger);
  assert.ok(pp.pensionMax <= 1866 * 26 / 2 + 1, String(pp.pensionMax));
});

test('review 3: odd inputs, the debt line and the mortgage check', () => {
  // #32: ages outside 15–109 are treated as unknown.
  assert.equal(E.freedomPlan({ age: 1, savings: 100000, monthlySavings: 2000, target: 1.5e6 }).freedomAge, null);
  assert.equal(E.freedomPlan({ age: 119, savings: 100000, monthlySavings: 2000, target: 1.5e6 }).freedomAge, null);
  // #32: nothing outside super → no simulated path is free before super unlocks at 60.
  const r = E.freedomRange({ age: 35, savings: 0, monthlySavings: 0, target: 6000 * 12 * 25, superBalance: 400000, takeHomeMonthly: 8000, savingsType: 'cash' });
  assert.ok(r == null || r.early >= 290, JSON.stringify(r));
  // #32: repayments bigger than spending → not counted, and the note says so.
  const big = E.freedomPlan({ age: 40, savings: 100000, monthlySavings: 2000, target: 6000 * 12 * 25, superBalance: 100000, takeHomeMonthly: 8000, mortgage: { balance: 500000, repayMonthly: 20000 } });
  assert.ok(big.valid && big.months != null);
  assert.match(E.mortgageNote(big), /look bigger than your spending/);
  // #30: a small debt only adds a few months: never the main line, and never "move".
  const teen = E.planInputsFromProfile({ age: 19, take_home_income: 2600, savings_monthly: 900, current_savings: 4000, savings_type: 'cash', super_balance: 3000,
    freedom_number: 1700 * 12 * 25, pay_cycle: 'monthly', housing_status: 'renting', debt_total: 6000 });
  const n = E.headlineNotes(teen, E.freedomPlan(teen), { homeowner: false });
  assert.ok(!n || n.main.key !== 'debt');
  // #35: already free → no cushion line.
  assert.equal(E.cushionNote({ valid: true, alreadyFree: true, targetMultiple: 1.14, withdrawalRate: 0.035 }), null);
});

test('review 2: savings held in the offset count once, not twice', () => {
  // #16: 40, $400k loan, $80k offset that is their savings.
  const pi = E.planInputsFromProfile({ age: 40, take_home_income: 8200, savings_monthly: 2400, current_savings: 80000, savings_type: 'offset', super_balance: 160000,
    freedom_number: 5800 * 12 * 25, pay_cycle: 'monthly', housing_status: 'owning', mortgage_remaining: 400000, offset_amount: 80000, context: 'Mortgage repayments $3,000 a month.' });
  const plan = E.freedomPlan(pi);
  // The checker's 136, plus the cushion on the years before super unlocks (owner decision, review 3).
  assert.ok(Math.abs(plan.months - 138) <= 1, `month ${plan.months}`);
  assert.match(E.mortgageNote(plan), /sooner with your savings in the offset/);
  // The market range wraps the date.
  const r = E.freedomRange(pi);
  assert.ok(r.early <= plan.months && plan.months <= r.late);
});

test('review 2: self-employed means no employer super; super you add yourself counts', () => {
  const base = { age: 39, take_home_income: 9000, savings_monthly: 3000, current_savings: 150000, savings_type: 'etfs', super_balance: 45000, freedom_number: 6000 * 12 * 25, pay_cycle: 'monthly', housing_status: 'owning' };
  const employee = E.freedomPlan(E.planInputsFromProfile(base));
  const self = E.planInputsFromProfile(Object.assign({}, base, { context: "I'm self-employed so no employer pays my super. I put in about $10,000 a year myself." }));
  assert.equal(self.selfEmployed, true);
  assert.equal(self.ownSuperYear, 10000);
  const sp = E.freedomPlan(self);
  // The checker: about 16 months later than with 12% employer super.
  assert.ok(sp.months - employee.months >= 12 && sp.months - employee.months <= 20, `${employee.months} → ${sp.months}`);
  const none = E.freedomPlan(Object.assign({}, self, { ownSuperYear: 0 }));
  assert.ok(none.months > sp.months);
  assert.equal(E.noteFacts('My partner is self-employed').selfEmployed, undefined);
});

test('review 2: more ways of saying how much is in Australian shares', () => {
  const share = t => E.noteFacts(t).ausShare;
  assert.equal(share('None of my shares are Australian'), 0);
  assert.equal(share('Australian shares: none'), 0);
  assert.equal(share('All my shares are international'), 0);
  assert.equal(share('Most of my shares are Australian'), 0.7);
  assert.equal(share('My shares are mostly Australian'), 0.7);
  assert.equal(share('30% international shares'), 0.7);
  assert.equal(share('I have an Australian passport and save in shares'), undefined);
});

test('review 2: "If invested" uses a typical share mix for cash savers, not their 0', () => {
  // #18: the invested comparison equals the same person with ETF savings.
  const prof = { age: 41, take_home_income: 6200, savings_monthly: 600, current_savings: 15000, savings_type: 'cash', super_balance: 70000,
    freedom_number: 5600 * 12 * 25, pay_cycle: 'monthly', housing_status: 'renting', context: 'I pay $550 a week rent.' };
  const pi = E.planInputsFromProfile(prof), plan = E.freedomPlan(pi);
  const etf = E.freedomPlan(E.planInputsFromProfile(Object.assign({}, prof, { savings_type: 'etfs' })));
  const notes = E.headlineNotes(pi, plan, { homeowner: false, rentFortnight: pi.rentFortnight });
  assert.equal(notes.main.key, 'savings');
  assert.ok(notes.main.text.includes(`age ${etf.freedomAge}`), notes.main.text);
  // The range for cash savers still moves with super (it used to be a few months wide).
  const r = E.freedomRange(pi);
  assert.ok(r.late == null || r.late - r.early > 24, JSON.stringify(r));
});

test('review 2: a renter\'s "mix" has no offset in it', () => {
  const mk = h => E.freedomPlan({ age: 36, savings: 60000, monthlySavings: 2000, target: 4000 * 12 * 25, superBalance: 90000, takeHomeMonthly: 7000, savingsType: 'mix', hasMortgage: h });
  const renter = mk(false), owner = mk(true);
  assert.ok(renter.outsideReturn > owner.outsideReturn);
  assert.ok(renter.months <= owner.months);
});

test('owner decisions (review 2): debt note, buffer wording, no far-off pension line under 50', () => {
  // #21: 31, $40k of card debt, $5k cash, saves $800 a month.
  const prof = { age: 31, take_home_income: 5200, savings_monthly: 800, current_savings: 5000, savings_type: 'cash', super_balance: 35000,
    freedom_number: 4400 * 12 * 25, pay_cycle: 'monthly', housing_status: 'renting', debt_total: 40000 };
  const pi = E.planInputsFromProfile(prof), plan = E.freedomPlan(pi);
  const notes = E.headlineNotes(pi, plan, { homeowner: false });
  assert.equal(notes.main.key, 'debt');
  assert.match(notes.main.text, /doesn't count your \$40,000 of debt\. Counting it, the date would be around \d{4}, age \d+\./);
  const sv = notes.others.find(n => n.key === 'savings');
  assert.ok(sv && /once your debt is paid off/.test(sv.text), sv && sv.text);
  // Paying it off first is later than ignoring it: about 6 years of saving at 20% (the checker: ~11 months later).
  const later = E.freedomPlan(Object.assign({}, pi, { savings: -73 * 800 }));
  assert.ok(later.months > plan.months);
  // Saving that doesn't cover the interest says so.
  const tight = E.headlineNotes(Object.assign({}, pi, { monthlySavings: 300 }), E.freedomPlan(Object.assign({}, pi, { monthlySavings: 300 })), { homeowner: false });
  assert.match(tight.main.text, /doesn't cover its interest/);

  // #18: short of a three-month buffer → invest only what's added beyond it.
  const p18 = E.planInputsFromProfile({ age: 41, take_home_income: 6200, savings_monthly: 600, current_savings: 15000, savings_type: 'cash', super_balance: 70000,
    freedom_number: 5600 * 12 * 25, pay_cycle: 'monthly', housing_status: 'renting' });
  const n18 = E.headlineNotes(p18, E.freedomPlan(p18), { homeowner: false });
  assert.match(n18.main.text, /Investing what you add beyond a three-month buffer/);

  // #17: 36, the Age Pension line moved the date most, but under 50 it stays behind "More".
  const p17 = E.planInputsFromProfile({ age: 36, take_home_income: 7000, savings_monthly: 2000, current_savings: 60000, savings_type: 'mix', super_balance: 90000,
    freedom_number: 5000 * 12 * 25 * 0.8, retirement_spend_multiplier: 0.8, pay_cycle: 'monthly', housing_status: 'renting', context: 'I pay $480 a week rent. Most of my shares are Australian.' });
  const n17 = E.headlineNotes(p17, E.freedomPlan(p17), { homeowner: false, rentFortnight: p17.rentFortnight });
  assert.notEqual(n17.main.key, 'pension');
  assert.ok(n17.others.some(n => n.key === 'pension'));
});


test('owner decisions (review 3): someone who has stopped work, and the cushion before super unlocks', () => {
  // #34: 62, stopped work, living on super: no date, how long the money lasts instead.
  const f = E.noteFacts("I've retired and live off my super.");
  assert.equal(f.retired, true);
  assert.equal(E.noteFacts('My partner has retired.').retired, undefined);
  const pi = E.planInputsFromProfile({ age: 62, take_home_income: 4200, savings_monthly: 0, current_savings: 80000, savings_type: 'cash', super_balance: 750000,
    freedom_number: 4200 * 12 * 25, pay_cycle: 'monthly', housing_status: 'owning', context: "I've retired and live off my super." });
  const p = E.freedomPlan(pi);
  assert.ok(p.retired && p.months == null && !p.alreadyFree);
  near(p.lasts.drawRate, 50400 / 830000, 1e-6);
  const n = E.headlineNotes(pi, p, { homeowner: true });
  assert.equal(n.main.key, 'retired');
  assert.match(n.main.text, /You've stopped work and spend about \$50,400 a year: 6\.1% of your \$830K\. A common guide is about 4% a year\./);
  // No wages: no employer super, so no co-contribution or salary sacrifice ideas.
  if (!ctx.FirePathMoves) vm.runInContext(read('js/moves.js'), ctx);
  const M = ctx.FirePathMoves;
  const ids = M.rank(M.situationFromProfile({ age: 62, take_home_income: 4200, savings_monthly: 0, current_savings: 80000, savings_type: 'cash', super_balance: 750000,
    freedom_number: 4200 * 12 * 25, pay_cycle: 'monthly', housing_status: 'owning', context: "I've retired and live off my super." }), { limit: 20 }).all.map(m => m.id);
  assert.ok(!ids.includes('co-contribution') && !ids.includes('salary-sacrifice'), ids.join(','));
  // Spending more than it can carry runs out, and says when.
  const short = E.freedomPlan(Object.assign({}, pi, { savings: 20000, superBalance: 150000 }));
  assert.ok(short.lasts.runsOutAge > 62 && short.lasts.runsOutAge < 100);
  // Stopped work and already covered: "free now", with the stopped-work line.
  const rich = E.freedomPlan(Object.assign({}, pi, { superBalance: 1500000 }));
  assert.ok(rich.alreadyFree);
  assert.match(E.headlineNotes(Object.assign({}, pi, { superBalance: 1500000 }), rich, { homeowner: true }).main.text, /cover your freedom number/);

  // #39: stopping before 50, the years before super unlocks carry the same cushion, so the date
  // is later than without it, and the line says so.
  const c = E.freedomPlan(E.planInputsFromProfile({ age: 29, take_home_income: 14000, savings_monthly: 9800, current_savings: 310000, savings_type: 'etfs', super_balance: 75000,
    freedom_number: 4200 * 12 * 25 * 0.8, retirement_spend_multiplier: 0.8, pay_cycle: 'monthly', partner_super: 95000, partner_age: 31, partner_income: 6500, housing_status: 'renting', context: 'Mostly Australian shares.' }));
  assert.ok(c.months > 18, String(c.months));
  assert.match(E.cushionNote(c), /spending a little more until your super unlocks/);
});

test('review 4: stopped work — the couple pension by each partner\'s 67, the wording, and no date-based extras', () => {
  // #42: a couple who have stopped work, small savings. Each partner's half starts at their own 67.
  const mk = pAge => E.freedomPlan({ age: 64, savings: 50000, monthlySavings: 0, target: 5500 * 12 * 25, superBalance: 120000, takeHomeMonthly: 5500,
    savingsType: 'cash', homeowner: false, rentFortnight: 1040, retired: true, partner: { superBalance: 80000, age: pAge, takeHomeMonthly: 0 } });
  const younger = mk(61), same = mk(64), older = mk(67);
  // A younger partner means only one half for three years: it can't last longer than both at 67 together.
  assert.ok(younger.lasts.runsOutAge <= same.lasts.runsOutAge + 0.01, `${younger.lasts.runsOutAge} vs ${same.lasts.runsOutAge}`);
  // An older partner already on the pension helps from today.
  assert.ok(older.lasts.runsOutAge == null || older.lasts.runsOutAge > same.lasts.runsOutAge);
  assert.ok(older.lasts.pensionNow > 0);
  // #41: the pension is only mentioned if it comes, and when.
  const base = { age: 62, savings: 80000, monthlySavings: 0, target: 4200 * 12 * 25, superBalance: 750000, takeHomeMonthly: 4200, savingsType: 'cash', homeowner: true, retired: true };
  assert.match(E.retiredNote(E.freedomPlan(base)), /some Age Pension from about age \d+|past age 100\.$/);
  const young = E.freedomPlan(Object.assign({}, base, { age: 57, savings: 60000 }));
  assert.match(E.retiredNote(young), /before your super unlocks at 60\. Your super can carry you from 60/);
  // No market range and no "ease off saving" point once someone has stopped work.
  assert.equal(E.freedomRange(base), null);
  assert.equal(E.coastPoint(base), null);
});


test('review 5 (20 random clients): own super, partners, the pension line, the mortgage and debt lines', () => {
  const R = f => JSON.parse(f);
  const prof = (o) => Object.assign({ pay_cycle: 'monthly', housing_status: 'owning' }, o);
  // #07/#10: the tap-to-add wording "...and put $8,000 a year into super myself" is read.
  const f = E.noteFacts("I'm self-employed and put $8,000 a year into super myself.");
  assert.equal(f.selfEmployed, true); assert.equal(f.ownSuperYear, 8000);
  // #11/#15: a partner with no super and no pay is still a partner (couple Age Pension rules).
  const pi11 = E.planInputsFromProfile(prof({ age: 52, take_home_income: 11100, savings_monthly: 2550, current_savings: 63000, savings_type: 'mix', super_balance: 127000,
    freedom_number: 8550 * 300, partner_age: 55, partner_super: 0, partner_income: 0 }));
  assert.ok(pi11.partner && pi11.partner.age === 55);
  // #18: repayments bigger than spending leave the mortgage out of the pension line too, so it shows.
  const pi18 = E.planInputsFromProfile(prof({ age: 44, take_home_income: 3600, savings_monthly: 100, current_savings: 211000, savings_type: 'offset', super_balance: 103000,
    freedom_number: 3500 * 300, mortgage_remaining: 500000, offset_amount: 150000, context: 'Mortgage repayments $4,300 a month.' }));
  const pp18 = E.agePensionPlan(pi18, { homeowner: true });
  assert.ok(pp18.pensionMax > 0 && pp18.plan.months < E.freedomPlan(pi18).months);
  // #20: stopped work with a mortgage: the mortgage note stays behind "More about this date".
  const pi20 = E.planInputsFromProfile(prof({ age: 63, take_home_income: 5200, savings_monthly: 200, current_savings: 220000, savings_type: 'cash', super_balance: 615000,
    freedom_number: 5000 * 300 * 0.8, retirement_spend_multiplier: 0.8, mortgage_remaining: 610000, context: "Mortgage repayments $4,700 a month. I've stopped work and live off my savings and super." }));
  const n20 = E.headlineNotes(pi20, E.freedomPlan(pi20), { homeowner: true });
  assert.ok(n20.others.some(n => n.key === 'mortgage'));
  // #17: under 50, a debt that barely moves the date doesn't take the main line.
  const pi17 = E.planInputsFromProfile(prof({ age: 45, take_home_income: 7100, savings_monthly: 2300, current_savings: 399000, savings_type: 'cash', super_balance: 177000,
    freedom_number: 4800 * 300, debt_total: 32500, context: 'My employer pays 17% super.' }));
  const n17 = E.headlineNotes(pi17, E.freedomPlan(pi17), { homeowner: true });
  assert.notEqual(n17.main.key, 'debt');
  assert.match(n17.others.find(n => n.key === 'debt').text, /Counting it, the date would be around/);
  // #19: a loan paid off before the date: the note says what saving the repayments could do.
  const pi19 = E.planInputsFromProfile(prof({ age: 29, take_home_income: 7500, savings_monthly: 550, current_savings: 252000, savings_type: 'cash', super_balance: 72000,
    freedom_number: 6950 * 300, mortgage_remaining: 445000, context: 'Mortgage repayments $4,350 a month.' }));
  const p19 = E.freedomPlan(pi19);
  assert.ok(p19.mortgage.savedAfter && p19.mortgage.savedAfter.months < p19.months - 24);
  assert.match(E.mortgageNote(p19), /If the repayments went into savings instead, it could be around \d{4}/);
  // #12: 75 and still earning $136k: the Age Pension idea counts that pay (so it's nil).
  if (!ctx.FirePathMoves) vm.runInContext(read('js/moves.js'), ctx);
  const ids = ctx.FirePathMoves.rank(ctx.FirePathMoves.situationFromProfile(prof({ age: 75, take_home_income: 8500, savings_monthly: 1850, current_savings: 318000, savings_type: 'cash',
    super_balance: 147000, freedom_number: 6650 * 300 * 1.2, retirement_spend_multiplier: 1.2 })), { limit: 20 }).all.map(m => m.id);
  assert.ok(!ids.includes('age-pension'), ids.join(','));
});
