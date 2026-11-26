// Which browser settings follow a logged-in visitor between devices, and how two copies are merged. Pure functions,
// shared by assets/account.js and the tests. The server (worker/src/account.js) applies the same key rule.
//
// Synced: the settings pages already keep in localStorage — my character and its picture, calculator settings, quest
// checklists, wishlist, favourites, EXP log, megaphone nickname and delete keys, theme, ticker options and so on.
// Never synced: owner keys, the analytics "internal" flag, per-tab/live state and caches.
const KEY_RE = /^(gms|gmshub|fg-|mk-|cb_lang)[A-Za-z0-9_.\-]{0,80}$/;
const NEVER = new Set(['cb_admin_token', 'gms-traffic-key', 'gmshub_internal', 'gms-presence', 'gms-exp-session', 'gms-exp-client',
  'gms-market-catalog', 'gms-market-seen', 'gms-account', 'gms-sync-meta', 'gmshub_voted',
  // Caches the page rewrites by itself (owner 2026-11-26: a logged-in visitor's saves were refused): the header
  // megaphone ticker's last lines, rewritten on every megaphone, and the shop scan's place, rewritten every second.
  'gms-ticker-options-v1', 'gmshub_scan_loc']);
export const syncableKey = (k) => typeof k === 'string' && KEY_RE.test(k) && !NEVER.has(k) && !k.startsWith('gms-sync');
export const MAX_VALUE = 200 * 1024;

// A short fingerprint of a value, so a change made before this script loaded (or by another tab) is still noticed.
export function fingerprint(v) {
  if (v === null || v === undefined) return '';
  let h = 2166136261;
  for (let i = 0; i < v.length; i++) h = Math.imul(h ^ v.charCodeAt(i), 16777619);
  return `${v.length}:${(h >>> 0).toString(36)}`;
}

// local:  { key: string value }            what this browser holds now (syncable keys only)
// meta:   { key: { t, h } }                when this browser last changed / saw each key, and its fingerprint then
// server: { key: { v: string|null, t } }   the account's copy (v null = removed on another device)
// Returns what to write into this browser, what to send up, and the new meta.
// A key this browser never timed (it existed before the first login) counts as older than the account's copy, so the
// account wins on a new device; keys only this browser has are sent up.
export function plan(local, meta, server, now = Date.now()) {
  const apply = {}, push = {}, next = { ...meta };
  // Changes this browser made that meta does not know about yet (made before this script ran, or in another tab).
  for (const [k, v] of Object.entries(local)) {
    const m = meta[k];
    if (m && m.h !== fingerprint(v)) next[k] = { t: now, h: fingerprint(v) };
  }
  for (const k of Object.keys(meta)) if (!(k in local) && meta[k].h) next[k] = { t: now, h: '' }; // removed here
  const keys = new Set([...Object.keys(local), ...Object.keys(next), ...Object.keys(server || {})]);
  for (const k of keys) {
    if (!syncableKey(k)) continue;
    const have = k in local ? local[k] : null;
    const t = next[k]?.t || 0;
    const s = server?.[k];
    if (s && s.t > t) {
      if ((s.v ?? null) !== have) apply[k] = s.v ?? null;
      next[k] = { t: s.t, h: fingerprint(s.v ?? null) };
    } else if (!s || t > s.t) {
      if (have === null && !next[k]) continue; // nothing here, nothing there
      if (s && (s.v ?? null) === have) continue;
      if (have !== null && have.length > MAX_VALUE) continue;
      const when = t || now;
      push[k] = { v: have, t: when };
      next[k] = { t: when, h: fingerprint(have) };
    }
  }
  return { apply, push, meta: next };
}

// Splits what goes up into requests that stay under the worker's 64 KB body limit.
export function batches(push, limit = 56 * 1024) {
  const out = [];
  let cur = {}, size = 0;
  for (const [k, x] of Object.entries(push)) {
    const n = k.length + (x.v ? x.v.length : 4) + 40;
    if (n > limit) continue;
    if (size + n > limit && size) { out.push(cur); cur = {}; size = 0; }
    cur[k] = x; size += n;
  }
  if (size) out.push(cur);
  return out;
}
