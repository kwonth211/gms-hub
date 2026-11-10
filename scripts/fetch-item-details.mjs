// Refreshes data/item-details.json: requirements, upgrade slots and stat bonuses for every item a monster drops, a
// quest rewards or a player has priced, read from the client data maplestory.io serves (MCW region). Item pages show these as base stats.
// Run by hand after a game patch or after new drops/prices: node scripts/fetch-item-details.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const API = `https://maplestory.io/api/MCW/${process.argv[2] || '1'}`;
const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));

async function get(path) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(API + path);
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
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

const ids = new Set();
for (const m of read('monsters.json').monsters) for (const d of m.drops) ids.add(d.itemId);
for (const id of Object.keys(read('item-prices.json').prices || {})) ids.add(Number(id));
// Quest rewards too, so the equipment finder can list gear you earn from a quest.
for (const q of read('quests-raw.json').quests) for (const i of q.rewardOnComplete?.items || []) if (i.count > 0) ids.add(i.id);
const known = new Set(read('items.json').items.map((i) => i.id));
const list = [...ids].filter((id) => known.has(id)).sort((a, b) => a - b);

// Only the fields an item page shows; zero bonuses are dropped.
const REQ = { reqLevel: 'lv', reqSTR: 'str', reqDEX: 'dex', reqINT: 'int', reqLUK: 'luk', reqJob: 'job' };
const INC = ['incSTR', 'incDEX', 'incINT', 'incLUK', 'incMHP', 'incMMP', 'incPAD', 'incWAT', 'incMAD', 'incPDD', 'incMDD', 'incACC', 'incEVA', 'incSpeed', 'incJump'];
const details = {};
await pool(list, 6, async (id) => {
  const d = await get(`/item/${id}`);
  if (!d?.metaInfo) return;
  const m = d.metaInfo;
  const row = {};
  const req = Object.fromEntries(Object.entries(REQ).filter(([k]) => m[k]).map(([k, v]) => [v, m[k]]));
  if (Object.keys(req).length) row.req = req;
  const inc = Object.fromEntries(INC.filter((k) => m[k]).map((k) => [k.replace(/^inc/, '').replace('WAT', 'PAD'), m[k]]));
  if (Object.keys(inc).length) row.inc = inc;
  if (m.tuc) row.slots = m.tuc;
  if (m.attackSpeed) row.speed = m.attackSpeed;
  if (m.price) row.sell = m.price;
  if (m.only) row.unique = true;
  if (m.tradeBlock || m.notSale) row.untradeable = true;
  if (Object.keys(row).length) details[id] = row;
});
writeFileSync(new URL('../data/item-details.json', import.meta.url), `${JSON.stringify({ source: 'maplestory.io MCW client data', updated: new Date().toISOString().slice(0, 10), items: details })}\n`);
console.log(`item-details.json: ${Object.keys(details).length} of ${list.length} items`);
