/**
 * FirePath API — Cloudflare Worker (firepath-api)
 * ================================================
 * The only server FirePath has. It holds every secret (Anthropic, Stripe,
 * Supabase service key, Resend) and is the gatekeeper between the public
 * website and the people's financial data behind it.
 *
 * Principles
 *   - Deny by default: only the routes, tables, methods and auth paths the
 *     website actually uses are allowed (audited Oct 2026). Everything else 404s.
 *   - Identity comes from the verified Supabase session, never from the request
 *     body (user IDs, emails and Pro status are looked up server-side).
 *   - Paid features (AI) are checked against the database on every call.
 *   - Browsers may only call from FirePath's own origins.
 *   - Errors never leak internals to the client; details go to the Worker logs.
 *
 * Secrets (Cloudflare → Workers → firepath-api → Settings → Variables and Secrets)
 *   ANTHROPIC_API_KEY, RESEND_API_KEY, STRIPE_SECRET_KEY, STRIPE_PRICE_ID,
 *   STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY,
 *   FEEDBACK_WEBHOOK_SECRET (new — also set as a header on the Supabase webhook),
 *   ADMIN_SECRET (new, optional — enables /assumptions/clear-cache).
 * Bindings (wrangler.toml): LIMITER — the RateLimiter Durable Object (exact per-minute
 *   and per-day caps). If it's missing (e.g. code pasted into the dashboard) limits are skipped.
 */

const SITE = 'https://www.firepath.pro';

// Browsers may call the API only from these origins.
const ALLOWED_ORIGINS = new Set([
  'https://www.firepath.pro',
  'https://firepath.pro',
  'https://firepath-e2w.pages.dev'
]);
const PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+\.firepath-e2w\.pages\.dev$/;   // branch previews
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;              // only with ALLOW_LOCALHOST=true

// AI: the models the site uses and the largest real request (discover.html: 1,500).
const AI = {
  models: ['claude-sonnet-4-6', 'claude-sonnet-4-5'],
  defaultModel: 'claude-sonnet-4-6',
  maxTokens: 1500,
  maxSystemChars: 12000,
  maxMessageChars: 24000,
  maxMessages: 12,
  maxBodyBytes: 96 * 1024
};

// Database: table → methods the website uses. Anything else is refused.
const DB_RULES = {
  users: ['GET', 'POST'],
  fp_profiles: ['GET', 'POST'],
  calculations: ['GET', 'POST'],
  checkins: ['GET'],
  financial_snapshots: ['GET', 'POST'],
  lab_progress: ['GET', 'POST'],
  financial_learning_progress: ['GET', 'POST'],
  learn_lab: ['GET', 'POST'],
  learning_articles: ['GET'],
  feedback: ['POST']
};
// The only database calls allowed without signing in.
const DB_PUBLIC = { learning_articles: ['GET'], feedback: ['POST'] };
const PREFER_ALLOWED = new Set(['return=minimal', 'return=representation', 'resolution=merge-duplicates', 'count=exact']);
const DB_MAX_BODY = 256 * 1024;

// Supabase Auth: only what the sign-in page calls.
const AUTH_ROUTES = new Set(['POST /token', 'POST /signup', 'POST /recover', 'GET /user', 'PUT /user', 'POST /logout']);
const AUTH_GRANT_TYPES = new Set(['password', 'refresh_token']);

// Stripe statuses that keep Pro switched on (past_due = Stripe is still retrying payment).
const PRO_STATUSES = new Set(['active', 'trialing', 'past_due']);
const WEBHOOK_TOLERANCE_SECONDS = 300;

// ── Small helpers ─────────────────────────────────────────

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra }
  });
}

function originAllowed(origin, env) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin) || PREVIEW_ORIGIN.test(origin)) return true;
  return env.ALLOW_LOCALHOST === 'true' && LOCAL_ORIGIN.test(origin);
}

function corsHeaders(origin, env) {
  if (!originAllowed(origin, env)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Prefer',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function finalise(response, origin, env) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(origin, env))) headers.set(k, v);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function readBody(request, maxBytes) {
  const declared = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (declared > maxBytes) return { error: 'too_large' };
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) return { error: 'too_large' };
  return { text };
}

async function readJson(request, maxBytes) {
  const { text, error } = await readBody(request, maxBytes);
  if (error) return { error };
  try { return { data: JSON.parse(text) }; } catch { return { error: 'bad_json' }; }
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] || 0) ^ (eb[i] || 0);
  return diff === 0;
}

