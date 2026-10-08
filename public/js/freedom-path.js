/* FirePath: the freedom path, FirePath's signature picture. One renderer for every page.
 *
 *   const viz = FirePathViz.mount(containerEl, { compact, animateIn, idle, live, legend, watch, onIntro });
 *     animateIn: true = draw in the first time it's seen; 'onload' = only if it's on screen
 *     when the page opens. watch = the element whose visibility starts and pauses motion
 *     (default: the container). onIntro(phase) = 'seed' | 'play' | 'reveal' | 'end'.
 *   viz.update(plan, range, { preview, previewRange, since, far, previewFar, age, message, waiting, pending });
 *   viz.destroy();
 *
 * plan  = a FirePathEngine.freedomPlan() result (its inputs carry the age; or pass opts.age).
 * range = a FirePathEngine.freedomRange() result (months), or null for no band.
 * preview = a second freedomPlan result to show instead, with your own date left as a
 *   dashed ghost marker (the homepage options, the calculator's "Try it" sliders).
 * since = { age, label } draws a faint "where you started" marker, labelled "{label}: {age}".
 * waiting = a short label for a path that has an age but no date yet (no plan): it draws
 *   Today and 60 with the label above the line, instead of "Add your numbers…" (the
 *   calculator's builder, while the questions are still being answered).
 * pending = with waiting: also a soft "?" marker on the line, standing in for the date
 *   without giving it away (its place doesn't depend on any plan). The builder only.
 *
 * It draws Today, the freedom marker (ember), the dotted "savings carry you" bridge to 60,
 * 60 · super, the likely-range band and age ticks, at the real pixel width (ResizeObserver),
 * with fewer ticks and shorter labels when narrow. Motion: a one-off draw-in, a glide on
 * every change, an idle pulse and a few dots drifting along the bridge. All of it runs on
 * one requestAnimationFrame loop (shared by the page through FirePathViz.loop) that only
 * asks for frames while something moves, pauses off screen and in hidden tabs, and is off
 * under prefers-reduced-motion. A plain-text version is kept for screen readers.
 * Styles: public/css/freedom-path.css. No libraries. Nothing here is sent anywhere.
 */
