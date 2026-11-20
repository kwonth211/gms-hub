import { parseUtc } from './market-data.js';

export const RADAR_WINDOW = 3600000;
// Catalog snapshots live for 15 minutes, plus the existing 5-minute edge cache and browser cache.
export const RADAR_REFERENCE_MAX_AGE = 25 * 60000;
// Equipment with different stats must never compete as if they were identical. Scrolls and stars use an exact ID.
export const radarEligible = (s) => [204, 207].includes(Math.floor(s.item / 10000)) &&
  s.open >= 5 && s.shops >= 2 && Number.isFinite(s.median) && s.median > 0 && s.low > 0 && s.low <= s.median * .9;

export function radarDeals(catalog, rows, now = Date.now()) {
  const at = Date.parse(catalog?.asOf);
  if (!Number.isFinite(at) || now - at > RADAR_REFERENCE_MAX_AGE || at > now + 60000) return [];
  const refs = new Map(catalog.items.filter(radarEligible).map((s) => [s.item, s]));
  const best = new Map();
  for (const r of rows) {
    const s = refs.get(r.item), seen = parseUtc(r.seen);
    if (!s || r.sold || r.goneN || r.opts || !r.seller || !r.channel || !r.room ||
      !Number.isFinite(seen) || seen > now || seen < now - RADAR_WINDOW ||
      !Number.isFinite(r.price) || r.price <= 0 || r.price > s.median * .9) continue;
    const old = best.get(r.item);
    if (!old || r.price < old.price || r.price === old.price && seen > parseUtc(old.seen)) {
      best.set(r.item, { ...r, median: s.median, sample: s.open, shops: s.shops,
        below: Math.floor((1 - r.price / s.median) * 100), saving: s.median - r.price });
    }
  }
  return [...best.values()].sort((a, b) => b.saving - a.saving || b.below - a.below || a.item - b.item).slice(0, 6);
}

export function marketSharePath({ fixed, pathname, itemPath, marketPath, id, opt }) {
  const path = fixed ? pathname : itemPath || `${marketPath}?item=${id}`;
  if (opt == null) return path;
  return `${path}${path.includes('?') ? '&' : '?'}opt=${encodeURIComponent(opt)}`;
}