function bearer(request) {
  const m = (request.headers.get('Authorization') || '').match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

const looksLikeJwt = t => typeof t === 'string' && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t);

// ── Identity ──────────────────────────────────────────────

// Verifies the session with Supabase and returns the real user — the only source
// of user IDs and emails anywhere in this Worker.
async function getUser(request, env) {
  const token = bearer(request);
  if (!looksLikeJwt(token) || token === env.SUPABASE_ANON_KEY) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user && user.id ? { id: user.id, email: user.email || null, token } : null;
}

function serviceHeaders(env, extra = {}) {
  return { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, ...extra };
}

async function isPro(userId, env) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=is_pro`, {
    headers: serviceHeaders(env)
  });
  if (!res.ok) return false;
  const rows = await res.json().catch(() => []);
  return rows[0]?.is_pro === true;
}

// ── Rate limiting ─────────────────────────────────────────
// Exact counts per key (a user for AI, a connection for feedback), kept in a
// Durable Object so every request for that key is counted in one place.
const RATE_LIMITS = {
  ai: [{ limit: 10, windowMs: 60_000 }, { limit: 100, windowMs: 86_400_000 }],
  feedback: [{ limit: 3, windowMs: 60_000 }, { limit: 20, windowMs: 86_400_000 }]
};

export class RateLimiter {
  constructor(state) { this.state = state; }

  async fetch(request) {
    const { rules } = await request.json();
    const now = Date.now();
    const longest = Math.max(...rules.map(r => r.windowMs));
    const hits = ((await this.state.storage.get('hits')) || []).filter(t => now - t < longest);
    const allowed = rules.every(r => hits.filter(t => now - t < r.windowMs).length < r.limit);
    if (allowed) hits.push(now);
    await this.state.storage.put('hits', hits);
    // Forget this key once its longest window has passed with no activity.
    await this.state.storage.setAlarm(now + longest);
    return new Response(JSON.stringify({ allowed }), { headers: { 'Content-Type': 'application/json' } });
  }

  async alarm() { await this.state.storage.deleteAll(); }
}

// true = go ahead. AI fails closed if the limiter errors (it costs money);
// feedback fails open (honeypot and validation still apply).
async function rateLimit(env, bucket, key) {
  if (!env.LIMITER) return true;
  try {
    const stub = env.LIMITER.get(env.LIMITER.idFromName(`${bucket}:${key}`));
    const res = await stub.fetch('https://limiter/check', { method: 'POST', body: JSON.stringify({ rules: RATE_LIMITS[bucket] }) });
    return (await res.json()).allowed === true;
  } catch (e) {
    console.error('Rate limiter error', e && e.message);
    return bucket === 'feedback';
  }
}

// ── AI (Anthropic) ────────────────────────────────────────

function textLength(content) {
  if (typeof content === 'string') return content.length;
  if (Array.isArray(content)) return content.reduce((n, part) => n + (part && part.type === 'text' && typeof part.text === 'string' ? part.text.length : Infinity), 0);
  return Infinity;
}

// Rebuilds the request from scratch with only the fields we allow, so nothing
// else the browser sends (tools, other models, huge outputs) reaches Anthropic.
function sanitiseAiRequest(body) {
  if (!body || typeof body !== 'object') return { error: 'Invalid request.' };
  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > AI.maxMessages) return { error: 'Invalid messages.' };
  let total = 0;
  const clean = [];
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return { error: 'Invalid messages.' };
    const len = textLength(m.content);
    if (!Number.isFinite(len)) return { error: 'Invalid messages.' };
    total += len;
    clean.push({ role: m.role, content: m.content });
  }
  if (total > AI.maxMessageChars) return { error: 'Request too long.' };
  const out = {
    model: AI.models.includes(body.model) ? body.model : AI.defaultModel,
    max_tokens: Math.min(AI.maxTokens, Math.max(1, parseInt(body.max_tokens, 10) || 600)),
    messages: clean
  };
  if (typeof body.system === 'string' && body.system.trim()) {
    if (body.system.length > AI.maxSystemChars) return { error: 'Request too long.' };
    out.system = body.system;
  }
  return { request: out };
}

async function handleAi(request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Please sign in to use FirePath AI.' }, 401);
  if (!(await isPro(user.id, env))) return json({ error: 'FirePath AI is part of FirePath Pro.' }, 403);
  if (!(await rateLimit(env, 'ai', user.id))) {
    return json({ error: "You've reached the AI limit for now — please try again a bit later." }, 429);
  }
  const { data, error } = await readJson(request, AI.maxBodyBytes);
  if (error) return json({ error: error === 'too_large' ? 'Request too long.' : 'Invalid request.' }, error === 'too_large' ? 413 : 400);
  const clean = sanitiseAiRequest(data);
  if (clean.error) return json({ error: clean.error }, 400);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(clean.request)
  });
  const out = await res.json().catch(() => null);
  if (!res.ok || !out) {
    console.error('Anthropic error', res.status, out && out.error);
    return json({ error: 'FirePath AI is unavailable right now. Please try again shortly.' }, 502);
  }
  return json(out);
}

// ── Database proxy (Supabase PostgREST, caller's own session → RLS applies) ──

// ── Feedback (open to everyone, so it gets its own spam protection) ──
//   1. Honeypot: a hidden "website" field people never see; bots that fill it
//      get a normal-looking success and nothing is saved.
//   2. Rate limit per connection (3 a minute, 20 a day — see RATE_LIMITS).
//   3. Rebuilt server-side from an allow-list with length limits; user_id comes
//      from the verified session (or stays empty), never from the form.
const FEEDBACK_TEXT_FIELDS = ['gaps', 'confusing', 'bring_back', 'other', 'pro_interest'];
const FEEDBACK_MAX_TEXT = 4000;

function sanitiseFeedback(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Invalid feedback.' };
  if (typeof input.website === 'string' && input.website.trim() !== '') return { honeypot: true };
  const out = {};
  for (const f of FEEDBACK_TEXT_FIELDS) {
    const v = input[f];
    if (v == null || v === '') continue;
    if (typeof v !== 'string') return { error: 'Invalid feedback.' };
    if (v.length > FEEDBACK_MAX_TEXT) return { error: 'That message is too long.' };
    out[f] = v.trim();
  }
  const rating = parseInt(input.rating, 10);
  if (rating >= 1 && rating <= 5) out.rating = rating;
  if (typeof input.email === 'string' && input.email.trim()) {
    const email = input.email.trim();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'That email address looks wrong.' };
    out.email = email;
  }
  if (typeof input.page_url === 'string' && input.page_url.startsWith('/')) out.page_url = input.page_url.slice(0, 300);
  if (typeof input.is_pro === 'boolean') out.is_pro = input.is_pro;
  if (Object.keys(out).filter(k => k !== 'is_pro' && k !== 'page_url').length === 0) return { error: 'Please write something first.' };
  out.submitted_at = new Date().toISOString();
  return { feedback: out };
}

async function handleFeedback(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await rateLimit(env, 'feedback', ip))) {
    return json({ error: "Thanks — that's plenty for now. Please try again a bit later." }, 429);
  }
  const { data, error } = await readJson(request, 32 * 1024);
  if (error) return json({ error: 'Invalid feedback.' }, error === 'too_large' ? 413 : 400);
  const clean = sanitiseFeedback(data);
  if (clean.honeypot) return new Response(null, { status: 201 });
  if (clean.error) return json({ error: clean.error }, 400);

  const user = bearer(request) ? await getUser(request, env) : null;
  const row = { ...clean.feedback, user_id: user ? user.id : null };
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${user ? user.token : env.SUPABASE_ANON_KEY}`,
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(row)
  });
  if (!res.ok) {
    console.error('Feedback insert failed', res.status, await res.text().catch(() => ''));
    return json({ error: "Couldn't save feedback right now." }, 502);
  }
  return new Response(null, { status: 201 });
}

