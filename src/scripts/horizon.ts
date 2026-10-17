/**
 * The homepage calculator's 3D stage: an ember path across a dark grid floor, running to a glow on the
 * horizon, with gates at today, the work-optional age and 60. Ages are to scale along the path (time,
 * not money: the engine gives a date, not a balance by year, so the scene only shows what the words say).
 *
 * - While the five questions are asked, the path is lit up to today and the far gate shows "?".
 * - On the reveal, the fuse burns along the path to the work-optional gate and the camera follows it.
 * - home-path.js tells it the result (`fp:result`) and the step (`fp:step`) as events on #hpCalc.
 *
 * Three.js is bundled (no outside host) and only loaded when the calculator is near the screen and the
 * browser has WebGL; otherwise #hpCalc gets .no-3d and CSS shows a flat stage. Reduced motion: no camera
 * glide or drifting sparks, just the finished picture. It stops drawing whenever it's off screen.
 */
type Result = { status: string; age: number | null; free: number | null };

export function startHorizon(root: HTMLElement) {
  const wrap = root.querySelector<HTMLElement>('.hp-3d');
  const canvas = wrap?.querySelector('canvas');
  if (!wrap || !canvas) return;
  const hasGL = (() => {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
  })();
  if (!hasGL || !('IntersectionObserver' in window)) { root.classList.add('no-3d'); return; }

  const num = (v: string | undefined) => (v === undefined || v === '' ? null : Number(v));
  let result: Result = { status: root.dataset.status || 'ok', age: num(root.dataset.age), free: num(root.dataset.free) };
  let revealed = root.classList.contains('is-revealed');
  let step = 0;
  let api: { set: (r: Result, revealed: boolean, step: number) => void } | null = null;
  root.addEventListener('fp:result', e => { result = (e as CustomEvent).detail; api?.set(result, revealed, step); });
  root.addEventListener('fp:step', e => { const d = (e as CustomEvent).detail; revealed = d.revealed; step = d.step; api?.set(result, revealed, step); });

  let booted = false;
  const io = new IntersectionObserver(entries => {
    if (booted || !entries.some(en => en.isIntersecting)) return;
    booted = true; io.disconnect();
    import('./three-lite').then(THREE => {
      api = build(THREE, root, wrap, canvas);
      api.set(result, revealed, step);
      root.classList.add('has-3d');
    }).catch(() => root.classList.add('no-3d'));
  }, { rootMargin: '600px 0px' });
  io.observe(root);
}

