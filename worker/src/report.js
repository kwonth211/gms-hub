// Weekly report data. Two small daily rollups keep what would otherwise be lost, and one read-only route hands the build
// everything the report page needs:
// - 'mega-day:YYYY-MM-DD' (snapshots): per item, how often it was named in that UTC day's megaphones, split by sell/buy,
//   with the median asked/offered price. Megaphones themselves are deleted after two days, so this is written by the
//   16:00 UTC run (before the prune) for yesterday (UTC).
// - 'rank-day:YYYY-MM-DD' (snapshots): job mix and level spread of the stored top-1000 ranking, once per UTC day.
// - GET /report/raw: 15 days of item_daily (one row per item per day), the two rollups and forge_counts. Edge-cached;
//   it is read by the build a few times a day, never by visitors.
const DAY = 86400000;
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};

// Per-item summary of one day's megaphone rows ({ item, intent, price, nick }).
export function summarizeMegaDay(rows) {
  const items = new Map();
  const nicks = new Set();
  let withItem = 0;
  for (const r of rows) {
    nicks.add(r.nick);
    if (r.item == null) continue;
    withItem++;
    const it = items.get(r.item) || { item: r.item, n: 0, sell: 0, buy: 0, sp: [], bp: [] };
    it.n++;
    if (r.intent === 'sell') { it.sell++; if (r.price > 0) it.sp.push(r.price); }
    if (r.intent === 'buy') { it.buy++; if (r.price > 0) it.bp.push(r.price); }
    items.set(r.item, it);
  }
  const list = [...items.values()].sort((a, b) => b.n - a.n || a.item - b.item)
    .map(({ sp, bp, ...it }) => ({ ...it, sellPrice: median(sp), buyPrice: median(bp) }));
  return { n: rows.length, nicks: nicks.size, withItem, items: list };
}

// Job mix of the stored ranking (rows: { level, job }).
export function summarizeRank(snapshot) {
  const rows = snapshot?.rows || [];
  const jobs = {};
  const levels = {};
  for (const r of rows) {
    jobs[r.job] = (jobs[r.job] || 0) + 1;
    const band = Math.floor(r.level / 5) * 5;
    levels[band] = (levels[band] || 0) + 1;
  }
  const top = rows.slice(0, 10).map((r) => ({ name: r.name, level: r.level, job: r.job }));
  return { n: rows.length, characters: snapshot?.stats?.characters ?? null, highest: snapshot?.stats?.highest_level ?? null, jobs, levels, top };
}

// The 16:00 UTC run: store yesterday (UTC), which is still complete then (the prune keeps 48 hours, so the day before
// yesterday is already cut in half and is never stored), and today's ranking summary.
export async function storeDailyRollups(env, now = Date.now()) {
  const d = dayOf(now - DAY);
  const have = await env.DB.prepare("SELECT 1 FROM snapshots WHERE key = ?").bind(`mega-day:${d}`).first();
  if (!have) {
    const { results } = await env.DB.prepare("SELECT nick, item, intent, price FROM megaphones WHERE seen_at >= ? AND seen_at < ?")
      .bind(`${d} 00:00:00`, `${dayOf(now)} 00:00:00`).all();
    if (results.length) await env.DB.prepare("INSERT OR IGNORE INTO snapshots (key, json, at) VALUES (?, ?, datetime('now'))")
      .bind(`mega-day:${d}`, JSON.stringify({ day: d, ...summarizeMegaDay(results) })).run();
  }
  const rank = await env.DB.prepare("SELECT json FROM snapshots WHERE key = 'rank'").first().catch(() => null);
  if (rank) await env.DB.prepare("INSERT OR REPLACE INTO snapshots (key, json, at) VALUES (?, ?, datetime('now'))")
    .bind(`rank-day:${dayOf(now)}`, JSON.stringify({ day: dayOf(now), ...summarizeRank(JSON.parse(rank.json)) })).run();
}

// Everything the weekly report build needs, compact: items as { id: [[day index, median, low, n, sold], ...] }.
export async function reportRaw(env, now = Date.now(), span = 15) {
  const days = Array.from({ length: span }, (_, i) => dayOf(now - (span - 1 - i) * DAY));
  const index = new Map(days.map((d, i) => [d, i]));
  const [daily, snaps, forge, rank] = await Promise.all([
    env.DB.prepare("SELECT item, day, median, low, p25, p75, n, sold FROM item_daily WHERE day >= ?").bind(days[0]).all(),
    env.DB.prepare("SELECT key, json FROM snapshots WHERE key >= ? AND key < ? OR key >= ? AND key < ?")
      .bind(`mega-day:${days[0]}`, 'mega-day:~', `rank-day:${days[0]}`, 'rank-day:~').all(),
    env.DB.prepare("SELECT day, ok, fail, boom FROM forge_counts WHERE day >= ?").bind(days[0]).all(),
    env.DB.prepare("SELECT json FROM snapshots WHERE key = 'rank'").first().catch(() => null),
  ]);
  const items = {};
  for (const r of daily.results) {
    const i = index.get(r.day);
    if (i == null) continue;
    (items[r.item] ||= []).push([i, r.median, r.low, r.p25, r.p75, r.n, r.sold]);
  }
  const mega = [], ranks = [];
  for (const s of snaps.results) (s.key.startsWith('mega-day:') ? mega : ranks).push(JSON.parse(s.json));
  // Today's ranking always rides along, so the first report has a "now" even before any rank-day is stored.
  if (rank) ranks.push({ day: dayOf(now), live: true, ...summarizeRank(JSON.parse(rank.json)) });
  return {
    at: new Date(now).toISOString(), days, items,
    mega: mega.sort((a, b) => (a.day < b.day ? -1 : 1)),
    rank: ranks.sort((a, b) => (a.day < b.day ? -1 : 1)),
    forge: forge.results,
  };
}
