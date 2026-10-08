/* FirePath homepage: the live freedom path, and the story sections that reuse it.
 *
 * Reads the five hero inputs, works out the freedom age with the shared engine
 * (FirePathEngine.freedomPlan, the "bridge to 60" rule) and its likely range
 * (freedomRange, 2,000 possible market outcomes), then:
 *   - draws the hero path (it draws itself in once on load, then glides on every change),
 *   - counts every number on the page to its new value,
 *   - works out the hero's what-if options and section 03's three life scenarios,
 *   - keeps section 01's spending slider and the hero's spending box in step,
 *   - draws the visitor's own path larger in 02, and the spread of outcomes in 04.
 * All motion runs through one requestAnimationFrame loop that stops when nothing is
 * moving. The idle touches (a slow pulse on the freedom marker, a few dots drifting
 * along the bridge) only run while the hero is on screen and the tab is visible.
 * prefers-reduced-motion: no drawing in, no travel, no pulse, no drift. Final states only.
 * Needs tax-engine.js, calculations.js and financial-engine.js loaded first.
 * Runs in the browser only; nothing typed here is sent anywhere.
 */
(function () {
  'use strict';
  const root = document.getElementById('hpCalc');
  if (!root) return;
  const $ = id => document.getElementById(id);
  const E = window.FirePathEngine;
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
  // Every tween and the idle motion is a task here. The loop only asks for a frame while
  // at least one task is running, so a still page costs nothing.
  const tasks = new Map();
  let loopId = 0;
  function run(key, fn) { tasks.set(key, fn); if (!loopId) loopId = requestAnimationFrame(loop); }
  function stop(key) { tasks.delete(key); }
  function loop(now) {
    tasks.forEach((fn, key) => { if (fn(now) === false && tasks.get(key) === fn) tasks.delete(key); });
    loopId = tasks.size ? requestAnimationFrame(loop) : 0;
  }

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

  // ── The hero path (SVG) ─────────────────────────────────
  // Drawn from a small set of numbers (start, end, freedom, range, ghost) so a change is
  // a tween of those numbers, redrawn each frame into #hpMain. #hpFx holds the pulse ring
  // and the drifting dots, which move without redrawing anything else.
  const svg = $('hpSvg'), mainG = $('hpMain'), fxG = $('hpFx');
  const pulse = fxG.querySelector('.hp-pulse'), flows = Array.from(fxG.querySelectorAll('.hp-flow'));
  let svgW = svg.getBoundingClientRect().width || 600;
  let shown = null;          // what's on screen now
  let shape = null;          // non-numeric bits of the current picture (status, labels)
  let fxGeo = null;          // where the marker and bridge are, for the idle motion
  // The load animation: p = how far the line has drawn (0–1), f = fade of everything after it.
  let intro = reduce ? null : { p: 0, f: 0 };
  let introDone = reduce;

  function geometryFor(s, ghostAge) {
    const age = s.inputs.age;
    const g = { start: age, free: NaN, lo: NaN, hi: NaN, ghost: Number.isFinite(ghostAge) ? ghostAge : NaN };
    let far = age + 30;
    if (s.status === 'ok') {
      g.free = s.plan.freedomAgeExact;
      if (s.lo != null) { g.lo = s.lo; g.hi = s.hi; }
      far = Math.max(g.free, Number.isFinite(g.hi) ? g.hi : 0, g.ghost || 0);
    } else if (s.status === 'free') {
      g.free = age;
      far = age;
    }
    g.end = Math.min(Math.max(100, age + 4), Math.max(SUPER_AGE, far, age + 8) + 3);
    return g;
  }

  const KEYS = ['start', 'end', 'free', 'lo', 'hi', 'ghost'];
  function glideTo(next, meta) {
    shape = meta;
    if (intro && shown) endIntro();          // an edit during the load animation ends it
    if (!shown || reduce || !heroOn) { stop('path'); shown = Object.assign({}, next); draw(shown); return; }
    const from = Object.assign({}, shown);
    const t0 = performance.now(), dur = 450;
    run('path', now => {
      const k = Math.min(1, (now - t0) / dur), e = ease(k);
      KEYS.forEach(key => {
        const a = from[key], b = next[key];
        shown[key] = Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * e : b;
      });
      // A band that's appearing grows out of the freedom marker.
      if (!Number.isFinite(from.lo) && Number.isFinite(next.lo) && Number.isFinite(next.free)) {
        shown.lo = next.free + (next.lo - next.free) * e; shown.hi = next.free + (next.hi - next.free) * e;
      }
      draw(shown);
      return k < 1;
    });
  }

  function textW(str, size) { return str.length * size * 0.56; }

  function draw(g) {
    if (!shape) return;
    const W = Math.max(280, svgW);
    const narrow = W < 520;
    const H = 128, Y = 62, padL = 6, padR = 6;
    svg.setAttribute('viewBox', `0 0 ${f1(W)} ${H}`);
    const x = a => f1(padL + (clamp(a, g.start, g.end) - g.start) / Math.max(1, g.end - g.start) * (W - padL - padR));
    const out = [], late = [];          // `late` = things that fade in after the line has drawn
    const st = shape.status;
    const x0 = x(g.start), x60 = g.start < SUPER_AGE ? x(SUPER_AGE) : null, xEnd = x(g.end);
    const ip = intro ? intro.p : 1, fa = intro ? intro.f : 1;
    fxGeo = null;

    // Age ticks
    const stepYears = narrow ? 10 : 5;
    for (let a = Math.ceil((g.start + 1) / stepYears) * stepYears; a <= g.end; a += stepYears) {
      const tx = x(a);
      if (tx - x0 < 18 || xEnd - tx < 10) continue;
      out.push(`<line class="hp-tick" x1="${tx}" x2="${tx}" y1="${Y + 5}" y2="${Y + 9}"/>`);
      out.push(`<text class="hp-tick-t" x="${tx}" y="${H - 6}" text-anchor="middle">${a}</text>`);
    }

    if (st === 'invalid') {
      out.push(`<line class="hp-seg is-after" x1="${x0}" x2="${xEnd}" y1="${Y}" y2="${Y}"/>`);
      out.push(`<text class="hp-lab" x="${x0}" y="${Y - 14}">Add your numbers to see your path</text>`);
      mainG.innerHTML = out.join('');
      idleUpdate();
      return;
    }

    // Likely range band
    if (st === 'ok' && Number.isFinite(g.lo) && Number.isFinite(g.hi)) {
      const bx = x(g.lo), bw = Math.max(2, x(g.hi) - bx);
      if (fa > 0) out.push(`<rect class="hp-band" x="${bx}" y="${Y - 10}" width="${f1(bw)}" height="20" rx="3"${fa < 1 ? ` opacity="${op(fa)}"` : ''}/>`);
    }

    // Segments. The working line draws in first on load; the rest fades in after it.
    let xf = null;
    if (st === 'far') {
      out.push(`<line class="hp-seg is-far" x1="${x0}" x2="${f1(x0 + (xEnd - x0) * ip)}" y1="${Y}" y2="${Y}"/>`);
    } else {
      xf = x(g.free);
      const xHead = f1(x0 + (xf - x0) * ip);
      if (xHead > x0) out.push(`<line class="hp-seg is-work" x1="${x0}" x2="${xHead}" y1="${Y}" y2="${Y}"/>`);
      if (x60 != null && xf < x60) late.push(`<line class="hp-seg is-bridge" x1="${xf}" x2="${x60}" y1="${Y}" y2="${Y}"/>`);
      const xa = Math.max(xf, x60 == null ? xf : x60);
      if (xEnd > xa) late.push(`<line class="hp-seg is-after" x1="${xa}" x2="${xEnd}" y1="${Y}" y2="${Y}"/>`);
      // Bridge label, if it fits
      if (x60 != null && xf < x60) {
        const t = 'savings carry you', w = textW(t, 11.5);
        if (x60 - xf > w + 12) late.push(`<text class="hp-lab is-small" x="${f1((xf + x60) / 2)}" y="${Y - 8}" text-anchor="middle">${t}</text>`);
      }
    }

    // Labels below the line: Today on the left, 60 where super unlocks
    const below = [];
    const todayT = `Today · ${shape.age}`;
    below.push({ x: x0, w: textW(todayT, 12), anchor: 'start', t: todayT });
    if (x60 != null) {
      let t = narrow ? '60 · super' : '60 · super unlocks';
      let w = textW(t, 12);
      let lx = Math.min(x60, W - padR - w / 2);
      if (lx - w / 2 < below[0].x + below[0].w + 10) { t = '60'; w = textW(t, 12); lx = x60; }
      if (lx - w / 2 >= below[0].x + below[0].w + 6) below.push({ x: f1(lx), w, anchor: 'middle', t, late: true });
      late.push(`<line class="hp-sixty" x1="${x60}" x2="${x60}" y1="${Y - 9}" y2="${Y + 9}"/>`);
    }
    out.push(`<circle class="hp-today-dot" cx="${x0}" cy="${Y}" r="4.5"/>`);
    below.forEach(l => (l.late ? late : out).push(`<text class="hp-lab" x="${l.x}" y="${Y + 26}" text-anchor="${l.anchor}">${esc(l.t)}</text>`));

    // Ghost marker (where your own numbers put it, while an option is previewed)
    if (Number.isFinite(g.ghost) && st !== 'far') out.push(`<circle class="hp-ghost" cx="${x(g.ghost)}" cy="${Y}" r="7"/>`);

    // Freedom marker and its label. On load the marker rides the head of the line.
    if (st === 'far') {
      late.push(`<text class="hp-lab is-far" x="${xEnd}" y="${Y - 14}" text-anchor="end">Not within reach on these numbers</text>`);
    } else {
      const xm = f1(x0 + (xf - x0) * ip);
      // The label counts along with the marker as it glides.
      const t = st === 'free' ? 'Work optional now' : `Work optional · ${Math.round(Number.isFinite(g.free) ? g.free : shape.freeAge)}`;
      const w = textW(t, 13);
      const lx = f1(Math.min(Math.max(xf, padL + w / 2), W - padR - w / 2));
      late.push(`<line class="hp-stem" x1="${xf}" x2="${xf}" y1="${Y - 30}" y2="${Y - 8}"/>`);
      late.push(`<text class="hp-lab is-free" x="${lx}" y="${Y - 36}" text-anchor="middle">${esc(t)}</text>`);
      out.push(`<circle class="hp-free-dot" cx="${xm}" cy="${Y}" r="7"/>`);
      fxGeo = { xf, x60: x60 != null && xf < x60 ? x60 : null, Y };
    }
    // The fading group sits under the marker so the marker stays on top.
    const lateHtml = fa <= 0 ? '' : `<g${fa < 1 ? ` opacity="${op(fa)}"` : ''}>${late.join('')}</g>`;
    const marker = out.findIndex(s => s.indexOf('hp-free-dot') > -1);
    if (marker > -1) out.splice(marker, 0, lateHtml); else out.push(lateHtml);
    mainG.innerHTML = out.join('');
    idleUpdate();
  }

  // ── Idle motion: a slow pulse on the marker, savings drifting along the bridge ──
  let heroOn = true;
  function hideFx() {
    pulse.setAttribute('opacity', '0');
    flows.forEach(c => c.setAttribute('opacity', '0'));
  }
  function idleTick(now) {
    const G = fxGeo;
    if (!G) { hideFx(); return true; }
    // Pulse: a faint ring grows out of the marker about every 3.2 seconds.
    const ph = (now % 3200) / 3200;
    if (ph < 0.5) {
      const e = ease(ph / 0.5);
      pulse.setAttribute('cx', G.xf); pulse.setAttribute('cy', G.Y);
      pulse.setAttribute('r', f1(8 + 11 * e));
      pulse.setAttribute('opacity', op((1 - e) * 0.3));
    } else pulse.setAttribute('opacity', '0');
    // Drift: four dots move from the freedom marker towards 60, fading in and out.
    const len = G.x60 == null ? 0 : G.x60 - G.xf;
    flows.forEach((c, i) => {
      if (len < 48) { c.setAttribute('opacity', '0'); return; }
      const pos = (now / 1000 * 14 + i * len / flows.length) % len, t = pos / len;
      c.setAttribute('cx', f1(G.xf + pos)); c.setAttribute('cy', G.Y);
      c.setAttribute('opacity', op(Math.sin(Math.PI * t) * 0.45));
    });
    return true;
  }
  function idleUpdate() {
    const want = !reduce && introDone && heroOn && !document.hidden && !!fxGeo;
    if (want) { if (!tasks.has('idle')) run('idle', idleTick); }
    else if (tasks.has('idle')) { stop('idle'); hideFx(); }
  }

  // ── The load animation ──────────────────────────────────
  // The line draws from Today to the freedom marker (900ms, ease-out) while the marker
  // rides its head and the age counts up; then the bridge, 60 and the range fade in.
  const ageOut = () => $('hpAgeOut');
  const when = $('hpWhen');
  function seedIntro() {
    if (!intro || !base || base.status !== 'ok') return;
    root.classList.add('is-intro');
    const a = ageOut();
    untween(a); untween(when);
    tween(a, 'age', [base.inputs.age], ageText);
    tween(when, 'when', [THIS_YEAR, 0], whenText);
  }
  function playIntro() {
    if (!intro) return;
    if (!base || base.status !== 'ok' || reduce) { endIntro(); return; }
    const D = 900, F = 500, t0 = performance.now();
    tween(ageOut(), 'age', [base.plan.freedomAge], ageText, D);
    tween(when, 'when', [base.plan.freedomYear, base.plan.months], whenText, D);
    let unveiled = false;
    run('path', now => {
      if (!intro) return false;
      const t = now - t0;
      intro.p = ease(Math.min(1, t / D));
      intro.f = t <= D ? 0 : ease(Math.min(1, (t - D) / F));
      if (t > D && !unveiled) { unveiled = true; setRange(base); root.classList.remove('is-intro'); }
      if (t >= D + F) { endIntro(); return false; }
      draw(shown);
      return true;
    });
  }
  // Jumps to the final picture: when the intro ends, or is interrupted by an edit.
  function endIntro() {
    if (!intro) return;
    intro = null; introDone = true;
    root.classList.remove('is-intro');
    if (base) showResult(base);
    if (shown) draw(shown);
    idleUpdate();
  }

  // ── Wiring ──────────────────────────────────────────────
  const big = $('hpBig'), rangeOut = $('hpRange'), pathText = $('hpPathText');
  const whatIf = $('hpWhatIf'), preview = $('hpPreview');
  const chips = Array.from(root.querySelectorAll('.hp-chip'));
  let base = null, chipScen = {}, active = null, edited = false, speakTimer = 0;
  const whenText = v => `in ${Math.round(v[0])} · ${span(v[1], true)} from now`;

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

  function describe(s) {
    const a = s.inputs.age;
    if (s.status === 'free') return `Your path: on these numbers, work could be optional now, at ${a}.${a < SUPER_AGE ? ` Your savings would carry you to 60, when super unlocks.` : ''}`;
    if (s.status === 'far') return `Your path: on these numbers, work doesn’t become optional within a lifetime. Saving more or spending less brings it into view.`;
    const p = s.plan;
    let t = `Your path: today you’re ${a}. Work could become optional at ${p.freedomAge}, in ${p.freedomYear}.`;
    if (p.bridgeYears > 0) t += ` Your savings carry you about ${span(p.bridgeYears * 12)} to 60, then super takes over.`;
    else if (p.superCounted) t += ' Your super joins in from 60.';
    if (s.lo != null) t += s.hiOpen ? ` Likely from about ${Math.round(s.lo)}, and in some market outcomes later than ${s.capAge}.` : ` Likely range: about ${Math.round(s.lo)} to ${Math.round(s.hi)}.`;
    return t;
  }

  function showResult(s) {
    root.dataset.status = s.status;
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
    if (intro) return;            // the load animation counts these in
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
    clearPreview(false);
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
    syncSlider(v.spend);
    // Options
    chipScen = {};
    whatIf.hidden = s.status === 'invalid' || s.status === 'free';
    chips.forEach(c => {
      const def = CHIPS[c.dataset.chip];
      chipScen[c.dataset.chip] = s.status === 'invalid' || s.status === 'free' ? null : scenario(def.tweak(s.inputs), false);
      chipText(c, chipScen[c.dataset.chip]);
    });
    paint(s, null);
    story.update(s);
    scenarios(s);
    futures.update(s);
    clearTimeout(speakTimer);
    speakTimer = setTimeout(() => { pathText.textContent = s.status === 'invalid' ? s.message : describe(s); }, 700);
  }

  function paint(s, ghostAge) {
    glideTo(geometryFor(s, ghostAge), {
      status: s.status, age: s.inputs.age,
      freeAge: s.status === 'ok' ? s.plan.freedomAge : null,
    });
    const bridge = s.status === 'ok' ? s.plan.bridgeYears > 0 : s.status === 'free' && s.inputs.age < SUPER_AGE;
    $('hpLegBridge').hidden = !bridge;
    $('hpLegBand').hidden = !(s.status === 'ok' && s.lo != null);
  }

  function clearPreview(repaint) {
    if (!active) return;
    active = null;
    chips.forEach(c => c.setAttribute('aria-pressed', 'false'));
    preview.textContent = '';
    if (repaint && base) paint(base, null);
  }

  function choose(c) {
    const key = c.dataset.chip;
    if (active === key) { clearPreview(true); return; }
    const s = chipScen[key];
    if (!s || !base) return;
    active = key;
    chips.forEach(o => o.setAttribute('aria-pressed', String(o === c)));
    // The previewed option, with its own range, drawn on the path; your own date stays as a ghost.
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
    paint(full, base.status === 'ok' ? base.plan.freedomAgeExact : null);
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

  // ── 01 Find your number: big figure + spending slider, in step with the hero ──
  const numEl = document.querySelector('[data-hp-number]'), spendEl = document.querySelector('[data-hp-spend]');
  const slider = $('hpSpendSlide');
  let sliding = false;
  function updateFreedomNumber(spend, dur) {
    if (!numEl || !spendEl || !Number.isFinite(spend) || !(spend > 0)) return;
    // Rounded to the nearest $1,000 while it counts, exact when it lands.
    tween(numEl, 'money', [spend * 25], v => money(v[0] === spend * 25 ? v[0] : Math.round(v[0] / 1000) * 1000), dur);
    tween(spendEl, 'money', [spend], v => money(v[0] === spend ? v[0] : Math.round(v[0] / 100) * 100), dur);
  }
  function syncSlider(spend) {
    if (!slider || sliding || !Number.isFinite(spend) || !(spend > 0)) return;
    slider.value = String(clamp(Math.round(spend / 1000) * 1000, 30000, 150000));
    slider.setAttribute('aria-valuetext', `${money(spend)} a year`);
  }
  if (slider) {
    slider.addEventListener('input', () => {
      const v = Number(slider.value);
      sliding = true;
      $(ids.spend).value = fmtNum(v);
      slider.setAttribute('aria-valuetext', `${money(v)} a year`);
      markEdited(true);
      updateFreedomNumber(v, 260);
      later();
    });
    slider.addEventListener('change', () => { sliding = false; });
    slider.addEventListener('blur', () => { sliding = false; });
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

  // ── 02 See your path: the visitor's own path, vertical, annotated ──
  const story = (function () {
    const fig = $('hpStory'), sv = $('hpStorySvg'), cap = $('hpStoryCap');
    if (!fig || !sv) return { update() {} };
    const width = watchWidth(sv, () => render(drawn ? 1 : 0));
    let model = null, drawn = false, h = 0;

    // Points (Today, freedom, 60) and the segments between them, in age order.
    function build(s) {
      if (!s || s.status === 'invalid') return { msg: 'Add your numbers in the calculator above and your path draws here.' };
      const age = s.inputs.age;
      if (s.status === 'far') return {
        far: true, age,
        cap: 'On these numbers, work doesn’t become optional within a lifetime yet. Section 03 below shows what a few changes would do.'
      };
      const free = s.status === 'free' ? age : s.plan.freedomAgeExact;
      const freeAge = s.status === 'free' ? age : s.plan.freedomAge;
      const pts = [], segs = [];
      const sixty = age < SUPER_AGE;
      let bridgeM = sixty && free < SUPER_AGE ? (SUPER_AGE - free) * 12 : 0;
      if (bridgeM < 1) bridgeM = 0;
      if (s.status === 'free') pts.push({ age, kind: 'free', t: `Work optional now · ${age}`, sub: 'On these numbers' });
      else {
        pts.push({ age, kind: 'today', t: `Today · ${age}` });
        pts.push({ age: free, kind: 'free', t: `Work optional · ${freeAge}`, sub: `in ${s.plan.freedomYear}` });
      }
      if (sixty && (bridgeM > 0 || free > SUPER_AGE + 0.1)) pts.push({ age: SUPER_AGE, kind: 'sixty', t: 'Super unlocks at 60' });
      pts.sort((a, b) => a.age - b.age || (a.kind === 'today' ? -1 : 1));
      const end = Math.max(SUPER_AGE, free) + 6;
      pts.push({ age: end, kind: 'end' });
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        let kind, t = '', sub = '';
        const afterFree = a.age >= free && a.kind !== 'today';
        if (!afterFree) { kind = 'work'; t = a.kind === 'today' ? 'Working and saving' : ''; }
        else if (b.kind === 'sixty') { kind = 'bridge'; t = `Your savings carry you ${span(bridgeM)}`; sub = 'Money outside super pays the way'; }
        else if (bridgeM > 0) { kind = 'after'; t = 'From 60 your super takes over'; }
        else { kind = 'after'; t = 'Savings and super together from here'; }
        segs.push({ a, b, kind, t, sub });
      }
      let c;
      if (s.status === 'free') c = sixty
        ? `On these numbers work could already be optional. Your savings would carry you ${span(bridgeM)} to 60, then super takes over.`
        : 'On these numbers work could already be optional, and you can already get to your super.';
      else if (bridgeM > 0) c = `On these numbers work could become optional at ${freeAge}. Your savings carry you ${span(bridgeM)} to 60, then your super takes over.`;
      else if (sixty) c = `On these numbers your date, ${freeAge}, falls after 60. So there’s no bridge to cross: you could get to your super by then, and savings and super work together from the day you stop.`;
      else c = `On these numbers work could become optional at ${freeAge}. You can already get to your super, so savings and super work together from the day you stop.`;
      return { pts, segs, cap: c };
    }

    // y position for every point: years scaled, with room for the labels between.
    function layout(m) {
      const top = 22;
      let y = top;
      m.pts[0].y = y;
      m.segs.forEach(sg => {
        const yrs = sg.b.age - sg.a.age;
        const min = sg.t ? (sg.sub ? 92 : 72) + (sg.a.sub ? 16 : 0) : 52;
        y += clamp(yrs * 8, min, sg.kind === 'work' ? 220 : 140);
        sg.b.y = y;
      });
      return y + 10;
    }

    function render(p) {
      if (!model) return;
      const W = Math.max(260, width());
      const narrow = W < 420;
      const LX = 12, TX = 40, fs = narrow ? 14 : 15.5, fsub = narrow ? 12.5 : 13.5;
      const out = [];
      if (model.msg || model.far) {
        const H = 150;
        if (h !== H) { h = H; sv.setAttribute('height', H); }
        sv.setAttribute('viewBox', `0 0 ${f1(W)} ${H}`);
        const yEnd = f1(20 + (H - 40) * p);
        if (model.far) {
          out.push(`<circle class="hp-today-dot" cx="${LX}" cy="20" r="5"/>`);
          out.push(`<text class="hp-st" x="${TX}" y="25" font-size="${fs}">Today · ${esc(model.age)}</text>`);
          out.push(`<line class="hp-seg is-far" x1="${LX}" x2="${LX}" y1="20" y2="${yEnd}"/>`);
          out.push(`<text class="hp-st is-sub" x="${TX}" y="${H / 2 + 8}" font-size="${fsub}" opacity="${p}">Not within reach on these numbers yet</text>`);
        } else {
          out.push(`<line class="hp-seg is-after" x1="${LX}" x2="${LX}" y1="20" y2="${H - 20}"/>`);
          out.push(`<text class="hp-st is-sub" x="${TX}" y="${H / 2}" font-size="${fsub}">${esc(model.msg)}</text>`);
        }
        sv.innerHTML = out.join('');
        return;
      }
      const H = layout(model);
      if (h !== H) { h = H; sv.setAttribute('height', H); }
      sv.setAttribute('viewBox', `0 0 ${f1(W)} ${H}`);
      const y0 = model.pts[0].y, yN = model.pts[model.pts.length - 1].y;
      const head = y0 + (yN - y0) * p;
      const seen = y => p <= 0 ? 0 : clamp((head - y) / 28 + 0.15, 0, 1);       // fades in as the line reaches it
      const fit = (t, size) => textW(t, size) <= W - TX - 4;
      // Segments
      model.segs.forEach(sg => {
        const y1 = sg.a.y, y2 = Math.min(sg.b.y, head);
        if (y2 > y1) out.push(`<line class="hp-seg is-${sg.kind}" x1="${LX}" x2="${LX}" y1="${f1(y1)}" y2="${f1(y2)}"/>`);
        if (sg.t) {
          const ym = Math.max((sg.a.y + sg.b.y) / 2, sg.a.sub ? sg.a.y + 46 : 0), o = seen(ym);   // clear of the point's own sub-line
          if (o > 0) {
            let t = sg.t;
            if (!fit(t, fs)) t = t.replace('Your savings carry you', 'Savings carry you').replace(' together from here', ' together');
            out.push(`<g opacity="${op(o)}"><text class="hp-st is-seg" x="${TX}" y="${f1(ym + (sg.sub ? -3 : 5))}" font-size="${fs}">${esc(t)}</text>`
              + (sg.sub ? `<text class="hp-st is-sub" x="${TX}" y="${f1(ym + 16)}" font-size="${fsub}">${esc(sg.sub)}</text>` : '') + '</g>');
          }
        }
      });
      // Points
      model.pts.forEach(pt => {
        if (pt.kind === 'end') return;
        const o = seen(pt.y);
        if (o <= 0) return;
        const g = [];
        if (pt.kind === 'today') g.push(`<circle class="hp-today-dot" cx="${LX}" cy="${pt.y}" r="5"/>`);
        if (pt.kind === 'sixty') g.push(`<line class="hp-sixty" x1="${LX - 9}" x2="${LX + 9}" y1="${pt.y}" y2="${pt.y}"/>`);
        if (pt.kind === 'free') g.push(`<circle class="hp-free-dot" cx="${LX}" cy="${pt.y}" r="8"/>`);
        const big = pt.kind === 'free';
        g.push(`<text class="hp-st${big ? ' is-free' : ''}" x="${TX}" y="${f1(pt.y + (pt.sub ? 1 : 5))}" font-size="${big ? fs + 4 : fs}">${esc(pt.t)}</text>`);
        if (pt.sub) g.push(`<text class="hp-st is-sub" x="${TX}" y="${f1(pt.y + 20)}" font-size="${fsub}">${esc(pt.sub)}</text>`);
        out.push(`<g opacity="${op(o)}">${g.join('')}</g>`);
      });
      sv.innerHTML = out.join('');
    }

    onceInView(fig, () => {
      if (reduce || !model) { drawn = true; render(1); return; }
      const t0 = performance.now(), D = 1500;
      run('story', now => {
        const k = Math.min(1, (now - t0) / D);
        render(easeInOut(k));
        if (k >= 1) { drawn = true; return false; }
        return true;
      });
    }, 0.35);

    return {
      update(s) {
        model = build(s);
        if (cap) cap.textContent = model.cap || model.msg || '';
        if (reduce) drawn = true;
        if (drawn) render(1);
        else if (!tasks.has('story')) render(0);      // keeps its height until it draws in
      }
    };
  })();

  // ── 03 Change the variables: three life scenarios on the hero's numbers ──
  const scenEls = Array.from(document.querySelectorAll('.hp-scen'));
  const scenNow = $('hpScenNow'), scenNote = $('hpScenNote');
  const SCEN = {
    windfall: i => plan(Object.assign({}, i, { savings: i.savings + 20000 })),
    spendless: i => i.target - 125000 > 0 ? plan(Object.assign({}, i, { target: i.target - 125000, monthlySavings: i.monthlySavings + 5000 / 12 })) : null,
    // A year off with no saving: nothing goes in for 12 months while what you have keeps
    // growing at the same rates, then the plan carries on from there, a year older.
    yearoff: (i, bp) => {
      if (!bp || !E.monthlyRate) return null;
      const g = (r, n) => Math.pow(1 + E.monthlyRate(r), n);
      const p = plan(Object.assign({}, i, { age: i.age + 1, savings: i.savings * g(bp.outsideReturn, 12), superBalance: i.superBalance * g(E.SUPER_RETURN || bp.superReturn, 12) }));
      if (!p || !p.valid) return p;
      if (p.months == null) return p;
      const months = p.months + 12;
      return Object.assign({}, p, { months, alreadyFree: false, freedomAge: Math.round(i.age + months / 12), freedomAgeExact: i.age + months / 12 });
    },
  };
  function scenarios(s) {
    if (!scenEls.length) return;
    const ok = s.status === 'ok', far = s.status === 'far';
    if (scenNow) scenNow.textContent = ok ? `(your date now: ${s.plan.freedomAge})` : '';
    scenEls.forEach(a => {
      const out = a.querySelector('[data-out]'), delta = a.querySelector('[data-delta]');
      const key = a.dataset.scen;
      if (!ok && !far) { untween(out); out.textContent = '–'; delta.textContent = s.status === 'free' ? 'Work could already be optional' : 'Add your numbers above'; return; }
      const p = SCEN[key](s.inputs, s.plan);
      const about = key === 'yearoff' ? 'about ' : '';
      if (!p || !p.valid || !p.reachable || p.freedomAge == null || p.freedomAgeExact > 100) {
        untween(out); out.textContent = 'not yet'; delta.textContent = far ? 'Still not within reach' : 'Out of reach on these numbers';
        return;
      }
      if (p.alreadyFree) { untween(out); out.textContent = 'now'; delta.textContent = 'Work could be optional now'; return; }
      tween(out, 'scen', [p.freedomAge], v => `age ${Math.round(v[0])}`);
      if (far) { delta.textContent = 'Brings it within reach'; return; }
      const d = s.plan.months - p.months;
      delta.textContent = Math.abs(d) < 1 ? 'About the same date' : `${about}${span(Math.abs(d))} ${d > 0 ? 'sooner' : 'later'}`;
    });
    if (scenNote) scenNote.hidden = !(ok || far);
  }

  // ── 04 Understand why: 100 of the 2,000 possible futures, as dots ──
  // Each dot is one simulated market outcome from the engine's own Monte Carlo
  // (freedomRange run one path at a time, each with its own seed). The band and the
  // middle line come from the full 2,000-outcome run the hero uses.
  const futures = (function () {
    const fig = $('hpFut'), sv = $('hpFutSvg'), cap = $('hpFutCap');
    if (!fig || !sv) return { update() {} };
    const N = 100;
    const width = watchWidth(sv, () => { if (seen) render(false); });
    let s = null, data = null, dirty = true, seen = false, played = false, h = 0;

    function sample() {
      dirty = false;
      data = null;
      if (!s || s.status !== 'ok' || s.lo == null) return;
      const ages = [];
      let beyond = 0;
      for (let k = 0; k < N; k++) {
        const r = range(s.inputs, { paths: 1, seed: 7001 + k });
        if (r && r.early != null) ages.push(s.inputs.age + r.early / 12); else beyond++;
      }
      data = { ages, beyond };
    }

    function render(animate) {
      if (dirty) sample();
      if (!data) {
        h = 0; sv.setAttribute('height', '0'); sv.innerHTML = '';
        cap.textContent = !s || s.status === 'invalid' ? 'Add your numbers in the calculator above to see the spread.'
          : s.status === 'free' ? 'On these numbers work could already be optional, so there’s no spread of dates to show. The Withdrawal planner tests whether your money lasts across 2,000 outcomes.'
          : 'On these numbers work doesn’t become optional within a lifetime yet, so there’s no spread to show.';
        return;
      }
      const W = Math.max(260, width()), narrow = W < 520;
      const all = data.ages.concat([s.lo, s.hi]);
      let a0 = Math.floor(Math.min.apply(null, all)) - 1, a1 = Math.ceil(Math.max.apply(null, all)) + 1;
      const bucket = a1 - a0 > (narrow ? 26 : 40) ? 2 : 1;
      const r = narrow ? 3 : 3.6, step = r * 2 + 1.6, pad = 8;
      const cols = {};
      data.ages.forEach(a => { const b = Math.floor((a - a0) / bucket); (cols[b] = cols[b] || []).push(a); });
      const maxN = Math.max.apply(null, [1].concat(Object.keys(cols).map(k => cols[k].length)));
      const plotH = Math.max(80, maxN * step + 34), base = plotH, H = plotH + 30;
      if (h !== H) { h = H; sv.setAttribute('height', H); }
      sv.setAttribute('viewBox', `0 0 ${f1(W)} ${H}`);
      const x = a => f1(pad + (a - a0) / Math.max(1, a1 - a0) * (W - pad * 2));
      const out = [];
      // Likely band (10th to 90th percentile of all 2,000)
      out.push(`<rect class="hp-band" x="${x(s.lo)}" y="6" width="${f1(Math.max(2, x(s.hi) - x(s.lo)))}" height="${base - 6}" rx="3"/>`);
      // Axis
      out.push(`<line class="hp-axis" x1="${pad}" x2="${f1(W - pad)}" y1="${base}" y2="${base}"/>`);
      const tick = (a1 - a0) > 30 ? 10 : 5;
      for (let a = Math.ceil(a0 / tick) * tick; a <= a1; a += tick) out.push(`<text class="hp-tick-t" x="${x(a)}" y="${base + 18}" text-anchor="middle">${a}</text>`);
      // Dots, stacked by age
      const dots = [];
      Object.keys(cols).forEach(k => {
        const cx = x(a0 + (Number(k) + 0.5) * bucket);
        cols[k].forEach((a, i) => dots.push({ cx, cy: f1(base - r - 3 - i * step), k: Number(k), i }));
      });
      out.push('<g class="hp-dots">' + dots.map(d => `<circle class="hp-mc" cx="${d.cx}" cy="${d.cy}" r="${r}"/>`).join('') + '</g>');
      // Middle outcome
      if (s.mid != null) {
        const mx = x(s.mid), t = `Middle outcome · ${Math.round(s.mid)}`, tw = textW(t, 12.5);
        const lx = clamp(mx, pad + tw / 2, W - pad - tw / 2);
        out.push(`<line class="hp-mid" x1="${mx}" x2="${mx}" y1="22" y2="${base}"/>`);
        out.push(`<text class="hp-lab is-free" x="${f1(lx)}" y="14" text-anchor="middle" font-size="12.5">${esc(t)}</text>`);
      }
      sv.innerHTML = out.join('');
      const few = data.beyond ? ` ${data.beyond} of these 100 take longer than 50 years.` : '';
      cap.textContent = s.hiOpen
        ? `Most likely from ${Math.round(s.lo)}, and in some outcomes later than ${s.capAge}.${few}`
        : `Eight in ten outcomes land between ${Math.round(s.lo)} and ${Math.round(s.hi)}. The shaded band is that likely range.${few}`;
      if (!animate || reduce) return;
      // Dots fall into place, left to right, each column stacking up.
      const els = Array.from(sv.querySelectorAll('.hp-mc'));
      const nCols = Math.max(1, Math.max.apply(null, dots.map(d => d.k)) + 1);
      const t0 = performance.now();
      els.forEach(c => c.setAttribute('opacity', '0'));
      run('fut', now => {
        let busy = false;
        els.forEach((c, j) => {
          const d = dots[j], delay = d.k / nCols * 520 + d.i * 22;
          const k = clamp((now - t0 - delay) / 420, 0, 1), e = ease(k);
          if (k < 1) busy = true;
          c.setAttribute('cy', f1(d.cy - (1 - e) * 26));
          c.setAttribute('opacity', op(e));
        });
        return busy;
      });
    }

    onceInView(fig, () => { seen = true; render(!played); played = true; }, 0.25);

    return {
      update(next) {
        s = next; dirty = true;
        if (seen) render(false);            // after its first showing, changes land instantly
      }
    };
  })();

  // ── 05 and anything else that animates once in view (CSS does the motion) ──
  document.querySelectorAll('[data-hp-once]').forEach(el => onceInView(el, () => el.classList.add('is-in'), 0.4));

  // ── Pausing ─────────────────────────────────────────────
  // The idle motion runs only while the hero is on screen and the tab is visible.
  let firstSight = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      heroOn = entries[entries.length - 1].isIntersecting;
      if (firstSight) {
        firstSight = false;
        // Play the load animation only if the hero is in view when the page opens.
        if (heroOn) playIntro(); else endIntro();
      }
      idleUpdate();
    }).observe(root);
  }
  document.addEventListener('visibilitychange', idleUpdate);
  if (mq) {
    const onMotion = () => {
      reduce = mq.matches;
      if (reduce) { tasks.clear(); endIntro(); hideFx(); recompute(); }   // land everything on its final state
      idleUpdate();
    };
    if (mq.addEventListener) mq.addEventListener('change', onMotion); else if (mq.addListener) mq.addListener(onMotion);
  }
  watchWidthHero();
  function watchWidthHero() {
    if ('ResizeObserver' in window) new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      if (w && Math.abs(w - svgW) > 0.5) { svgW = w; if (shown) draw(shown); }
    }).observe(svg);
  }

  if (!E || !E.freedomPlan) {
    intro = null; introDone = true;
    setBig('The calculator didn’t load.');
    when.textContent = 'Try refreshing the page, or use the full calculator.';
    return;
  }
  recompute();
  if (intro) {
    if (base && base.status === 'ok') { seedIntro(); draw(shown); }
    else endIntro();
    if (!('IntersectionObserver' in window)) playIntro();
  }
})();
