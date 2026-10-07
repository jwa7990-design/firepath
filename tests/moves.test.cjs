// FirePath "moves" — what each kind of person is (and is never) shown.
// Run with:  npm test   (or node tests/moves.test.cjs)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load({ withTax = true } = {}) {
  const ctx = { console: { log() {}, warn() {} }, Math, JSON, Object, Number, String, Array, isNaN, parseInt, parseFloat, Infinity, Date, localStorage: undefined };
  ctx.window = ctx;
  vm.createContext(ctx);
  const files = (withTax ? ['tax-engine.js', 'calculations.js'] : []).concat(['financial-engine.js', 'moves.js']);
  vm.runInContext(files.map(f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8')).join('\n;\n'), ctx);
  // Test-only handles: the engine this copy of moves.js reads, and its global scope.
  return Object.assign(Object.create(ctx.FirePathMoves), ctx.FirePathMoves, { __engine: ctx.FirePathEngine, __ctx: ctx });
}
const M = load();
const ids = s => M.rank(s, { limit: 20 }).all.map(m => m.id);
const top = s => M.rank(s).moves.map(m => m.id);

// A typical 35-year-old saver: $8k/month take-home, $2k/month saved, $60k in the bank.
const base = { age: 35, takeHomeMonthly: 8000, savingsMonthly: 2000, currentSavings: 60000, savingsType: 'cash', superBalance: 90000, housing: 'renting' };

test('credit-card debt comes first, and "invest your cash" is never shown alongside it', () => {
  const s = Object.assign({}, base, { consumerDebt: 12000 });
  assert.equal(top(s)[0], 'clear-debt');
  for (const id of ['invest-idle-cash', 'save-more', 'spend-less', 'salary-sacrifice', 'start-saving']) assert.ok(!ids(s).includes(id), id);
});

test('renters never see mortgage or offset moves', () => {
  assert.ok(!ids(base).includes('offset-vs-invest'));
  const owner = Object.assign({}, base, { housing: 'owner', mortgageRemaining: 400000 });
  assert.ok(ids(owner).includes('offset-vs-invest'));
});

test('already free: nothing about saving more, spending less or salary sacrifice', () => {
  const s = Object.assign({}, base, { currentSavings: 3000000, age: 58 });
  const got = ids(s);
  for (const id of ['save-more', 'spend-less', 'salary-sacrifice', 'start-saving', 'invest-idle-cash', 'build-buffer', 'clear-debt']) assert.ok(!got.includes(id), id);
  assert.ok(got.includes('stress-test'));
});

test('low earners are never pushed into salary sacrifice', () => {
  const low = Object.assign({}, base, { takeHomeMonthly: 2600, savingsMonthly: 300 });    // ≈ $36k gross: 15% bracket
  assert.ok(!ids(low).includes('salary-sacrifice'));
  const mid = Object.assign({}, base, { savingsType: 'etfs' });                            // ≈ $125k gross
  assert.ok(ids(mid).includes('salary-sacrifice'));
});

test('without the tax engine, tax moves simply don\'t appear (no errors)', () => {
  const lite = load({ withTax: false });
  // No super, so the date rests on savings alone and saving more moves it.
  const got = lite.rank(Object.assign({}, base, { savingsType: 'etfs', superBalance: 0 }), { limit: 20 }).all.map(m => m.id);
  assert.ok(!got.includes('salary-sacrifice'));
  assert.ok(got.includes('save-more'));
});

test('singles never see the spouse contribution offset; low-earning partners do', () => {
  assert.ok(!ids(base).includes('spouse-contribution'));
  const couple = Object.assign({}, base, { hasPartner: true, partnerTakeHomeMonthly: 1500 });
  assert.ok(ids(couple).includes('spouse-contribution'));
  const highPartner = Object.assign({}, base, { hasPartner: true, partnerTakeHomeMonthly: 7000 });
  assert.ok(!ids(highPartner).includes('spouse-contribution'));
});

test('people already invested aren\'t told to invest their cash', () => {
  assert.ok(ids(base).includes('invest-idle-cash'));
  assert.ok(!ids(Object.assign({}, base, { savingsType: 'etfs' })).includes('invest-idle-cash'));
});

test('a thin cash buffer comes before investing it', () => {
  const thin = Object.assign({}, base, { currentSavings: 8000 });     // under 3 months of $6k spending
  const got = top(thin);
  assert.equal(got[0], 'build-buffer');
  assert.ok(!ids(thin).includes('invest-idle-cash'));
});

test('not saving yet: start small (and nothing assumes savings exist)', () => {
  const s = Object.assign({}, base, { savingsMonthly: 0, currentSavings: 0 });
  assert.equal(M.rank(s).situation.stage, 'starting');
  assert.ok(ids(s).includes('start-saving'));
  assert.ok(!ids(s).includes('save-more'));
});

test('super-before-60 planning only for people who\'d be free before 60', () => {
  const early = Object.assign({}, base, { savingsType: 'etfs', currentSavings: 600000, savingsMonthly: 5000 });
  assert.ok(M.rank(early).situation.freedomAge < 60);
  assert.ok(ids(early).includes('bridge-to-60'));
  assert.ok(!ids(Object.assign({}, early, { age: 61 })).includes('bridge-to-60'));
});

test('stress test and Age Pension appear as freedom gets close, not for a 30-year-old just starting', () => {
  assert.ok(!ids(Object.assign({}, base, { age: 30 })).includes('stress-test'));
  assert.ok(!ids(Object.assign({}, base, { age: 30 })).includes('age-pension'));
  const older = Object.assign({}, base, { age: 60, currentSavings: 400000, superBalance: 250000, housing: 'owner' });
  const got = ids(older);
  assert.ok(got.includes('stress-test'));
  assert.ok(got.includes('age-pension'));
});

test('impacts are measured on the headline plan: $50 a week more = the freedomPlan difference', () => {
  // freedom number = $6,000 × 12 × 25 = $1.8M. The same plan the free calculator's headline
  // uses (savings outside super, then super from 60, after tax), at $2,000 vs $2,216.67 a month.
  // No super here, so the plan is savings alone and easy to check by hand.
  const E = M.__engine;
  const s = M.situationFromInputs(Object.assign({}, base, { savingsType: 'etfs', superBalance: 0 }));
  const plan = monthly => E.freedomPlan({ age: 35, savings: 60000, monthlySavings: monthly, target: 1800000, superBalance: 0, grossIncome: s.grossIncome, takeHomeMonthly: 8000 });
  const gain = plan(2000).years - plan(2000 + 50 * 52 / 12).years;
  const move = M.rank(s, { limit: 20 }).all.find(m => m.id === 'save-more');
  assert.ok(Math.abs(move.impact.years - gain) < 1e-9, `${move.impact.years} vs ${gain}`);
  assert.ok(gain > 0.2 && gain < 2, `gain ${gain}`);
  assert.ok(Math.abs(s.yearsToFree - plan(2000).years) < 1e-9, 'base date is the headline date');
});

test('a move that barely changes the headline date isn\'t shown as "sooner"', () => {
  // 58, almost everything in super: super carries the plan, so $50 a week more moves the
  // date by under 3 months on the headline plan and "save more" isn't offered.
  const p = { age: 58, takeHomeMonthly: 6000, savingsMonthly: 200, currentSavings: 0, savingsType: 'etfs', superBalance: 1200000, housing: 'owner' };
  const s = M.situationFromInputs(p);
  const gain = s.yearsToFree - M.planYears(s, { monthlySavings: 200 + 50 * 52 / 12 });
  assert.ok(gain >= 0 && gain < 0.25, `gain ${gain}`);
  assert.ok(!ids(p).includes('save-more'));
});

test('the headline the free calculator shows and the moves card agree for a partner with super', () => {
  const E = M.__engine;
  const inp = Object.assign({}, base, { savingsType: 'etfs', hasPartner: true, partnerSuper: 150000, partnerAge: 40, partnerTakeHomeMonthly: 3000 });
  const s = M.situationFromInputs(inp);
  const headline = E.freedomPlan({ age: 35, savings: 60000, monthlySavings: 2000, target: s.freedomNumber, superBalance: 90000, takeHomeMonthly: 5000,
    partner: { superBalance: 150000, age: 40, takeHomeMonthly: 3000 } });
  assert.ok(Math.abs(s.yearsToFree - headline.years) < 1e-9, `${s.yearsToFree} vs ${headline.years}`);
});

test('without freedomPlan, impacts fall back to the simple 7% timeline', () => {
  const lite = load();
  lite.__ctx.FirePathEngine = Object.assign({}, lite.__engine, { freedomPlan: undefined });
  const yrs = (start, monthly) => lite.yearsTo(1800000, start, monthly, 0.07);
  const gain = yrs(60000, 2000) - yrs(60000, 2000 + 50 * 52 / 12);
  const move = lite.rank(Object.assign({}, base, { savingsType: 'etfs' }), { limit: 20 }).all.find(m => m.id === 'save-more');
  assert.ok(Math.abs(move.impact.years - gain) < 1e-9);
  assert.ok(gain > 0.5 && gain < 2, `gain ${gain}`);
});

test('at most three moves by default, biggest modelled effect first', () => {
  const r = M.rank(base);
  assert.ok(r.moves.length <= 3);
  assert.deepEqual(r.moves.map(m => m.id), r.all.slice(0, 3).map(m => m.id));
});

test('profiles from the database map onto the same situation', () => {
  const s = M.situationFromProfile({ age: 40, take_home_income: 9000, savings_monthly: 2500, current_savings: 150000, savings_type: 'etfs', super_balance: 200000, housing_status: 'owner', mortgage_remaining: 350000, debt_total: 0, partner_income: 1000, pay_cycle: 'fortnightly', freedom_number: 1950000 });
  assert.equal(s.housing, 'mortgage');
  assert.equal(s.hasPartner, true);
  near(s.partnerTakeHomeMonthly, 1000 * 26 / 12);
  assert.equal(s.freedomNumber, 1950000);
});
function near(a, b) { assert.ok(Math.abs(a - b) < 1e-6, `${a} vs ${b}`); }

test('super counts once its owner is 60: a retiree with enough is "free", not told to save', () => {
  const retiree = { age: 64, takeHomeMonthly: 5000, savingsMonthly: 0, currentSavings: 900000, savingsType: 'etfs', superBalance: 650000, housing: 'owner', hasPartner: true };
  const r = M.rank(retiree, { limit: 20 });
  assert.equal(r.situation.alreadyFree, true);                     // 900k + 650k ≥ 25 × $60k = $1.5M
  for (const id of ['salary-sacrifice', 'start-saving', 'save-more', 'spend-less']) assert.ok(!r.all.some(m => m.id === id), id);
  // Under 60 the same super is locked, so it doesn't count yet.
  assert.equal(M.rank(Object.assign({}, retiree, { age: 50 })).situation.alreadyFree, false);
});

test('basics before tax tricks: no salary sacrifice for someone not yet saving or without a buffer', () => {
  const s = { age: 24, takeHomeMonthly: 3800, savingsMonthly: 0, currentSavings: 0, savingsType: 'cash', superBalance: 8000, housing: 'renting' };
  assert.ok(!ids(s).includes('salary-sacrifice'));
  const t = top(s);
  assert.equal(t[0], 'build-buffer');
  assert.ok(t.includes('start-saving'), t.join());
});

test('articles are never recommended to someone they don\'t fit', () => {
  const s = M.rank({ age: 62, takeHomeMonthly: 6000, savingsMonthly: 500, currentSavings: 200000, housing: 'renting' }).situation;
  assert.equal(M.articleFits({ ages: [36, 55] }, s), false);                 // "Too late to invest at 40?"
  assert.equal(M.articleFits({ housing: ['owner', 'mortgage'] }, s), false); // "What if I sold my house?"
  assert.equal(M.articleFits({ partner: true }, s), false);                  // spouse offset, single
  assert.equal(M.articleFits({ housing: ['renting'] }, s), true);
  assert.equal(M.articleFits(null, s), true);
  // Unknown facts never exclude.
  assert.equal(M.articleFits({ ages: [36, 55] }, M.rank({ takeHomeMonthly: 6000, savingsMonthly: 500 }).situation), true);
});

test('every article recommended by a move exists', () => {
  const slugs = new Set(fs.readdirSync(path.join(__dirname, '..', 'src', 'content', 'learn')).map(f => f.replace(/\.html$/, '')));
  for (const m of M.MOVES) if (m.article) assert.ok(slugs.has(m.article), m.article);
});

test('wording is general information: no "best" and no commands in titles or impacts', () => {
  const imperative = /^(Clear|Build|Put|Start|Save|Trim|Cut|Plan|See|Count|Boost|Salary sacrifice into)\b/;
  const everyone = [base, { age: 24, takeHomeMonthly: 3800, savingsMonthly: 0, currentSavings: 0, savingsType: 'cash', superBalance: 8000, housing: 'renting' },
    { age: 58, takeHomeMonthly: 9000, savingsMonthly: 2000, currentSavings: 400000, savingsType: 'cash', superBalance: 500000, housing: 'mortgage', mortgageRemaining: 200000, consumerDebt: 5000, hasPartner: true, partnerTakeHomeMonthly: 1500 }];
  for (const m of M.MOVES) {
    assert.ok(!imperative.test(m.title), m.title);
    assert.ok(!/\bbest\b/i.test(m.title), m.title);
  }
  for (const s of everyone) for (const m of M.rank(s, { limit: 20 }).all) {
    assert.ok(!/\bbest\b|\byou should\b/i.test(`${m.title} ${m.impact.text} ${m.why}`), m.id);
  }
});
