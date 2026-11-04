// Saves the 14-day price summary of every scanned item to data/item-prices.json, which the build bakes into the item pages.
// The deploy workflow runs this before each build (and once a day on a schedule); a failed fetch keeps the committed file.
import { readFileSync, writeFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../site.config.json', import.meta.url), 'utf8'));
const file = new URL('../data/item-prices.json', import.meta.url);

try {
  const r = await fetch(`${config.voteApi}/prices/all`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const prices = await r.json();
  if (!prices || typeof prices !== 'object' || Array.isArray(prices)) throw new Error('unexpected body');
  writeFileSync(file, `${JSON.stringify({ updated: new Date().toISOString(), prices })}\n`);
  console.log(`item prices: ${Object.keys(prices).length} items`);
} catch (e) {
  console.warn(`item prices: kept the committed file (${e.message})`);
}
