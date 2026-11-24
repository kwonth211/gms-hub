// Numbers behind the two 거래 tools (/tools/sell/, /tools/scroll-profit/). No DOM here, so tests/trade-math.test.mjs
// can run every rule.
//
// Listings come from /market/history: one point per listing per day it was on sale, `sold` set on its last day only.
// A listing keeps one price for its whole life, so seller + place + price + options names it.

const optKey = (o) => (o ? `${o.ups ?? ''}|${o.slots ?? ''}|${JSON.stringify(o.stats || {})}` : '');

// One row per listing: its latest sighting, sold when any of its days says so.
export function uniqueListings(rows) {
  const out = new Map();
  for (const r of rows || []) {
    if (!(r.price > 0)) continue;
    const key = `${r.seller}|${r.channel}|${r.room}|${r.price}|${optKey(r.opts)}`;
    const had = out.get(key);
    if (!had) out.set(key, { ...r, sold: r.sold ? 1 : 0 });
    else {
      if (r.sold) had.sold = 1;
      if (r.seen > had.seen) had.seen = r.seen;
    }
  }
  return [...out.values()];
}

const median = (sorted) => (sorted.length ? sorted[(sorted.length - 1) >> 1] : null);
const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null);
export const prices = (list) => list.map((r) => r.price).sort((a, b) => a - b);
export const medianPrice = (list) => median(prices(list));

// Share of listings that sold, by price band. Bands start out holding about the same number of listings each and
// never split one price in two. Neighbours are then joined until a dearer band never shows a higher share than a
// cheaper one (pool adjacent violators): with a few dozen listings per band the raw shares wobble, and "dearer sells
// better" is noise. A joined band is one band, so its share is always its own sold / n.
// Returns [{ lo, hi, n, sold, rate }] from cheap to dear, or [] when there is too little to say anything.
export function sellCurve(list, { bands, minBand = 8, minTotal = 24, minSold = 3 } = {}) {
  const rows = [...list].sort((a, b) => a.price - b.price);
  // More listings, finer bands: 4 at the least, 12 at the most, about 40 listings in each or more.
  bands ||= Math.min(12, Math.max(4, Math.floor(rows.length / 40)));
  const soldAll = rows.reduce((s, r) => s + (r.sold ? 1 : 0), 0);
  if (rows.length < minTotal || soldAll < minSold) return [];
  const size = Math.max(minBand, Math.ceil(rows.length / bands));
  const cut = [];
  let cur = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (cur && cur.n >= size && r.price !== cur.hi) { cut.push(cur); cur = null; }
    cur ||= { lo: r.price, hi: r.price, n: 0, sold: 0 };
    cur.hi = r.price; cur.n++; cur.sold += r.sold ? 1 : 0;
  }
  if (cur) {
    // A short tail joins the band before it.
    const last = cut[cut.length - 1];
    if (last && cur.n < Math.max(4, size / 2)) { last.hi = cur.hi; last.n += cur.n; last.sold += cur.sold; } else cut.push(cur);
  }
  const pools = [];
  for (const b of cut) {
    pools.push({ ...b });
    while (pools.length > 1) {
      const y = pools[pools.length - 1], x = pools[pools.length - 2];
      if (y.sold / y.n <= x.sold / x.n) break;
      pools.splice(pools.length - 2, 2, { lo: x.lo, hi: y.hi, n: x.n + y.n, sold: x.sold + y.sold });
    }
  }
  return pools.map((b) => ({ ...b, rate: b.sold / b.n }));
}

// The band a price falls in. Below the cheapest band counts as the cheapest, above the dearest as the dearest;
// between two bands the price belongs to the dearer one (it is dearer than everything in the cheaper band).
export function bandAt(curve, price) {
  if (!curve.length || !(price > 0)) return null;
  if (price < curve[0].lo) return { ...curve[0], index: 0, edge: 'below' };
  for (let i = 0; i < curve.length; i++) if (price <= curve[i].hi) return { ...curve[i], index: i, edge: null };
  return { ...curve[curve.length - 1], index: curve.length - 1, edge: 'above' };
}

