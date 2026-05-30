/* ============================================================
   FirePath — Shared Auth Engine
   /js/auth.js
   ============================================================ */

const WORKER_URL = 'https://firepath-api.jwa7990.workers.dev';

/* ── Storage helpers ───────────────────────────────────────
   Falls back to sessionStorage in private/incognito mode.
──────────────────────────────────────────────────────────── */
function setStore(key, value) {
  try { localStorage.setItem(key, value); }
  catch(e) { sessionStorage.setItem(key, value); }
}

function getStore(key) {
  try { const v = localStorage.getItem(key); if (v) return v; }
  catch(e) {}
  return sessionStorage.getItem(key);
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

/* ── Sign out ──────────────────────────────────────────────
   Clears all auth state and redirects to auth page.
──────────────────────────────────────────────────────────── */
function signOut() {
  ['fp_access_token', 'fp_user_id', 'fp_email', 'fp_persona', 'fp_guest'].forEach(k => removeStore(k));
  window.location.href = 'auth.html';
}

/* ── Check Pro status ──────────────────────────────────────
   Fetches is_pro from DB and updates UI accordingly.
   Shows/hides upgrade nudge and menu upgrade button.
──────────────────────────────────────────────────────────── */
async function checkProStatus() {
  const userId = getUserId();
  const token  = getToken();
  if (!userId || !token) return false;
  try {
    const res  = await fetch(`${WORKER_URL}/db/users?id=eq.${userId}&select=is_pro`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const isPro = data[0]?.is_pro === true;
    setStore('fp_is_pro', isPro ? 'true' : 'false');
    const nudge = document.getElementById('upgradeNudge');
    if (nudge) nudge.style.display = isPro ? 'none' : 'block';
    const menuUpgrade = document.getElementById('menuUpgradeBtn');
    if (menuUpgrade) menuUpgrade.style.display = isPro ? 'none' : 'block';
    return isPro;
  } catch(e) {
    console.log('Pro check failed', e);
    return false;
  }
}

/* ── Upgrade to Pro ────────────────────────────────────────
   Redirects to Stripe checkout.
──────────────────────────────────────────────────────────── */
async function upgradeToPro() {
  const userId = getUserId();
  const email  = getEmail();
  if (!userId || !email) { window.location.href = 'auth.html'; return; }
  try {
    const res  = await fetch(`${WORKER_URL}/stripe/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, email })
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else alert('Something went wrong. Please try again.');
  } catch(e) {
    alert('Something went wrong. Please try again.');
  }
}

/* ── DB insert helper ──────────────────────────────────────
   Inserts a row into a Supabase table via the Worker.
──────────────────────────────────────────────────────────── */
async function dbInsert(table, data) {
  const token  = getToken();
  const userId = getUserId();
  if (!token || !userId) return;
  try {
    await fetch(`${WORKER_URL}/db/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ ...data, user_id: userId })
    });
  } catch(e) {
    console.log('DB insert failed', e);
  }
}

/* ── Inactivity timer ──────────────────────────────────────
   Signs out after 20 minutes of inactivity.
──────────────────────────────────────────────────────────── */
let _inactivityTimer;
function resetInactivityTimer() {
  clearTimeout(_inactivityTimer);
  _inactivityTimer = setTimeout(() => {
    if (getToken()) {
      ['fp_access_token', 'fp_user_id', 'fp_email', 'fp_persona', 'fp_guest'].forEach(k => localStorage.removeItem(k));
      alert('You\'ve been signed out due to inactivity.');
      window.location.href = 'auth.html';
    }
  }, 20 * 60 * 1000);
}
['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(e =>
  document.addEventListener(e, resetInactivityTimer)
);
resetInactivityTimer();