async function handleDb(request, env, url) {
  if (url.pathname === '/db/feedback' && request.method === 'POST') return handleFeedback(request, env);
  const m = url.pathname.match(/^\/db\/([a-z_]+)$/);         // no rpc, no nested paths
  const table = m && m[1];
  const allowed = table && DB_RULES[table];
  if (!allowed) return json({ error: 'Not found' }, 404);
  if (!allowed.includes(request.method)) return json({ error: 'Method not allowed' }, 405);

  const token = bearer(request);
  const signedIn = looksLikeJwt(token) && token !== env.SUPABASE_ANON_KEY;
  const isPublic = (DB_PUBLIC[table] || []).includes(request.method);
  if (!signedIn && !isPublic) return json({ error: 'Please sign in.' }, 401);

  let body = null;
  if (request.method !== 'GET') {
    const r = await readBody(request, DB_MAX_BODY);
    if (r.error) return json({ error: 'Request too large.' }, 413);
    body = r.text;
  }
  const prefer = (request.headers.get('Prefer') || '').split(',').map(s => s.trim()).filter(p => PREFER_ALLOWED.has(p)).join(', ');
  const headers = {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${signedIn ? token : env.SUPABASE_ANON_KEY}`
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}${url.search}`, { method: request.method, headers, body });
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

// ── Auth proxy (Supabase GoTrue) ──────────────────────────

async function handleAuth(request, env, url) {
  const sub = url.pathname.replace(/^\/auth/, '') || '/';
  if (!AUTH_ROUTES.has(`${request.method} ${sub}`)) return json({ error: 'Not found' }, 404);
  if (sub === '/token' && !AUTH_GRANT_TYPES.has(url.searchParams.get('grant_type'))) return json({ error: 'Not found' }, 404);

  let body = null;
  if (request.method !== 'GET') {
    const r = await readBody(request, 16 * 1024);
    if (r.error) return json({ error: 'Request too large.' }, 413);
    body = r.text;
  }
  const token = bearer(request);
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1${sub}${url.search}`, {
    method: request.method,
    headers: {
      'Content-Type': 'application/json',
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${looksLikeJwt(token) ? token : env.SUPABASE_ANON_KEY}`
    },
    body
  });
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

