// Analytics of observed shop listings, not exchange trades or an order book.
import { DAY, median } from './market-data.js';
export const HOUR = 3600000;
export const PERIODS = [1, 6, 24, 168];
const summarize = (rows) => rows.length ? {
  n: rows.length, median: median(rows.map((r) => r.price)),
  low: Math.min(...rows.map((r) => r.price)), high: Math.max(...rows.map((r) => r.price))
} : null;

export function priceProfile(rows, maxBins = 8) {
  if (!rows.length) return { bins: [], levels: [], peak: null, total: 0 };
  const prices = rows.map((r) => r.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  // Inclusive integer bounds: a price on an edge belongs to exactly one band.
  const count = Math.min(maxBins, new Set(prices).size);
  const width = Math.max(1, Math.ceil((high - low + 1) / count));
  const bins = Array.from({ length: Math.ceil((high - low + 1) / width) }, (_, i) => ({
    from: low + i * width, to: Math.min(high, low + (i + 1) * width - 1), count: 0
  }));
  const byPrice = new Map();
  for (const r of rows) {
    bins[Math.floor((r.price - low) / width)].count++;
    byPrice.set(r.price, (byPrice.get(r.price) || 0) + 1);
  }
  let cumulative = 0;
  const levels = [...byPrice].sort((a, b) => a[0] - b[0]).map(([price, count]) => ({ price, count, cumulative: cumulative += count }));
  const peak = bins.reduce((a, b) => b.count > a.count ? b : a);
  return { bins, levels, peak: { ...peak, share: peak.count / rows.length }, total: rows.length };
}

export function analyzeMarket(rows, { now = Date.now(), hours = 24, profileRows = rows } = {}) {
  if (!PERIODS.includes(hours)) hours = 24;
  const observed = rows.filter((r) => Number.isInteger(r.price) && r.price > 0 && Number.isFinite(r.t) && r.t > now - hours * HOUR && r.t <= now);
  const profileHours = Math.min(hours, 24);
  const profile = priceProfile(profileRows.filter((r) => !r.sold && Number.isInteger(r.price) && r.price > 0 && r.t > now - profileHours * HOUR && r.t <= now));
  if (!observed.length) return { rows: [], buckets: [], profile, hours, profileHours, from: null, to: null,
    asking: null, sold: null, changes: { asking: null, sold: null } };
  const first = Math.min(...observed.map((r) => r.t));
  const last = Math.max(...observed.map((r) => r.t));
  // Fit the actual observed interval, so a new dataset isn't squeezed into the last pixel of a seven-day chart.
  const steps = [5 * 60000, 15 * 60000, 30 * 60000, HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY];
  const step = steps.find((s) => s >= (last - first) / 12) || DAY;
  const from = Math.floor(first / step) * step;
  const to = (Math.floor(last / step) + 1) * step;
  const buckets = Array.from({ length: Math.round((to - from) / step) }, (_, i) => ({ from: from + i * step, to: from + (i + 1) * step, rows: [] }));
  for (const r of observed) buckets[Math.floor((r.t - from) / step)].rows.push(r);
  for (const b of buckets) {
    b.t = (b.from + b.to) / 2;
    b.asking = summarize(b.rows.filter((r) => !r.sold));
    b.sold = summarize(b.rows.filter((r) => r.sold));
  }
  const changes = Object.fromEntries(['asking', 'sold'].map((kind) => {
    const points = buckets.filter((b) => b[kind]);
    const start = points[0]?.[kind].median;
    const end = points.at(-1)?.[kind].median;
    return [kind, points.length < 2 ? null : { from: start, to: end, delta: end - start, percent: (end - start) / start * 100 }];
  }));
  return { rows: observed, buckets, profile, hours, profileHours, from, to, first, last, changes,
    asking: summarize(observed.filter((r) => !r.sold)), sold: summarize(observed.filter((r) => r.sold)) };
}
