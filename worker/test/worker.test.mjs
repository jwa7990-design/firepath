// Worker security tests — run with:  node --test worker/test/
// Real requests go through the Worker; Supabase, Stripe, Anthropic and Resend are
// faked at the fetch() boundary, and every outbound call is recorded so the tests
// can check exactly what would have been sent.

import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { _internal } from '../src/index.js';

const SUPABASE = 'https://db.example.supabase.co';
const ANON = 'anon.anon.anon';
const env = {
  SUPABASE_URL: SUPABASE, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_KEY: 'svc.svc.svc',
  ANTHROPIC_API_KEY: 'sk-ant-test', STRIPE_SECRET_KEY: 'sk_test', STRIPE_PRICE_ID: 'price_1',
  STRIPE_WEBHOOK_SECRET: 'whsec_test', RESEND_API_KEY: 're_test', FEEDBACK_WEBHOOK_SECRET: 'fb-secret'
};
const PRO_TOKEN = 'aaa.pro.token', FREE_TOKEN = 'aaa.free.token';
const USERS = { [PRO_TOKEN]: { id: 'user-pro', email: 'pro@example.com', pro: true }, [FREE_TOKEN]: { id: 'user-free', email: 'free@example.com', pro: false } };

let calls = [];
let stripeSubs = [];
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const call = { url, method: init.method || 'GET', headers: init.headers || {}, body: init.body };
  calls.push(call);
  const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  if (url === `${SUPABASE}/auth/v1/user` && call.method === 'GET') {
    const token = (call.headers.Authorization || '').replace('Bearer ', '');
    const u = USERS[token];
    return u ? reply({ id: u.id, email: u.email }) : reply({ msg: 'invalid' }, 401);
  }
  if (url.startsWith(`${SUPABASE}/rest/v1/users?id=eq.`)) {
    const id = decodeURIComponent(url.split('id=eq.')[1].split('&')[0]);
    const u = Object.values(USERS).find(x => x.id === id);
    return reply(u ? [{ is_pro: u.pro }] : []);
  }
  if (url.startsWith(`${SUPABASE}/`)) return reply([]);
  if (url === 'https://api.anthropic.com/v1/messages') return reply({ content: [{ type: 'text', text: 'hi' }] });
  if (url.startsWith('https://api.stripe.com/v1/checkout/sessions')) return reply({ url: 'https://checkout.stripe.com/x' });
  if (url.startsWith('https://api.stripe.com/v1/subscriptions/search')) return reply({ data: stripeSubs });
  if (url.startsWith('https://api.stripe.com/v1/subscriptions/')) return reply({ id: 'sub_1', current_period_end: 1800000000 });
  if (url.startsWith('https://api.stripe.com/v1/billing_portal/sessions')) return reply({ url: 'https://billing.stripe.com/p' });
  if (url === 'https://api.resend.com/emails') return reply({ id: 'email' });
  return reply({ error: 'unexpected ' + url }, 500);
};

const ORIGIN = 'https://www.firepath.pro';
function req(path, { method = 'POST', token, body, origin = ORIGIN, headers = {} } = {}) {
  const h = { ...headers };
  if (origin) h.Origin = origin;
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  return new Request(`https://firepath-api.example.workers.dev${path}`, {
    method, headers: h, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  });
}
const send = async r => { calls = []; return worker.fetch(r, env); };
const outbound = prefix => calls.filter(c => c.url.startsWith(prefix));
const aiBody = { model: 'claude-sonnet-4-6', max_tokens: 400, system: 'be nice', messages: [{ role: 'user', content: 'hello' }] };

// ── Origins / CORS ──
test('browsers on other sites are refused', async () => {
  const res = await send(req('/assumptions', { method: 'GET', origin: 'https://evil.example' }));
  assert.equal(res.status, 403);
  const pre = await send(req('/', { method: 'OPTIONS', origin: 'https://evil.example' }));
  assert.equal(pre.status, 403);
});

test('FirePath origins (incl. branch previews) get CORS headers', async () => {
  const pre = await send(req('/', { method: 'OPTIONS', origin: 'https://redesign.firepath-e2w.pages.dev' }));
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), 'https://redesign.firepath-e2w.pages.dev');
  assert.ok(!_internal.originAllowed('http://localhost:8792', {}));
  assert.ok(_internal.originAllowed('http://localhost:8792', { ALLOW_LOCALHOST: 'true' }));
});

// ── AI ──
test('AI: refused without a login, and nothing is sent to Anthropic', async () => {
  const res = await send(req('/', { body: aiBody }));
  assert.equal(res.status, 401);
  assert.equal(outbound('https://api.anthropic.com').length, 0);
});

