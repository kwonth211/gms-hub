// Saves the 14-day price summary of every scanned item (and the live market list's current numbers) to data/item-prices.json, which the build bakes into the item pages.
// The deploy workflow runs this before each build (and once a day on a schedule); a failed fetch keeps the committed file.
import { readFileSync, writeFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../site.config.json', import.meta.url), 'utf8'));
const file = new URL('../data/item-prices.json', import.meta.url);

try {
  const r = await fetch(`${config.voteApi}/prices/all`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const prices = await r.json();
  if (!prices || typeof prices !== 'object' || Array.isArray(prices)) throw new Error('unexpected body');
  // The live market list's numbers (median of what is for sale now, lowest ask, count), so the pages show the same price.
  let now = {};
  try {
    const c = await fetch(`${config.voteApi}/market/catalog`, { signal: AbortSignal.timeout(20000) }).then((r) => (r.ok ? r.json() : null));
    for (const r of c?.items || []) if (r.open > 0 && r.median != null) now[r.item] = [r.median, r.low, r.open];
  } catch (e) {
    console.warn(`item prices: no live catalog (${e.message})`);
  }
  writeFileSync(file, `${JSON.stringify({ updated: new Date().toISOString(), prices, now })}\n`);
  console.log(`item prices: ${Object.keys(prices).length} items, ${Object.keys(now).length} for sale now`);
} catch (e) {
  console.warn(`item prices: kept the committed file (${e.message})`);
}