// Prices to act on: `quick` is the dearest price in the bands where at least half sold, `slow` the price from which
// fewer than one in five sold (either is null when no band qualifies), `best` the band that sold most (the cheapest).
export function sellAdvice(curve, list) {
  if (!curve.length) return { quick: null, slow: null, best: null, soldMedian: null };
  const quick = [...curve].reverse().find((b) => b.rate >= 0.5);
  const slow = curve.find((b) => b.rate < 0.2);
  return { quick: quick ? quick.hi : null, quickRate: quick ? quick.rate : null, slow: slow ? slow.lo : null, slowRate: slow ? slow.rate : null,
    best: curve[0], soldMedian: medianPrice(list.filter((r) => r.sold)) };
}

// Where a price would stand among what is on sale now: how many are cheaper, how many ask the same.
export function rankAmong(open, price) {
  let cheaper = 0, same = 0;
  for (const r of open) { if (r.price < price) cheaper++; else if (r.price === price) same++; }
  return { cheaper, same, total: open.length, place: cheaper + 1 };
}

// ---------- gear options ----------
// Gear of one name is many different goods: clean, scrolled, slots left. A group is what a buyer would call the
// same piece: how many scrolls passed, the attack (or magic) it carries, the upgrade slots left.
const MAGIC = new Set(['Wand', 'Staff']);
export const mainStatOf = (stats, sub = '') => {
  const order = MAGIC.has(sub) ? ['MAD', 'PAD'] : ['PAD', 'MAD'];
  return order.find((k) => Number.isInteger(stats?.[k])) || null;
};
export function groupKey(opts, sub = '') {
  if (!opts || !Number.isInteger(opts.slots)) return null;
  const ups = Number.isInteger(opts.ups) ? opts.ups : 0;
  if (!ups) return `c:${opts.slots}`;
  const k = mainStatOf(opts.stats, sub);
  return `u:${ups}:${k ? `${k}${opts.stats[k]}` : ''}:${opts.slots}`;
}
// [{ key, ups, slots, stat, value, n, sold }] with the biggest group first.
export function optionGroups(list, sub = '') {
  const out = new Map();
  for (const r of list) {
    const key = groupKey(r.opts, sub);
    if (!key) continue;
    let g = out.get(key);
    if (!g) {
      const ups = r.opts.ups || 0, stat = ups ? mainStatOf(r.opts.stats, sub) : null;
      out.set(key, (g = { key, ups, slots: r.opts.slots, stat, value: stat ? r.opts.stats[stat] : null, n: 0, sold: 0 }));
    }
    g.n++; g.sold += r.sold ? 1 : 0;
  }
  return [...out.values()].sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
}
export const inGroup = (list, key, sub = '') => list.filter((r) => groupKey(r.opts, sub) === key);

// ---------- scrolling ----------
// Every slot gets the same scroll. success and destroy are percentages; destroy is the chance the piece is lost when
// the scroll fails (Chaos: 50). Returns the chance of each number of passes on a piece that survived, the chance it
// was destroyed, and how many scrolls are used on average (a destroyed piece uses no more).
export function scrollOdds(slots, success, destroy = 0) {
  const p = success / 100, boomOnFail = (1 - p) * (destroy / 100), keep = 1 - p - boomOnFail;
  let alive = [1], boom = 0, used = 0;
  for (let i = 0; i < slots; i++) {
    const live = alive.reduce((s, x) => s + x, 0);
    used += live;
    boom += live * boomOnFail;
    const next = new Array(alive.length + 1).fill(0);
    alive.forEach((x, k) => { next[k] += x * keep; next[k + 1] += x * p; });
    alive = next;
  }
  return { passes: alive, boom, used };
}

