// Adds the Korean client names to data/training.json: each spot's map and monsters get a `ko` field, matched by English
// name against the Classic World map and mob lists maplestory.io serves. Re-run after adding spots: node scripts/fetch-training-ko.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const API = 'https://maplestory.io/api/MCW/1';
const file = new URL('../data/training.json', import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
const get = async (path) => (await fetch(API + path)).json();
const index = (rows) => {
  const out = new Map();
  for (const r of rows) if (r.names?.ko && !out.has(r.names.en || r.name)) out.set(r.names.en || r.name, r.names.ko);
  return out;
};
// Names the client lists without a Korean entry: the excavation camps and the unnumbered Jr. Boogie.
const maps = new Map([...index(await get('/map?count=100000')), ['Camp 1', '캠프 1'], ['Camp 2', '캠프 2'], ['Camp 3', '캠프 3']]);
const mobs = new Map([...index(await get('/mob?count=100000')), ['Jr. Boogie', '주니어 부기']]);
const missing = new Set();
for (const s of data.spots) {
  s.ko = maps.get(s.map) || (missing.add(`map: ${s.map}`), undefined);
  for (const m of s.monsters) m.ko = mobs.get(m.name) || (missing.add(`mob: ${m.name}`), undefined);
}
writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
console.log(missing.size ? `No Korean name for:\n${[...missing].join('\n')}` : 'All names matched');
