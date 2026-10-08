/* FirePath: the free calculator's builder (/firepath). "Build your FirePath".
 *
 * Six questions, one at a time: age, how you're paid, what lands in your account each
 * pay, how much of that you put aside, savings outside super, and super. Answered ones
 * fold into one line ("32 · paid fortnightly · $3,200 take-home · …"), and each part of
 * that line reopens its question. Enter (or leaving the box) moves on; the pay choice
 * moves on when tapped.
 *
 * What you spend isn't asked: it's take-home less what you put aside, annualised by the
 * pay cycle, exactly as calculate() works it out. It's shown under the questions, with
 * "Adjust" for the old Less / About the same / More choice (retirementSpendMultiplier).
 *
 * The path on the right (a slim sticky strip on phones) takes shape as you answer: Today,
 * 60 and a "?" where the date will land, with the supporting numbers (spending, freedom
 * number, saving rate). It never shows the freedom age, year or range: the results page
 * reveals those.
 *
 * The maths isn't here. Every answer is written into the fields calculate() has always
 * read (#fbFields), in the original form's shape: the pay cycle (selectedCycle), #income =
 * take-home per pay, #savingsAmount = put aside per pay, #age, #savings, #superBalance,
 * and the partner's pay and saving in the same cycle. The page's readInputs() then does
 * the rest.
 * Needs (loaded first): calculations.js, financial-engine.js, freedom-path.js, moves.js,
 * persona.js and the page's inline script (readInputs, calculate, PLAN_INVALID, and the
 * globals selectedCycle, retirementSpendMultiplier, housingStatus, dependants,
 * savingsType). Nothing typed here is sent anywhere.
 */