test('AI: refused for signed-in users who are not Pro', async () => {
  const res = await send(req('/', { token: FREE_TOKEN, body: aiBody }));
  assert.equal(res.status, 403);
  assert.equal(outbound('https://api.anthropic.com').length, 0);
});

test('AI: Pro users get through, with the request rebuilt and capped', async () => {
  const res = await send(req('/', { token: PRO_TOKEN, body: { ...aiBody, model: 'claude-opus-4', max_tokens: 64000, tools: [{ name: 'x' }], stream: true } }));
  assert.equal(res.status, 200);
  const sent = JSON.parse(outbound('https://api.anthropic.com')[0].body);
  assert.equal(sent.model, 'claude-sonnet-4-6');      // unknown model → default
  assert.equal(sent.max_tokens, 1500);                // capped
  assert.equal(sent.tools, undefined);                // stripped
  assert.equal(sent.stream, undefined);
  assert.deepEqual(Object.keys(sent).sort(), ['max_tokens', 'messages', 'model', 'system']);
});

test('AI: oversized or malformed requests are rejected', async () => {
  const huge = { ...aiBody, messages: [{ role: 'user', content: 'x'.repeat(30000) }] };
  assert.equal((await send(req('/', { token: PRO_TOKEN, body: huge }))).status, 400);
  assert.equal((await send(req('/', { token: PRO_TOKEN, body: { ...aiBody, messages: [{ role: 'system', content: 'x' }] } }))).status, 400);
  assert.equal((await send(req('/', { token: PRO_TOKEN, body: '{not json' }))).status, 400);
});

test('AI: the rate limiter is applied per user', async () => {
  const limited = { ...env, AI_LIMITER: { limit: async ({ key }) => ({ success: key !== 'user-pro' }) } };
  calls = [];
  const res = await worker.fetch(req('/', { token: PRO_TOKEN, body: aiBody }), limited);
  assert.equal(res.status, 429);
});

// ── Database proxy ──
test('DB: personal tables need a login', async () => {
  for (const t of ['fp_profiles', 'financial_snapshots', 'users', 'calculations', 'checkins']) {
    const res = await send(req(`/db/${t}?select=*`, { method: 'GET' }));
    assert.equal(res.status, 401, t);
  }
  assert.equal(outbound(SUPABASE).length, 0);
});

test('DB: the anon key cannot be passed off as a login', async () => {
  const res = await send(req('/db/fp_profiles?select=*', { method: 'GET', token: ANON }));
  assert.equal(res.status, 401);
});

test('DB: signed-in reads go to Supabase with the caller\'s own session (RLS applies)', async () => {
  const res = await send(req('/db/fp_profiles?id=eq.user-pro', { method: 'GET', token: PRO_TOKEN }));
  assert.equal(res.status, 200);
  const c = outbound(`${SUPABASE}/rest/v1/fp_profiles`)[0];
  assert.equal(c.headers.Authorization, `Bearer ${PRO_TOKEN}`);
  assert.equal(c.headers.apikey, ANON);
});

test('DB: only allowed tables and methods; no deletes, no RPC', async () => {
  assert.equal((await send(req('/db/fp_profiles?id=eq.x', { method: 'DELETE', token: PRO_TOKEN }))).status, 405);
  assert.equal((await send(req('/db/users', { method: 'PATCH', token: PRO_TOKEN, body: { is_pro: true } }))).status, 405);
  assert.equal((await send(req('/db/rpc/anything', { token: PRO_TOKEN, body: {} }))).status, 404);
  assert.equal((await send(req('/db/secret_table', { method: 'GET', token: PRO_TOKEN }))).status, 404);
  assert.equal((await send(req('/db/checkins', { token: PRO_TOKEN, body: {} }))).status, 405);
});

test('DB: anonymous feedback and article reads are allowed', async () => {
  assert.equal((await send(req('/db/feedback', { body: { rating: 5 } }))).status, 200);
  assert.equal((await send(req('/db/learning_articles?select=body_html', { method: 'GET' }))).status, 200);
});

test('DB: only known Prefer values are forwarded', async () => {
  await send(req('/db/fp_profiles', { token: PRO_TOKEN, body: { id: 'user-pro' }, headers: { Prefer: 'resolution=merge-duplicates, tx=rollback, missing=default' } }));
  assert.equal(outbound(`${SUPABASE}/rest/v1/fp_profiles`)[0].headers.Prefer, 'resolution=merge-duplicates');
});

// ── Auth proxy ──
test('Auth: only the sign-in page\'s routes are reachable', async () => {
  assert.equal((await send(req('/auth/token?grant_type=password', { body: { email: 'a', password: 'b' } }))).status, 200);
  assert.equal((await send(req('/auth/token?grant_type=id_token', { body: {} }))).status, 404);
  assert.equal((await send(req('/auth/admin/users', { method: 'GET' }))).status, 404);
  assert.equal((await send(req('/auth/user', { method: 'DELETE', token: PRO_TOKEN }))).status, 404);
});

