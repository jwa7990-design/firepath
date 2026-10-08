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

// ── Pro journey: autoDone and plan ──
// moves.js runs in its own realm, so compare plain copies.
const plain = v => v === undefined ? v : JSON.parse(JSON.stringify(v));
const deq = (a, b, ...msg) => assert.deepEqual(plain(a), plain(b), ...msg);
const titleOf = id => M.MOVES.find(m => m.id === id).title;
const openIds = (s, st, o) => M.plan(s, st, o).open.map(m => m.id);
const doneIds = (s, st) => M.plan(s, st).done.map(d => d.id);

test('autoDone: no debt counts as done only when the debt field was actually filled in', () => {
  assert.ok(!('clear-debt' in M.autoDone(base)));                                     // not asked → unknown
  assert.ok(!('clear-debt' in M.autoDone(Object.assign({}, base, { consumerDebt: '' }))));
  assert.ok('clear-debt' in M.autoDone(Object.assign({}, base, { consumerDebt: 0 })));
  assert.ok(!('clear-debt' in M.autoDone(Object.assign({}, base, { consumerDebt: 4000 }))));
  // From a saved profile: debt_total missing vs 0.
  const prof = { age: 35, take_home_income: 8000, savings_monthly: 2000, current_savings: 60000, savings_type: 'cash' };
  assert.ok(!('clear-debt' in M.autoDone(M.situationFromProfile(prof))));
  assert.ok('clear-debt' in M.autoDone(M.situationFromProfile(Object.assign({}, prof, { debt_total: 0 }))));
  assert.ok(!('clear-debt' in M.autoDone(M.situationFromProfile(Object.assign({}, prof, { debt_total: null })))));
});

test('autoDone: buffer when the person says so or holds 3+ months of spending in cash', () => {
  assert.ok('build-buffer' in M.autoDone(base));                                      // $60k cash vs $6k/month spend
  assert.ok(!('build-buffer' in M.autoDone(Object.assign({}, base, { currentSavings: 8000 }))));
  assert.ok('build-buffer' in M.autoDone(Object.assign({}, base, { currentSavings: 8000, emergencyFund: true })));
  // Invested savings: the cash buffer is unknown, so not done unless they said they have one.
  assert.ok(!('build-buffer' in M.autoDone(Object.assign({}, base, { savingsType: 'etfs' }))));
  assert.ok(!('build-buffer' in M.autoDone(Object.assign({}, base, { savingsType: 'etfs', emergencyFund: false }))));
  assert.ok('build-buffer' in M.autoDone(Object.assign({}, base, { savingsType: 'etfs', emergencyFund: true })));
  // Mix: a third counts as cash.
  assert.ok('build-buffer' in M.autoDone(Object.assign({}, base, { savingsType: 'mix', currentSavings: 60000 })));
  assert.ok(!('build-buffer' in M.autoDone(Object.assign({}, base, { savingsType: 'mix', currentSavings: 30000 }))));
});

test('autoDone: saving each month, and savings held invested', () => {
  assert.ok('start-saving' in M.autoDone(base));
  assert.ok(!('start-saving' in M.autoDone(Object.assign({}, base, { savingsMonthly: 0 }))));
  assert.ok(!('start-saving' in M.autoDone(Object.assign({}, base, { savingsMonthly: null }))));
  assert.ok('invest-idle-cash' in M.autoDone(Object.assign({}, base, { savingsType: 'etfs' })));
  for (const t of ['cash', 'mix', 'offset', null, 'something-new']) assert.ok(!('invest-idle-cash' in M.autoDone(Object.assign({}, base, { savingsType: t }))), String(t));
  assert.ok(!('invest-idle-cash' in M.autoDone(Object.assign({}, base, { savingsType: 'etfs', currentSavings: 0 }))));
  // Nothing known → nothing done.
  deq(Object.keys(M.autoDone({})), []);
  // Reasons are plain descriptions, not instructions.
  for (const r of Object.values(M.autoDone(Object.assign({}, base, { consumerDebt: 0, savingsType: 'etfs', emergencyFund: true })))) assert.match(r, /^Your plan shows /);
});

test('plan: with no statuses, open is exactly rank() order and nothing is flagged', () => {
  const p = M.plan(base, {});
  deq(p.open.map(m => m.id), ids(base).filter(id => !(id in M.autoDone(base))));
  assert.ok(p.open.every(m => m.status === null));
  deq(p.dismissed, []);
  deq(M.plan(base).open.map(m => m.id), p.open.map(m => m.id));   // statuses optional
  // Open items keep everything rank() gives (tool, article, why, impact...).
  const r = M.rank(base, { limit: 20 }).all[0];
  deq(Object.assign({}, p.open[0], { status: undefined, updated_at: undefined }), Object.assign({}, r, { status: undefined, updated_at: undefined }));
});

