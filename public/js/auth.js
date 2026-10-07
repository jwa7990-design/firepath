/* ============================================================
   FirePath — Shared Auth Engine
   /js/auth.js

   One place for the signed-in session: tokens, keeping them fresh, Pro status,
   saving rows, the small "couldn't save" note, and signing out.

   Pages use the globals below (getToken, requirePro, dbInsert, signOut…) or the
   same things on window.FirePathAuth. For any call to the Worker that needs the
   person's session, use FirePathAuth.fetch(url, options): it adds the session,
   refreshes it when it is about to run out, and retries once after a 401.
   ============================================================ */

const WORKER_URL = 'https://firepath-api.jwa7990.workers.dev';

/* ── Storage helpers ───────────────────────────────────────
   Falls back to sessionStorage in private/incognito mode.
──────────────────────────────────────────────────────────── */
function setStore(key, value) {
  try { localStorage.setItem(key, value); }
  catch(e) { try { sessionStorage.setItem(key, value); } catch(e2) {} }
}

function getStore(key) {
  try { const v = localStorage.getItem(key); if (v) return v; }
  catch(e) {}
  try { return sessionStorage.getItem(key); } catch(e) { return null; }
}

function removeStore(key) {
  try { localStorage.removeItem(key); } catch(e) {}
  try { sessionStorage.removeItem(key); } catch(e) {}
}

/* ── Token helpers ─────────────────────────────────────────
   Returns clean token/userId or null if missing/invalid.
──────────────────────────────────────────────────────────── */
function getToken() {
  const t = getStore('fp_access_token');
  return (t && t !== 'undefined' && t !== 'null') ? t : null;
}

function getUserId() {
  const u = getStore('fp_user_id');
  return (u && u !== 'undefined' && u !== 'null') ? u : null;
}

function getEmail() {
  return getStore('fp_email') || null;
}

function isGuest() {
  return getStore('fp_guest') === 'true';
}

function isLoggedIn() {
  return getToken() !== null && getUserId() !== null;
}

