/* FirePath homepage: the live calculator and the timeline under it.
 *
 * Reads the five hero inputs, works out the freedom age with the shared engine
 * (FirePathEngine.freedomPlan, the "bridge to 60" rule) and its likely range
 * (freedomRange, 2,000 possible market outcomes), then:
 *   - counts the result's numbers to their new values,
 *   - keeps the freedom number line in step with the spending box,
 *   - works out the three what-if options and says each one in words,
 *   - draws the visitor's journey (From here to a freer future).
 * Tweens share one requestAnimationFrame loop (FirePathViz.loop from freedom-path.js),
 * which stops when nothing is moving. prefers-reduced-motion: numbers land at once and
 * the timeline appears complete.
 * Needs tax-engine.js, calculations.js, financial-engine.js and freedom-path.js first.
 * Runs in the browser only; nothing typed here is sent anywhere.
 */
(function () {
  'use strict';
  const root = document.getElementById('hpCalc');
  if (!root) return;
  const $ = id => document.getElementById(id);
  const E = window.FirePathEngine;
  const Viz = window.FirePathViz;
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduce = !!(mq && mq.matches);
  const SUPER_AGE = 60;
  const THIS_YEAR = new Date().getFullYear();
  let example;
  try { example = JSON.parse(root.dataset.example); } catch (e) { example = { age: 32, savings: 60000, super: 50000, monthly: 2500, spend: 50000 }; }

  const ids = { age: 'hpAge', spend: 'hpSpend', savings: 'hpSavings', super: 'hpSuper', monthly: 'hpMonthly' };
  const fmtNum = n => Math.round(n).toLocaleString('en-AU');
  const money = n => '$' + fmtNum(n);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = k => 1 - Math.pow(1 - k, 3);                                  // ease-out cubic
  const easeInOut = k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const f1 = n => Math.round(n * 10) / 10;                                    // keeps SVG strings short
  const op = n => clamp(n, 0, 1).toFixed(2);                                   // opacity attribute
  const textW = (str, size) => str.length * size * 0.56;

  // Blank = 0. Accepts "1,200", "$1200", "80k" and "1.2m". NaN = not a number we can use.
  function read(key) {
    const raw = String($(ids[key]).value || '').trim().toLowerCase().replace(/[$,\s]/g, '');
    if (!raw) return key === 'age' || key === 'spend' ? NaN : 0;
    const m = raw.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
    if (!m) return NaN;
    return Number(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1);
  }

  // "1 year 4 months", "13 years, 2 months"
  function span(months, comma) {
    months = Math.max(0, Math.round(months));
    const y = Math.floor(months / 12), m = months % 12;
    const ys = y ? `${y} year${y === 1 ? '' : 's'}` : '', ms = m ? `${m} month${m === 1 ? '' : 's'}` : '';
    if (ys && ms) return ys + (comma ? ', ' : ' ') + ms;
    return ys || ms || 'less than a month';
  }

  // ── One animation loop ──────────────────────────────────
  // Every tween is a task on the path renderer's shared loop, which only asks for a frame
  // while at least one task is running, so a still page costs nothing.
  const tasks = Viz ? Viz.loop : (function () {
    const m = new Map(); let id = 0;
    const loop = now => { m.forEach((fn, k) => { if (fn(now) === false && m.get(k) === fn) m.delete(k); }); id = m.size ? requestAnimationFrame(loop) : 0; };
    return { run(k, fn) { m.set(k, fn); if (!id) id = requestAnimationFrame(loop); }, stop(k) { m.delete(k); }, has: k => m.has(k) };
  })();
  const mine = new Set();          // this script's own tasks, so reduced motion can stop them
  function run(key, fn) { mine.add(key); tasks.run(key, fn); }
  function stop(key) { mine.delete(key); tasks.stop(key); }

  // Counts the numbers in an element's text from what's on screen to `to`.
  // `kind` names the sentence shape; a new shape (or reduced motion) just sets the text.
  function tween(el, kind, to, render, dur) {
    if (!el) return;
    const from = el._hpv;
    const set = v => { const s = render(v); if (el._hps !== s) { el.textContent = s; el._hps = s; } };
    const same = from && from.length === to.length && from.every((v, i) => v === to[i]);
    if (reduce || same || !from || el._hpk !== kind || from.length !== to.length || !from.every(Number.isFinite) || !to.every(Number.isFinite)) {
      stop(el); el._hpv = to.slice(); el._hpk = kind; set(to); return;
    }
    const a = from.slice(), t0 = performance.now(), d = dur || 450;
    run(el, now => {
      const k = Math.min(1, (now - t0) / d), e = ease(k);
      el._hpv = k < 1 ? a.map((v, i) => v + (to[i] - v) * e) : to.slice();
      set(el._hpv);
      return k < 1;
    });
  }
  function untween(el) { if (!el) return; stop(el); el._hpv = el._hpk = el._hps = null; }
  const ageText = v => String(Math.round(v[0]));

  // ── The maths ───────────────────────────────────────────
  function plan(inp) {
    try { return E.freedomPlan(inp); } catch (e) { return null; }
  }
  function range(inp, opts) {
    try { return E.freedomRange(inp, opts); } catch (e) { return null; }
  }
  const CHIPS = {
    // Spending less works twice: a smaller freedom number (25× spending) and the money
    // not spent goes into savings each month.
    week100: { label: '+$100 a week', tweak: i => Object.assign({}, i, { monthlySavings: i.monthlySavings + 100 * 52 / 12 }) },
    spend10: { label: 'Spending 10% less', tweak: i => Object.assign({}, i, { target: i.target * 0.9, monthlySavings: i.monthlySavings + i.target / 25 * 0.1 / 12 }) },
    both:    { label: '+$100 a week and spending 10% less', tweak: i => Object.assign({}, i, { target: i.target * 0.9, monthlySavings: i.monthlySavings + 100 * 52 / 12 + i.target / 25 * 0.1 / 12 }) },
  };

  // One scenario: everything the result, path and text need. status: invalid | free | far | ok
  function scenario(inp, withRange) {
    const p = plan(inp);
    if (!p || !p.valid) return { status: 'invalid', inputs: inp };
    if (p.alreadyFree) return { status: 'free', plan: p, inputs: inp };
    if (!p.reachable || p.freedomAge == null || p.freedomAgeExact > 100) return { status: 'far', plan: p, inputs: inp };
    const s = { status: 'ok', plan: p, inputs: inp, lo: null, hi: null };
    if (withRange) {
      const r = range(inp);
      if (r && r.early != null) {
        s.range = r;
        s.lo = inp.age + r.early / 12;
        // No late figure = some outcomes take longer than the 50 years simulated, so the band runs on past the date.
        s.hi = r.late == null ? Math.min(100, Math.max(inp.age + 50, p.freedomAgeExact + 2)) : inp.age + r.late / 12;
        s.capAge = Math.round(inp.age + 50);
        s.hiOpen = r.late == null;
        s.mid = r.likely == null ? null : inp.age + r.likely / 12;
      }
    }
    return s;
  }

  let base = null;
  const whenText = v => `in ${Math.round(v[0])} · ${span(v[1], true)} from now`;

  // ── The result ──────────────────────────────────────────
  const ageOut = () => $('hpAgeOut');
  const when = $('hpWhen');

  // ── Wiring ──────────────────────────────────────────────
  const big = $('hpBig'), rangeOut = $('hpRange');
  const whatIf = $('hpWhatIf'), preview = $('hpPreview');
  const chips = Array.from(root.querySelectorAll('.hp-chip'));
  let chipScen = {}, active = null, edited = false;

  function inputsNow() {
    const v = {}; Object.keys(ids).forEach(k => { v[k] = read(k); });
    return v;
  }

  function invalidMessage(v) {
    if (!Number.isFinite(v.age) || v.age < 15 || v.age > 100) return ['age', 'Add your age (15 to 100) to see your date.'];
    const bad = ['savings', 'super', 'monthly'].find(k => !Number.isFinite(v[k]) || v[k] < 0);
    if (bad) return [bad, 'That amount doesn’t look like a number. Try 25000 or 25k.'];
    if (!Number.isFinite(v.spend) || !(v.spend > 0)) return ['spend', 'Add roughly what you’d spend in a year, like 50000.'];
    return null;
  }

  function setBig(html) { big.innerHTML = html; }

  // The fuse ruler: ages to scale from today out to 75 (or a little past the date), burnt from today to
  // the age work could become optional, with a glowing orb at that point. Display only; CSS moves the orb
  // along when the numbers change, and the first time it comes into view it burns in from today.
  const track = $('hpTrack');
  function setTrack(s) {
    if (!track) return;
    if (!s || s.status !== 'ok') { track.hidden = true; return; }
    const from = Math.round(s.inputs.age), to = Math.round(s.plan.freedomAge), end = Math.max(75, to + 4);
    const at = a => clamp((a - from) / Math.max(1, end - from), 0, 1).toFixed(4);
    track.style.setProperty('--f', at(to));
    track.style.setProperty('--s', at(SUPER_AGE));
    track.classList.toggle('no-sixty', from >= SUPER_AGE || Math.abs(to - SUPER_AGE) < 5);
    // Labels that would bump into the work-optional one step aside (the fire's label always wins)
    track.classList.toggle('near-start', Number(at(to)) < 0.24);
    track.classList.toggle('near-end', Number(at(to)) > 0.82);
    track.querySelector('.hp-track-from').textContent = from + ' today';
    track.querySelector('.hp-track-to').textContent = to + ' work optional';
    track.querySelector('.hp-track-end').textContent = String(end);
    track.hidden = false;
  }
  if (track) {
    if ('IntersectionObserver' in window && !reduce) {
      const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); setTimeout(() => track.classList.add('is-lit'), 250); } }, { threshold: 0.6 });
      io.observe(track);
    } else track.classList.add('is-lit');
  }

  function showResult(s) {
    root.dataset.status = s.status;
    setTrack(s);
    if (s.status !== 'ok') { untween(when); untween(rangeOut); }
    if (s.status === 'invalid') {
      setBig('Your freedom age <strong class="hp-age is-quiet">–</strong>');
      when.textContent = s.message || 'Fill in your numbers to see your date.';
      rangeOut.textContent = '';
      return;
    }
    if (s.status === 'free') {
      setBig('Work could already be <strong class="hp-age is-word">optional</strong>');
      when.textContent = s.inputs.age < SUPER_AGE && s.inputs.superBalance > 0
        ? 'On these numbers, your savings could carry you to 60, then super takes over.'
        : 'On these numbers, what you have could cover your spending, drawn down slowly.';
      rangeOut.innerHTML = 'The <a href="/withdrawal">Withdrawal planner</a> shows how long it could last.';
      return;
    }
    if (s.status === 'far') {
      setBig('Not within reach <strong class="hp-age is-word">yet</strong>');
      when.textContent = 'On these numbers, work doesn’t become optional within a lifetime. Saving a little each month starts the path. The options below show what helps.';
      rangeOut.textContent = '';
      return;
    }
    const p = s.plan;
    if (!ageOut()) setBig('Work could become optional at <strong class="hp-age num" id="hpAgeOut"></strong>');
    tween(ageOut(), 'age', [p.freedomAge], ageText);
    tween(when, 'when', [p.freedomYear, p.months], whenText);
    setRange(s);
  }
  function setRange(s) {
    if (s.lo == null) { untween(rangeOut); rangeOut.textContent = ''; }
    else if (s.hiOpen) tween(rangeOut, 'open', [s.lo], v => `Across 2,000 possible market outcomes, most likely from ${Math.round(v[0])}, and in some later than ${s.capAge}.`);
    else tween(rangeOut, 'range', [s.lo, s.hi], v => `Likely between ${Math.round(v[0])} and ${Math.round(v[1])}, across 2,000 possible market outcomes.`);
  }

  function chipText(c, s) {
    const strong = c.querySelector('strong');
    if (!base || base.status === 'invalid' || base.status === 'free' || !s) { untween(strong); strong.textContent = '–'; return; }
    if (s.status === 'ok') tween(strong, 'age', [s.plan.freedomAge], ageText);
    else { untween(strong); strong.textContent = s.status === 'free' ? 'now' : 'not yet'; }
  }

  function recompute() {
    const v = inputsNow();
    Object.values(ids).forEach(id => $(id).removeAttribute('aria-invalid'));
    clearPreview();
    const bad = invalidMessage(v);
    let s;
    if (bad) {
      $(ids[bad[0]]).setAttribute('aria-invalid', 'true');
      s = { status: 'invalid', message: bad[1], inputs: { age: Number.isFinite(v.age) && v.age >= 15 && v.age <= 100 ? v.age : 32 } };
    } else {
      const inp = { age: v.age, savings: v.savings, superBalance: v.super, monthlySavings: v.monthly, target: v.spend * 25 };
      s = scenario(inp, true);
    }
    base = s;
    showResult(s);
    updateFreedomNumber(v.spend);
    // Options
    chipScen = {};
    whatIf.hidden = s.status === 'invalid' || s.status === 'free';
    chips.forEach(c => {
      const def = CHIPS[c.dataset.chip];
      chipScen[c.dataset.chip] = s.status === 'invalid' || s.status === 'free' ? null : scenario(def.tweak(s.inputs), false);
      chipText(c, chipScen[c.dataset.chip]);
    });
    story.update(s);
  }

  function clearPreview() {
    if (!active) return;
    active = null;
    chips.forEach(c => c.setAttribute('aria-pressed', 'false'));
    preview.textContent = '';
  }

  function choose(c) {
    const key = c.dataset.chip;
    if (active === key) { clearPreview(); return; }
    const s = chipScen[key];
    if (!s || !base) return;
    active = key;
    chips.forEach(o => o.setAttribute('aria-pressed', String(o === c)));
    // The previewed option, worked out in full, then said in words under the options.
    const full = s.status === 'ok' ? scenario(s.inputs, true) : s;
    const label = CHIPS[key].label;
    let msg;
    if (base.status === 'far') {
      msg = full.status === 'ok' ? `${label}: that would bring it within reach, at ${full.plan.freedomAge} in ${full.plan.freedomYear}.`
        : `${label}: on its own, that wouldn’t bring it within reach yet.`;
    } else if (full.status === 'ok') {
      const d = base.plan.months - full.plan.months;
      msg = d >= 1 ? `${label}: that would bring it forward ${span(d)}, to ${full.plan.freedomAge}.` : `${label}: about the same date on these numbers.`;
    } else if (full.status === 'free') {
      msg = `${label}: that would make work optional now.`;
    } else msg = '';
    preview.textContent = msg + (msg ? ' Tap again to go back.' : '');
  }

  chips.forEach(c => c.addEventListener('click', () => choose(c)));

  // ── Example vs your numbers ─────────────────────────────
  // The label cross-fades (CSS, on .is-yours). The label is aria-live, so the change is read out.
  const whoEx = $('hpWhoEx'), whoYou = $('hpWhoYou'), resetBtn = $('hpReset');
  const exText = whoEx.innerHTML;
  function markEdited(on) {
    if (edited === on) return;
    edited = on;
    root.classList.toggle('is-yours', on);
    whoEx.setAttribute('aria-hidden', String(on));
    if (on) whoYou.textContent = 'Your numbers';
    else { whoYou.textContent = ''; whoEx.innerHTML = exText; }
    resetBtn.hidden = !on;
  }
  resetBtn.addEventListener('click', () => {
    $(ids.age).value = String(example.age);
    ['spend', 'savings', 'super', 'monthly'].forEach(k => { $(ids[k]).value = fmtNum(example[k]); });
    markEdited(false);
    schedule();
    $(ids.age).focus();
  });

  let typeTimer = 0;
  function schedule() { clearTimeout(typeTimer); recompute(); }
  // The range (2,000 outcomes) is the slow part, so typing is debounced a touch.
  function later() { clearTimeout(typeTimer); typeTimer = setTimeout(schedule, 120); }
  $('hpForm').addEventListener('input', () => { markEdited(true); later(); });
  $('hpForm').addEventListener('submit', e => { e.preventDefault(); schedule(); });
  // Tidy money boxes on the way out: "40000" → "40,000".
  ['spend', 'savings', 'super', 'monthly'].forEach(k => {
    $(ids[k]).addEventListener('blur', () => {
      const n = read(k);
      if (Number.isFinite(n) && String($(ids[k]).value).trim() !== '') $(ids[k]).value = fmtNum(n);
    });
  });

  // ── The freedom number line under the result, in step with the spending box ──
  const numEl = document.querySelector('[data-hp-number]'), spendEl = document.querySelector('[data-hp-spend]');
  function updateFreedomNumber(spend, dur) {
    if (!numEl || !spendEl || !Number.isFinite(spend) || !(spend > 0)) return;
    // Rounded to the nearest $1,000 while it counts, exact when it lands.
    tween(numEl, 'money', [spend * 25], v => money(v[0] === spend * 25 ? v[0] : Math.round(v[0] / 1000) * 1000), dur);
    tween(spendEl, 'money', [spend], v => money(v[0] === spend ? v[0] : Math.round(v[0] / 100) * 100), dur);
  }

  // ── Drawing helpers for the story sections ──────────────
  // Widths come from ResizeObserver, so nothing reads layout inside an animation frame.
  function watchWidth(el, cb) {
    let w = el.getBoundingClientRect().width;
    if ('ResizeObserver' in window) new ResizeObserver(entries => {
      const nw = entries[0].contentRect.width;
      if (Math.abs(nw - w) > 0.5) { w = nw; cb(w); }
    }).observe(el);
    return () => w;
  }
  // Runs `cb` once, the first time `el` is well into view (or straight away without IO).
  function onceInView(el, cb, threshold) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { cb(); return; }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { io.disconnect(); cb(); }
    }, { threshold: threshold || 0.3 });
    io.observe(el);
  }

  // ── From here to a freer future: the visitor's journey, to scale by age ──
  // A picture of time, not money. Ages are to scale along the line; the line itself is
  // level on purpose: the engine doesn't return a year-by-year balance, and a rising line
  // would read as one. Every age and figure comes from the plan the hero already worked
  // out (s.plan, FirePathEngine.freedomPlan): freedomAge / freedomYear, the years to 60,
  // superAt60 and outsideAt60 (today's dollars). Nothing financial is worked out here.
  // Wide (640px and up): left to right, milestones above the line, decade ticks below, the
  // years from 60 shaded. Narrow: top to bottom. The stages under it are plain HTML, so the
  // SVG is decorative (aria-hidden) and the caption sums it up for screen readers.
  const story = (function () {
    const fig = $('hpStory'), sv = $('hpStorySvg'), cap = $('hpStoryCap'), stagesEl = $('hpStages');
    if (!fig || !sv) return { update() {} };
    const width = watchWidth(sv, () => render(drawn ? 1 : 0));
    let model = null, drawn = false, h = 0;
    const about = n => money(Math.round(n / 1000) * 1000);

    // Milestones (Today, work optional, 60), the stretches between them, and the stages text.
    function build(s) {
      if (!s || s.status === 'invalid') return { msg: 'Add your numbers in the calculator above and your path draws here.', stages: [] };
      const age = s.inputs.age;
      if (s.status === 'far') return {
        far: true, age, stages: [],
        cap: 'On these numbers, work doesn’t become optional within a lifetime yet. Section 03 below shows what a few changes would do.'
      };
      const p = s.plan, inp = s.inputs;
      const free = s.status === 'free' ? age : p.freedomAgeExact;
      const freeAge = s.status === 'free' ? age : p.freedomAge;
      const sixty = age < SUPER_AGE;
      let bridgeM = sixty && free < SUPER_AGE ? (SUPER_AGE - free) * 12 : 0;
      if (bridgeM < 1) bridgeM = 0;
      const superAt60 = p.superAt60 > 0 ? p.superAt60 : 0;
      const outsideAt60 = p.outsideAt60 > 0 ? p.outsideAt60 : 0;
      // No super to unlock: no bridge to cross and no 60 marker, savings go the whole way.
      const opens = sixty && superAt60 > 0;
      const bridgeShown = opens ? bridgeM : 0;
      const pts = [];
      if (s.status === 'free') pts.push({ age, a: String(age), kind: 'free', t: 'Work could be optional now', sub: 'On these numbers' });
      else {
        pts.push({ age, a: String(age), kind: 'today', t: 'Today',
          sub: inp.savings + inp.superBalance > 0 ? `${about(inp.savings)} saved · ${about(inp.superBalance)} super` : 'Starting from scratch' });
        // A date that rounds to 60 shares its age with the 60 marker: one label, carrying both.
        const at60 = opens && freeAge === SUPER_AGE;
        pts.push({ age: free, a: String(freeAge), kind: 'free', t: 'Work could become optional',
          sub: at60 ? `in ${p.freedomYear} · about ${about(superAt60)} in super` : `in ${p.freedomYear}, on these numbers` });
      }
      if (opens && freeAge !== SUPER_AGE && (bridgeM > 0 || free > SUPER_AGE + 0.1)) pts.push({ age: SUPER_AGE, a: '60', kind: 'sixty', t: 'Super unlocks', sub: `about ${about(superAt60)} in super` });
      pts.sort((a, b) => a.age - b.age || (a.kind === 'today' ? -1 : 1));
      const end = Math.max(SUPER_AGE, free) + 6;
      const segs = [];
      const line = pts.concat([{ age: end, kind: 'end' }]);
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1];
        const afterFree = a.age >= free && a.kind !== 'today';
        segs.push({ a, b, kind: !afterFree ? 'work' : b.kind === 'sixty' ? 'bridge' : 'after' });
      }

      // The stages, in plain words. Same facts as the line, plus why each one matters.
      const stages = [];
      const markets = 'Markets won’t rise in a straight line, so the date could come earlier or later.';
      if (s.status !== 'free') stages.push({ kind: 'work', big: age, when: `${age} to ${freeAge} · ${span(p.months)}`, t: 'Working and saving',
        d: inp.monthlySavings > 0 ? `${money(inp.monthlySavings)} a month going in, with growth on top. ${markets}` : `Nothing new going in, so growth on what you hold does the work. ${markets}` });
      if (bridgeShown > 0) stages.push({ kind: 'bridge', big: freeAge, when: freeAge === SUPER_AGE ? `The last ${span(bridgeM)} before 60` : `${freeAge} to 60 · ${span(bridgeM)}`, t: 'Savings carry you',
        d: 'Super stays locked until 60, so money outside super pays the way.' + (outsideAt60 ? ` On these numbers about ${about(outsideAt60)} could still be invested when you get there.` : '') });
      if (!sixty) stages.push({ kind: 'after', big: freeAge, when: `From ${freeAge}`, t: 'Savings and super together',
        d: 'You can usually already get to your super, so savings and super could share the load from the day you stop.' });
      else if (!superAt60) stages.push({ kind: 'after', big: freeAge, when: `From ${freeAge}`, t: 'Savings carry the whole way',
        d: 'No super entered above, so on these numbers your savings pay the way from the day you stop.' });
      else if (bridgeM > 0) stages.push({ kind: 'after', big: SUPER_AGE, when: 'From 60', t: 'Super joins in',
        d: `Most Australians can get to their super from 60 once they’ve retired. On these numbers it could be about ${about(superAt60)} by then, sharing the load with your savings.` });
      else stages.push({ kind: 'after', big: freeAge, when: `From ${freeAge}`, t: 'Savings and super together',
        d: `By ${freeAge} you can usually get to your super too (about ${about(superAt60)} at 60 on these numbers), so savings and super could share the load from the day you stop.` });

      // The one-sentence summary (also what a screen reader hears for the picture).
      let c;
      if (s.status === 'free') c = sixty
        ? `On these numbers work could already be optional. Your savings would carry you ${span(bridgeM)} to 60, then super takes over.`
        : 'On these numbers work could already be optional, and you can already get to your super.';
      else if (bridgeM > 0) c = `On these numbers work could become optional at ${freeAge}. Your savings carry you ${span(bridgeM)} to 60, then your super takes over.`;
      else if (sixty) c = `On these numbers your date, ${freeAge}, falls after 60. So there’s no bridge to cross: you could get to your super by then, and savings and super work together from the day you stop.`;
      else c = `On these numbers work could become optional at ${freeAge}. You can already get to your super, so savings and super work together from the day you stop.`;
      return { pts, segs, start: age, end, sixty: opens, cap: c, stages };
    }

    function renderStages() {
      if (!stagesEl) return;
      const st = model.stages || [];
      stagesEl.style.setProperty('--n', String(Math.max(1, st.length)));
      stagesEl.innerHTML = st.map(x => `<li class="hp-stage is-${x.kind}"><p class="hp-stage-age num" aria-hidden="true">${esc(String(x.big))}</p><p class="hp-stage-when num">${esc(x.when)}</p><h3 class="hp-stage-t">${esc(x.t)}</h3><p class="hp-stage-d">${esc(x.d)}</p></li>`).join('');
    }

    // ── Wide: left to right ──
    // Each milestone is a label block (age in the display face, a title, one short line)
    // on a hairline above its marker. Blocks sit on the top tier unless that would collide
    // with one already placed, then on the second tier. Most important placed first.
    const AGE_FS = 30, T_FS = 13.5, SUB_FS = 12.5, BLOCK_H = 66, TIER_GAP = 12;
    function blockW(pt) { return Math.max(textW(pt.a, AGE_FS) * 1.05, textW(pt.t, T_FS) * 1.04, pt.sub ? textW(pt.sub, SUB_FS) : 0); }
    function renderWide(W, p) {
      const padL = 8, padR = 8;
      const x = a => padL + (a - model.start) / Math.max(1, model.end - model.start) * (W - padL - padR);
      const order = ['free', 'today', 'sixty'];
      const placed = [];
      model.pts.slice().sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).forEach(pt => {
        const mx = x(pt.age), w = blockW(pt);
        const right = mx + 10 + w <= W;              // label to the right of its hairline, unless it would run off
        const x0 = right ? mx : mx - 10 - w, x1 = right ? mx + 10 + w : mx;
        let tier = 0;
        while (tier < 2 && placed.some(q => q.tier === tier && x0 < q.x1 + 18 && x1 > q.x0 - 18)) tier++;
        placed.push({ pt, mx, w, right, x0, x1, tier: Math.min(tier, 1) });
      });
      const tiers = placed.some(q => q.tier === 1) ? 2 : 1;
      const Y = tiers * (BLOCK_H + TIER_GAP) + 26;      // the line
      const H = Y + 44;
      if (h !== H) { h = H; sv.setAttribute('height', H); }
      sv.setAttribute('viewBox', `0 0 ${f1(W)} ${H}`);
      const xs = x(model.start), xe = x(model.end), head = xs + (xe - xs) * p;
      const seen = xx => p <= 0 ? 0 : clamp((head - xx) / 40 + 0.2, 0, 1);
      const out = [];
      // The years from 60, shaded: super can usually be drawn from here.
      if (model.sixty) {
        const x6 = x(SUPER_AGE);
        out.push(`<rect class="hp-tl-band" x="${f1(x6)}" y="0" width="${f1(W - x6)}" height="${f1(Y + 18)}"/>`);
      }
      // Decade (or five-year) ticks under the line. An age a milestone already shows is left out.
      const step = (W - padL - padR) / Math.max(1, model.end - model.start) * 5 >= 56 ? 5 : 10;
      for (let a = Math.ceil((model.start + 1) / step) * step; a < model.end; a += step) {
        const tx = x(a);
        out.push(`<line class="hp-tl-tick" x1="${f1(tx)}" x2="${f1(tx)}" y1="${Y + 7}" y2="${Y + 12}"/>`);
        if (!model.pts.some(pt => Math.abs(pt.age - a) < 2)) out.push(`<text class="hp-tl-tick-t" x="${f1(tx)}" y="${Y + 30}" text-anchor="middle">${a}</text>`);
      }
      // The line, drawn left to right on first view.
      model.segs.forEach(sg => {
        const x1 = x(sg.a.age), x2 = Math.min(x(sg.b.age), head);
        if (x2 > x1) out.push(`<line class="hp-tl-seg is-${sg.kind}" x1="${f1(x1)}" x2="${f1(x2)}" y1="${Y}" y2="${Y}"/>`);
      });
      // Milestones: hairline, marker, label block.
      placed.forEach(q => {
        const o = seen(q.mx);
        if (o <= 0) return;
        const pt = q.pt, ty = q.tier === 0 ? 4 : BLOCK_H + TIER_GAP + 4;   // block top
        const tx = q.right ? q.mx + 10 : q.mx - 10, anchor = q.right ? 'start' : 'end';
        const g = [];
        g.push(`<line class="hp-tl-lead" x1="${f1(q.mx)}" x2="${f1(q.mx)}" y1="${ty + 4}" y2="${Y - 12}"/>`);
        if (pt.kind === 'today') g.push(`<circle class="hp-tl-today" cx="${f1(q.mx)}" cy="${Y}" r="6"/>`);
        if (pt.kind === 'free') g.push(`<circle class="hp-tl-halo" cx="${f1(q.mx)}" cy="${Y}" r="13"/><circle class="fpv-free-dot" cx="${f1(q.mx)}" cy="${Y}" r="8"/>`);
        if (pt.kind === 'sixty') g.push(`<line class="hp-tl-sixty" x1="${f1(q.mx)}" x2="${f1(q.mx)}" y1="${Y - 11}" y2="${Y + 11}"/>`);
        g.push(`<text class="hp-tl-age${pt.kind === 'free' ? ' is-free' : ''}" x="${f1(tx)}" y="${ty + 26}" text-anchor="${anchor}" font-size="${AGE_FS}">${esc(pt.a)}</text>`);
        g.push(`<text class="hp-tl-t" x="${f1(tx)}" y="${ty + 45}" text-anchor="${anchor}" font-size="${T_FS}">${esc(pt.t)}</text>`);
        if (pt.sub) g.push(`<text class="hp-tl-sub" x="${f1(tx)}" y="${ty + 62}" text-anchor="${anchor}" font-size="${SUB_FS}">${esc(pt.sub)}</text>`);
        out.push(`<g opacity="${op(o)}">${g.join('')}</g>`);
      });
      sv.innerHTML = out.join('');
    }

    // ── Narrow: top to bottom ──
    // Markers down the left, each with its age, title and one short line; the stretch between
    // them scaled by years (within limits so short stretches still have room for their label).
    function renderNarrow(W, p) {
      const LX = 12, TX = 40;
      let y = 16;
      model.pts[0].y = y;
      model.segs.forEach(sg => {
        const min = sg.a.sub ? 74 : 56;
        y += clamp((sg.b.age - sg.a.age) * 6, min, sg.kind === 'work' ? 170 : 110);
        sg.b.y = y;
      });
      const H = y + 8;
      if (h !== H) { h = H; sv.setAttribute('height', H); }
      sv.setAttribute('viewBox', `0 0 ${f1(W)} ${H}`);
      const y0 = model.pts[0].y, head = y0 + (H - 8 - y0) * p;
      const seen = yy => p <= 0 ? 0 : clamp((head - yy) / 28 + 0.15, 0, 1);
      const out = [];
      const p60 = model.pts.find(pt => pt.kind === 'sixty');
      if (model.sixty && p60) out.push(`<rect class="hp-tl-band" x="0" y="${f1(p60.y - 14)}" width="${f1(W)}" height="${f1(H - p60.y + 14)}" rx="6"/>`);
      model.segs.forEach(sg => {
        const y1 = sg.a.y, y2 = Math.min(sg.b.y, head);
        if (y2 > y1) out.push(`<line class="hp-tl-seg is-${sg.kind}" x1="${LX}" x2="${LX}" y1="${f1(y1)}" y2="${f1(y2)}"/>`);
      });
      model.pts.forEach(pt => {
        const o = seen(pt.y);
        if (o <= 0) return;
        const g = [];
        if (pt.kind === 'today') g.push(`<circle class="hp-tl-today" cx="${LX}" cy="${f1(pt.y)}" r="6"/>`);
        if (pt.kind === 'free') g.push(`<circle class="hp-tl-halo" cx="${LX}" cy="${f1(pt.y)}" r="12"/><circle class="fpv-free-dot" cx="${LX}" cy="${f1(pt.y)}" r="7.5"/>`);
        if (pt.kind === 'sixty') g.push(`<line class="hp-tl-sixty" x1="${LX - 10}" x2="${LX + 10}" y1="${f1(pt.y)}" y2="${f1(pt.y)}"/>`);
        g.push(`<text class="hp-tl-t" x="${TX}" y="${f1(pt.y + 7)}" font-size="15"><tspan class="hp-tl-age${pt.kind === 'free' ? ' is-free' : ''}" font-size="24">${esc(pt.a)}</tspan><tspan dx="10">${esc(pt.t)}</tspan></text>`);
        if (pt.sub) g.push(`<text class="hp-tl-sub" x="${TX}" y="${f1(pt.y + 27)}" font-size="13">${esc(pt.sub)}</text>`);
        out.push(`<g opacity="${op(o)}">${g.join('')}</g>`);
      });
      sv.innerHTML = out.join('');
    }

    function render(p) {
      if (!model) return;
      const W = Math.max(260, width());
      if (model.msg || model.far) {
        const H = 110;
        if (h !== H) { h = H; sv.setAttribute('height', H); }
        sv.setAttribute('viewBox', `0 0 ${f1(W)} ${H}`);
        const out = [`<line class="hp-tl-seg is-${model.far ? 'far' : 'after'}" x1="8" x2="${f1(W - 8)}" y1="40" y2="40"/>`];
        if (model.far) out.push(`<circle class="hp-tl-today" cx="8" cy="40" r="6"/><text class="hp-tl-t" x="8" y="76" font-size="14">Today · ${esc(model.age)}. Not within reach on these numbers yet.</text>`);
        else out.push(`<text class="hp-tl-sub" x="8" y="76" font-size="14">${esc(model.msg)}</text>`);
        sv.innerHTML = out.join('');
        return;
      }
      if (W >= 640) renderWide(W, p); else renderNarrow(W, p);
    }

    onceInView(fig, () => {
      if (reduce || !model) { drawn = true; render(1); return; }
      const t0 = performance.now(), D = 1200;
      run('story', now => {
        const k = Math.min(1, (now - t0) / D);
        render(easeInOut(k));
        if (k >= 1) { drawn = true; return false; }
        return true;
      });
      // If frames stall (a throttled or hidden tab), show the finished picture anyway.
      setTimeout(() => { if (!drawn) { stop('story'); drawn = true; render(1); } }, D + 400);
    }, 0.35);

    return {
      update(s) {
        model = build(s);
        if (cap) cap.textContent = model.cap || model.msg || '';
        renderStages();
        if (reduce) drawn = true;
        if (drawn) render(1);
        else if (!tasks.has('story')) render(0);      // keeps its height until it draws in
      }
    };
  })();

  // ── The hero: Australia's coastline burning like a lit fuse behind the headline ──
  // The spark burns quickly to 70% on arrival, then keeps creeping on its own (to 90% at most);
  // on wide screens with motion allowed the stage pins for about one extra screen and scrolling
  // burns it the rest of the way round. A fuse can't un-burn, so it only ever moves forward. When it
  // reaches Darwin the outline closes, the spark goes out and the coast glows once (CSS). Phones:
  // it burns all the way round by itself. Reduced motion / no JS: the finished map, no sparks.
  // The animation runs only while it's burning and on screen; it stops for good once complete.
  (function () {
    const scene = $('hpScene'), wrap = scene && scene.querySelector('.hp-outline');
    const line = $('hpOutline'), spark = $('hpOutlineTip'), bitsG = $('hpFuseBits');
    if (!scene || !wrap || !line || !window.matchMedia) return;
    const fits = window.matchMedia('(min-width: 900px) and (min-height: 640px) and (prefers-reduced-motion: no-preference)');
    const L = line.getTotalLength ? line.getTotalLength() : 0;
    const NS = 'http://www.w3.org/2000/svg';
    let od = 0, p = 0, t0 = performance.now(), done = false, visible = true, looping = false;
    const bits = [];
    function set(burning) {
      wrap.style.setProperty('--od', od.toFixed(4));
      wrap.style.setProperty('--burning', burning ? '1' : '0');
      if (L && spark) { const q = line.getPointAtLength(L * Math.min(od, 0.9999)); spark.setAttribute('transform', `translate(${q.x.toFixed(2)} ${q.y.toFixed(2)})`); return q; }
      return null;
    }
    function finish() {
      done = true; od = 1; set(false);
      bits.splice(0).forEach(b => b.el.remove());
      if (!reduce) wrap.classList.add('is-complete');
    }
    if (reduce || !L) { finish(); }
    // Where the fuse should have reached by now, from time and (on wide screens) scroll.
    function target(now) {
      const t = (now - t0) / 1000, live = scene.classList.contains('is-live');
      if (!live) return t < 7 ? 0.5 - 0.5 * Math.cos(Math.PI * t / 7) : 1;    // phones: all the way round in 7 s
      const intro = 0.7 * ease(Math.min(1, t / 2.8));
      const crawl = t > 2.8 ? Math.min(0.9, 0.7 + (t - 2.8) * 0.002) : 0;
      return Math.max(intro, crawl, p > 0 ? 0.7 + Math.min(1, p / 0.3) * 0.3 : 0);   // closes in the first stretch, before the zoom
    }
    let last = 0;
    function frame(now) {
      if (done) return false;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60; last = now;
      // Always burn towards where it should be, never jump: at most half the coast a second, faster once
      // the zoom has started so it's always closed before the calculator arrives.
      od = Math.min(1, od + clamp(target(now) - od, 0, (p > 0.25 ? 1.5 : 0.5) * dt));
      if (od >= 0.999) { finish(); return false; }
      const q = set(true);
      // A few sparks thrown off the spark: short-lived, drifting and fading.
      if (q && bits.length < 9 && Math.random() < 0.55) {
        const el = document.createElementNS(NS, 'circle');
        el.setAttribute('r', (0.35 + Math.random() * 0.45).toFixed(2));
        bitsG.appendChild(el);
        const ang = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 7;
        bits.push({ el, x: q.x, y: q.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 2, life: 0, max: 0.35 + Math.random() * 0.35 });
      }
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i]; b.life += 1 / 60; b.vy += 9 / 60;
        b.x += b.vx / 60; b.y += b.vy / 60;
        const k = b.life / b.max;
        if (k >= 1) { b.el.remove(); bits.splice(i, 1); continue; }
        b.el.setAttribute('cx', b.x.toFixed(2)); b.el.setAttribute('cy', b.y.toFixed(2)); b.el.setAttribute('opacity', (1 - k).toFixed(2));
      }
      return visible && !document.hidden;
    }
    function burn() { if (!done && !looping && visible) { looping = true; last = 0; run('fuse', now => { const go = frame(now); if (!go) looping = false; return go; }); } }
    let ticking = false;
    function onScroll() {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        if (!scene.classList.contains('is-live')) return;
        const r = scene.getBoundingClientRect(), span = scene.offsetHeight - window.innerHeight;
        p = clamp(span > 0 ? -r.top / span : 1, 0, 1);
        scene.style.setProperty('--p', p.toFixed(3));
        // The push-in: still while the fuse closes, then easing in to 1.9x while the map slides to the
        // centre of the screen, so the coast ends up framing the calculator.
        const k = clamp((p - 0.25) / 0.75, 0, 1), e = k * k * (3 - 2 * k);
        const svg = line.ownerSVGElement, W = wrap.clientWidth, sw = svg.clientWidth;
        const left = W - sw - (parseFloat(getComputedStyle(svg).right) || 0);
        scene.style.setProperty('--z', (1 + 0.9 * e).toFixed(3));
        scene.style.setProperty('--dx', ((W / 2 - (left + sw / 2)) * e).toFixed(1) + 'px');
        burn();
      });
    }
    function apply() {
      scene.classList.toggle('is-live', fits.matches);
      if (fits.matches) window.addEventListener('scroll', onScroll, { passive: true });
      else { window.removeEventListener('scroll', onScroll); scene.style.removeProperty('--p'); scene.style.removeProperty('--z'); scene.style.removeProperty('--dx'); p = 0; }
      onScroll(); burn();
    }
    if ('IntersectionObserver' in window) new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible) burn(); }).observe(scene);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) burn(); });
    if (fits.addEventListener) fits.addEventListener('change', apply); else if (fits.addListener) fits.addListener(apply);
    if (!done) { set(false); apply(); }
    // If frames never come (a throttled tab), show the finished map rather than a blank cord.
    setTimeout(() => { if (!done && od < 0.05) finish(); }, 4000);
  })();

  // ── Start where you are: the sideways deck ──
  // Wide screens with motion allowed (and scroll-driven animation): pin the section and let scrolling
  // slide the row across (CSS does the sliding; this measures how far). Otherwise it stays a swipe row.
  (function () {
    const deck = $('hpDeck'), track = $('hpDeckTrack');
    if (!deck || !track || !window.matchMedia || !(window.CSS && CSS.supports && CSS.supports('animation-timeline: view()'))) return;
    const fits = window.matchMedia('(min-width: 900px) and (min-height: 600px) and (prefers-reduced-motion: no-preference)');
    const view = track.parentElement;
    function measure() {
      if (!fits.matches) { deck.classList.remove('is-pinned'); deck.style.removeProperty('--deck-d'); return; }
      deck.classList.add('is-pinned');
      const pad = parseFloat(getComputedStyle(view).paddingRight) || 0;
      const d = Math.max(0, track.scrollWidth + pad * 2 - view.clientWidth);
      deck.style.setProperty('--deck-d', Math.round(d) + 'px');
    }
    measure();
    let t = 0;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(measure, 150); });
    if (fits.addEventListener) fits.addEventListener('change', measure);
    // Keyboard: tabbing to a card that's slid off to the side scrolls the page until it's in view.
    track.addEventListener('focusin', e => {
      if (!deck.classList.contains('is-pinned')) return;
      const item = e.target.closest('.hp-deck-item'); if (!item) return;
      const d = parseFloat(deck.style.getPropertyValue('--deck-d')) || 0;
      const x = clamp(item.offsetLeft - track.firstElementChild.offsetLeft, 0, d);
      window.scrollTo({ top: deck.getBoundingClientRect().top + window.scrollY + x, behavior: 'auto' });
    });
  })();

  // ── "Find my path" in the hero: to the calculator, cursor in the first box ──
  const find = $('hpFind');
  if (find) find.addEventListener('click', e => {
    e.preventDefault();
    root.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => { const a = $(ids.age); a.focus({ preventScroll: true }); a.select(); }, reduce ? 0 : 450);
  });

  // ── Reduced motion ──────────────────────────────────────
  // Switching it on mid-visit lands everything on its final state. (The path renderer
  // pauses its own idle motion off screen, in hidden tabs and under reduced motion.)
  if (mq) {
    const onMotion = () => {
      reduce = mq.matches;
      if (reduce) { Array.from(mine).forEach(stop); recompute(); }
    };
    if (mq.addEventListener) mq.addEventListener('change', onMotion); else if (mq.addListener) mq.addListener(onMotion);
  }

  if (!E || !E.freedomPlan) {
    setBig('The calculator didn’t load.');
    when.textContent = 'Try refreshing the page, or use the full calculator.';
    return;
  }
  recompute();
})();
