// Refreshes data/quests.json from the Classic World client data maplestory.io serves: every quest's area, start and
// completion requirements (level, class, NPC, items to bring, monsters to hunt), rewards and the NPCs' names.
// Run by hand after a patch: node scripts/fetch-quests.mjs
import { writeFileSync } from 'node:fs';

const API = `https://maplestory.io/api/MCW/${process.argv[2] || '1'}`;
async function get(path) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(API + path);
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw new Error(`maplestory.io ${path}`);
}
async function pool(list, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < list.length) {
      const k = i++;
      out[k] = await fn(list[k]);
    }
  }));
  return out;
}

const list = await get('/quest');
const raw = (await pool(list, 4, (q) => get(`/quest/${q.id}`))).filter(Boolean);
const npcIds = new Set();
for (const q of raw) for (const r of [q.requirementToStart, q.requirementToComplete]) if (r?.npcId) npcIds.add(r.npcId);
const npcs = {};
await pool([...npcIds], 4, async (id) => {
  const n = await get(`/npc/${id}`);
  if (n) npcs[id] = { en: n.name, ko: n.names?.ko || null };
});
writeFileSync(new URL('../data/quests-raw.json', import.meta.url), `${JSON.stringify({ source: 'maplestory.io MCW client data', updated: new Date().toISOString().slice(0, 10), quests: raw, npcs })}\n`);
console.log(`quests-raw.json: ${raw.length} quests, ${Object.keys(npcs).length} NPCs`);
