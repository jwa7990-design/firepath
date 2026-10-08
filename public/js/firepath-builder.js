/* FirePath: the free calculator's builder (/firepath). "Build your FirePath".
 *
 * Five questions, one at a time: age, savings outside super, super, saved each month,
 * spending a year. Answered ones fold into one line ("32 · $60k saved · …"), and each
 * part of that line reopens its question. Enter (or leaving the box) moves on. The path
 * on the right (a slim sticky strip on phones) redraws as each number is typed.
 *
 * The maths isn't here. Every answer is written into the fields calculate() has always
 * read (#age, #savings, #superBalance, #income, #savingsAmount and the rest, in
 * #fbFields), then the page's own readInputs() turns them into the plan inputs, and
 * the live path runs FirePathEngine.freedomPlan / freedomRange on exactly those. So the
 * live path is the result the button shows.
 *
 * How the five answers map onto the old form (spending = take-home less savings):
 *   pay cycle = monthly, #savingsAmount = saved a month, #income = spending / 12 + saved a month.
 * With "Add more detail":
 *   - a take-home pay is used as #income, in its own pay cycle (savings converted to that cycle);
 *   - a partner's pay and savings go in as before;
 *   - and when either means "take-home less savings" no longer equals the spending typed,
 *     retirementSpendMultiplier (the old Less / Same / More choice) is set so the freedom
 *     number stays 25 times the spending typed.
 * Needs (loaded first): calculations.js, financial-engine.js, freedom-path.js, moves.js,
 * persona.js and the page's inline script (readInputs, calculate, inReach, rangeSentence,
 * PLAN_INVALID, and the globals selectedCycle, retirementSpendMultiplier, housingStatus,
 * dependants, savingsType). Nothing typed here is sent anywhere.
 */