function build(THREE: typeof import('./three-lite'), root: HTMLElement, wrap: HTMLElement, canvas: HTMLCanvasElement) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EMBER = 0xF4622A, CREAM = 0xFDF6EE, BG = 0x241910;
  let visible = true, raf = 0, last = 0;   // the draw loop (below)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, 12, 62);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);

  // A soft round dot, for sparks and glows
  const dot = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!, gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,236,210,1)'); gr.addColorStop(0.25, 'rgba(255,170,110,0.85)'); gr.addColorStop(0.6, 'rgba(244,98,42,0.25)'); gr.addColorStop(1, 'rgba(244,98,42,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();

  // The floor
  const grid = new THREE.GridHelper(260, 130, 0x7a5640, 0x4a3628);
  const gm = grid.material as import('three').Material; gm.transparent = true; gm.opacity = 0.5;
  scene.add(grid);

  // The path: a gentle S into the distance
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 26; i++) pts.push(new THREE.Vector3(Math.sin(i * 0.42) * 1.9, 0.03, 8 - i * 3));
  const curve = new THREE.CatmullRomCurve3(pts);
  const SEG = 600, RAD = 8;
  const dim = new THREE.Mesh(new THREE.TubeGeometry(curve, SEG, 0.035, RAD, false),
    new THREE.MeshBasicMaterial({ color: CREAM, transparent: true, opacity: 0.22 }));
  scene.add(dim);
  const litGeo = new THREE.TubeGeometry(curve, SEG, 0.075, RAD, false);
  const lit = new THREE.Mesh(litGeo, new THREE.MeshBasicMaterial({ color: EMBER }));
  const glowGeo = new THREE.TubeGeometry(curve, SEG, 0.32, RAD, false);
  const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: EMBER, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(lit, glow);
  const showTo = (t: number) => { const n = Math.round(Math.max(0, Math.min(1, t)) * SEG) * RAD * 6; litGeo.setDrawRange(0, n); glowGeo.setDrawRange(0, n); };

  // The spark at the head of the lit path
  const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  spark.scale.set(1.6, 1.6, 1); scene.add(spark);

  // The horizon: a warm glow where the path runs out
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xffb37a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55, fog: false }));
  sun.scale.set(70, 26, 1); const end = curve.getPointAt(1); sun.position.set(end.x, 4, end.z - 14); scene.add(sun);

  // Labels: the age big, a caption small (Inter Tight, drawn to a canvas)
  function labelTexture(big: string, small: string, color: string) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 300;
    const g = c.getContext('2d')!;
    g.textAlign = 'center'; g.fillStyle = color;
    g.font = `800 190px "Inter Tight", "DM Sans", system-ui, sans-serif`;
    g.shadowColor = color === '#F4622A' ? 'rgba(244,98,42,0.6)' : 'rgba(0,0,0,0)'; g.shadowBlur = 30;
    g.fillText(big, 256, 190);
    g.shadowBlur = 0; g.fillStyle = 'rgba(253,246,238,0.75)';
    g.font = `700 34px "Inter Tight", "DM Sans", system-ui, sans-serif`;
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '6px';
    g.fillText(small.toUpperCase(), 256, 262);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }

  // Gates: two posts and a bar across the path, a label above
  type Gate = { g: THREE.Group; label: THREE.Sprite; t: number; to: number; on: number; onTo: number; key: string };
  function gate(color: number, opacity: number, hot: boolean): Gate {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
    const post = new THREE.BoxGeometry(0.07, 1.9, 0.07), bar = new THREE.BoxGeometry(2.7, 0.07, 0.07);
    const a = new THREE.Mesh(post, m), b = new THREE.Mesh(post, m), c = new THREE.Mesh(bar, m);
    a.position.set(-1.3, 0.95, 0); b.position.set(1.3, 0.95, 0); c.position.set(0, 1.9, 0);
    g.add(a, b, c);
    if (hot) {
      const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
      h.scale.set(6, 4, 1); h.position.set(0, 1.4, 0); g.add(h);
    }
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false }));
    label.scale.set(2.6, 1.52, 1); label.position.set(0, 2.85, 0); g.add(label);
    scene.add(g);
    return { g, label, t: 0, to: 0, on: 0, onTo: 0, key: '' };
  }
  const gToday = gate(CREAM, 0.7, false), gFree = gate(EMBER, 1, true), gSixty = gate(CREAM, 0.38, false);
  function setLabel(gt: Gate, big: string, small: string, color: string) {
    const key = big + '|' + small + '|' + color;
    if (gt.key === key) return;
    gt.key = key;
    const mat = gt.label.material as THREE.SpriteMaterial;
    mat.map?.dispose(); mat.map = labelTexture(big, small, color); mat.needsUpdate = true;
  }
  function placeGate(gt: Gate) {
    const t = Math.max(0.0001, Math.min(0.9999, gt.t));
    const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    gt.g.position.copy(p); gt.g.rotation.y = Math.atan2(tan.x, tan.z);
    const s = Math.max(0.0001, gt.on); gt.g.scale.set(s, s, s); gt.g.visible = gt.on > 0.01;
  }

  // Sparks drifting up off the lit path
  const N = 140, sp = new Float32Array(N * 3), life = new Float32Array(N), speed = new Float32Array(N), at = new Float32Array(N);
  const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ map: dot, size: 0.16, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffc29a }));
  scene.add(sparks);
  function respawn(i: number, upTo: number) {
    at[i] = Math.random() * Math.max(0.02, upTo);
    const p = curve.getPointAt(Math.min(0.9999, at[i]));
    sp[i * 3] = p.x + (Math.random() - 0.5) * 0.6; sp[i * 3 + 1] = Math.random() * 0.4; sp[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.6;
    life[i] = 0; speed[i] = 0.4 + Math.random() * 0.9;
  }

  // State: ages → positions along the path (to scale, today near the start, out to 75 or a bit past the date)
  const T0 = 0.07, T1 = 0.9;
  let litT = T0, litTo = T0, camT = 0, camTo = 0;
  let lastSet = { r: { status: 'ok', age: null, free: null } as Result, revealed: false, step: 0 };
  function set(r: Result, revealed: boolean, step: number) {
    lastSet = { r, revealed, step };
    const age = r.age ?? 32;
    const free = r.status === 'ok' && r.free != null ? r.free : r.status === 'free' ? age : null;
    const endAge = Math.max(75, (free ?? 0) + 6, age + 20);
    const tOf = (a: number) => T0 + (a - age) / (endAge - age) * (T1 - T0);
    gToday.to = T0; gToday.onTo = 1; setLabel(gToday, String(Math.round(age)), 'Today', '#FDF6EE');
    const tFree = free != null ? tOf(free) : tOf(Math.min(endAge - 4, age + 25));
    gFree.to = tFree; gFree.onTo = 1;
    if (!revealed) setLabel(gFree, '?', 'Work optional', '#F4622A');
    else if (r.status === 'ok' && free != null) setLabel(gFree, String(Math.round(free)), 'Work optional', '#F4622A');
    else if (r.status === 'free') setLabel(gFree, 'Now', 'Work optional', '#F4622A');
    else setLabel(gFree, '?', r.status === 'far' ? 'Not yet' : 'Work optional', '#F4622A');
    const showSixty = age < 59 && (free == null || Math.abs(free - 60) >= 2 || !revealed);
    gSixty.to = tOf(60); gSixty.onTo = showSixty ? 1 : 0; setLabel(gSixty, '60', 'Super', 'rgba(253,246,238,0.85)');
    if (r.status === 'free' && revealed) gSixty.onTo = 0;
    // Before the reveal the fuse waits at today, creeping forward a little per question; then it burns to the date.
    const okFree = revealed && (r.status === 'ok' || r.status === 'free') && free != null;
    litTo = okFree ? tFree : T0;
    if (okFree) gToday.onTo = 0;   // the camera leaves today behind; don't let its label fill the foreground
    camTo = okFree ? Math.max(0, tFree - 0.16) : Math.min(0.05, step * 0.01);
    if (reduce) { litT = litTo; camT = camTo; [gToday, gFree, gSixty].forEach(g => { g.t = g.to; g.on = g.onTo; }); }
    kick();
  }
  // Labels again once Inter Tight has loaded (the first ones may have used the fallback face)
  if (document.fonts && document.fonts.load) {
    document.fonts.load('800 190px "Inter Tight"').then(() => { [gToday, gFree, gSixty].forEach(g => { g.key = ''; }); set(lastSet.r, lastSet.revealed, lastSet.step); }).catch(() => {});
  }

  // Camera: behind and above a point on the path, looking a little way ahead; a touch of pointer parallax
  let px = 0, py = 0, ptx = 0, pty = 0;
  root.addEventListener('pointermove', e => {
    const r = root.getBoundingClientRect();
    ptx = ((e.clientX - r.left) / r.width - 0.5) * 2; pty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    kick();
  });
  const v = new THREE.Vector3(), look = new THREE.Vector3();
  function placeCamera() {
    const t = Math.max(0, Math.min(0.97, camT));
    // Straight down the road (not along the bends), so the far gates stay in view beside the questions
    const p = curve.getPointAt(t), ahead = curve.getPointAt(Math.min(1, t + 0.24));
    const narrow = camera.aspect < 1.4;   // phones: closer in, so the gates read at a small size
    v.set(p.x * 0.35 + px * 0.9, (narrow ? 4.6 : 7) - py * 0.5, p.z + (narrow ? 5.5 : 10));
    camera.position.copy(v);
    look.set(ahead.x * 0.5, 0, ahead.z);
    camera.lookAt(look);
  }

  // Size
  function resize() {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Wide panels: shift the view so the path sits to the right of the questions
    camera.setViewOffset(w, h, w > 900 ? -w * 0.16 : 0, 0, w, h);
    camera.updateProjectionMatrix();
    kick();
  }
  new ResizeObserver(resize).observe(wrap);
  resize();

  // The loop: only while on screen and something is moving
  new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); if (visible) kick(); }).observe(root);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  function kick() { if (!raf && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } }
  const ease = (a: number, b: number, k: number) => a + (b - a) * k;
  function frame(now: number) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60; last = now;
    const k = reduce ? 1 : 1 - Math.pow(0.0015, dt);
    // The fuse burns at a steady pace (about two seconds to the date), the camera follows
    if (litT < litTo) litT = Math.min(litTo, litT + dt * 0.42 * (reduce ? 100 : 1)); else litT = ease(litT, litTo, k);
    camT = ease(camT, camTo, reduce ? 1 : 1 - Math.pow(0.12, dt));
    px = ease(px, ptx, k); py = ease(py, pty, k);
    [gToday, gFree, gSixty].forEach(g => { g.t = ease(g.t, g.to, k); g.on = ease(g.on, g.onTo, k); placeGate(g); });
    // The work-optional gate only fully lights when the fuse reaches it
    const fm = (gFree.g.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    fm.opacity = lastSet.revealed && litT >= gFree.t - 0.003 ? 1 : 0.45;
    showTo(litT);
    const hp = curve.getPointAt(Math.max(0.0001, Math.min(0.9999, litT)));
    spark.position.set(hp.x, 0.18, hp.z);
    spark.scale.setScalar(1.3 + Math.sin(now / 90) * 0.18);
    if (!reduce) {
      for (let i = 0; i < N; i++) {
        life[i] += dt * speed[i];
        sp[i * 3 + 1] += dt * speed[i] * 0.9;
        if (life[i] > 2.2 || at[i] > litT) respawn(i, litT);
      }
      sparkGeo.attributes.position.needsUpdate = true;
    }
    placeCamera();
    renderer.render(scene, camera);
    const moving = Math.abs(litT - litTo) > 0.0005 || Math.abs(camT - camTo) > 0.0005 || Math.abs(px - ptx) > 0.002 || Math.abs(py - pty) > 0.002
      || [gToday, gFree, gSixty].some(g => Math.abs(g.t - g.to) > 0.0005 || Math.abs(g.on - g.onTo) > 0.005);
    // Sparks keep drifting while it's on screen; with reduced motion it stops once everything has settled.
    if (visible && !document.hidden && (moving || !reduce)) raf = requestAnimationFrame(frame);
  }
  for (let i = 0; i < N; i++) respawn(i, T0);

  return { set };
}