// What a finished piece is worth against what it cost. values[k] is the price of a piece with k passes (null = not
// known). cost = the clean piece + the scrolls used on average.
//   ev: average sale value (null while a result that can happen has no price)
//   win: chance the piece sells for more than it cost
//   needs: fewest passes that pay the cost back (null when even all passes do not)
export function scrollProfit({ item, scroll, odds, values }) {
  const cost = item + scroll * odds.used, full = item + scroll * (odds.passes.length - 1);
  let ev = 0, win = 0, known = true, needs = null;
  odds.passes.forEach((pr, k) => {
    const v = values[k];
    if (v == null) { if (pr > 1e-9) known = false; return; }
    ev += pr * v;
    if (v > full) { win += pr; if (needs == null) needs = k; }
  });
  // The price the missing result must reach for the average to break even (one unknown result only).
  const missing = odds.passes.map((pr, k) => (values[k] == null && pr > 1e-9 ? k : -1)).filter((k) => k >= 0);
  const breakEven = missing.length === 1 ? Math.max(0, (cost - ev) / odds.passes[missing[0]]) : null;
  return { cost, full, ev: known ? ev : null, partial: ev, profit: known ? ev - cost : null, win, needs, missing, breakEven };
}

// Listings of a piece that ended like this result: k scrolls passed, `add` gained on `stat` in total (on top of a
// clean value between baseLo and baseHi; clean pieces of one name roll a little apart), `left` upgrade slots unused.
export function finishedPieces(list, { stat, gain, k, add = k * gain, left = 0, baseLo, baseHi }) {
  return list.filter((r) => {
    const o = r.opts;
    if (!o || o.slots !== left || (o.ups || 0) !== k) return false;
    const v = Number.isInteger(o.stats?.[stat]) ? o.stats[stat] : 0;
    return v >= baseLo + add && v <= baseHi + add;
  });
}
// The clean value range of a stat among unscrolled pieces on the market; the catalogue value when none is listed.
export function cleanRange(list, stat, base = 0) {
  const vals = list.filter((r) => r.opts && !(r.opts.ups > 0) && !(r.opts.used > 0)).map((r) => (Number.isInteger(r.opts.stats?.[stat]) ? r.opts.stats[stat] : 0));
  if (!vals.length) return { lo: base, hi: base };
  return { lo: Math.min(base, ...vals), hi: Math.max(base, ...vals) };
}
// One price for a set of listings: what they sold for when at least three sold, else the cheap end of what is asked
// (the dear half rarely sells). { price, basis: 'sold' | 'ask', n, sold } or null.
export function fairPrice(list) {
  if (!list.length) return null;
  const sold = list.filter((r) => r.sold);
  if (sold.length >= 3) return { price: medianPrice(sold), basis: 'sold', n: list.length, sold: sold.length };
  return { price: quantile(prices(list), 0.25), basis: 'ask', n: list.length, sold: sold.length };
}

// "150만", "1.5m", "1,500,000", "3억 2000만", "250k" -> mesos; null when it is not a price.
export function parseMesos(text) {
  const s = String(text ?? '').replace(/[,\s]/g, '').toLowerCase();
  if (!s) return null;
  let total = 0, rest = s, hit = false;
  for (const [unit, mult] of [['억', 1e8], ['만', 1e4]]) {
    const m = rest.match(new RegExp(`^(\\d+(?:\\.\\d+)?)${unit}`));
    if (m) { total += Number(m[1]) * mult; rest = rest.slice(m[0].length); hit = true; }
  }
  if (rest) {
    const m = rest.match(/^(\d+(?:\.\d+)?)(b|m|k)?$/);
    if (!m) return null;
    total += Number(m[1]) * ({ b: 1e9, m: 1e6, k: 1e3 }[m[2]] || 1);
    hit = true;
  }
  const n = Math.round(total);
  return hit && n > 0 && n <= 2147483647 ? n : null;
}

// ---------- scrolling many pieces ----------
// Every way one piece can end: k passes on a surviving piece (all scrolls used), or destroyed on the j-th scroll.
// [{ k, boom, p, used }]; the chances add up to 1.
export function scrollCases(slots, success, destroy = 0) {
  const p = success / 100, boomOnFail = (1 - p) * (destroy / 100), keep = 1 - p - boomOnFail;
  let alive = [1];
  const out = [];
  for (let i = 0; i < slots; i++) {
    const live = alive.reduce((s, x) => s + x, 0);
    if (boomOnFail > 0) out.push({ k: null, boom: true, p: live * boomOnFail, used: i + 1 });
    const next = new Array(alive.length + 1).fill(0);
    alive.forEach((x, k) => { next[k] += x * keep; next[k + 1] += x * p; });
    alive = next;
  }
  return [...alive.map((x, k) => ({ k, boom: false, p: x, used: slots })), ...out].filter((c) => c.p > 0);
}