/* ── AI request headers ────────────────────────────────────
   Every call to FirePath AI must carry the signed-in user's session — the
   Worker checks it (and Pro status) before anything reaches Anthropic.
   Prefer FirePathAuth.fetch(), which also keeps the session fresh.
──────────────────────────────────────────────────────────── */
function aiHeaders() {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

window.FirePathAuth = (function () {
  // Everything that makes up "being signed in". Cleared when a session ends.
  const SESSION_KEYS = ['fp_access_token', 'fp_refresh_token', 'fp_user_id', 'fp_email', 'fp_is_pro', 'fp_guest'];
  // Signing out clears every fp_*, ap_* and hmo_* key (money figures, plans, check-ins,
  // reading progress) EXCEPT these: fp_situation is the free calculator's device
  // copy, which has its own "Clear" button; fp_persona is only how FirePath talks
  // to you (beginner / building / fire) and holds no money details.
  const KEEP_ON_SIGN_OUT = new Set(['fp_situation', 'fp_persona']);
  const USER_DATA_KEY = /^(fp|ap|hmo)_/;

  // The Worker passes this straight to Supabase: POST /auth/v1/token?grant_type=refresh_token
  const REFRESH_URL = `${WORKER_URL}/auth/token?grant_type=refresh_token`;
  const REFRESH_EARLY_MS = 5 * 60 * 1000;   // refresh once less than 5 minutes are left

  const SAVE_FAILED_MSG = 'We couldn’t save that just now. Please try again.';
  const INACTIVE_MSG = 'You’ve been signed out because you were away for a while.';

  /* ── Session expiry (scheduling only) ──
     Reads exp from the token without checking its signature. That is fine for
     deciding WHEN to refresh; it is never used to decide who someone is. */
  function tokenExpiresAt(token) {
    try {
      const part = String(token).split('.')[1];
      if (!part) return null;
      const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4);
      const exp = JSON.parse(atob(b64)).exp;
      return typeof exp === 'number' ? exp * 1000 : null;
    } catch (e) { return null; }
  }

  function getRefreshToken() {
    const t = getStore('fp_refresh_token');
    return (t && t !== 'undefined' && t !== 'null') ? t : null;
  }

  let refreshing = null;
  let refreshTimer = null;

  // Swaps the refresh token for a fresh session. One refresh at a time, shared by
  // every caller. Resolves { ok: true } or { ok: false, reason }, where reason is
  // 'no_refresh_token' | 'network' (try later, keep the session) |
  // 'unsupported' (the Worker has no refresh route) | 'rejected' (session is over).
  function refreshSession() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return { ok: false, reason: 'no_refresh_token' };
      let res;
      try {
        res = await fetch(REFRESH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken })
        });
      } catch (e) {
        console.warn('Session refresh failed (network)', e);
        return { ok: false, reason: 'network' };
      }
      if (res.status >= 500) { console.warn('Session refresh failed', res.status); return { ok: false, reason: 'network' }; }
      if (!res.ok) {
        console.warn('Session refresh refused', res.status);
        return { ok: false, reason: res.status === 404 ? 'unsupported' : 'rejected' };
      }
      let data = null;
      try { data = await res.json(); } catch (e) {}
      if (!data || !data.access_token) return { ok: false, reason: 'rejected' };
      setStore('fp_access_token', data.access_token);
      if (data.refresh_token) setStore('fp_refresh_token', data.refresh_token);
      scheduleRefresh();
      return { ok: true };
    })();
    refreshing.then(() => { refreshing = null; }, () => { refreshing = null; });
    return refreshing;
  }

  // Refreshes first if the current session runs out within 5 minutes.
  async function ensureFresh() {
    const token = getToken();
    if (!token || !getRefreshToken()) return;
    const exp = tokenExpiresAt(token);
    if (exp && exp - Date.now() < REFRESH_EARLY_MS) await refreshSession();
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    const token = getToken();
    if (!token || !getRefreshToken()) return;
    const exp = tokenExpiresAt(token);
    if (!exp) return;
    const wait = Math.max(0, exp - Date.now() - REFRESH_EARLY_MS);
    refreshTimer = setTimeout(() => { refreshSession(); }, Math.min(wait, 2147483647));
  }

  function clearSession() {
    clearTimeout(refreshTimer);
    SESSION_KEYS.forEach(removeStore);
  }

  // The session can't be renewed: forget it and, unless the caller handles it,
  // send the person to sign in again with a friendly note.
  function sessionEnded(onExpired) {
    clearSession();
    if (onExpired === 'redirect' && !/\/auth(\.html)?$/.test(window.location.pathname || '')) {
      window.location.href = 'auth.html?expired=1';
    }
  }

  function withSession(options, token) {
    const headers = Object.assign({}, (options && options.headers) || {});
    delete headers.authorization;
    if (token) headers.Authorization = `Bearer ${token}`;
    else delete headers.Authorization;
    return Object.assign({}, options, { headers });
  }

  // fetch() with the person's session attached. Refreshes early, and after a 401
  // refreshes and retries once. If the session truly can't be renewed it is
  // cleared and (by default) the person is sent to sign in.
  // opts.onExpired: 'redirect' (default) | 'none'. Network errors still throw.
  async function authFetch(url, options = {}, opts = {}) {
    const onExpired = opts.onExpired || 'redirect';
    await ensureFresh();
    const usedToken = getToken();
    const res = await fetch(url, withSession(options, usedToken));
    if (res.status !== 401 || !usedToken) return res;

    let current = getToken();
    if (!current || current === usedToken) {      // another tab may already have refreshed
      const r = await refreshSession();
      if (!r.ok) {
        if (r.reason !== 'network') sessionEnded(onExpired);
        return res;
      }
      current = getToken();
    }
    const retry = await fetch(url, withSession(options, current));
    if (retry.status === 401) sessionEnded(onExpired);
    return retry;
  }

  /* ── Small note at the bottom of the screen ──
     Plain text, read out by screen readers, never blocks anything. */
  let toastEl = null, toastTimer = null;
  function notify(message, opts = {}) {
    const show = () => {
      if (!toastEl || !toastEl.isConnected) {
        toastEl = document.createElement('div');
        toastEl.id = 'fp-toast';
        toastEl.setAttribute('role', 'status');
        toastEl.setAttribute('aria-live', 'polite');
        toastEl.style.cssText = [
          'position:fixed', 'left:50%', 'bottom:calc(20px + env(safe-area-inset-bottom, 0px))',
          'transform:translateX(-50%)', 'z-index:10000', 'max-width:min(440px, calc(100vw - 32px))',
          'padding:12px 18px', 'border-radius:var(--r-sm, 10px)', 'background:var(--ink, #2B1D14)',
          'color:var(--surface, #FFFFFF)', 'font:500 14px/1.45 var(--font-ui, system-ui, sans-serif)',
          'box-shadow:0 10px 28px -8px rgba(43,29,20,0.35)', 'text-align:center', 'pointer-events:none',
          'transition:opacity 0.2s ease', 'opacity:0'
        ].join(';');
        document.body.appendChild(toastEl);
      }
      toastEl.textContent = String(message == null ? '' : message);
      toastEl.style.opacity = '1';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { if (toastEl) toastEl.style.opacity = '0'; }, opts.timeout || 5000);
    };
    if (document.body) show();
    else document.addEventListener('DOMContentLoaded', show, { once: true });
  }

  /* ── Pro status ──
     Asks the database. Only when the check can't get through (offline, or the
     server is having a moment) is the last known answer used, so a paying member
     isn't bounced by a hiccup. A 401/403 means the session is no good: it is
     cleared, along with the cached Pro flag. */
  async function checkProStatus() {
    const userId = getUserId();
    if (!userId || !getToken()) return false;
    const cached = () => getStore('fp_is_pro') === 'true';
    let res;
    try {
      res = await authFetch(`${WORKER_URL}/db/users?id=eq.${encodeURIComponent(userId)}&select=is_pro`, {}, { onExpired: 'none' });
    } catch (e) {
      console.warn('Pro check failed (network) — using the last known status', e);
      return cached();
    }
    if (res.status === 401 || res.status === 403) { clearSession(); return false; }
    if (res.status >= 500) { console.warn('Pro check failed', res.status, '— using the last known status'); return cached(); }
    if (!res.ok) { console.warn('Pro check refused', res.status); removeStore('fp_is_pro'); return false; }
    let data;
    try { data = await res.json(); } catch (e) { return cached(); }
    const isPro = Array.isArray(data) && data[0] && data[0].is_pro === true;
    setStore('fp_is_pro', isPro ? 'true' : 'false');
    return isPro;
  }

  /* ── Saving a row ──
     Returns { ok: true } or { ok: false, status?, error }. Failures are logged and,
     unless opts.quiet, the person sees "We couldn't save that just now…".
     opts.prefer overrides the Prefer header (e.g. 'resolution=merge-duplicates'). */
  async function dbInsert(table, data, opts = {}) {
    const userId = getUserId();
    if (!getToken() || !userId) return { ok: false, error: 'signed_out' };
    let res;
    try {
      res = await authFetch(`${WORKER_URL}/db/${table}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Prefer': opts.prefer || 'return=minimal' },
        body: JSON.stringify(Object.assign({}, data, { user_id: userId }))
      });
    } catch (e) {
      console.error(`Save to ${table} failed (network)`, e);
      if (!opts.quiet) notify(SAVE_FAILED_MSG);
      return { ok: false, error: 'network' };
    }
    if (!res.ok) {
      console.error(`Save to ${table} failed`, res.status);
      if (!opts.quiet) notify(SAVE_FAILED_MSG);
      return { ok: false, status: res.status, error: 'http' };
    }
    return { ok: true, status: res.status };
  }

  /* ── Sign out — the one way out ──
     Tells the Worker (best effort, this device only), clears the session and the
     money details this browser holds, then goes home. opts.message is shown
     first; opts.redirect changes where it goes. */
  function clearUserData() {
    clearSession();
    [() => localStorage, () => sessionStorage].forEach(get => {
      let store;
      try { store = get(); } catch (e) { return; }
      if (!store) return;
      const keys = [];
      try { for (let i = 0; i < store.length; i++) keys.push(store.key(i)); } catch (e) { return; }
      keys.forEach(k => {
        if (k && USER_DATA_KEY.test(k) && !KEEP_ON_SIGN_OUT.has(k)) { try { store.removeItem(k); } catch (e) {} }
      });
    });
  }

  function signOut(opts) {
    const o = (opts && typeof opts === 'object' && !('target' in opts)) ? opts : {};
    const token = getToken();
    if (token) {
      try {
        fetch(`${WORKER_URL}/auth/logout?scope=local`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          keepalive: true
        }).catch(() => {});
      } catch (e) {}
    }
    clearUserData();
    if (o.message) { try { alert(o.message); } catch (e) {} }
    window.location.href = o.redirect || '/';
  }

  // Keep the session fresh while the page is open, and when a tab comes back.
  scheduleRefresh();
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') ensureFresh().catch(() => {});
    });
  }

  return {
    fetch: authFetch, refresh: refreshSession, ensureFresh, clearSession, clearUserData,
    signOut, notify, checkProStatus, dbInsert,
    getToken, getUserId, getEmail, isLoggedIn,
    SAVE_FAILED_MSG, INACTIVE_MSG,
    _tokenExpiresAt: tokenExpiresAt
  };
})();

/* ── Sign out ──────────────────────────────────────────────
   See FirePathAuth.signOut above.
──────────────────────────────────────────────────────────── */
function signOut(opts) { return FirePathAuth.signOut(opts); }

/* ── Check Pro status ──────────────────────────────────────
   See FirePathAuth.checkProStatus above.
──────────────────────────────────────────────────────────── */
function checkProStatus() { return FirePathAuth.checkProStatus(); }

/* ── Accounts are part of Pro ──────────────────────────────
   Free tools need no account; signing in is for Pro members. Call at the top
   of every signed-in page:   if (!(await requirePro())) return;
   Signed out → sign-in page. Signed in without Pro → the upgrade page, which
   explains why and has a working "start your free trial" button.
──────────────────────────────────────────────────────────── */
async function requirePro() {
  if (!isLoggedIn()) { window.location.href = 'auth.html'; return false; }
  if (await checkProStatus()) return true;
  // The check found the session was no good (and cleared it): sign in again.
  if (!isLoggedIn()) { window.location.href = 'auth.html?expired=1'; return false; }
  // Straight back from Stripe? Pro may take a few seconds to land — the upgrade
  // page waits for it rather than asking someone who just paid to pay again.
  const justPaid = new URLSearchParams(window.location.search).get('upgraded') === 'true';
  window.location.href = 'upgrade.html' + (justPaid ? '?upgraded=true' : '');
  return false;
}

/* ── Upgrade to Pro ────────────────────────────────────────
   Redirects to Stripe checkout.
──────────────────────────────────────────────────────────── */
async function upgradeToPro() {
  if (!isLoggedIn()) { window.location.href = 'auth.html'; return; }
  try {
    const res = await FirePathAuth.fetch(`${WORKER_URL}/stripe/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})   // the Worker takes who you are from the session only
    });
    const data = res.ok ? await res.json() : null;
    if (data && data.url) window.location.href = data.url;
    else if (isLoggedIn()) alert('We couldn’t open checkout just now. Please try again in a minute.');
  } catch(e) {
    alert('We couldn’t open checkout just now. Please try again in a minute.');
  }
}

/* ── DB insert helper ──────────────────────────────────────
   Inserts a row into a Supabase table via the Worker. Returns { ok, ... };
   on failure it logs and shows "We couldn't save that just now…".
──────────────────────────────────────────────────────────── */
function dbInsert(table, data, opts) { return FirePathAuth.dbInsert(table, data, opts); }

/* ── Inactivity timer ──────────────────────────────────────
   Signs out after 20 minutes of inactivity.
──────────────────────────────────────────────────────────── */
let _inactivityTimer;
function resetInactivityTimer() {
  clearTimeout(_inactivityTimer);
  _inactivityTimer = setTimeout(() => {
    if (getToken()) FirePathAuth.signOut({ message: FirePathAuth.INACTIVE_MSG });
  }, 20 * 60 * 1000);
}
['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(e =>
  document.addEventListener(e, resetInactivityTimer, { passive: true })
);
resetInactivityTimer();