// ── Stripe ────────────────────────────────────────────────

async function stripe(env, path, { method = 'GET', params } = {}) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params ? new URLSearchParams(params).toString() : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

async function handleCheckout(request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Please sign in first.' }, 401);
  // The body is ignored on purpose: identity comes from the session only.
  const { ok, data } = await stripe(env, '/checkout/sessions', {
    method: 'POST',
    params: {
      'payment_method_types[]': 'card',
      'line_items[0][price]': env.STRIPE_PRICE_ID,
      'line_items[0][quantity]': '1',
      mode: 'subscription',
      'subscription_data[trial_period_days]': '7',
      success_url: `${SITE}/dashboard.html?upgraded=true`,
      cancel_url: `${SITE}/firepath_pro.html?cancelled=true`,
      ...(user.email ? { customer_email: user.email } : {}),
      client_reference_id: user.id,
      'metadata[user_id]': user.id,
      'subscription_data[metadata][user_id]': user.id
    }
  });
  if (!ok || !data.url) {
    console.error('Stripe checkout failed', data && data.error && data.error.message);
    return json({ error: "Couldn't start checkout. Please try again." }, 502);
  }
  return json({ url: data.url });
}

// Finds the signed-in user's subscription by the user_id we stamp on it at checkout.
async function findSubscription(user, env) {
  const query = encodeURIComponent(`metadata['user_id']:'${user.id.replace(/'/g, '')}'`);
  const { ok, data } = await stripe(env, `/subscriptions/search?query=${query}&limit=10`);
  const subs = ok && Array.isArray(data.data) ? data.data : [];
  return subs.find(s => PRO_STATUSES.has(s.status)) || subs[0] || null;
}

async function handleBillingPortal(request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Please sign in first.' }, 401);
  const sub = await findSubscription(user, env);
  if (!sub) return json({ error: 'No subscription found for this account.' }, 404);
  const { ok, data } = await stripe(env, '/billing_portal/sessions', {
    method: 'POST',
    params: { customer: sub.customer, return_url: `${SITE}/account.html` }
  });
  if (!ok || !data.url) {
    console.error('Stripe portal failed', data && data.error && data.error.message);
    return json({ error: "Couldn't open billing right now." }, 502);
  }
  return json({ url: data.url });
}

async function handleBillingCancel(request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Please sign in first.' }, 401);
  const sub = await findSubscription(user, env);
  if (!sub || !PRO_STATUSES.has(sub.status)) return json({ error: 'No active subscription found.' }, 404);
  // Cancel at the end of the paid period; the webhook switches Pro off when it ends.
  const { ok, data } = await stripe(env, `/subscriptions/${encodeURIComponent(sub.id)}`, {
    method: 'POST',
    params: { cancel_at_period_end: 'true' }
  });
  if (!ok) {
    console.error('Stripe cancel failed', data && data.error && data.error.message);
    return json({ error: "Couldn't cancel right now." }, 502);
  }
  return json({ ok: true, endsAt: data.current_period_end || null });
}

