// Saves today's market snapshot to data/market-report.json for the daily report page (/tools/market/today/): the most
// listed items, the 7-day movers and the items most mentioned in recent megaphones. The deploy workflow runs this before
// each build (once a day on a schedule, plus every push); a failed fetch keeps the committed file.
import { readFileSync, writeFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../site.config.json', import.meta.url), 'utf8'));
const file = new URL('../data/market-report.json', import.meta.url);
const get = async (path) => {
  const r = await fetch(`${config.voteApi}${path}`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
};

try {
  const [catalog, top, mega] = await Promise.all([get('/market/catalog'), get('/market/top'), get('/megaphones?limit=200')]);
  const listed = catalog.items.filter((r) => r.open > 0 && r.median).sort((a, b) => b.open - a.open).slice(0, 30)
    .map((r) => ({ item: r.item, open: r.open, median: r.median, low: r.low, shops: r.shops }));
  const movers = (top.items || []).filter((r) => r.change != null).map((r) => ({ item: r.item, change: r.change, median: r.median, spark: r.spark }));
  // Item megaphones name their item in brackets ("[Steel Slain] S> 1.5m"); counted by the bracketed name.
  const said = {};
  for (const m of mega.rows || []) {
    const b = /\[([^\]]{3,60})\]/.exec(m.text);
    if (b) said[b[1].toLowerCase()] = (said[b[1].toLowerCase()] || 0) + 1;
  }
  const rows = mega.rows || [];
  writeFileSync(file, `${JSON.stringify({
    updated: new Date().toISOString(), stats: top.stats || catalog.stats || {}, listed, movers, said,
    megaSpan: rows.length ? [rows.at(-1).seen, rows[0].seen] : null
  })}\n`);
  console.log(`market report: ${listed.length} listed, ${movers.length} movers, ${Object.keys(said).length} megaphone items`);
} catch (e) {
  console.warn(`market report: kept the committed file (${e.message})`);
}
