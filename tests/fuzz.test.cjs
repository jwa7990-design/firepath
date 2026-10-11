// Random-profile tests: thousands of made-up Australians (seeded, so a failure can be re-run),
// each checked against rules that must always hold, whatever the numbers.
//   node tests/fuzz.test.cjs                  → 300 profiles (part of npm test)
//   FUZZ_N=10000 FUZZ_SEED=7 node tests/fuzz.test.cjs   → a bigger run
//   FUZZ_ONLY=1234 node tests/fuzz.test.cjs   → just profile #1234, with its details
const fs = require('fs'), path = require('path'), vm = require('vm');
const { test } = require('node:test');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..', 'public', 'js');
const ctx = { console: { log() {}, warn() {} } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(['tax-engine.js', 'calculations.js', 'financial-engine.js', 'moves.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n'), ctx);
const E = ctx.FirePathEngine, M = ctx.FirePathMoves;

const N = Number(process.env.FUZZ_N) || 300;
const SEED = Number(process.env.FUZZ_SEED) || 20261011;
const ONLY = process.env.FUZZ_ONLY ? Number(process.env.FUZZ_ONLY) : null;
const FIRST = Number(process.env.FUZZ_FROM) || 1, LAST = Number(process.env.FUZZ_TO) || N;   // for splitting a big run

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const NOTES = [
  r => `I pay $${Math.round(150 + r() * 900)} a week rent.`,
  r => `Mortgage repayments $${Math.round(200 + r() * 9000)} a month.`,
  r => `We pay $${Math.round(300 + r() * 3000)} a fortnight on the home loan.`,
  r => `My employer pays ${[13, 14, 15, 15.4, 17, 20, 35][Math.floor(r() * 7)]}% super.`,
  () => "I'm self-employed and put $8,000 a year into super myself.",
  () => "I'm a sole trader.",
  () => 'My partner is self-employed.',
  () => "I've stopped work and live off my savings and super.",
  () => "We're retired and living off our super.",
  r => `Super insurance about $${Math.round(100 + r() * 3000)} a year.`,
  () => 'Mostly Australian shares.',
  () => 'None of my shares are Australian.',
  () => 'About half my investments are in Australian shares.',
  () => 'I add $5k a year to super.',
  () => 'I have two kids under 5 and a mortgage with 22 years left.',
  () => '',
];

// A profile row as Pro saves it (fp_profiles). Wide on purpose: odd ages, big and tiny
// numbers, mortgages that never shrink or cost more than all spending, every note pattern.
function makeProfile(i) {
  const r = rng(SEED * 1000003 + i);
  const pick = arr => arr[Math.floor(r() * arr.length)];
  const between = (lo, hi) => Math.round(lo + r() * (hi - lo));
  const big = (hi) => Math.round(Math.pow(r(), 2.5) * hi);   // mostly small, sometimes huge
  const age = between(16, 92);
  const take = r() < 0.03 ? 0 : between(800, r() < 0.1 ? 40000 : 15000);
  const save = Math.min(take, Math.round(take * r() * (r() < 0.1 ? 1 : 0.6)));
  const couple = r() < 0.45;
  const housing = pick(['renting', 'owning', 'owning']);
  const mortgage = housing === 'owning' && r() < 0.6 ? big(1500000) : 0;
  const notes = [];
  const nNotes = between(0, 3);
  for (let k = 0; k < nNotes; k++) notes.push(pick(NOTES)(r));
  const mult = pick([1, 1, 1, 0.8, 1.2]);
  return {
    age, take_home_income: take, savings_monthly: save, current_savings: big(3000000),
    savings_type: pick(['cash', 'etfs', 'mix', 'offset', null]), super_balance: big(4000000),
    freedom_number: Math.max(0, take - save) * 12 * 25 * mult || (r() < 0.5 ? 0 : big(3000000)),
    retirement_spend_multiplier: mult, pay_cycle: pick(['monthly', 'fortnightly', 'weekly', null]),
    partner_super: couple ? big(1500000) : 0, partner_age: couple ? (r() < 0.1 ? null : Math.max(18, age + between(-15, 15))) : null,
    partner_income: couple ? pick([0, between(200, 6000)]) : 0,
    housing_status: housing, mortgage_remaining: mortgage, offset_amount: mortgage ? pick([0, big(300000)]) : 0,
    dependants: pick([0, 0, 1, 2, 3]), debt_total: pick([0, 0, 0, big(80000)]), context: notes.join(' '),
  };
}

const later = m => (m == null ? Infinity : m);
const BAD_TEXT = /NaN|undefined|Infinity|\$-|null/;
const WAGE_IDEAS = ['salary-sacrifice', 'co-contribution', 'save-more', 'start-saving', 'work-less', 'spend-less'];

// Every rule, for one profile. Returns a list of what broke (empty = all good).
function check(i, withRange) {
  const prof = makeProfile(i);
  const broke = [];
  const fail = msg => broke.push(msg);
  let pi, plan;
  try { pi = E.planInputsFromProfile(prof); plan = E.freedomPlan(pi); } catch (e) { return [`threw: ${e.message}`]; }
  if (!(prof.freedom_number > 0)) { if (plan.valid) fail('valid plan with no freedom number'); return broke; }
  if (!plan.valid) { fail('invalid plan for a usable profile'); return broke; }
  // 1. Numbers are numbers.
  const nums = JSON.stringify(plan, (k, v) => (typeof v === 'function' ? undefined : v));
  if (/NaN/.test(nums)) fail('NaN in the plan');
  // 2. The date's own figures agree with each other.
  if (plan.months != null) {
    if (plan.alreadyFree !== (plan.months === 0)) fail('alreadyFree disagrees with months');
    if (pi.age != null && Math.abs(plan.freedomAgeExact - (pi.age + plan.months / 12)) > 1e-6) fail('freedom age ≠ age + months');
    if (plan.target < plan.baseTarget - (pi.mortgage ? pi.mortgage.repayMonthly * 12 * 25 * 2 : 0) - 1) fail('target below the base number');
  }
  // 3. More money, or a smaller number, never makes it later (or, once stopped work, run out sooner).
  const base = later(plan.months);
  const runsOut = p => (p.lasts ? (p.lasts.runsOutAge == null ? Infinity : p.lasts.runsOutAge) : null);
  const variants = [['+$50k savings', { savings: pi.savings + 50000 }], ['+$300/m saving', { monthlySavings: pi.monthlySavings + 300 }],
    ['+$50k super', { superBalance: pi.superBalance + 50000 }], ['10% smaller number', { target: pi.target * 0.9 }]];
  if (pi.partner) variants.push(['partner +$1 super', { partner: Object.assign({}, pi.partner, { superBalance: pi.partner.superBalance + 1 }) }]);
  for (const [name, over] of variants) {
    let q;
    try { q = E.freedomPlan(Object.assign({}, pi, over)); } catch (e) { fail(`${name} threw: ${e.message}`); continue; }
    // Repayments that stop adding up (≥ spending less $600 a month) switch the mortgage off and ask
    // for the figures to be checked: a deliberate switch, not a smooth change, so it's left out here.
    if (!!q.mortgageCheck !== !!plan.mortgageCheck) continue;
    if (plan.retired && !plan.alreadyFree) {
      if (q.alreadyFree) continue;
      if (runsOut(q) != null && runsOut(plan) != null && runsOut(q) < runsOut(plan) - 0.01) fail(`${name}: money runs out sooner (${runsOut(plan)} → ${runsOut(q)})`);
    } else if (later(q.months) > base && !(q.retired && !q.alreadyFree)) fail(`${name} made it later (${plan.months} → ${q.months})`);
  }
  // 4. Stopped work: no date, a "lasts" line, and no wage ideas.
  if (plan.retired && !plan.alreadyFree) {
    if (plan.months != null) fail('stopped work but still a date');
    if (!E.retiredNote(plan)) fail('stopped work with no line');
  }
  // 5. The line under the date reads properly.
  let notes;
  try { notes = E.headlineNotes(pi, plan, { homeowner: pi.homeowner, rentFortnight: pi.rentFortnight, consumerDebt: prof.debt_total }); } catch (e) { fail(`notes threw: ${e.message}`); }
  if (notes) for (const n of [notes.main, ...notes.others]) if (!n.text || BAD_TEXT.test(n.text)) fail(`bad ${n.key} text: ${String(n.text).slice(0, 400)}`);
  // 6. The ideas list works, agrees with the date, and fits someone who has stopped work.
  try {
    const sit = M.situationFromProfile(prof);
    const ranked = M.rank(sit, { limit: 20 });
    for (const m of ranked.all) if (!m.impact || BAD_TEXT.test(m.impact.text || '') || BAD_TEXT.test(m.why || '')) fail(`bad idea text: ${m.id}`);
    if (plan.retired) { const w = ranked.all.map(m => m.id).filter(x => WAGE_IDEAS.includes(x)); if (w.length) fail(`wage ideas for stopped work: ${w.join(',')}`); }
    const y = M.planYears(sit);   // the ideas list's own plan (years, or null)
    const ideasMonths = y == null ? null : Math.round(y * 12);
    if (y !== undefined && later(ideasMonths) !== base) fail(`ideas list's date ${ideasMonths} ≠ ${plan.months}`);
  } catch (e) { fail(`ideas threw: ${e.message}`); }
  // 7. The Age Pension line is never later than the date it sits beside.
  try {
    const pp = E.agePensionPlan(pi, { homeowner: pi.homeowner, rentFortnight: pi.rentFortnight });
    const line = E.agePensionLine(pp, plan, pi.homeowner, { rentFortnight: pi.rentFortnight });
    if (line && later(pp.plan.months) > base) fail('pension line later than the date');
    if (line && BAD_TEXT.test(line)) fail('bad pension line text');
  } catch (e) { fail(`pension threw: ${e.message}`); }
  // 8. Easing off saving ("coast") really does get there by 65 without more saving.
  try {
    const c = E.coastPoint(pi);
    if (c && c.months === 0 && !plan.retired) {
      const noSave = E.freedomPlan(Object.assign({}, pi, { monthlySavings: 0 }));
      if (!(noSave.freedomAgeExact <= 65 + 1e-6)) fail(`coast says now but no saving gives ${noSave.freedomAgeExact}`);
    }
  } catch (e) { fail(`coast threw: ${e.message}`); }
  // 9. The market range (on some profiles: it's slower) sits around the date.
  if (withRange) {
    try {
      const rg = E.freedomRange(pi);
      if (rg && plan.months != null && rg.early != null && (rg.early > plan.months + 2 || (rg.late != null && rg.late < plan.months - 2))) fail(`range ${rg.early}/${rg.likely}/${rg.late} misses ${plan.months}`);
      if ((plan.alreadyFree || plan.retired) && rg) fail('a range for someone free now or stopped work');
    } catch (e) { fail(`range threw: ${e.message}`); }
  }
  return broke;
}

if (ONLY != null) {
  console.log(JSON.stringify(makeProfile(ONLY), null, 1));
  console.log(check(ONLY, true));
} else {
  test(`random profiles ${FIRST}–${LAST} (seed ${SEED}): every rule holds`, () => {
    const problems = [];
    for (let i = FIRST; i <= LAST; i++) {
      const b = check(i, i % 25 === 0);
      if (b.length) problems.push(`#${i}: ${b.join(' | ')}`);
    }
    assert.ok(!problems.length, `${problems.length} profile(s) broke a rule:\n${problems.slice(0, 40).join('\n')}${problems.length > 40 ? `\n…and ${problems.length - 40} more` : ''}`);
  });
}