// A small seeded generator, so the same inputs always draw the same luck (numbers do not flicker between redraws).
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// What scrolling n pieces leaves, given each case's net result (sale price minus what was spent on that piece):
//   mean: the average total,  win: the chance the total ends above zero,
//   lo / hi: the total you beat 9 times in 10, and the total you reach 1 time in 10.
// One piece is exact; a few are played out many times; hundreds follow the bell curve.
export function batchSpread(cases, n, { trials = 4000, seed = 7 } = {}) {
  const mean1 = cases.reduce((s, c) => s + c.p * c.net, 0);
  const var1 = cases.reduce((s, c) => s + c.p * (c.net - mean1) ** 2, 0);
  const sorted = [...cases].sort((a, b) => a.net - b.net);
  const at = (q) => { let acc = 0; for (const c of sorted) { acc += c.p; if (acc >= q - 1e-12) return c.net; } return sorted[sorted.length - 1].net; };
  if (n <= 1) return { mean: mean1, win: cases.reduce((s, c) => s + (c.net > 0 ? c.p : 0), 0), lo: at(0.1), hi: at(0.9) };
  if (n > 200 || var1 === 0) {
    const sd = Math.sqrt(var1 * n), z = sd ? (mean1 * n) / sd : mean1 > 0 ? Infinity : -Infinity;
    // Normal curve: chance of landing above zero, and the 10% / 90% points.
    const phi = (x) => { if (!Number.isFinite(x)) return x > 0 ? 1 : 0; const t = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989423 * Math.exp((-x * x) / 2); const pr = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - pr : pr; };
    return { mean: mean1 * n, win: phi(z), lo: mean1 * n - 1.2816 * sd, hi: mean1 * n + 1.2816 * sd };
  }
  const cum = []; let acc = 0;
  for (const c of cases) { acc += c.p; cum.push(acc); }
  const rand = rng(seed), totals = new Float64Array(trials);
  let wins = 0;
  for (let t = 0; t < trials; t++) {
    let sum = 0;
    for (let i = 0; i < n; i++) { const r = rand() * acc; let j = 0; while (j < cum.length - 1 && cum[j] < r) j++; sum += cases[j].net; }
    totals[t] = sum; if (sum > 0) wins++;
  }
  totals.sort();
  return { mean: mean1 * n, win: wins / trials, lo: totals[Math.floor(trials * 0.1)], hi: totals[Math.floor(trials * 0.9)] };
}

// A plan of scrolls for one piece, slot by slot, each its own scroll: [{ success, destroy, gain }]. Returns
//   outcomes: [{ k, add, p }] for a surviving piece (k passes, `add` gained in total), best first,
//   booms: [{ used, p }] destroyed on the used-th scroll,
//   reach: [chance the piece is still there when slot i comes up] (what share of scroll i is really spent).
export function planCases(steps) {
  let alive = new Map([['0|0', 1]]);
  const booms = [], reach = [];
  steps.forEach((st, i) => {
    const p = st.success / 100, boomOnFail = (1 - p) * ((st.destroy || 0) / 100), keep = 1 - p - boomOnFail;
    let live = 0;
    for (const x of alive.values()) live += x;
    reach.push(live);
    if (boomOnFail > 0) booms.push({ used: i + 1, p: live * boomOnFail });
    const next = new Map();
    const put = (key, x) => { if (x > 0) next.set(key, (next.get(key) || 0) + x); };
    for (const [key, x] of alive) {
      const [k, g] = key.split('|').map(Number);
      put(key, x * keep);
      put(`${k + 1}|${g + st.gain}`, x * p);
    }
    alive = next;
  });
  const outcomes = [...alive].map(([key, p]) => { const [k, add] = key.split('|').map(Number); return { k, add, p }; }).sort((a, b) => b.add - a.add || b.k - a.k);
  return { outcomes, booms, reach };
}
