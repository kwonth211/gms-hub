// What a browser remembers about the market without an account: the wishlist, recently opened items and the
// price snapshot seen at the last visit. Pure functions; storage access lives in the page scripts.
export const WISHLIST_KEY = 'gms-market-wishlist';
export const RECENT_KEY = 'gms-market-recent';
export const SEEN_KEY = 'gms-market-seen';
export const WISHLIST_MAX = 50;
export const RECENT_MAX = 10;
const HOUR = 3600000;
const MIN_SAMPLE = 3;

const validId = (id) => Number.isInteger(id) && id >= 1000000 && id <= 9999999;

export function readList(raw) {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v.filter(validId) : [];
  } catch {
    return [];
  }
}

// Newest first, one entry per item, bounded. Reopening an item moves it to the front instead of adding a copy.
export function addRecent(list, id, max = RECENT_MAX) {
  if (!validId(id)) return list;
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}
export const removeRecent = (list, id) => list.filter((x) => x !== id);

// Toggle an item in the wishlist; refuses to grow past the cap so storage stays small and the list stays readable.
export function toggleWishlist(set, id, max = WISHLIST_MAX) {
  if (!validId(id)) return { ok: false, reason: 'invalid', added: false };
  if (set.has(id)) {
    set.delete(id);
    return { ok: true, added: false };
  }
  if (set.size >= max) return { ok: false, reason: 'full', added: false };
  set.add(id);
  return { ok: true, added: true };
}

// Snapshot of the catalog summary at the moment an item was opened: asking median and count of open listings (24h).
export function snapshot(summary, at = Date.now()) {
  return { t: at, m: summary?.median ?? null, o: summary?.open ?? 0 };
}

// Change since the previous visit, or null when there is nothing honest to compare: no earlier visit, a visit in the
// same hour (a refresh is not a return), a missing median on either side, or fewer than three open listings on either side.
export function visitDelta(prev, cur, now = Date.now()) {
  if (!prev || !cur || typeof prev.t !== 'number') return null;
  if (now - prev.t < HOUR) return null;
  if (prev.m == null || cur.m == null || prev.o < MIN_SAMPLE || cur.o < MIN_SAMPLE) return null;
  return { since: prev.t, from: prev.m, to: cur.m, pct: Math.round(((cur.m - prev.m) / prev.m) * 1000) / 10 };
}

// Keep snapshots only for items the browser still cares about, so the store never grows with every item ever opened.
export function pruneSeen(seen, keep) {
  const out = {};
  for (const id of keep) if (seen[id]) out[id] = seen[id];
  return out;
}
