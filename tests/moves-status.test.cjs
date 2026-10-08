// FirePath move status (public/js/moves-status.js) — loading, saving and undoing
// a Pro member's "On it" / "Done" / "Not for me" through the Worker.
// Run with:  npm test   (or node tests/moves-status.test.cjs)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const AUTH = read('auth.js'), SRC = read('moves-status.js');
const WORKER = 'https://firepath-api.jwa7990.workers.dev';
const plain = v => JSON.parse(JSON.stringify(v));

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    get length() { return m.size; },
    key: i => Array.from(m.keys())[i] ?? null,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); }
  };
}
function jwt(expInSeconds) {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64({ exp: Math.floor(Date.now() / 1000) + expInSeconds, sub: 'u1' })}.sig`;
}
function response(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body, text: async () => JSON.stringify(body) };
}

// routes: (url, init) => response | throws. Every call is recorded.
function load({ store = { fp_access_token: jwt(3600), fp_refresh_token: 'r1', fp_user_id: 'u1' }, routes }) {
  const calls = [];
  const body = { children: [], appendChild(el) { this.children.push(el); el.isConnected = true; } };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    localStorage: fakeStorage(store), sessionStorage: fakeStorage(),
    document: { body, visibilityState: 'visible', addEventListener() {}, createElement: () => ({ style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, textContent: '' }) },
    location: { href: 'https://firepath.pro/journey', pathname: '/journey', search: '' },
    URLSearchParams, JSON, Math, Date, Object, Array, String, Number, Set, Promise,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    setTimeout: () => 0, clearTimeout: () => {}, alert() {},
    fetch: async (url, init = {}) => { calls.push({ url, init }); return routes(url, init); }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(AUTH, ctx);           // auth.js first, as on the page
  vm.runInContext(SRC, ctx);
  return { S: ctx.FirePathMoveStatus, calls, body, ctx };
}

const ROWS = [
  { move_id: 'clear-debt', status: 'done', done_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z' },
  { move_id: 'build-buffer', status: 'doing', done_at: null, updated_at: '2026-09-02T00:00:00.000Z' },
  { move_id: 'Bad Id', status: 'done' },                       // ignored: not a move id
  { move_id: 'save-more', status: 'weird' }                    // ignored: unknown status
];
const posts = calls => calls.filter(c => c.init.method === 'POST' && c.url.includes('/db/fp_moves'));

test('load: reads fp_moves through the Worker with the session, returns a map, and caches it', async () => {
  const env = load({ routes: () => response(200, ROWS) });
  const m = await env.S.load();
  assert.deepEqual(plain(m), {
    'clear-debt': { status: 'done', done_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z' },
    'build-buffer': { status: 'doing', done_at: null, updated_at: '2026-09-02T00:00:00.000Z' }
  });
  assert.equal(env.calls.length, 1);
  assert.equal(env.calls[0].url, `${WORKER}/db/fp_moves?select=move_id,status,done_at,updated_at`);
  assert.match(env.calls[0].init.headers.Authorization, /^Bearer /);
  m['clear-debt'].status = 'dismissed';                         // callers get a copy
  assert.equal((await env.S.load())['clear-debt'].status, 'done');
  assert.equal(env.calls.length, 1);                            // cached
  await env.S.load({ refresh: true });
  assert.equal(env.calls.length, 2);
});

test('load: two calls at once share one request', async () => {
  const env = load({ routes: () => response(200, ROWS) });
  await Promise.all([env.S.load(), env.S.load()]);
  assert.equal(env.calls.length, 1);
});

test('load: a failed read or being signed out gives {} and is not cached', async () => {
  let fail = true;
  const env = load({ routes: () => { if (fail) throw new TypeError('offline'); return response(200, ROWS); } });
  assert.deepEqual(plain(await env.S.load()), {});
  fail = false;
  assert.equal(Object.keys(await env.S.load()).length, 2);      // tried again
  const five = load({ routes: () => response(500, {}) });
  assert.deepEqual(plain(await five.S.load()), {});
  const out = load({ store: {}, routes: () => response(200, ROWS) });
  assert.deepEqual(plain(await out.S.load()), {});
  assert.equal(out.calls.length, 0);
});

test('set: upserts one row on (user_id, move_id) with both Prefer values; done_at only for done', async () => {
  const env = load({ routes: (url, init) => init.method === 'POST' ? response(201, null) : response(200, []) });
  const before = Date.now();
  assert.deepEqual(plain(await env.S.set('build-buffer', 'done')), { ok: true });
  const [p] = posts(env.calls);
  assert.equal(p.url, `${WORKER}/db/fp_moves?on_conflict=user_id,move_id`);
  assert.equal(p.init.headers.Prefer, 'resolution=merge-duplicates,return=minimal');
  assert.equal(p.init.headers['Content-Type'], 'application/json');
  const row = JSON.parse(p.init.body);
  assert.deepEqual(Object.keys(row), ['user_id', 'move_id', 'status', 'done_at', 'updated_at']);
  assert.equal(row.user_id, 'u1');
  assert.equal(row.status, 'done');
  assert.ok(Date.parse(row.done_at) >= before - 1000);
  assert.equal(row.done_at, row.updated_at);
  // The cache follows.
  assert.equal((await env.S.load())['build-buffer'].status, 'done');
  await env.S.set('build-buffer', 'dismissed');
  const second = JSON.parse(posts(env.calls)[1].init.body);
  assert.equal(second.status, 'dismissed');
  assert.equal(second.done_at, null);
  assert.equal((await env.S.load())['build-buffer'].done_at, null);
});

test('set: bad ids or statuses, or signed out, send nothing', async () => {
  const env = load({ routes: () => response(200, []) });
  for (const [id, st] of [['Build Buffer', 'done'], ['', 'done'], ['a'.repeat(65), 'done'], ['build-buffer', 'finished'], ['build-buffer', undefined]]) {
    assert.equal((await env.S.set(id, st)).ok, false, `${id} ${st}`);
  }
  assert.equal(posts(env.calls).length, 0);
  const out = load({ store: {}, routes: () => response(201, null) });
  assert.deepEqual(plain(await out.S.set('build-buffer', 'done')), { ok: false, error: 'signed_out' });
  assert.equal(out.calls.length, 0);
});

test('set: a failed save shows the usual note and leaves the cache alone', async () => {
  for (const fail of [() => response(500, {}), () => { throw new TypeError('offline'); }]) {
    const env = load({ routes: (url, init) => init.method === 'POST' ? fail() : response(200, ROWS) });
    const r = await env.S.set('build-buffer', 'done');
    assert.equal(r.ok, false);
    assert.equal(env.body.children[0].textContent, env.ctx.FirePathAuth.SAVE_FAILED_MSG);
    assert.equal((await env.S.load())['build-buffer'].status, 'doing');
  }
});

test('undo: goes back to the earlier status (keeping its done date); with nothing earlier, "doing"', async () => {
  const env = load({ routes: (url, init) => init.method === 'POST' ? response(201, null) : response(200, ROWS) });
  await env.S.set('clear-debt', 'dismissed');
  assert.equal((await env.S.undo('clear-debt')).ok, true);
  const back = JSON.parse(posts(env.calls).pop().init.body);
  assert.equal(back.status, 'done');
  assert.equal(back.done_at, '2026-09-01T00:00:00.000Z');
  assert.equal((await env.S.load())['clear-debt'].status, 'done');
  // Two steps back.
  await env.S.set('build-buffer', 'done');
  await env.S.set('build-buffer', 'dismissed');
  await env.S.undo('build-buffer');
  assert.equal(JSON.parse(posts(env.calls).pop().init.body).status, 'done');
  await env.S.undo('build-buffer');
  assert.equal(JSON.parse(posts(env.calls).pop().init.body).status, 'doing');
  // Nothing to go back to (no earlier row, or a move never touched): "Bring it back" = doing.
  await env.S.undo('save-more');
  const fresh = JSON.parse(posts(env.calls).pop().init.body);
  assert.equal(fresh.status, 'doing');
  assert.equal(fresh.done_at, null);
  await env.S.set('spend-less', 'dismissed');                    // had no row before
  await env.S.undo('spend-less');
  assert.equal(JSON.parse(posts(env.calls).pop().init.body).status, 'doing');
});
