// Exact, observed equipment values shared by links, the market UI and the API.
// Scroll tiers and fixed weapon properties belong to the item itself, not a listing filter.
const MAX = { PAD:255, MAD:255, STR:255, DEX:255, INT:255, LUK:255, ACC:255, EVA:255, MHP:5000, MMP:5000, PDD:999, MDD:999, Speed:255, Jump:255, CRT:255, CRD:255 };
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const integer = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

export function optionFilter(raw) {
  if (!object(raw) || raw.scroll) return null;
  const out = {}, stats = {};
  if (object(raw.stats)) for (const [key, max] of Object.entries(MAX)) {
    if (integer(raw.stats[key], -99, max)) stats[key] = raw.stats[key];
  }
  if (Object.keys(stats).length) out.stats = stats;
  for (const key of ['slots', 'ups']) if (integer(raw[key], 0, 20)) out[key] = raw[key];
  return Object.keys(out).length ? out : null;
}

export const encodeOptionFilter = (raw) => {
  const filter = optionFilter(raw);
  return filter ? JSON.stringify(filter) : '';
};

// Invalid filters never silently turn into an unfiltered API query.
export function parseOptionFilter(text) {
  if (typeof text !== 'string' || !text || text.length > 1024) return null;
  let raw;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!object(raw) || Object.keys(raw).some((k) => !['stats', 'slots', 'ups'].includes(k))) return null;
  if ('stats' in raw && (!object(raw.stats) || Object.entries(raw.stats).some(([k,v]) => !Object.hasOwn(MAX,k) || !integer(v,-99,MAX[k])))) return null;
  for (const key of ['slots','ups']) if (key in raw && !integer(raw[key],0,20)) return null;
  return optionFilter(raw);
}

export function optionFilterEntries(filter) {
  return [...Object.entries(filter.stats || {}).map(([k,v]) => [`$.stats.${k}`,v]),
    ...['slots','ups'].filter((k) => filter[k] !== undefined).map((k) => [`$.${k}`,filter[k]])];
}

export function matchesOptionFilter(observed, filter) {
  if (!observed || !filter) return false;
  return Object.entries(filter.stats || {}).every(([k,v]) => observed.stats?.[k] === v) &&
    ['slots','ups'].every(k => filter[k] === undefined || observed[k] === filter[k]);
}