async function verifyStripeSignature(body, header, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false;
  const parts = header.split(',').map(p => p.trim());
  const timestamp = parseInt((parts.find(p => p.startsWith('t=')) || '').slice(2), 10);
  const signatures = parts.filter(p => p.startsWith('v1=')).map(p => p.slice(3));
  if (!Number.isFinite(timestamp) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return false;   // replay protection
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`));
  const expected = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
  return signatures.some(sig => timingSafeEqual(sig, expected));
}

async function sendEmail(env, subject, text) {
  if (!env.RESEND_API_KEY) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'FirePath <noreply@firepath.pro>', to: 'jwa7990@gmail.com', subject, text })
  }).catch(e => console.error('Email failed', e && e.message));
}

async function setUserPro(env, userId, isProNow) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/users`, {
    method: 'POST',
    headers: serviceHeaders(env, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }),
    body: JSON.stringify({ id: userId, is_pro: isProNow })
  });
  if (!res.ok) console.error('setUserPro failed', res.status, await res.text().catch(() => ''));
}

async function findUserIdByEmail(env, email) {
  if (!email) return null;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=id`, { headers: serviceHeaders(env) });
  const rows = await res.json().catch(() => []);
  return rows[0]?.id || null;
}

async function userIdForStripeObject(env, obj) {
  let userId = obj.client_reference_id || obj.metadata?.user_id || obj.subscription_details?.metadata?.user_id || null;
  if (!userId && obj.subscription) {
    const { data } = await stripe(env, `/subscriptions/${encodeURIComponent(obj.subscription)}`);
    userId = data?.metadata?.user_id || null;
  }
  if (!userId) {
    let email = obj.customer_email || obj.customer_details?.email || null;
    if (!email && obj.customer) {
      const { data } = await stripe(env, `/customers/${encodeURIComponent(obj.customer)}`);
      email = data?.email || null;
    }
    userId = await findUserIdByEmail(env, email);
  }
  return userId;
}

async function handleStripeWebhook(request, env) {
  const { text, error } = await readBody(request, 512 * 1024);
  if (error) return new Response('Too large', { status: 413 });
  const valid = await verifyStripeSignature(text, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return new Response('Invalid signature', { status: 400 });

  const event = JSON.parse(text);
  const obj = event.data?.object || {};

  switch (event.type) {
    case 'checkout.session.completed': {
      const userId = await userIdForStripeObject(env, obj);
      if (userId) await setUserPro(env, userId, true);
      await sendEmail(env, '🔥 New FirePath Pro subscriber!', `Someone just upgraded to Pro!\n\nEmail: ${obj.customer_email || obj.customer_details?.email || 'unknown'}\nUser ID: ${userId || 'unknown'}\nTime: ${new Date().toISOString()}`);
      break;
    }
    // Pro follows the subscription's real status — failed payments that Stripe
    // gives up on (unpaid / canceled / incomplete_expired) switch Pro off.
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const userId = await userIdForStripeObject(env, obj);
      if (userId) await setUserPro(env, userId, PRO_STATUSES.has(obj.status));
      break;
    }
    case 'invoice.payment_succeeded': {
      const userId = await userIdForStripeObject(env, obj);
      if (userId) await setUserPro(env, userId, true);
      break;
    }
    case 'customer.subscription.deleted': {
      const userId = await userIdForStripeObject(env, obj);
      if (userId) await setUserPro(env, userId, false);
      await sendEmail(env, '😔 FirePath Pro cancellation', `A subscriber has cancelled.\n\nUser ID: ${userId || 'unknown'}\nTime: ${new Date().toISOString()}`);
      break;
    }
  }
  return json({ received: true });
}

// ── Feedback notification (Supabase database webhook) ─────

async function handleFeedbackNotify(request, env) {
  if (!env.FEEDBACK_WEBHOOK_SECRET) {
    console.warn('FEEDBACK_WEBHOOK_SECRET not set — refusing feedback notifications');
    return json({ error: 'Not configured' }, 503);
  }
  if (!timingSafeEqual(request.headers.get('x-firepath-secret') || '', env.FEEDBACK_WEBHOOK_SECRET)) {
    return json({ error: 'Forbidden' }, 403);
  }
  const { data, error } = await readJson(request, 64 * 1024);
  if (error) return json({ error: 'Invalid request.' }, 400);
  const r = data.record || {};
  const clip = v => String(v ?? '-').slice(0, 2000);
  await sendEmail(env, '🔥 New FirePath feedback',
    `Rating: ${clip(r.rating || 'not rated')}\n\nWhat was missing: ${clip(r.gaps)}\n\nConfusing bits: ${clip(r.confusing)}\n\nWould bring them back: ${clip(r.bring_back)}\n\nInterest in Pro: ${clip(r.pro_interest)}\n\nAnything else: ${clip(r.other)}\n\nEmail: ${clip(r.email || 'not provided')}\nOn Pro: ${r.is_pro === true ? 'yes' : r.is_pro === false ? 'no' : 'unknown'}\nPage: ${clip(r.page_url || 'feedback page')}\nSubmitted: ${clip(r.submitted_at || 'unknown')}`);
  return json({ ok: true });
}

// ── Assumptions (public, cached RBA data) ─────────────────

const ASSUMPTIONS_CACHE_KEY = 'https://firepath.pro/assumptions-cache';

async function handleAssumptions() {
  const cache = caches.default;
  const cacheKey = new Request(ASSUMPTIONS_CACHE_KEY);
  const cached = await cache.match(cacheKey);
  if (cached) return json(await cached.json());

  let cashRate = 4.35, cpi = 3.7, source = 'fallback';
  try {
    const text = await (await fetch('https://www.rba.gov.au/statistics/tables/csv/f1-data.csv')).text();
    const lines = text.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) { const v = parseFloat(lines[i].split(',')[1]); if (!isNaN(v)) { cashRate = v; break; } }
    source = 'rba';
  } catch (e) { console.log('RBA cash rate fetch failed:', e.message); }
  try {
    const text = await (await fetch('https://www.rba.gov.au/statistics/tables/csv/g1-data.csv')).text();
    const rows = text.trim().split('\n').map(l => parseFloat(l.split(',')[1])).filter(v => !isNaN(v));
    if (rows.length >= 5) {
      const latest = rows[rows.length - 1], yearAgo = rows[rows.length - 5];
      cpi = Math.round(((latest - yearAgo) / yearAgo) * 1000) / 10;
    }
    source = source === 'rba' ? 'rba' : 'partial';
  } catch (e) { console.log('RBA CPI fetch failed:', e.message); }

  const assumptions = { cashRate, cpi, sgRate: 12, preservationAge: 60, source, fetchedAt: new Date().toISOString() };
  const response = new Response(JSON.stringify(assumptions), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' }
  });
  await cache.put(cacheKey, response.clone());
  return response;
}

async function handleClearCache(request, env) {
  if (!env.ADMIN_SECRET || !timingSafeEqual(request.headers.get('x-admin-secret') || '', env.ADMIN_SECRET)) {
    return json({ error: 'Not found' }, 404);
  }
  await caches.default.delete(new Request(ASSUMPTIONS_CACHE_KEY));
  return json({ ok: true, cleared: true });
}

// ── Router ────────────────────────────────────────────────

async function route(request, env, url) {
  const { pathname: path } = url;
  const method = request.method;

  if ((path === '/' || path === '/ai') && method === 'POST') return handleAi(request, env);
  if (path === '/stripe/checkout' && method === 'POST') return handleCheckout(request, env);
  if (path === '/billing/portal' && method === 'POST') return handleBillingPortal(request, env);
  if (path === '/billing/cancel' && method === 'POST') return handleBillingCancel(request, env);
  if (path === '/stripe/webhook' && method === 'POST') return handleStripeWebhook(request, env);
  if (path === '/notify/feedback' && method === 'POST') return handleFeedbackNotify(request, env);
  if (path.startsWith('/db/')) return handleDb(request, env, url);
  if (path.startsWith('/auth/')) return handleAuth(request, env, url);
  if (path === '/assumptions' && method === 'GET') return handleAssumptions();
  if (path === '/assumptions/clear-cache' && method === 'GET') return handleClearCache(request, env);
  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return originAllowed(origin, env)
        ? new Response(null, { status: 204, headers: corsHeaders(origin, env) })
        : new Response(null, { status: 403 });
    }
    // A browser calling from someone else's site is refused outright.
    // (Server-to-server callers — Stripe, Supabase webhooks — send no Origin.)
    if (origin && !originAllowed(origin, env)) return json({ error: 'Forbidden' }, 403);

    try {
      const response = await route(request, env, new URL(request.url));
      return finalise(response, origin, env);
    } catch (e) {
      console.error('Unhandled error', e && e.stack || e);
      return finalise(json({ error: 'Something went wrong.' }, 500), origin, env);
    }
  }
};

// Exposed for tests only.
export const _internal = { RATE_LIMITS, sanitiseFeedback, sanitiseAiRequest, verifyStripeSignature, originAllowed, timingSafeEqual, DB_RULES, AI };
