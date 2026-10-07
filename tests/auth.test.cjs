// FirePath shared auth (public/js/auth.js) — session refresh, Pro-status fallback
// rules, saving, and sign-out clearing.
// Run with:  npm test   (or node tests/auth.test.cjs)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'auth.js'), 'utf8');
const WORKER = 'https://firepath-api.jwa7990.workers.dev';

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    get length() { return m.size; },
    key: i => Array.from(m.keys())[i] ?? null,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    dump: () => Object.fromEntries(m)
  };
}

// A JWT-shaped token (unsigned — the client only reads exp for scheduling).
function jwt(expInSeconds, tag = 'a') {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64({ exp: Math.floor(Date.now() / 1000) + expInSeconds, sub: 'u1', tag })}.sig`;
}

function response(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body, text: async () => JSON.stringify(body) };
}

// routes: (url, init) => response | throws. Every call is recorded.
function load({ store = {}, routes }) {
  const calls = [];
  const localStorage = fakeStorage(store);
  const sessionStorage = fakeStorage();
  const location = { href: 'https://firepath.pro/progress.html', pathname: '/progress.html', search: '' };
  const alerts = [];
  const body = { children: [], appendChild(el) { this.children.push(el); el.isConnected = true; } };
  const document = {
    body, visibilityState: 'visible',
    addEventListener() {},
    createElement: () => ({ style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, textContent: '' })
  };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    localStorage, sessionStorage, document, location, URLSearchParams, JSON, Math, Date, Object, Array, String, Number, Set, Promise,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    setTimeout: () => 0, clearTimeout: () => {},
    alert: msg => alerts.push(msg),
    fetch: async (url, init = {}) => { calls.push({ url, init }); return routes(url, init); }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, calls, localStorage, sessionStorage, location, alerts, body };
}

const signedIn = (extra = {}) => Object.assign({
  fp_access_token: jwt(3600, 'old'), fp_refresh_token: 'r1', fp_user_id: 'u1', fp_email: 'a@b.co'
}, extra);

test('a 401 refreshes the session and retries once with the new token', async () => {
  const fresh = jwt(3600, 'new');
  const env = load({
    store: signedIn(),
    routes: (url, init) => {
      if (url.includes('/auth/token?grant_type=refresh_token')) {
        assert.equal(JSON.parse(init.body).refresh_token, 'r1');
        return response(200, { access_token: fresh, refresh_token: 'r2' });
      }
      return response(init.headers.Authorization === `Bearer ${fresh}` ? 200 : 401, []);
    }
  });
  const res = await env.ctx.FirePathAuth.fetch(`${WORKER}/db/checkins`);
  assert.equal(res.status, 200);
  assert.equal(env.calls.length, 3);                       // original, refresh, retry
  assert.equal(env.localStorage.getItem('fp_access_token'), fresh);
  assert.equal(env.localStorage.getItem('fp_refresh_token'), 'r2');
});

test('refreshes before the request when the session has under 5 minutes left', async () => {
  const fresh = jwt(3600, 'new');
  const env = load({
    store: signedIn({ fp_access_token: jwt(120, 'old') }),
    routes: url => url.includes('grant_type=refresh_token') ? response(200, { access_token: fresh }) : response(200, [])
  });
  await env.ctx.FirePathAuth.fetch(`${WORKER}/db/x`);
  assert.ok(env.calls[0].url.includes('grant_type=refresh_token'));
  assert.equal(env.calls[1].init.headers.Authorization, `Bearer ${fresh}`);
});

test('a refused refresh ends the session and sends the person to sign in', async () => {
  const env = load({
    store: signedIn({ fp_is_pro: 'true' }),
    routes: url => url.includes('grant_type=refresh_token') ? response(400, { error: 'invalid_grant' }) : response(401, {})
  });
  const res = await env.ctx.FirePathAuth.fetch(`${WORKER}/db/x`);
  assert.equal(res.status, 401);
  assert.equal(env.localStorage.getItem('fp_access_token'), null);
  assert.equal(env.localStorage.getItem('fp_is_pro'), null);
  assert.equal(env.location.href, 'auth.html?expired=1');
});

test('a missing refresh route (404) degrades to signing in again', async () => {
  const env = load({
    store: signedIn(),
    routes: url => url.includes('grant_type=refresh_token') ? response(404, { error: 'Not found' }) : response(401, {})
  });
  await env.ctx.FirePathAuth.fetch(`${WORKER}/db/x`);
  assert.equal(env.location.href, 'auth.html?expired=1');
});

test('checkProStatus: network error or 5xx falls back to the cached answer', async () => {
  let env = load({ store: signedIn({ fp_is_pro: 'true' }), routes: () => { throw new TypeError('offline'); } });
  assert.equal(await env.ctx.checkProStatus(), true);
  env = load({ store: signedIn({ fp_is_pro: 'true' }), routes: () => response(503, {}) });
  assert.equal(await env.ctx.checkProStatus(), true);
  assert.equal(env.localStorage.getItem('fp_access_token') !== null, true);
});

test('checkProStatus: 401 (after a failed refresh) or 403 clears the session and the cached flag', async () => {
  for (const status of [401, 403]) {
    const env = load({
      store: signedIn({ fp_is_pro: 'true' }),
      routes: url => url.includes('grant_type=refresh_token') ? response(400, {}) : response(status, {})
    });
    assert.equal(await env.ctx.checkProStatus(), false, String(status));
    assert.equal(env.localStorage.getItem('fp_is_pro'), null);
    assert.equal(env.localStorage.getItem('fp_access_token'), null);
    assert.equal(env.localStorage.getItem('fp_user_id'), null);
    assert.equal(env.location.href, 'https://firepath.pro/progress.html');   // the caller decides where to go
  }
});

test('checkProStatus: a good answer is cached', async () => {
  const env = load({ store: signedIn({ fp_is_pro: 'true' }), routes: () => response(200, [{ is_pro: false }]) });
  assert.equal(await env.ctx.checkProStatus(), false);
  assert.equal(env.localStorage.getItem('fp_is_pro'), 'false');
});

test('dbInsert reports a failed save and shows the friendly note', async () => {
  const env = load({ store: signedIn(), routes: () => response(500, {}) });
  const r = await env.ctx.dbInsert('checkins', { hit: true });
  assert.equal(r.ok, false);
  assert.equal(r.status, 500);
  const toast = env.body.children[0];
  assert.equal(toast.textContent, 'We couldn’t save that just now. Please try again.');
  assert.equal(toast.attrs.role, 'status');
  const ok = load({ store: signedIn(), routes: () => response(201, null) });
  assert.equal((await ok.ctx.dbInsert('checkins', {})).ok, true);
});

test('signOut calls logout, clears fp_/ap_/hmo_ data but keeps fp_situation and fp_persona, and goes home', () => {
  const token = jwt(3600);
  const env = load({
    store: signedIn({
      fp_access_token: token, fp_is_pro: 'true', fp_guest: 'false', fp_last_calc: '{}', fp_commitment: '{}',
      fp_lab_read: '[]', ap_income: '9000', ap_saved_plan: '{}', hmo_fireNum: '1', fp_has_help_debt: 'true',
      fp_situation: '{"age":30}', fp_persona: 'fire', other_app_key: 'x'
    }),
    routes: () => response(204, null)
  });
  env.sessionStorage.setItem('fp_access_token', 'x');
  env.sessionStorage.setItem('ap_age', '30');
  env.ctx.FirePathAuth.signOut();
  assert.ok(env.calls.some(c => c.url === `${WORKER}/auth/logout?scope=local` && c.init.headers.Authorization === `Bearer ${token}`));
  assert.deepEqual(env.localStorage.dump(), { fp_situation: '{"age":30}', fp_persona: 'fire', other_app_key: 'x' });
  assert.deepEqual(env.sessionStorage.dump(), {});
  assert.equal(env.location.href, '/');
});

test('signOut from a click handler (event argument) still works; message is shown', () => {
  const env = load({ store: signedIn(), routes: () => response(204, null) });
  env.ctx.signOut({ target: {}, type: 'click' });
  assert.equal(env.location.href, '/');
  const env2 = load({ store: signedIn(), routes: () => response(204, null) });
  env2.ctx.FirePathAuth.signOut({ message: env2.ctx.FirePathAuth.INACTIVE_MSG });
  assert.equal(env2.alerts.length, 1);
  assert.equal(env2.localStorage.getItem('fp_access_token'), null);
});
