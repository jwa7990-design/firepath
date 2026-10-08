/* ============================================================
   FirePath — Move status (Pro journey)
   /js/moves-status.js

   Where a Pro member stands on each option ("move") from js/moves.js:
   'doing' (On it), 'done' (Done) or 'dismissed' (Not for me). Saved in the
   fp_moves table through the Worker, one row per person per move.

     const statuses = await FirePathMoveStatus.load();          // { moveId: { status, done_at, updated_at } }
     const p = FirePathMoves.plan(situation, statuses);         // open / done / dismissed / progress
     await FirePathMoveStatus.set('build-buffer', 'done');      // { ok }
     await FirePathMoveStatus.undo('build-buffer');             // back to what it was before

   There is no delete: "Bring it back" (or undo with nothing to go back to) sets
   the status to 'doing'.

   Needs js/auth.js loaded first (FirePathAuth.fetch, WORKER_URL).
   ============================================================ */

window.FirePathMoveStatus = (function () {
  const BASE = typeof WORKER_URL !== 'undefined' ? WORKER_URL : 'https://firepath-api.jwa7990.workers.dev';
  const STATUSES = ['doing', 'done', 'dismissed'];
  const ID_RE = /^[a-z0-9-]{1,64}$/;
  // The Worker forwards both of these (PREFER_ALLOWED), so this is a true upsert.
  const PREFER = 'resolution=merge-duplicates,return=minimal';

  let cache = null;          // { moveId: { status, done_at, updated_at } } once loaded
  let inflight = null;
  const history = {};        // moveId → [earlier rows (or null)], for undo

  const auth = () => window.FirePathAuth;
  const copyRow = r => ({ status: r.status, done_at: r.done_at || null, updated_at: r.updated_at || null });
  const copyMap = m => { const out = {}; for (const k in m) out[k] = copyRow(m[k]); return out; };
  const signedIn = () => { const a = auth(); return !!(a && a.getToken() && a.getUserId()); };

  // The person's statuses. Cached for this page; opts.refresh asks again.
  // Signed out or a failed read → {} (not cached, so the next call tries again).
  async function load(opts) {
    if (cache && !(opts && opts.refresh)) return copyMap(cache);
    if (!signedIn()) return {};
    if (!inflight) {
      inflight = (async () => {
        try {
          const res = await auth().fetch(`${BASE}/db/fp_moves?select=move_id,status,done_at,updated_at`);
          if (!res.ok) { console.warn('Move status load failed', res.status); return null; }
          const rows = await res.json();
          const map = {};
          if (Array.isArray(rows)) for (const r of rows) {
            if (r && ID_RE.test(r.move_id) && STATUSES.includes(r.status)) map[r.move_id] = copyRow(r);
          }
          cache = map;
          return map;
        } catch (e) {
          console.warn('Move status load failed (network)', e);
          return null;
        } finally {
          inflight = null;
        }
      })();
    }
    const map = await inflight;
    return map ? copyMap(map) : {};
  }

  async function write(moveId, status, doneAt) {
    if (!ID_RE.test(String(moveId)) || !STATUSES.includes(status)) return { ok: false, error: 'invalid' };
    const a = auth();
    if (!signedIn()) return { ok: false, error: 'signed_out' };
    const now = new Date().toISOString();
    const row = { user_id: a.getUserId(), move_id: moveId, status, done_at: status === 'done' ? (doneAt || now) : null, updated_at: now };
    let res;
    try {
      res = await a.fetch(`${BASE}/db/fp_moves?on_conflict=user_id,move_id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: PREFER },
        body: JSON.stringify(row)
      });
    } catch (e) {
      console.error('Saving move status failed (network)', e);
      a.notify(a.SAVE_FAILED_MSG);
      return { ok: false, error: 'network' };
    }
    if (!res.ok) {
      console.error('Saving move status failed', res.status);
      a.notify(a.SAVE_FAILED_MSG);
      return { ok: false, status: res.status, error: 'http' };
    }
    if (!cache) cache = {};
    cache[moveId] = copyRow(row);
    return { ok: true };
  }

  // Save a status ('doing' | 'done' | 'dismissed'). done_at is now for 'done', else null.
  // Returns { ok: true } or { ok: false, error, status? }; a failed save shows the usual note.
  async function set(moveId, status) {
    if (!cache && signedIn()) await load();             // so undo knows what it was before
    const before = cache && cache[moveId] ? copyRow(cache[moveId]) : null;
    const r = await write(moveId, status);
    if (r.ok) (history[moveId] = history[moveId] || []).push(before);
    return r;
  }

  // Put a move back to its status before the last set() on this page (keeping its
  // original done date). With nothing to go back to, it becomes 'doing'.
  async function undo(moveId) {
    const stack = history[moveId] || [];
    const prev = stack.length ? stack[stack.length - 1] : null;
    const r = prev ? await write(moveId, prev.status, prev.done_at) : await write(moveId, 'doing');
    if (r.ok && stack.length) stack.pop();
    return r;
  }

  return { load, set, undo, STATUSES };
})();
