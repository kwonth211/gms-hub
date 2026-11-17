// Saves the game's newest official notices (worker GET /news) to data/official-news.json so the home page is built
// with them already in its HTML. The deploy workflow runs this before each build; a failed fetch keeps the committed file.
import { readFileSync, writeFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../site.config.json', import.meta.url), 'utf8'));
const file = new URL('../data/official-news.json', import.meta.url);
try {
  const r = await fetch(`${config.voteApi}/news`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  if (!d.items?.length) throw new Error('empty list');
  writeFileSync(file, `${JSON.stringify(d, null, 1)}\n`);
  console.log(`official news: ${d.items.length} notices, newest ${d.items[0].date.slice(0, 10)}`);
} catch (e) {
  console.warn(`official news: kept the committed file (${e.message})`);
}