// ── Stripe checkout & billing ──
test('Checkout: identity comes from the session, not the request body', async () => {
  const res = await send(req('/stripe/checkout', { token: FREE_TOKEN, body: { userId: 'someone-else', email: 'victim@example.com' } }));
  assert.equal(res.status, 200);
  const params = new URLSearchParams(outbound('https://api.stripe.com/v1/checkout/sessions')[0].body);
  assert.equal(params.get('client_reference_id'), 'user-free');
  assert.equal(params.get('customer_email'), 'free@example.com');
  assert.equal(params.get('subscription_data[metadata][user_id]'), 'user-free');
});

test('Checkout and billing need a login', async () => {
  for (const p of ['/stripe/checkout', '/billing/portal', '/billing/cancel']) {
    assert.equal((await send(req(p, { body: { userId: 'x' } }))).status, 401, p);
  }
});

test('Billing: cancel sets cancel_at_period_end on the user\'s own subscription', async () => {
  stripeSubs = [{ id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { user_id: 'user-pro' } }];
  const res = await send(req('/billing/cancel', { token: PRO_TOKEN }));
  assert.equal(res.status, 200);
  const search = outbound('https://api.stripe.com/v1/subscriptions/search')[0];
  assert.ok(decodeURIComponent(search.url).includes("metadata['user_id']:'user-pro'"));
  const update = calls.find(c => c.url.endsWith('/subscriptions/sub_1') && c.method === 'POST');
  assert.equal(new URLSearchParams(update.body).get('cancel_at_period_end'), 'true');
});

test('Billing: portal opens for the user\'s own Stripe customer', async () => {
  stripeSubs = [{ id: 'sub_1', customer: 'cus_1', status: 'trialing', metadata: { user_id: 'user-pro' } }];
  const res = await send(req('/billing/portal', { token: PRO_TOKEN }));
  assert.equal((await res.json()).url, 'https://billing.stripe.com/p');
  assert.equal(new URLSearchParams(outbound('https://api.stripe.com/v1/billing_portal/sessions')[0].body).get('customer'), 'cus_1');
});

// ── Stripe webhook ──
async function signed(payload, secret = env.STRIPE_WEBHOOK_SECRET, ts = Math.floor(Date.now() / 1000)) {
  const body = JSON.stringify(payload);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${body}`));
  const sig = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
  return new Request('https://firepath-api.example.workers.dev/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': `t=${ts},v1=${sig}` }, body });
}
const proWrites = () => outbound(`${SUPABASE}/rest/v1/users`).filter(c => c.method === 'POST').map(c => JSON.parse(c.body));

test('Webhook: forged or replayed events are rejected', async () => {
  const evt = { type: 'checkout.session.completed', data: { object: { client_reference_id: 'user-free' } } };
  assert.equal((await send(await signed(evt, 'whsec_wrong'))).status, 400);
  assert.equal((await send(await signed(evt, env.STRIPE_WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 3600))).status, 400);
  assert.equal(proWrites().length, 0);
});

test('Webhook: Pro follows the subscription status (unpaid switches it off)', async () => {
  await send(await signed({ type: 'customer.subscription.updated', data: { object: { status: 'unpaid', metadata: { user_id: 'user-pro' } } } }));
  assert.deepEqual(proWrites(), [{ id: 'user-pro', is_pro: false }]);
  await send(await signed({ type: 'customer.subscription.updated', data: { object: { status: 'trialing', metadata: { user_id: 'user-free' } } } }));
  assert.deepEqual(proWrites(), [{ id: 'user-free', is_pro: true }]);
});

// ── Feedback notifications & admin ──
test('Feedback email needs the shared secret', async () => {
  const body = { record: { rating: 5 } };
  assert.equal((await send(req('/notify/feedback', { origin: null, body }))).status, 403);
  assert.equal((await send(req('/notify/feedback', { origin: null, body, headers: { 'x-firepath-secret': 'fb-secret' } }))).status, 200);
  calls = [];
  const res = await worker.fetch(req('/notify/feedback', { origin: null, body, headers: { 'x-firepath-secret': 'x' } }), { ...env, FEEDBACK_WEBHOOK_SECRET: undefined });
  assert.equal(res.status, 503);
  assert.equal(outbound('https://api.resend.com').length, 0);
});

test('Cache clearing is hidden without the admin secret', async () => {
  assert.equal((await send(req('/assumptions/clear-cache', { method: 'GET' }))).status, 404);
});

test('Unknown routes 404 and errors never leak internals', async () => {
  const res = await send(req('/anything', { method: 'GET' }));
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
});
