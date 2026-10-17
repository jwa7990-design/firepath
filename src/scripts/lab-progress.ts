/**
 * Learning Lab reading progress, kept on this device only (localStorage; never sent anywhere).
 * Articles call setLast() when opened and markRead() when the reader reaches the end;
 * the hub reads both for its dashboard. Every access is wrapped: private windows or blocked
 * storage just mean no progress is shown.
 */
const READ = 'fp_lab_read';
const LAST = 'fp_lab_last';

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: nothing to remember */ }
}

export function getRead(): string[] {
  const v = load<unknown>(READ, []);
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
}
export function markRead(slug: string) {
  const read = getRead();
  if (!read.includes(slug)) { read.push(slug); save(READ, read.slice(-500)); }
}
export function getLast(): { slug: string; at: number } | null {
  const v = load<{ slug?: unknown; at?: unknown } | null>(LAST, null);
  return v && typeof v.slug === 'string' ? { slug: v.slug, at: Number(v.at) || 0 } : null;
}
export function setLast(slug: string) { save(LAST, { slug, at: Date.now() }); }
export function forgetProgress() { try { localStorage.removeItem(READ); localStorage.removeItem(LAST); } catch { /* nothing to clear */ } }