(function () {
  'use strict';
  const root = document.getElementById('builder');
  if (!root) return;
  const $ = id => document.getElementById(id);
  const E = window.FirePathEngine;
  const Viz = window.FirePathViz;
  const mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const mqDesk = window.matchMedia ? window.matchMedia('(min-width: 900px)') : null;
  const reduced = () => !!(mqReduce && mqReduce.matches);
  const desk = () => !!(mqDesk && mqDesk.matches);
  const SUPER_AGE = 60;

  const CYCLE_WORD = { weekly: 'week', fortnightly: 'fortnight', monthly: 'month' };
  const Q = [
    { key: 'age', id: 'fbAge', money: false },
    { key: 'cycle', id: 'fbCycle', choice: true },
    { key: 'takeHome', id: 'fbTakeHome', money: true },
    { key: 'save', id: 'fbSave', money: true },
    { key: 'savings', id: 'fbSavings', money: true },
    { key: 'super', id: 'fbSuper', money: true },
  ];
  const byKey = {};
  Q.forEach(q => { q.input = $(q.id); q.block = root.querySelector(`.fb-q[data-q="${q.key}"]`); q.msg = $(q.id + 'Msg'); q.go = q.block.querySelector('.fb-go'); byKey[q.key] = q; });
  const cycleBtns = Array.from(byKey.cycle.input.querySelectorAll('[data-cycle]'));
  let cycle = null;                     // nothing chosen until tapped
  let spendMult = 1.0;                  // the "Adjust" choice: less 0.8 / about the same 1.0 / more 1.2

  // ── Reading numbers ─────────────────────────────────────
  // Blank = null. Accepts "1,200", "$1200", "80k" and "1.2m". NaN = not a number we can use.
  function parse(str) {
    const raw = String(str || '').trim().toLowerCase().replace(/[$,\s]/g, '');
    if (!raw) return null;
    const m = raw.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
    if (!m) return NaN;
    return Number(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1);
  }
  const fmtNum = n => Math.round(n).toLocaleString('en-AU');
  const fmtTyped = n => n.toLocaleString('en-AU', { maximumFractionDigits: 2 });   // keeps cents someone typed
  const money = n => '$' + fmtNum(n);
  // "$60k", "$1.2m", "$2,500"
  function short(n) {
    if (n >= 1e6) return '$' + (Math.round(n / 1e4) / 100).toString().replace(/\.?0+$/, '') + 'm';
    if (n >= 10000) return '$' + Math.round(n / 1000) + 'k';
    return money(n);
  }
  // A freedom number: "$1.17M", "$850K" (the site's K/M style, a little finer than fmtM)
  function bigM(n) {
    if (n >= 999500) return '$' + (n / 1e6).toFixed(2).replace(/0$/, '') + 'M';
    if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
    return money(n);
  }
  const word = () => CYCLE_WORD[cycle] || 'fortnight';

  // A question's value and what's wrong with it. ok = usable for the plan.
  function check(q) {
    if (q.choice) return cycle ? { ok: true, value: cycle } : { ok: false, blank: true, msg: 'Choose how often you’re paid.' };
    const v = parse(q.input.value);
    if (v === null) return { ok: false, blank: true, msg: q.key === 'age' ? 'Add your age to carry on.' : q.key === 'takeHome' ? `Add what lands in your account each ${word()}, like 3200.` : 'Type an amount, or 0 if there’s nothing here yet.' };
    if (!Number.isFinite(v)) return { ok: false, msg: q.money ? 'That doesn’t look like an amount. Try 2500 or 2.5k.' : 'Your age in whole years, like 32.' };
    if (q.key === 'age') {
      if (v !== Math.floor(v) || v < 15 || v > 100) return { ok: false, msg: 'Your age in whole years, from 15 to 100.' };
    } else if (q.key === 'takeHome' && !(v > 0)) return { ok: false, msg: `Add what lands in your account each ${word()}, like 3200.` };
    else if (q.key === 'save') {
      const th = parse(byKey.takeHome.input.value);
      if (Number.isFinite(th) && th > 0 && v > th) return { ok: false, over: true, msg: `That’s more than the ${money(th)} that lands each ${word()}. What you put aside comes out of your pay, so it can be up to ${money(th)}.` };
    }
    return { ok: true, value: v };
  }
  const values = () => { const o = {}; Q.forEach(q => { const c = check(q); o[q.key] = c.ok ? c.value : null; }); return o; };

  // ── The flow ────────────────────────────────────────────
  const answered = {};
  let current = 'age';
  let started = false;

  function summaryPart(key, v) {
    if (key === 'age') return String(v);
    if (key === 'cycle') return `paid ${v}`;
    if (key === 'takeHome') return `${money(v)} take-home`;
    if (key === 'save') return v > 0 ? `${money(v)} put aside` : 'nothing put aside';
    if (key === 'savings') return v > 0 ? `${short(v)} saved` : 'no savings yet';
    return v > 0 ? `${short(v)} super` : 'no super yet';
  }
  const ariaName = key => ({ age: 'Age', cycle: 'How you’re paid', takeHome: `Take-home pay each ${word()}`, save: `Put aside each ${word()}`, savings: 'Savings outside super', super: 'Super' }[key]);

  function renderLine() {
    const v = values();
    const parts = Q.filter(q => answered[q.key] && v[q.key] != null);
    $('fbSofar').hidden = parts.length === 0;
    $('fbLine').innerHTML = parts.map((q, i) =>
      (i ? '<span class="fb-sep" aria-hidden="true">·</span>' : '')
      + `<button type="button" class="fb-chip" data-edit="${q.key}" aria-label="${ariaName(q.key)}: ${summaryPart(q.key, v[q.key])}. Change"${current === q.key ? ' aria-current="true"' : ''}>${summaryPart(q.key, v[q.key])}</button>`
    ).join('');
  }

  const allDone = () => Q.every(q => answered[q.key] && check(q).ok);

  function showDone() {
    const done = $('fbDone'), on = allDone();
    if (on && done.hidden) {
      done.hidden = false;
      if (!reduced()) { done.classList.remove('is-in'); void done.offsetWidth; done.classList.add('is-in'); }
    } else if (!on) done.hidden = true;
  }

  function focusQ(q) {
    const el = q.choice ? (cycleBtns.find(b => b.dataset.cycle === cycle) || cycleBtns[0]) : q.input;
    el.focus({ preventScroll: !desk() });
    if (!q.choice) { try { el.select(); } catch (e) {} }
  }

  // Shows one question (or none, once everything's answered).
  function setCurrent(key, focus) {
    const prev = current;
    if (prev && prev !== key) {
      const pq = byKey[prev];
      // Left half-typed: it drops out of the line until it's answered again.
      if (!check(pq).ok) answered[prev] = false;
      tidy(pq);
    }
    current = key;
    Q.forEach(q => {
      const show = q.key === key;
      if (show && q.block.hidden) {
        q.block.hidden = false;
        if (!reduced()) { q.block.classList.remove('is-in'); void q.block.offsetWidth; q.block.classList.add('is-in'); }
      } else if (!show) q.block.hidden = true;
    });
    renderLine();
    showDone();
    if (focus) {
      if (key) { focusQ(byKey[key]); if (!desk()) keepInView(byKey[key].block); }
      else $('fbCalc').focus({ preventScroll: false });
    }
  }
  // On a phone the sticky path strip sits over the top of the page, so bring the question just below it.
  function keepInView(el) {
    const live = $('fbLive');
    const top = el.getBoundingClientRect().top;
    const cover = (live && !live.classList.contains('is-empty') ? live.getBoundingClientRect().bottom : 64) + 12;
    if (top < cover || top > window.innerHeight * 0.55) window.scrollBy({ top: top - cover, behavior: reduced() ? 'auto' : 'smooth' });
  }
  const nextOpen = () => { const q = Q.find(x => !answered[x.key] || !check(x).ok); return q ? q.key : null; };

  // Accepts the current question's answer and moves on. focus = move focus with it.
  function commit(q, focus) {
    const c = check(q);
    if (!c.ok) { q.msg.textContent = c.msg; if (!q.choice) q.input.setAttribute('aria-invalid', 'true'); return false; }
    answered[q.key] = true;
    tidy(q);
    setCurrent(nextOpen(), focus);
    recompute();
    return true;
  }
  // Money boxes tidy to "60,000" when you leave them.
  function tidy(q) {
    const c = check(q);
    if (c.ok && q.money) q.input.value = fmtTyped(c.value);
  }

  // Analytics: once, on the first thing typed or chosen.
  function start() {
    if (started) return;
    started = true;
    try { if (typeof gtag === 'function') gtag('event', 'builder_start', { 'event_category': 'engagement', 'event_label': 'firepath_builder' }); } catch (e) {}
  }
  function onType(q) {
    start();
    q.msg.textContent = '';
    q.input.removeAttribute('aria-invalid');
    const c = check(q);
    q.go.hidden = !c.ok;
    // Putting aside more than lands in the account: say so as it's typed.
    if (q.key === 'save' && c.over) { q.msg.textContent = c.msg; q.input.setAttribute('aria-invalid', 'true'); }
    if (answered[q.key]) renderLine();
    showDone();
    later();
  }

  Q.forEach(q => {
    if (q.choice) return;
    q.input.addEventListener('input', () => onType(q));
    q.input.addEventListener('focus', () => { if (current !== q.key) setCurrent(q.key, false); });
    q.input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(q, true); }
    });
    // Leaving the box (tapping away, or "Done" on a phone keyboard) also moves on, without
    // stealing focus from wherever it went.
    q.input.addEventListener('blur', () => {
      setTimeout(() => {
        if (current !== q.key) return;
        const to = document.activeElement;
        if (to && to !== document.body && root.contains(to)) return;    // they chose something else in the builder
        if (check(q).ok) commit(q, false); else tidy(q);
      }, 0);
    });
    q.go.addEventListener('click', () => commit(q, true));
    const none = q.block.querySelector('.fb-none');
    if (none) none.addEventListener('click', () => { q.input.value = '0'; onType(q); commit(q, true); });
  });

  // How you're paid: one tap chooses and moves on.
  cycleBtns.forEach(b => {
    b.addEventListener('focus', () => { if (current !== 'cycle') setCurrent('cycle', false); });
    b.addEventListener('click', () => {
      start();
      cycle = b.dataset.cycle;
      cycleBtns.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      byKey.cycle.msg.textContent = '';
      sync();
      commit(byKey.cycle, true);
    });
  });
  $('fbForm').addEventListener('submit', e => e.preventDefault());

  $('fbLine').addEventListener('click', e => {
    const b = e.target.closest('[data-edit]');
    if (!b) return;
    const key = b.dataset.edit;
    if (current && current !== key && check(byKey[current]).ok && !answered[current]) answered[current] = true;
    setCurrent(key, true);
  });

  // ── What you spend, and "Adjust" ────────────────────────
  const spendBox = $('fbSpendBox'), spendLine = $('fbSpendLine'), adjust = $('fbAdjust'), retire = $('fbRetire');
  const retireBtns = Array.from(retire.querySelectorAll('[data-spend]'));
  adjust.addEventListener('click', () => {
    const open = retire.hidden;
    retire.hidden = !open;
    adjust.setAttribute('aria-expanded', String(open));
    if (open) (retireBtns.find(b => b.getAttribute('aria-pressed') === 'true') || retireBtns[1]).focus();
  });
  retireBtns.forEach(b => b.addEventListener('click', () => {
    start();
    spendMult = parseFloat(b.dataset.spend);
    retireBtns.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    recompute();
  }));

  // ── Add more detail ─────────────────────────────────────
  const D = {
    held: $('fbHeld'), debt: $('fbDebt'), housing: $('fbHousing'),
    mortgage: $('fbMortgage'), deps: $('fbDependants'), hasPartner: $('fbHasPartner'), pIncome: $('fbPIncome'),
    pSavings: $('fbPSavings'), pAge: $('fbPAge'), pSuper: $('fbPSuper'), persona: $('fbPersona'), note: $('contextNote')
  };
  const num0 = el => { const v = parse(el.value); return Number.isFinite(v) && v > 0 ? v : 0; };

  const more = $('fbMore');
  more.addEventListener('input', e => {
    if (e.target === D.note) return;      // the note feeds the result, not the path
    start();
    later();
  });
  more.addEventListener('change', e => {
    if (e.target === D.hasPartner) { $('fbPartner').hidden = !D.hasPartner.checked; }
    if (e.target === D.persona && window.FirePathPersona) FirePathPersona.set(D.persona.value);
    later();
  });
  more.addEventListener('focusout', e => {
    const el = e.target;
    if (el.matches('.fb-sbox input') && el.inputMode === 'decimal') { const v = parse(el.value); if (Number.isFinite(v)) el.value = fmtTyped(v); }
  });
  // The persona: a small choice, defaulting to the one already chosen (or the site default).
  if (window.FirePathPersona && D.persona) {
    D.persona.innerHTML = FirePathPersona.ORDER.map(id => `<option value="${id}">${FirePathPersona.PERSONAS[id].name}</option>`).join('');
    D.persona.value = FirePathPersona.get();
    FirePathPersona.onChange(id => { if (D.persona.value !== id) D.persona.value = id; });
  }

  // ── Writing the answers into calculate()'s fields ───────
  // The original form's shape: pay cycle, take-home per pay, put aside per pay. A partner's
  // pay and saving are in the same cycle, as they were.
  const setField = (id, v) => { $(id).value = v == null || !Number.isFinite(v) ? '' : String(v); };
  function sync() {
    const v = values();
    selectedCycle = cycle || 'fortnightly';                  // eslint-disable-line no-undef
    root.querySelectorAll('.fb-cyc').forEach(s => { s.textContent = word(); });
    root.querySelectorAll('.fb-per').forEach(s => { s.textContent = 'a ' + word(); });
    const partner = D.hasPartner.checked;

    setField('age', v.age);
    setField('savings', v.savings);
    setField('superBalance', v.super);
    setField('income', v.takeHome);
    setField('savingsAmount', v.save);
    setField('debtTotal', num0(D.debt) || null);
    setField('mortgageRemaining', num0(D.mortgage) || null);
    setField('partnerIncome', partner ? num0(D.pIncome) || null : null);
    setField('partnerSavings', partner ? num0(D.pSavings) || null : null);
    setField('partnerAge', partner ? num0(D.pAge) || null : null);
    setField('partnerSuper', partner ? num0(D.pSuper) || null : null);
    housingStatus = D.housing.value;                         // eslint-disable-line no-undef
    savingsType = D.held.value;                              // eslint-disable-line no-undef
    dependants = Math.max(0, Math.min(10, Math.floor(num0(D.deps))));   // eslint-disable-line no-undef
    retirementSpendMultiplier = spendMult;                   // eslint-disable-line no-undef
  }

  // ── The live path ───────────────────────────────────────
  const live = $('fbLive'), big = $('fbBig'), when = $('fbWhen'), facts = $('fbFacts'), note = $('fbNote'), say = $('fbSay');
  const pathEl = $('fbPath');
  let viz = null, vizCompact = null, last = null;

  function mountViz() {
    if (!Viz || !pathEl) return;
    if (viz) viz.destroy();
    vizCompact = !desk();
    viz = Viz.mount(pathEl, { compact: vizCompact, legend: false, animateIn: false, live: false, watch: live });
  }
  if (mqDesk) {
    const re = () => { if (!viz || vizCompact === !desk()) return; mountViz(); paint(); };
    if (mqDesk.addEventListener) mqDesk.addEventListener('change', re); else if (mqDesk.addListener) mqDesk.addListener(re);
  }

  // Everything the panel shows. The plan is only checked for being workable: its date
  // stays for the results page.
  function evaluate() {
    sync();
    const v = values();
    if (v.age == null) return { status: 'empty' };
    if (v.cycle == null || v.takeHome == null || v.save == null) {
      const over = check(byKey.save).over;
      return over ? { status: 'error', age: v.age, v, msg: 'Savings can’t be more than take-home pay.' } : { status: 'waiting', age: v.age, v };
    }
    const d = typeof readInputs === 'function' ? readInputs() : { error: 'unavailable' };   // eslint-disable-line no-undef
    if (d.error) return { status: 'error', age: v.age, v, msg: d.error };
    let plan = null;
    try { plan = E.freedomPlan(d.planInputs); } catch (e) { plan = null; }
    if (!plan || !plan.valid) return { status: 'error', age: v.age, v, msg: PLAN_INVALID };   // eslint-disable-line no-undef
    return { status: 'ready', age: v.age, v, d };
  }

  function paint() {
    const s = last;
    if (!s || !viz) return;
    if (s.status === 'empty') { viz.update(null, null, { message: 'Add your numbers to see your path.' }); return; }
    viz.update(null, null, {
      age: s.age, pending: true,
      waiting: s.status === 'error' ? 'Check the numbers on the left' : 'Your date appears when you’re done',
      message: `Your path so far: today you’re ${s.age}${s.age < SUPER_AGE ? ', and you can get to your super from 60' : ''}. Your freedom date appears when you’re done.`
    });
  }

  // "So you spend about $57,200 a year. Your freedom number is about $1.43M (25 × that)."
  function spendText(d) {
    const annual = d.mS * 12, who = d.hasPartner ? 'your household spends' : 'you spend';
    const head = `So ${who} about <strong>${money(annual)} a year</strong>.`;
    if (spendMult === 1) return `${head} Your freedom number is about <strong>${typeof fmtM === "function" ? fmtM(d.fireNum) : bigM(d.fireNum)}</strong> (25 × that).`;
    return `${head} You expect to spend ${spendMult < 1 ? 'less' : 'more'} once work is optional, about ${money(annual * spendMult)} a year, so your freedom number is about <strong>${typeof fmtM === "function" ? fmtM(d.fireNum) : bigM(d.fireNum)}</strong> (25 × that).`;
  }

  function render(s) {
    last = s;
    live.classList.toggle('is-empty', s.status === 'empty');
    live.classList.add('is-waiting');
    if (s.status !== 'error') { const err = $('errorMsg'); if (err) err.style.display = 'none'; }   // an old "check your numbers" no longer applies
    facts.innerHTML = '';
    note.textContent = '';
    const ready = s.status === 'ready';
    spendBox.hidden = !ready;
    if (ready) { const t = spendText(s.d); if (spendLine.innerHTML !== t) spendLine.innerHTML = t; }
    if (s.status === 'empty') {
      big.textContent = 'Your path draws itself here';
      when.textContent = 'Answer on the left and watch it take shape.';
    } else {
      const today = s.age < SUPER_AGE
        ? `Today, ${s.age}. You can get to your super from 60, in ${SUPER_AGE - s.age} year${SUPER_AGE - s.age === 1 ? '' : 's'}.`
        : `Today, ${s.age}. You can already get to your super.`;
      if (s.status === 'error') { big.textContent = 'Check your numbers'; when.textContent = s.msg; }
      else { big.textContent = allDone() ? 'Your FirePath is ready' : 'Your FirePath is taking shape'; when.textContent = today; }
      if (ready) {
        const d = s.d;
        facts.innerHTML = [
          `${d.hasPartner ? 'Your household spends' : 'You spend'} about <strong>${money(d.mS * 12)} a year</strong>`,
          `Your freedom number: about <strong>${typeof fmtM === "function" ? fmtM(d.fireNum) : bigM(d.fireNum)}</strong>`,
          d.sRate > 0 ? `You’re saving <strong>${d.sRate}%</strong> of your take-home` : 'Nothing is going into savings from your pay yet'
        ].map(t => `<li>${t}</li>`).join('');
        if (s.v.savings == null || s.v.super == null) note.textContent = 'Your savings and super count as $0 until you add them.';
        else if (allDone()) note.textContent = 'Find your date to see when work could be optional, and what could move it.';
      }
    }
    paint();
    // Screen readers hear the panel once typing settles: no date in it, only what's known.
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => {
      const t = [big.textContent, when.textContent, facts.textContent ? Array.from(facts.children).map(li => li.textContent).join('. ') + '.' : '', note.textContent].filter(Boolean).join(' ');
      if (say.textContent !== t) say.textContent = t;
    }, 700);
  }
  let sayTimer = 0;

  // ── Recompute ───────────────────────────────────────────
  let typeTimer = 0;
  function recompute() { clearTimeout(typeTimer); render(evaluate()); }
  function later() { clearTimeout(typeTimer); typeTimer = setTimeout(recompute, 60); }

  // ── The one action ──────────────────────────────────────
  $('fbCalc').addEventListener('click', () => {
    if (current && check(byKey[current]).ok) { answered[current] = true; tidy(byKey[current]); }
    sync();
    calculate();                                            // eslint-disable-line no-undef
  });

  // ── Start ───────────────────────────────────────────────
  mountViz();
  setCurrent('age', false);
  recompute();

  window.FirePathBuilder = {
    sync,
    refresh() { recompute(); },
    // Back from the results: every answer still there; the line ready to change.
    reopen() {
      setCurrent(nextOpen(), false);
      recompute();
      const first = root.querySelector('.fb-chip') || byKey.age.input;
      first.focus({ preventScroll: true });
    }
  };
})();