(function () {
  'use strict';
  const root = document.getElementById('builder');
  if (!root) return;
  const $ = id => document.getElementById(id);
  const E = window.FirePathEngine;
  const Viz = window.FirePathViz;
  const mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const mqDesk = window.matchMedia ? window.matchMedia('(min-width: 960px)') : null;
  const reduced = () => !!(mqReduce && mqReduce.matches);
  const desk = () => !!(mqDesk && mqDesk.matches);
  const SUPER_AGE = 60;
  const THIS_YEAR = new Date().getFullYear();

  const Q = [
    { key: 'age', id: 'fbAge', money: false },
    { key: 'savings', id: 'fbSavings', money: true },
    { key: 'super', id: 'fbSuper', money: true },
    { key: 'monthly', id: 'fbMonthly', money: true },
    { key: 'spend', id: 'fbSpend', money: true },
  ];
  const byKey = {};
  Q.forEach(q => { q.input = $(q.id); q.block = root.querySelector(`.fb-q[data-q="${q.key}"]`); q.msg = $(q.id + 'Msg'); q.go = q.block.querySelector('.fb-go'); byKey[q.key] = q; });

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

  // A question's value and what's wrong with it. ok = usable for the plan.
  function check(q) {
    const v = parse(q.input.value);
    if (v === null) return { ok: false, blank: true, msg: q.key === 'age' ? 'Add your age to carry on.' : q.key === 'spend' ? 'Add roughly what you spend in a year, like 50000.' : 'Type an amount, or 0 if there’s nothing here yet.' };
    if (!Number.isFinite(v)) return { ok: false, msg: q.money ? 'That doesn’t look like an amount. Try 25000 or 25k.' : 'Your age in whole years, like 32.' };
    if (q.key === 'age') {
      if (v !== Math.floor(v) || v < 15 || v > 100) return { ok: false, msg: 'Your age in whole years, from 15 to 100.' };
    } else if (q.key === 'spend' && !(v > 0)) return { ok: false, msg: 'Add roughly what you spend in a year, like 50000.' };
    return { ok: true, value: v };
  }
  const values = () => { const o = {}; Q.forEach(q => { const c = check(q); o[q.key] = c.ok ? c.value : null; }); return o; };

  // ── The flow ────────────────────────────────────────────
  const answered = {};
  let current = 'age';
  let started = false;

  function summaryPart(key, v) {
    if (key === 'age') return String(v);
    if (key === 'savings') return v > 0 ? `${short(v)} saved` : 'no savings yet';
    if (key === 'super') return v > 0 ? `${short(v)} in super` : 'no super yet';
    if (key === 'monthly') return `${money(v)} a month`;
    return `${short(v)} a year`;
  }
  const ARIA = { age: 'Age', savings: 'Savings outside super', super: 'Super', monthly: 'Saved each month', spend: 'Spending a year' };

  function renderLine() {
    const v = values();
    const parts = Q.filter(q => answered[q.key] && v[q.key] != null);
    $('fbSofar').hidden = parts.length === 0;
    $('fbLine').innerHTML = parts.map((q, i) =>
      (i ? '<span class="fb-sep" aria-hidden="true">·</span>' : '')
      + `<button type="button" class="fb-chip" data-edit="${q.key}" aria-label="${ARIA[q.key]}: ${summaryPart(q.key, v[q.key])}. Change"${current === q.key ? ' aria-current="true"' : ''}>${summaryPart(q.key, v[q.key])}</button>`
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
      if (key) { const i = byKey[key].input; i.focus({ preventScroll: !desk() }); try { i.select(); } catch (e) {} if (!desk()) keepInView(byKey[key].block); }
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
    if (!c.ok) { q.msg.textContent = c.msg; q.input.setAttribute('aria-invalid', 'true'); return false; }
    answered[q.key] = true;
    tidy(q);
    setCurrent(nextOpen(), focus);
    recompute(true);
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
    if (answered[q.key]) renderLine();
    showDone();
    later();
  }

  Q.forEach(q => {
    q.input.addEventListener('input', () => onType(q));
    q.input.addEventListener('focus', () => { if (current !== q.key) setCurrent(q.key, false); markBaseline(); });
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
  $('fbForm').addEventListener('submit', e => e.preventDefault());

  $('fbLine').addEventListener('click', e => {
    const b = e.target.closest('[data-edit]');
    if (!b) return;
    const key = b.dataset.edit;
    if (current && current !== key && check(byKey[current]).ok && !answered[current]) answered[current] = true;
    setCurrent(key, true);
    markBaseline();
  });

  // ── Add more detail ─────────────────────────────────────
  const D = {
    takeHome: $('fbTakeHome'), cycle: $('fbCycle'), held: $('fbHeld'), debt: $('fbDebt'), housing: $('fbHousing'),
    mortgage: $('fbMortgage'), deps: $('fbDependants'), hasPartner: $('fbHasPartner'), pIncome: $('fbPIncome'),
    pSavings: $('fbPSavings'), pAge: $('fbPAge'), pSuper: $('fbPSuper'), persona: $('fbPersona'), note: $('contextNote')
  };
  const num0 = el => { const v = parse(el.value); return Number.isFinite(v) && v > 0 ? v : 0; };
  const PER = { weekly: 52 / 12, fortnightly: 26 / 12, monthly: 1 };   // per-cycle → monthly, as toMonthly()
  const WORD = { weekly: 'a week', fortnightly: 'a fortnight', monthly: 'a month' };

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
  more.addEventListener('focusin', e => { if (e.target.matches('input, select')) markBaseline(); });
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
  const setField = (id, v) => { $(id).value = v == null || !Number.isFinite(v) ? '' : String(v); };
  function sync() {
    const v = values();
    const takeHome = num0(D.takeHome);
    const cyc = takeHome > 0 ? D.cycle.value : 'monthly';
    const per = PER[cyc] || 1;
    selectedCycle = cyc;                                     // eslint-disable-line no-undef
    const partner = D.hasPartner.checked;
    const pI = partner ? num0(D.pIncome) : 0, pS = partner ? num0(D.pSavings) : 0;
    const pAge = partner ? num0(D.pAge) : 0, pSuper = partner ? num0(D.pSuper) : 0;
    root.querySelectorAll('.fb-per').forEach(s => { s.textContent = WORD[cyc]; });

    setField('age', v.age);
    setField('savings', v.savings);
    setField('superBalance', v.super);
    setField('debtTotal', num0(D.debt) || null);
    setField('mortgageRemaining', num0(D.mortgage) || null);
    setField('partnerIncome', pI || null);
    setField('partnerSavings', pS || null);
    setField('partnerAge', pAge || null);
    setField('partnerSuper', pSuper || null);
    housingStatus = D.housing.value;                         // eslint-disable-line no-undef
    savingsType = D.held.value;                              // eslint-disable-line no-undef
    dependants = Math.max(0, Math.min(10, Math.floor(num0(D.deps))));   // eslint-disable-line no-undef

    let mult = 1.0, derived = '';
    if (v.monthly != null && v.spend != null) {
      const save = v.monthly, spendM = v.spend / 12;
      // Take-home: as typed, or worked out as spending plus saving (the household's, less
      // what a partner brings in and doesn't save).
      let income;
      if (takeHome > 0) income = takeHome;
      else {
        income = spendM + save - Math.max(0, (pI - pS) * per);
        if (!(income > save)) income = spendM + save;      // the partner's numbers don't fit inside the spending: keep it simple
      }
      const saveCycle = takeHome > 0 ? save / per : save;
      setField('income', income);
      setField('savingsAmount', saveCycle);
      // Spending as calculate() sees it (take-home less savings, household, monthly).
      const mS = (income + pI) * per - (saveCycle + pS) * per;
      if (Math.abs(mS - spendM) > 0.005 && mS > 0) mult = spendM / mS;
      if (!(takeHome > 0) && pI > 0) derived = `Your own take-home is taken as ${money(income)} a month: the household’s spending and saving, less what your partner brings in. Add your take-home pay if it’s different.`;
      if (takeHome > 0) derived = mS > 0
        ? `On these numbers you spend about ${money(mS * 12)} a year now (take-home less savings). Your freedom number uses the ${money(v.spend)} a year you entered.`
        : 'Take-home pay needs to be more than what you save.';
    } else { setField('income', null); setField('savingsAmount', null); }
    retirementSpendMultiplier = mult;                        // eslint-disable-line no-undef
    $('fbDerived').textContent = derived;
  }

  // ── The live path ───────────────────────────────────────
  const live = $('fbLive'), big = $('fbBig'), when = $('fbWhen'), rangeEl = $('fbRange'), note = $('fbNote'), numEl = $('fbNumber'), say = $('fbSay');
  const pathEl = $('fbPath');
  let viz = null, vizCompact = null, dated = false, last = null;

  function mountViz(animate) {
    if (!Viz || !pathEl) return;
    if (viz) viz.destroy();
    vizCompact = !desk();
    viz = Viz.mount(pathEl, {
      compact: vizCompact, legend: !vizCompact, animateIn: animate ? true : false, live: false, watch: live,
      onIntro(phase, info) {
        if (phase === 'play' && last && last.status === 'ok') {
          const a = big.querySelector('strong.is-age');
          if (a) { setAge(a, last.inputs.age, true); setAge(a, last.plan.freedomAge, false, info.duration); }
        }
      }
    });
  }
  if (mqDesk) {
    const re = () => { if (!viz || vizCompact === !desk()) return; mountViz(false); paint(); };
    if (mqDesk.addEventListener) mqDesk.addEventListener('change', re); else if (mqDesk.addListener) mqDesk.addListener(re);
  }

  // The big age counts to its new value (not under reduced motion).
  function setAge(el, to, jump, dur) {
    const loop = Viz && Viz.loop;
    const from = Number(el.dataset.v);
    if (jump || !loop || reduced() || !Number.isFinite(from) || from === to) { if (loop) loop.stop(el); el.dataset.v = to; el.textContent = String(to); return; }
    const t0 = performance.now(), d = dur || 450;
    loop.run(el, now => {
      const k = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - k, 3);
      const cur = from + (to - from) * e;
      el.dataset.v = k < 1 ? cur : to;
      const s = String(Math.round(cur));
      if (el.textContent !== s) el.textContent = s;
      return k < 1;
    });
  }

  function span(months, comma) { return Viz ? Viz.span(months, comma) : `${Math.round(months)} months`; }
  function setBig(html, cls) { big.innerHTML = html; big.className = 'fb-big' + (cls ? ' ' + cls : ''); }

  // Everything the panel shows, worked out exactly as calculate() and buildAnswer() would.
  function evaluate() {
    sync();
    const v = values();
    if (v.age == null) return { status: 'empty' };
    if (v.spend == null || v.monthly == null || v.savings == null || v.super == null) return { status: 'waiting', age: v.age, v };
    const d = typeof readInputs === 'function' ? readInputs() : { error: 'unavailable' };   // eslint-disable-line no-undef
    if (d.error) return { status: 'error', age: v.age, msg: d.error };
    let plan = null;
    try { plan = E.freedomPlan(d.planInputs); } catch (e) { plan = null; }
    if (!plan || !plan.valid) return { status: 'error', age: v.age, msg: PLAN_INVALID };   // eslint-disable-line no-undef
    const s = { status: 'ok', age: v.age, plan, inputs: d.planInputs, d, range: null };
    if (plan.alreadyFree) s.status = 'free';
    else if (!inReach(plan)) s.status = 'far';                  // eslint-disable-line no-undef
    else if (!(d.mSav > 0)) s.status = 'nosave';
    return s;
  }

  function paint() {
    const s = last;
    if (!s || !viz) return;
    const opts = { age: s.age };
    if (s.status === 'empty' || s.status === 'waiting' || s.status === 'error') {
      if (s.status !== 'empty') opts.waiting = s.status === 'error' ? 'Check the numbers on the left' : 'Your date appears here';
      opts.message = s.status === 'error' ? s.msg : s.status === 'empty' ? 'Add your numbers to see your path.' : 'Your date appears once you add what you spend in a year.';
      viz.update(null, null, opts);
      return;
    }
    // Same as the result's path (pathOpts): "not within reach" past 60 years.
    opts.far = s.status !== 'free' && !inReach(s.plan);         // eslint-disable-line no-undef
    viz.update(s.plan, s.range, opts);
  }

  let baseline = null;          // the date when the visitor started changing something
  function markBaseline() { baseline = last && (last.status === 'ok' || last.status === 'nosave') ? { months: last.plan.months, age: last.plan.freedomAge } : null; }

  function render(s, settled) {
    const prev = last;
    last = s;
    live.classList.toggle('is-empty', s.status === 'empty');
    if (s.status !== 'error') { const err = $('errorMsg'); if (err) err.style.display = 'none'; }   // an old "check your numbers" no longer applies
    live.classList.toggle('is-waiting', s.status !== 'ok');
    rangeEl.textContent = '';
    numEl.innerHTML = '';
    if (s.status === 'empty') {
      setBig('Your path draws itself here', 'is-quiet');
      when.textContent = 'Answer on the left. Each number moves it.';
      note.textContent = '';
    } else if (s.status === 'waiting') {
      setBig(`Today, <strong>${s.age}</strong>`, 'is-quiet');
      when.textContent = s.age < SUPER_AGE
        ? `Super from 60, in ${SUPER_AGE - s.age} year${SUPER_AGE - s.age === 1 ? '' : 's'}. Your date appears once you add your spending.`
        : 'You can already get to your super. Your date appears once you add your spending.';
      note.textContent = '';
    } else if (s.status === 'error') {
      setBig('Check your numbers', 'is-quiet');
      when.textContent = s.msg;
      note.textContent = '';
    } else {
      const p = s.plan, d = s.d;
      numEl.innerHTML = `Freedom number <strong>${money(d.fireNum)}</strong>, about 25 times ${money(d.fireNum / 25)} a year.`;
      if (s.status === 'free') {
        setBig('Work could already be optional', 'is-quiet');
        when.textContent = s.age < SUPER_AGE && s.inputs.superBalance > 0
          ? 'On these numbers, your savings could carry you to 60, then super takes over.'
          : 'On these numbers, what you have could cover your spending, drawn down slowly.';
      } else if (s.status === 'far') {
        setBig('Not within reach yet', 'is-quiet');
        when.textContent = 'On these numbers, work being optional is a long way off. Saving more or spending less brings it into view.';
      } else if (s.status === 'nosave') {
        setBig('A long way off on these numbers', 'is-quiet');
        when.textContent = p.freedomAge != null ? `Nothing is going into savings from your pay yet, so this leans on super alone: around age ${p.freedomAge}.` : 'Nothing is going into savings from your pay yet.';
      } else {
        let a = big.querySelector('strong.is-age');
        if (!a) { setBig('Work could become optional at <strong class="is-age"></strong>'); a = big.querySelector('strong.is-age'); setAge(a, p.freedomAge, true); }
        else if (!(viz && viz.isIntro())) setAge(a, p.freedomAge, false);
        when.textContent = `in ${p.freedomYear} · ${span(p.months, true)} from now`;
        rangeEl.textContent = s.range ? rangeSentence(p, s.range) : '';      // eslint-disable-line no-undef
      }
      // What the last change did.
      const nowDated = s.status === 'ok' || s.status === 'nosave';
      if (!prev || !(prev.status === 'ok' || prev.status === 'nosave' || prev.status === 'free' || prev.status === 'far')) note.textContent = 'Here’s what your numbers produce. Changing any of them moves your projected date.';
      else if (baseline && nowDated) {
        const diff = baseline.months - p.months;
        note.textContent = Math.abs(diff) < 1 ? 'Changing this moves your projected date. On these numbers, it stays the same.'
          : diff > 0 ? `This scenario reaches the target ${span(diff)} earlier, at ${p.freedomAge}.`
          : `This scenario reaches the target ${span(-diff)} later, at ${p.freedomAge}.`;
      }
    }
    paint();
    // Screen readers hear the result once typing settles, not every keystroke.
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => {
      const t = [big.textContent, when.textContent, rangeEl.textContent, note.textContent].filter(Boolean).join(' ');
      if (say.textContent !== t) say.textContent = t;
    }, settled ? 150 : 900);
  }
  let sayTimer = 0;

  // ── Recompute ───────────────────────────────────────────
  // The plan is cheap, so it's redone on every keystroke. The likely range (2,000 market
  // outcomes, ~40ms) waits until typing settles, then the band grows in.
  let rangeTimer = 0, typeTimer = 0, rangeKey = '', rangeVal = null;
  function recompute(settled) {
    clearTimeout(typeTimer);
    const s = evaluate();
    // The first date draws itself in, once the spending's been typed.
    if ((s.status === 'ok') && !dated && viz) { dated = true; last = null; mountViz(true); }
    if (s.status === 'ok' && s.d.mSav > 0) {
      const key = JSON.stringify(s.inputs);
      if (key === rangeKey) s.range = rangeVal;
      else {
        clearTimeout(rangeTimer);
        rangeTimer = setTimeout(() => {
          let mc = null;
          try { mc = E.freedomRange(s.inputs); } catch (e) { mc = null; }
          rangeKey = key; rangeVal = mc && mc.early != null ? mc : null;
          if (last && last.inputs && JSON.stringify(last.inputs) === key) { last.range = rangeVal; render(last, true); }
        }, settled ? 0 : 200);
      }
    }
    render(s, settled);
  }
  // Typing: a short pause first. The first time through the spending question it waits a
  // little longer, so "50000" draws one path, not five.
  function later() {
    clearTimeout(typeTimer);
    const first = !dated && current === 'spend';
    typeTimer = setTimeout(() => recompute(false), first ? 350 : 60);
  }

  // ── The one action ──────────────────────────────────────
  $('fbCalc').addEventListener('click', () => {
    if (current && check(byKey[current]).ok) { answered[current] = true; tidy(byKey[current]); }
    sync();
    calculate();                                            // eslint-disable-line no-undef
  });

  // ── Start ───────────────────────────────────────────────
  mountViz(false);
  setCurrent('age', false);
  recompute(true);

  window.FirePathBuilder = {
    sync,
    refresh() { rangeKey = ''; recompute(true); },
    // Back from the results: every answer still there; the line ready to change.
    reopen() {
      setCurrent(nextOpen(), false);
      recompute(true);
      const first = root.querySelector('.fb-chip') || byKey.age.input;
      first.focus({ preventScroll: true });
    }
  };
})();
