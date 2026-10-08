/* FirePath homepage: the live freedom path.
 *
 * Reads the five hero inputs, works out the freedom age with the shared engine
 * (FirePathEngine.freedomPlan, the "bridge to 60" rule) and its likely range
 * (freedomRange, 2,000 possible market outcomes), then:
 *   - counts the headline age and year to the new values,
 *   - glides the SVG path (today → freedom → 60) to its new shape,
 *   - works out three what-if options, which preview on the path when tapped.
 * Needs tax-engine.js, calculations.js and financial-engine.js loaded first.
 * Runs in the browser only; nothing typed here is sent anywhere.
 */
(function () {
  'use strict';
  const root = document.getElementById('hpCalc');
  if (!root) return;
  const $ = id => document.getElementById(id);
  const E = window.FirePathEngine;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SUPER_AGE = 60;
  let example;
  try { example = JSON.parse(root.dataset.example); } catch (e) { example = { age: 32, savings: 60000, super: 50000, monthly: 2500, spend: 50000 }; }

  const ids = { age: 'hpAge', spend: 'hpSpend', savings: 'hpSavings', super: 'hpSuper', monthly: 'hpMonthly' };
  const fmtNum = n => Math.round(n).toLocaleString('en-AU');
  const money = n => '$' + fmtNum(n);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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

  // ── The maths ───────────────────────────────────────────
  function plan(inp) {
    try { return E.freedomPlan(inp); } catch (e) { return null; }
  }
  function range(inp) {
    try { return E.freedomRange(inp); } catch (e) { return null; }
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
      }
    }
    return s;
  }

  // ── The SVG path ────────────────────────────────────────
  // Drawn from a small set of numbers (start, end, freedom, range, ghost) so a change is
  // a tween of those numbers, redrawn each frame.
  const svg = $('hpSvg');
  let shown = null;          // what's on screen now
  let target = null;         // what we're gliding to
  let shape = null;          // non-numeric bits of the current picture (status, labels)
  let raf = 0;

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
    if (!shown || reduce) { shown = Object.assign({}, next); target = next; draw(shown); return; }
    const from = Object.assign({}, shown);
    target = next;
    const t0 = performance.now(), dur = 520;
    cancelAnimationFrame(raf);
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      KEYS.forEach(key => {
        const a = from[key], b = next[key];
        shown[key] = Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * e : b;
      });
      // A band that's appearing grows out of the freedom marker.
      if (!Number.isFinite(from.lo) && Number.isFinite(next.lo) && Number.isFinite(next.free)) {
        shown.lo = next.free + (next.lo - next.free) * e; shown.hi = next.free + (next.hi - next.free) * e;
      }
      draw(shown);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function textW(str, size) { return str.length * size * 0.56; }

  function draw(g) {
    if (!shape) return;
    const W = Math.max(280, svg.clientWidth || svg.getBoundingClientRect().width || 600);
    const narrow = W < 520;
    const H = 128, Y = 62, padL = 6, padR = 6;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const x = a => padL + (Math.min(Math.max(a, g.start), g.end) - g.start) / Math.max(1, g.end - g.start) * (W - padL - padR);
    const out = [];
    const st = shape.status;
    const x0 = x(g.start), x60 = g.start < SUPER_AGE ? x(SUPER_AGE) : null, xEnd = x(g.end);

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
      svg.innerHTML = out.join('');
      return;
    }

    // Likely range band
    if (st === 'ok' && Number.isFinite(g.lo) && Number.isFinite(g.hi)) {
      const bx = x(g.lo), bw = Math.max(2, x(g.hi) - bx);
      out.push(`<rect class="hp-band" x="${bx}" y="${Y - 10}" width="${bw}" height="20" rx="3"/>`);
    }

    // Segments
    if (st === 'far') {
      out.push(`<line class="hp-seg is-far" x1="${x0}" x2="${xEnd}" y1="${Y}" y2="${Y}"/>`);
    } else {
      const xf = x(g.free);
      if (xf > x0) out.push(`<line class="hp-seg is-work" x1="${x0}" x2="${xf}" y1="${Y}" y2="${Y}"/>`);
      if (x60 != null && xf < x60) out.push(`<line class="hp-seg is-bridge" x1="${xf}" x2="${x60}" y1="${Y}" y2="${Y}"/>`);
      const xa = Math.max(xf, x60 == null ? xf : x60);
      if (xEnd > xa) out.push(`<line class="hp-seg is-after" x1="${xa}" x2="${xEnd}" y1="${Y}" y2="${Y}"/>`);
      // Bridge label, if it fits
      if (x60 != null && xf < x60) {
        const t = 'savings carry you', w = textW(t, 11.5);
        if (x60 - xf > w + 12) out.push(`<text class="hp-lab is-small" x="${(xf + x60) / 2}" y="${Y - 8}" text-anchor="middle">${t}</text>`);
      }
    }

    // Labels below the line: Today on the left, 60 where super unlocks
    const below = [];
    const todayT = `Today · ${shape.age}`;
    below.push({ x: x0, w: textW(todayT, 12), anchor: 'start', t: todayT, cls: 'hp-lab' });
    if (x60 != null) {
      let t = narrow ? '60 · super' : '60 · super unlocks';
      let w = textW(t, 12);
      let lx = Math.min(x60, W - padR - w / 2);
      if (lx - w / 2 < below[0].x + below[0].w + 10) { t = '60'; w = textW(t, 12); lx = x60; }
      if (lx - w / 2 >= below[0].x + below[0].w + 6) below.push({ x: lx, w, anchor: 'middle', t, cls: 'hp-lab' });
    }
    if (x60 != null) out.push(`<line class="hp-sixty" x1="${x60}" x2="${x60}" y1="${Y - 9}" y2="${Y + 9}"/>`);
    out.push(`<circle class="hp-today-dot" cx="${x0}" cy="${Y}" r="4.5"/>`);
    below.forEach(l => out.push(`<text class="${l.cls}" x="${l.x}" y="${Y + 26}" text-anchor="${l.anchor}">${esc(l.t)}</text>`));

    // Ghost marker (where your own numbers put it, while an option is previewed)
    if (Number.isFinite(g.ghost) && st !== 'far') out.push(`<circle class="hp-ghost" cx="${x(g.ghost)}" cy="${Y}" r="7"/>`);

    // Freedom marker and its label
    if (st === 'far') {
      const t = 'Not within reach on these numbers';
      out.push(`<text class="hp-lab is-far" x="${xEnd}" y="${Y - 14}" text-anchor="end">${t}</text>`);
    } else {
      const xf = x(g.free);
      const t = st === 'free' ? 'Work optional now' : `Work optional · ${shape.freeAge}`;
      const w = textW(t, 13);
      const lx = Math.min(Math.max(xf, padL + w / 2), W - padR - w / 2);
      out.push(`<line class="hp-stem" x1="${xf}" x2="${xf}" y1="${Y - 30}" y2="${Y - 8}"/>`);
      out.push(`<circle class="hp-free-dot" cx="${xf}" cy="${Y}" r="7"/>`);
      out.push(`<text class="hp-lab is-free" x="${lx}" y="${Y - 36}" text-anchor="middle">${esc(t)}</text>`);
    }
    svg.innerHTML = out.join('');
  }

  if ('ResizeObserver' in window) new ResizeObserver(() => { if (shown) draw(shown); }).observe(svg);

  // ── The headline number ─────────────────────────────────
  // Counts from the age on screen to the new one over about 400ms.
  let ageShown = null, ageRaf = 0;
  function countAge(to) {
    const el = $('hpAgeOut');
    if (!el) return;
    cancelAnimationFrame(ageRaf);
    if (ageShown == null || reduce || !Number.isFinite(ageShown) || ageShown === to) { ageShown = to; el.textContent = String(to); return; }
    const from = ageShown, t0 = performance.now(), dur = 400;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      ageShown = k < 1 ? from + (to - from) * e : to;
      el.textContent = String(Math.round(ageShown));
      if (k < 1) ageRaf = requestAnimationFrame(step);
    };
    ageRaf = requestAnimationFrame(step);
  }

  // ── Wiring ──────────────────────────────────────────────
  const big = $('hpBig'), when = $('hpWhen'), rangeOut = $('hpRange'), pathText = $('hpPathText');
  const whatIf = $('hpWhatIf'), preview = $('hpPreview');
  const chips = Array.from(root.querySelectorAll('.hp-chip'));
  let base = null, chipScen = {}, active = null, edited = false, speakTimer = 0;

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
    if (s.status === 'invalid') {
      setBig('Your freedom age <strong class="hp-age is-quiet">–</strong>');
      when.textContent = s.message || 'Fill in your numbers to see your date.';
      rangeOut.textContent = '';
      ageShown = null;
      return;
    }
    if (s.status === 'free') {
      setBig('Work could already be <strong class="hp-age is-word">optional</strong>');
      when.textContent = s.inputs.age < SUPER_AGE && s.inputs.superBalance > 0
        ? 'On these numbers, your savings could carry you to 60, then super takes over.'
        : 'On these numbers, what you have could cover your spending, drawn down slowly.';
      rangeOut.innerHTML = 'The <a href="/withdrawal">Withdrawal planner</a> shows how long it could last.';
      ageShown = null;
      return;
    }
    if (s.status === 'far') {
      setBig('Not within reach <strong class="hp-age is-word">yet</strong>');
      when.textContent = 'On these numbers, work doesn’t become optional within a lifetime. Saving a little each month starts the path. The options below show what helps.';
      rangeOut.textContent = '';
      ageShown = null;
      return;
    }
    const p = s.plan;
    if (!big.querySelector('#hpAgeOut')) {
      setBig('Work could become optional at <strong class="hp-age" id="hpAgeOut"></strong>');
      ageShown = null;
    }
    countAge(p.freedomAge);
    when.textContent = `in ${p.freedomYear} · ${span(p.months, true)} from now`;
    rangeOut.textContent = s.lo == null ? ''
      : s.hiOpen ? `Across 2,000 possible market outcomes, most likely from ${Math.round(s.lo)}, and in some later than ${s.capAge}.`
      : `Likely between ${Math.round(s.lo)} and ${Math.round(s.hi)}, across 2,000 possible market outcomes.`;
  }
  function updateFreedomNumber(v) {
    const n = document.querySelector('[data-hp-number]'), s = document.querySelector('[data-hp-spend]');
    if (!n || !s || !Number.isFinite(v.spend) || !(v.spend > 0)) return;
    n.textContent = money(v.spend * 25);
    s.textContent = money(v.spend);
  }

  function chipText(c, s) {
    const strong = c.querySelector('strong');
    if (!base || base.status === 'invalid' || base.status === 'free') { strong.textContent = '–'; return; }
    strong.textContent = s.status === 'ok' ? String(s.plan.freedomAge) : s.status === 'free' ? 'now' : 'not yet';
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
    updateFreedomNumber(v);
    // Options
    chipScen = {};
    whatIf.hidden = s.status === 'invalid' || s.status === 'free';
    chips.forEach(c => {
      const def = CHIPS[c.dataset.chip];
      chipScen[c.dataset.chip] = s.status === 'invalid' || s.status === 'free' ? null : scenario(def.tweak(s.inputs), false);
      chipText(c, chipScen[c.dataset.chip]);
    });
    paint(s, null);
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

  // Example vs your numbers
  const whoTag = $('hpWhoTag'), whoText = $('hpWhoText'), resetBtn = $('hpReset');
  function markEdited(on) {
    edited = on;
    root.classList.toggle('is-yours', on);
    whoTag.textContent = on ? 'Your numbers' : 'Example';
    whoText.hidden = on;
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
  $('hpForm').addEventListener('input', () => {
    if (!edited) markEdited(true);
    clearTimeout(typeTimer);
    typeTimer = setTimeout(schedule, 120);
  });
  $('hpForm').addEventListener('submit', e => { e.preventDefault(); schedule(); });
  // Tidy money boxes on the way out: "40000" → "40,000".
  ['spend', 'savings', 'super', 'monthly'].forEach(k => {
    $(ids[k]).addEventListener('blur', () => {
      const n = read(k);
      if (Number.isFinite(n) && String($(ids[k]).value).trim() !== '') $(ids[k]).value = fmtNum(n);
    });
  });

  if (!E || !E.freedomPlan) {
    setBig('The calculator didn’t load.');
    when.textContent = 'Try refreshing the page, or use the full calculator.';
    return;
  }
  recompute();
})();