test('plan: "On it" is flagged without changing the order; "Done" and "Not for me" leave the open list', () => {
  const all = ids(base);
  assert.ok(all.length >= 3, all.join());
  const [a, b, c] = all;
  const st = { [c]: { status: 'doing', updated_at: '2026-10-01T00:00:00Z' }, [a]: { status: 'done', done_at: '2026-10-05T00:00:00Z' }, [b]: { status: 'dismissed' } };
  const p = M.plan(base, st);
  deq(p.open.map(m => m.id), all.filter(id => ![a, b].includes(id)));
  assert.equal(p.open[0].id, c);
  assert.equal(p.open[0].status, 'doing');
  assert.equal(p.open[0].updated_at, '2026-10-01T00:00:00Z');
  assert.ok(p.open.slice(1).every(m => m.status === null));
  deq(p.done.find(d => d.id === a), { id: a, title: titleOf(a), auto: false, done_at: '2026-10-05T00:00:00Z' });
  deq(p.dismissed, [{ id: b, title: titleOf(b) }]);
  assert.ok(!p.done.some(d => d.id === b));
});

test('plan: marked done stays done even when it no longer applies; doing/dismissed ones that no longer apply drop out', () => {
  const debt = Object.assign({}, base, { consumerDebt: 12000 });
  assert.ok(ids(debt).includes('clear-debt'));
  const st = { 'clear-debt': { status: 'done', done_at: '2026-09-01T00:00:00Z' }, 'offset-vs-invest': { status: 'doing' }, 'spouse-contribution': { status: 'dismissed' } };
  // Later the debt is gone (and recorded as 0) — the done row is still there, not auto.
  const later = Object.assign({}, base, { consumerDebt: 0 });
  const p = M.plan(later, st);
  const cd = p.done.filter(d => d.id === 'clear-debt');
  assert.equal(cd.length, 1);
  assert.equal(cd[0].auto, false);
  assert.equal(cd[0].done_at, '2026-09-01T00:00:00Z');
  // A renter: offset doesn't apply, spouse offset doesn't apply.
  assert.ok(!p.open.some(m => m.id === 'offset-vs-invest'));
  deq(p.dismissed, []);
  // Unknown ids (an option that was retired) are ignored, never crash.
  const q = M.plan(later, { 'retired-move': { status: 'done' }, 'save-more': null, 'spend-less': 'done' });
  assert.ok(!q.done.some(d => d.id === 'retired-move'));
  assert.ok(q.open.some(m => m.id === 'spend-less'));
});

test('plan: the numbers tick an option off only if the person was on it', () => {
  const s = Object.assign({}, base, { consumerDebt: 0 });
  // Never had the debt / already saving: not progress, it just doesn't apply.
  const p = M.plan(s, {});
  deq(p.done.filter(d => d.auto).map(d => d.id), []);
  assert.ok(!p.open.some(m => ['clear-debt', 'build-buffer', 'start-saving'].includes(m.id)));
  // Was "On it" and the numbers now show it → done (auto), with a reason.
  const on = { 'clear-debt': { status: 'doing' }, 'build-buffer': { status: 'doing' }, 'start-saving': { status: 'doing' } };
  const q = M.plan(s, on);
  deq(q.done.filter(d => d.auto).map(d => d.id).sort(), ['build-buffer', 'clear-debt', 'start-saving']);
  for (const d of q.done) { assert.equal(d.title, titleOf(d.id)); assert.ok(d.reason); }
  // "On it" for something the numbers now show is done → done.
  const s2 = Object.assign({}, base, { savingsType: 'etfs' });
  assert.ok(M.plan(s2, { 'invest-idle-cash': { status: 'doing' } }).done.some(d => d.id === 'invest-idle-cash' && d.auto));
  // Marked done by the person wins over auto (keeps their date, auto: false).
  const d = M.plan(s, { 'start-saving': { status: 'done', done_at: '2026-01-01T00:00:00Z' } }).done.find(x => x.id === 'start-saving');
  assert.equal(d.auto, false);
  assert.equal(d.done_at, '2026-01-01T00:00:00Z');
  // Marked done ones come first, newest first; auto ones after.
  const order = M.plan(s, { 'save-more': { status: 'done', done_at: '2026-02-01T00:00:00Z' }, 'spend-less': { status: 'done', done_at: '2026-03-01T00:00:00Z' } }).done.map(x => x.id);
  deq(order.slice(0, 2), ['spend-less', 'save-more']);
});

test('plan: progress counts open + done, never dismissed; limit trims open only', () => {
  const s = Object.assign({}, base, { consumerDebt: 0 });
  const p = M.plan(s, {});
  assert.equal(p.progress.done, p.done.length);
  assert.equal(p.progress.total, p.open.length + p.done.length);
  const first = p.open[0].id;
  const d = M.plan(s, { [first]: { status: 'dismissed' } });
  assert.equal(d.progress.total, p.progress.total - 1);
  assert.equal(d.progress.done, p.progress.done);
  const m = M.plan(s, { [first]: { status: 'done', done_at: '2026-10-08T00:00:00Z' } });
  assert.equal(m.progress.total, p.progress.total);
  assert.equal(m.progress.done, p.progress.done + 1);
  const lim = M.plan(s, {}, { limit: 1 });
  assert.equal(lim.open.length, 1);
  deq(lim.progress, p.progress);
  // Nothing known about the person: nothing counts as done.
  const empty = M.plan({}, {});
  deq(empty.progress, { done: 0, total: empty.open.length });
});
