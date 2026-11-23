// Refreshes data/quest-items.json: names of the items quests ask for or hand out that are not in data/items.json (quest
// items never reach the Free Market, so fetch-items.mjs leaves them out). The quest checklist cards need their names.
// Same source as fetch-items.mjs. Run by hand after a game patch: node scripts/fetch-quest-items.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const VERSION = process.argv[2] || '1';
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const known = new Set(read('../data/items.json').items.map((i) => i.id));
const wanted = new Set();
for (const q of read('../data/quests-raw.json').quests) {
  for (const part of [q.requirementToComplete, q.rewardOnComplete, q.rewardOnStart]) for (const i of part?.items || []) if (!known.has(i.id)) wanted.add(i.id);
}
const res = await fetch(`https://maplestory.io/api/MCW/${VERSION}/item?count=50000`);
if (!res.ok) throw new Error(`maplestory.io ${res.status}`);
const items = {};
for (const x of await res.json()) {
  if (!wanted.has(x.id) || !x.names?.en) continue;
  const translated = !(x.untranslated || []).includes('ko') && x.names.ko;
  items[x.id] = { en: x.names.en, ...(translated ? { ko: x.names.ko } : {}) };
}
writeFileSync(new URL('../data/quest-items.json', import.meta.url), JSON.stringify({ updated: new Date().toISOString().slice(0, 10), source: `https://maplestory.io/api/MCW/${VERSION}/item`, items }, null, 1) + '\n');
console.log(`${Object.keys(items).length} of ${wanted.size} quest items named, ${Object.values(items).filter((i) => i.ko).length} with Korean names`);