(function () {
  'use strict';
  if (window.FirePathViz) return;

  const SUPER_AGE = 60;
  const NS = 'http://www.w3.org/2000/svg';
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduce = !!(mq && mq.matches);

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = k => 1 - Math.pow(1 - k, 3);                                  // ease-out cubic
  const f1 = n => Math.round(n * 10) / 10;                                    // keeps SVG strings short
  const op = n => clamp(n, 0, 1).toFixed(2);                                   // opacity attribute
  const fin = Number.isFinite;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const textW = (str, size) => String(str).length * size * 0.56;

  // "1 year 4 months", "13 years, 2 months"
  function span(months, comma) {
    months = Math.max(0, Math.round(months));
    const y = Math.floor(months / 12), m = months % 12;
    const ys = y ? `${y} year${y === 1 ? '' : 's'}` : '', ms = m ? `${m} month${m === 1 ? '' : 's'}` : '';
    if (ys && ms) return ys + (comma ? ', ' : ' ') + ms;
    return ys || ms || 'less than a month';
  }

  // ── One animation loop for the whole page ───────────────
  // Every tween and idle touch is a task. A frame is only requested while a task runs,
  // so a still page costs nothing. A task returning false is finished.
  const tasks = new Map();
  let loopId = 0;
  function run(key, fn) { tasks.set(key, fn); if (!loopId) loopId = requestAnimationFrame(loop); }
  function stop(key) { tasks.delete(key); }
  function has(key) { return tasks.has(key); }
  function loop(now) {
    tasks.forEach((fn, key) => { if (fn(now) === false && tasks.get(key) === fn) tasks.delete(key); });
    loopId = tasks.size ? requestAnimationFrame(loop) : 0;
  }

  const instances = new Set();
  document.addEventListener('visibilitychange', () => instances.forEach(i => i.idleUpdate()));
  if (mq) {
    const onMotion = () => { reduce = mq.matches; instances.forEach(i => i.motionChanged()); };
    if (mq.addEventListener) mq.addEventListener('change', onMotion); else if (mq.addListener) mq.addListener(onMotion);
  }

  // A plan (and its range) as what the picture needs. status: invalid | free | far | ok
  function scenario(plan, range, o) {
    o = o || {};
    const age = plan && plan.inputs && fin(plan.inputs.age) ? plan.inputs.age : (fin(o.age) ? o.age : NaN);
    if (!plan || !plan.valid || !fin(age)) return { status: 'invalid', age: fin(age) ? age : (fin(o.age) ? o.age : 30), message: o.message };
    if (plan.alreadyFree) return { status: 'free', plan, age };
    if (o.far || !plan.reachable || plan.freedomAge == null || !fin(plan.freedomAgeExact) || plan.freedomAgeExact > 100) return { status: 'far', plan, age };
    const s = { status: 'ok', plan, age, lo: null, hi: null };
    if (range && fin(range.early)) {
      s.lo = age + range.early / 12;
      // No late figure = some outcomes take longer than the 50 years simulated, so the band runs on past the date.
      s.hiOpen = !fin(range.late);
      s.hi = s.hiOpen ? Math.min(100, Math.max(age + 50, plan.freedomAgeExact + 2)) : age + range.late / 12;
      s.capAge = Math.round(age + 50);
      s.mid = fin(range.likely) ? age + range.likely / 12 : null;
    }
    return s;
  }

  // The text version of the picture.
  function describe(s, since) {
    const a = Math.round(s.age);
    let t;
    if (s.status === 'invalid') return s.message || 'Add your numbers to see your path.';
    if (s.status === 'free') t = `Your path: on these numbers, work could be optional now, at ${a}.${a < SUPER_AGE ? ' Your savings would carry you to 60, when super unlocks.' : ''}`;
    else if (s.status === 'far') t = 'Your path: on these numbers, work doesn’t become optional within a lifetime. Saving more or spending less brings it into view.';
    else {
      const p = s.plan;
      t = `Your path: today you’re ${a}. Work could become optional at ${p.freedomAge}, in ${p.freedomYear}.`;
      if (p.bridgeYears > 0) t += ` Your savings carry you about ${span(p.bridgeYears * 12)} to 60, then super takes over.`;
      else if (p.superCounted) t += ' Your super joins in from 60.';
      if (s.lo != null) t += s.hiOpen ? ` Likely from about ${Math.round(s.lo)}, and in some market outcomes later than ${s.capAge}.` : ` Likely range: about ${Math.round(s.lo)} to ${Math.round(s.hi)}.`;
    }
    if (since) t += ` In ${since.label} it was about ${Math.round(since.age)}.`;
    return t;
  }

  let uid = 0;
  function mount(el, opts) {
    if (!el) return null;
    const o = Object.assign({ compact: false, animateIn: false, idle: true, live: true, speakDelay: 700 }, opts || {});
    const compact = !!o.compact;
    const showLegend = o.legend != null ? !!o.legend : !compact;
    const H = compact ? 116 : 128, Y = compact ? 58 : 62;
    const id = 'fpv' + (++uid);
    const KEY_PATH = {}, KEY_IDLE = {};

    // ── Build ──
    el.classList.add('fpv');
    if (compact) el.classList.add('is-compact');
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'fpv-svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', String(H));
    svg.innerHTML = `<g class="fpv-fx"><circle class="fpv-pulse" r="7" cx="-20" cy="${Y}" opacity="0"/>`
      + `<circle class="fpv-flow" r="2" cx="-20" cy="${Y}" opacity="0"/>`.repeat(4) + '</g><g></g>';
    const fxG = svg.firstChild, mainG = svg.lastChild;
    const pulse = fxG.querySelector('.fpv-pulse'), flows = Array.from(fxG.querySelectorAll('.fpv-flow'));
    el.appendChild(svg);
    let legBridge = null, legBand = null, legend = null;
    if (showLegend) {
      legend = document.createElement('ul');
      legend.className = 'fpv-legend';
      legend.setAttribute('aria-hidden', 'true');
      legend.innerHTML = '<li class="is-work">Working and saving</li><li class="is-bridge">Savings carry you</li><li class="is-band">Likely range</li>';
      legBridge = legend.children[1]; legBand = legend.children[2];
      el.appendChild(legend);
    }
    const sr = document.createElement(el.tagName === 'FIGURE' ? 'figcaption' : 'p');
    sr.className = 'fpv-sr';
    sr.id = id + '-text';
    if (o.live) sr.setAttribute('aria-live', 'polite');
    el.appendChild(sr);
    if (el.tagName === 'FIGURE') el.setAttribute('aria-labelledby', sr.id);

    let svgW = svg.getBoundingClientRect().width || el.getBoundingClientRect().width || 600;
    let shown = null;          // the numbers on screen now
    let shape = null;          // the non-numeric bits (status, labels)
    let fxGeo = null;          // where the marker and bridge are, for the idle motion
    let cur = null;            // the last update
    let intro = o.animateIn && !reduce ? { p: 0, f: 0, playing: false } : null;
    let introDone = !intro;
    let on = true, firstSight = true, speakTimer = 0, spokenOnce = false, dead = false;

    function geometryFor(s, ghost, since) {
      const age = s.age;
      const g = { start: age, free: NaN, lo: NaN, hi: NaN, ghost: fin(ghost) ? ghost : NaN, since: since && since.age > age ? since.age : NaN };
      let far = age + 30;
      if (s.status === 'ok') {
        g.free = s.plan.freedomAgeExact;
        if (s.lo != null) { g.lo = s.lo; g.hi = s.hi; }
        far = Math.max(g.free, fin(g.hi) ? g.hi : 0, g.ghost || 0);
      } else if (s.status === 'free') {
        g.free = age;
        far = Math.max(age, g.ghost || 0);
      }
      if (fin(g.since) && s.status !== 'invalid') far = Math.max(far, Math.min(100, g.since));
      g.end = Math.min(Math.max(100, age + 4), Math.max(SUPER_AGE, far, age + 8) + 3);
      return g;
    }

    const KEYS = ['start', 'end', 'free', 'lo', 'hi', 'ghost', 'since'];
    function glideTo(next) {
      if (!shown || reduce || !on || document.hidden) { stop(KEY_PATH); shown = Object.assign({}, next); draw(shown); return; }
      const from = Object.assign({}, shown);
      const t0 = performance.now(), dur = 450;
      run(KEY_PATH, now => {
        const k = Math.min(1, (now - t0) / dur), e = ease(k);
        KEYS.forEach(key => {
          const a = from[key], b = next[key];
          shown[key] = fin(a) && fin(b) ? a + (b - a) * e : b;
        });
        // A band that's appearing grows out of the freedom marker.
        if (!fin(from.lo) && fin(next.lo) && fin(next.free)) {
          shown.lo = next.free + (next.lo - next.free) * e; shown.hi = next.free + (next.hi - next.free) * e;
        }
        draw(shown);
        return k < 1;
      });
    }

    function draw(g) {
      if (!shape || dead) return;
      const W = Math.max(280, svgW);
      const narrow = W < 520;
      const padL = 6, padR = 6;
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
        out.push(`<line class="fpv-tick" x1="${tx}" x2="${tx}" y1="${Y + 5}" y2="${Y + 9}"/>`);
        out.push(`<text class="fpv-tick-t" x="${tx}" y="${H - 6}" text-anchor="middle">${a}</text>`);
      }

      if (st === 'invalid') {
        out.push(`<line class="fpv-seg is-after" x1="${x0}" x2="${xEnd}" y1="${Y}" y2="${Y}"/>`);
        if (shape.waiting) {
          // Today and 60 are known before the date is.
          const todayT = `Today · ${Math.round(shape.age)}`, tw = textW(todayT, 12);
          out.push(`<circle class="fpv-today-dot" cx="${x0}" cy="${Y}" r="4.5"/>`);
          out.push(`<text class="fpv-lab" x="${x0}" y="${Y + 26}">${esc(todayT)}</text>`);
          if (x60 != null) {
            let t = narrow ? '60 · super' : '60 · super unlocks', w = textW(t, 12);
            let lx = Math.min(x60, W - padR - w / 2);
            if (lx - w / 2 < x0 + tw + 10) { t = '60'; w = textW(t, 12); lx = x60; }
            out.push(`<line class="fpv-sixty" x1="${x60}" x2="${x60}" y1="${Y - 9}" y2="${Y + 9}"/>`);
            if (lx - w / 2 >= x0 + tw + 6) out.push(`<text class="fpv-lab" x="${f1(lx)}" y="${Y + 26}" text-anchor="middle">${esc(t)}</text>`);
          }
          if (shape.pending) {
            // A "?" where the date will land. A fixed spot along the line, clear of 60.
            let xq = x0 + (xEnd - x0) * 0.5;
            if (x60 != null && Math.abs(xq - x60) < 30) xq = x60 - 30 > x0 + 40 ? x60 - 30 : x60 + 30;
            out.push(`<g class="fpv-pending" aria-hidden="true"><circle class="fpv-q-dot" cx="${f1(xq)}" cy="${Y}" r="9"/><text class="fpv-q" x="${f1(xq)}" y="${Y + 4}" text-anchor="middle">?</text></g>`);
          }
          const lw = W - padL - padR, wt = shape.waiting;
          out.push(`<text class="fpv-lab" x="${x0}" y="${Y - 14}">${esc(textW(wt, 12) > lw ? wt.slice(0, Math.max(8, Math.floor(lw / 6.72) - 1)) + '…' : wt)}</text>`);
        } else out.push(`<text class="fpv-lab" x="${x0}" y="${Y - 14}">Add your numbers to see your path</text>`);
        mainG.innerHTML = out.join('');
        idleUpdate();
        return;
      }

      // Likely range band
      if (st === 'ok' && fin(g.lo) && fin(g.hi)) {
        const bx = x(g.lo), bw = Math.max(2, x(g.hi) - bx);
        if (fa > 0) out.push(`<rect class="fpv-band" x="${bx}" y="${Y - 10}" width="${f1(bw)}" height="20" rx="3"${fa < 1 ? ` opacity="${op(fa)}"` : ''}/>`);
      }

      // Where you started (a faint marker; its label goes where it fits)
      let sinceBox = null;
      if (fin(g.since) && shape.sinceLabel) {
        const xs = x(g.since);
        const t = `${shape.sinceLabel}: ${Math.round(g.since)}`, w = textW(t, 11.5);
        const lx = f1(clamp(xs, padL + w / 2, W - padR - w / 2));
        const xfree = st === 'far' ? null : x(g.free);
        // Above the line, unless that would cross the freedom marker's stem; then in the gap
        // between the labels and the age scale (or above everything on the compact path).
        const clash = xfree != null && Math.abs(lx - xfree) < w / 2 + 6;
        const farClash = st === 'far' && lx + w / 2 > xEnd - textW('Not within reach on these numbers', 12) - 8;
        const row = clash || farClash ? (compact ? Y - 52 : Y + 43) : Y - 13;
        late.push(`<circle class="fpv-since" cx="${xs}" cy="${Y}" r="4"/>`);
        late.push(`<text class="fpv-lab is-since" x="${lx}" y="${row}" text-anchor="middle">${esc(t)}</text>`);
        if (row === Y - 13) sinceBox = { a: lx - w / 2 - 6, b: lx + w / 2 + 6 };
      }

      // Segments. The working line draws in first on load; the rest fades in after it.
      let xf = null;
      if (st === 'far') {
        out.push(`<line class="fpv-seg is-far" x1="${x0}" x2="${f1(x0 + (xEnd - x0) * ip)}" y1="${Y}" y2="${Y}"/>`);
      } else {
        xf = x(g.free);
        const xHead = f1(x0 + (xf - x0) * ip);
        if (xHead > x0) out.push(`<line class="fpv-seg is-work" x1="${x0}" x2="${xHead}" y1="${Y}" y2="${Y}"/>`);
        if (x60 != null && xf < x60) late.push(`<line class="fpv-seg is-bridge" x1="${xf}" x2="${x60}" y1="${Y}" y2="${Y}"/>`);
        const xa = Math.max(xf, x60 == null ? xf : x60);
        if (xEnd > xa) late.push(`<line class="fpv-seg is-after" x1="${xa}" x2="${xEnd}" y1="${Y}" y2="${Y}"/>`);
        // Bridge label, if it fits (and isn't where the "since" label sits)
        if (x60 != null && xf < x60) {
          const t = 'savings carry you', w = textW(t, 11.5), mx = (xf + x60) / 2;
          const hitsSince = sinceBox && mx + w / 2 > sinceBox.a && mx - w / 2 < sinceBox.b;
          if (x60 - xf > w + 12 && !hitsSince) late.push(`<text class="fpv-lab is-small" x="${f1(mx)}" y="${Y - 8}" text-anchor="middle">${t}</text>`);
        }
      }

      // Labels below the line: Today on the left, 60 where super unlocks
      const below = [];
      const todayT = `Today · ${Math.round(shape.age)}`;
      below.push({ x: x0, w: textW(todayT, 12), anchor: 'start', t: todayT });
      if (x60 != null) {
        let t = narrow ? '60 · super' : '60 · super unlocks';
        let w = textW(t, 12);
        let lx = Math.min(x60, W - padR - w / 2);
        if (lx - w / 2 < below[0].x + below[0].w + 10) { t = '60'; w = textW(t, 12); lx = x60; }
        if (lx - w / 2 >= below[0].x + below[0].w + 6) below.push({ x: f1(lx), w, anchor: 'middle', t, late: true });
        late.push(`<line class="fpv-sixty" x1="${x60}" x2="${x60}" y1="${Y - 9}" y2="${Y + 9}"/>`);
      }
      out.push(`<circle class="fpv-today-dot" cx="${x0}" cy="${Y}" r="4.5"/>`);
      below.forEach(l => (l.late ? late : out).push(`<text class="fpv-lab" x="${l.x}" y="${Y + 26}" text-anchor="${l.anchor}">${esc(l.t)}</text>`));

      // Ghost marker (your own date, while another option is previewed)
      if (fin(g.ghost) && st !== 'far') out.push(`<circle class="fpv-ghost" cx="${x(g.ghost)}" cy="${Y}" r="7"/>`);

      // Freedom marker and its label. On load the marker rides the head of the line.
      if (st === 'far') {
        late.push(`<text class="fpv-lab is-far" x="${xEnd}" y="${Y - 14}" text-anchor="end">Not within reach on these numbers</text>`);
      } else {
        const xm = f1(x0 + (xf - x0) * ip);
        // The label counts along with the marker as it glides.
        const t = st === 'free' ? 'Work optional now' : `Work optional · ${Math.round(fin(g.free) ? g.free : shape.freeAge)}`;
        const w = textW(t, 13);
        const lx = f1(Math.min(Math.max(xf, padL + w / 2), W - padR - w / 2));
        late.push(`<line class="fpv-stem" x1="${xf}" x2="${xf}" y1="${Y - 30}" y2="${Y - 8}"/>`);
        late.push(`<text class="fpv-lab is-free" x="${lx}" y="${Y - 36}" text-anchor="middle">${esc(t)}</text>`);
        out.push(`<circle class="fpv-free-dot" cx="${xm}" cy="${Y}" r="7"/>`);
        fxGeo = { xf, x60: x60 != null && xf < x60 ? x60 : null, Y };
      }
      // The fading group sits under the marker so the marker stays on top.
      const lateHtml = fa <= 0 ? '' : `<g${fa < 1 ? ` opacity="${op(fa)}"` : ''}>${late.join('')}</g>`;
      const marker = out.findIndex(s => s.indexOf('fpv-free-dot') > -1);
      if (marker > -1) out.splice(marker, 0, lateHtml); else out.push(lateHtml);
      mainG.innerHTML = out.join('');
      idleUpdate();
    }

    // ── Idle motion: a slow pulse on the marker, savings drifting along the bridge ──
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
      const want = !dead && o.idle && !reduce && introDone && on && !document.hidden && !!fxGeo;
      if (want) { if (!has(KEY_IDLE)) run(KEY_IDLE, idleTick); }
      else if (has(KEY_IDLE)) { stop(KEY_IDLE); hideFx(); }
    }

    // ── The load animation ──
    // The line draws from Today to the freedom marker (900ms, ease-out) while the marker
    // rides its head; then the bridge, 60, the range and the legend fade in (500ms).
    const hook = (phase, info) => { if (typeof o.onIntro === 'function') { try { o.onIntro(phase, info); } catch (e) { /* the page's own hook */ } } };
    function playIntro() {
      if (!intro || intro.playing) return;
      if (!cur || cur.disp.status !== 'ok' || reduce || document.hidden) { endIntro(); return; }   // nobody would see it
      intro.playing = true;
      const D = 900, F = 500, t0 = performance.now();
      hook('play', { duration: D });
      let unveiled = false;
      run(KEY_PATH, now => {
        if (!intro) return false;
        const t = now - t0;
        intro.p = ease(Math.min(1, t / D));
        intro.f = t <= D ? 0 : ease(Math.min(1, (t - D) / F));
        if (t > D && !unveiled) { unveiled = true; el.classList.remove('is-intro'); hook('reveal'); }
        if (t >= D + F) { endIntro(); return false; }
        draw(shown);
        return true;
      });
    }
    // Jumps to the final picture: when the intro ends, or is interrupted by a change.
    function endIntro() {
      if (!intro) return;
      intro = null; introDone = true;
      el.classList.remove('is-intro');
      hook('end');
      if (shown) draw(shown);
      idleUpdate();
    }

    function speak(text) {
      clearTimeout(speakTimer);
      // The first text is set straight away; later changes wait for typing to settle.
      if (!spokenOnce || !o.live) { spokenOnce = true; sr.textContent = text; return; }
      speakTimer = setTimeout(() => { sr.textContent = text; }, o.speakDelay);
    }

    function update(plan, range, u) {
      if (dead) return;
      u = u || {};
      const base = scenario(plan, range, u);
      let disp = base, ghost = NaN;
      if (u.preview) {
        disp = scenario(u.preview, u.previewRange || null, { far: u.previewFar, age: base.age });
        if (base.status === 'ok') ghost = base.plan.freedomAgeExact;
        else if (base.status === 'free') ghost = base.age;
      }
      const since = u.since && fin(u.since.age) && u.since.label ? { age: u.since.age, label: String(u.since.label) } : null;
      const first = !cur;
      cur = { base, disp, since };
      if (intro && !first) endIntro();          // a change during the load animation ends it
      shape = { status: disp.status, age: disp.age, freeAge: disp.status === 'ok' ? disp.plan.freedomAge : null, sinceLabel: since && disp.status !== 'invalid' ? since.label : null,
        waiting: disp.status === 'invalid' && u.waiting && fin(disp.age) ? String(u.waiting) : null };
      shape.pending = !!(shape.waiting && u.pending);
      const next = geometryFor(disp, ghost, since);
      if (first && intro) {
        if (disp.status === 'ok') {
          el.classList.add('is-intro');
          hook('seed');
          shown = Object.assign({}, next); draw(shown);
          if (!('IntersectionObserver' in window)) playIntro();
          else if (!firstSight && on) playIntro();
        } else { shown = Object.assign({}, next); endIntro(); draw(shown); }
      } else glideTo(next);
      if (legend) {
        const bridge = disp.status === 'ok' ? disp.plan.bridgeYears > 0 : disp.status === 'free' && disp.age < SUPER_AGE;
        legBridge.hidden = !bridge;
        legBand.hidden = !(disp.status === 'ok' && disp.lo != null);
      }
      speak(describe(base, base.status === 'invalid' ? null : since));
    }

    // ── Watching: on screen, width, motion setting ──
    let io = null, ro = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(entries => {
        on = entries[entries.length - 1].isIntersecting;
        if (firstSight) {
          firstSight = false;
          // 'onload': play only if it's in view when the page opens. true: the first time it's seen.
          if (intro && cur) { if (on) playIntro(); else if (o.animateIn === 'onload') endIntro(); }
        } else if (intro && on && cur) playIntro();
        idleUpdate();
      });
      io.observe(o.watch || el);
    }
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(entries => {
        const w = entries[0].contentRect.width;
        if (w && Math.abs(w - svgW) > 0.5) { svgW = w; if (shown) draw(shown); }
      });
      ro.observe(svg);
    }

    const inst = {
      idleUpdate() { if (document.hidden && intro && intro.playing) endIntro(); idleUpdate(); },
      motionChanged() {
        if (reduce) { stop(KEY_PATH); endIntro(); hideFx(); if (shown && cur) { shown = geometryFor(cur.disp, shown.ghost, cur.since); draw(shown); } }
        idleUpdate();
      }
    };
    instances.add(inst);

    return {
      update,
      destroy() {
        dead = true;
        stop(KEY_PATH); stop(KEY_IDLE); clearTimeout(speakTimer);
        if (io) io.disconnect();
        if (ro) ro.disconnect();
        instances.delete(inst);
        [svg, legend, sr].forEach(n => { if (n && n.parentNode) n.parentNode.removeChild(n); });
        el.classList.remove('fpv', 'is-compact', 'is-intro');
      },
      isIntro: () => !!intro,
      describe: () => sr.textContent,
      el
    };
  }

  window.FirePathViz = { mount, loop: { run, stop, has }, reduced: () => reduce, span, SUPER_AGE };
})();
