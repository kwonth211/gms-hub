// Reproduce the dated editorial study; no live prices are mixed into its frozen calculations.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function median(values) {
  const a = [...values].sort((a, b) => a - b), n = a.length;
  return n ? n % 2 ? a[n >> 1] : (a[n / 2 - 1] + a[n / 2]) / 2 : null;
}
export function latestListings(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const old = byKey.get(row.key);
    byKey.set(row.key, old ? { ...(row.seen > old.seen ? row : old), sold: row.sold || old.sold } : row);
  }
  return [...byKey.values()];
}
export function matchesGlove(row, attack, slots, ups) {
  const o = row.opts, s = o?.stats;
  return !!s && s.PDD === 6 && s.CRT === 2 && (s.PAD || 0) === attack && o.slots === slots && o.ups === ups
    && !Object.entries(s).some(([key, value]) => !['PAD', 'PDD', 'CRT'].includes(key) && value !== 0);
}
export function binomial(slots, success) {
  let p = [1];
  for (let i = 0; i < slots; i++) {
    const next = Array(p.length + 1).fill(0);
    p.forEach((x, k) => { next[k] += x * (1 - success); next[k + 1] += x * success; });
    p = next;
  }
  return p;
}
function prices(rows) {
  const r = latestListings(rows);
  return { n: r.length, sellers: new Set(r.map(x => x.shop)).size, low: r.length ? Math.min(...r.map(x => x.price)) : null, median: median(r.map(x => x.price)) };
}
export function study(input) {
  const glove = input.items.find(x => x.id === 1082000);
  const history = latestListings(glove.history);
  const groups = [0, 2, 4, 6, 8, 10].map(attack => {
    const match = r => matchesGlove(r, attack, attack ? 0 : 5, attack / 2);
    return { attack, slots: attack ? 0 : 5, open: prices(glove.open.filter(match)), sold: prices(history.filter(r => r.sold && match(r))) };
  });
  const scrolls = [2040800, 2040801].map(id => ({ id, ...prices(input.items.find(x => x.id === id).open) }));
  const cost = groups[0].open.median + 5 * scrolls[1].median;
  const lowCost = groups[0].open.low + 5 * scrolls[1].low;
  const odds = binomial(5, 0.6);
  return { date: input.date, capturedFrom: input.items[0].asOf, capturedTo: input.items.at(-1).asOf, groups, scrolls,
    cost, lowCost, lesserCost: groups[0].open.median + 5 * scrolls[0].median,
    outcomes: odds.map((probability, passes) => ({ passes, attack: passes * 2, probability })),
    atLeast6: odds.slice(3).reduce((a, b) => a + b, 0), atLeast8: odds.slice(4).reduce((a, b) => a + b, 0),
    fivePiecesCost: 5 * cost, tenAttackInFive: 1 - (1 - odds[5]) ** 5 };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = new URL('../', import.meta.url);
  const input = JSON.parse(fs.readFileSync(new URL('data/editorial/work-gloves-2026-11-28.json', root)));
  const result = study(input);
  const out = new URL('assets/research/', root); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(new URL('work-gloves-2026-11-28.json', out), JSON.stringify(result, null, 2) + '\n');
  const lines = ['item_id,kind,attack,slots,listing_count,seller_count,lowest_mesos,median_mesos'];
  for (const g of result.groups) for (const kind of ['open', 'sold']) {
    const p = g[kind]; lines.push([1082000, kind, g.attack, g.slots, p.n, p.sellers, p.low, p.median].join(','));
  }
  for (const p of result.scrolls) lines.push([p.id, 'open', '', '', p.n, p.sellers, p.low, p.median].join(','));
  fs.writeFileSync(new URL('work-gloves-2026-11-28.csv', out), lines.join('\n') + '\n');
  console.log(JSON.stringify(result, null, 2));
}
