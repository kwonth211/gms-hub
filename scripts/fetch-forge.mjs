// Data for the scroll forge (/tools/forge/): every armor and weapon scroll of MapleStory Classic World with its success
// rate, stat gains and whether a failure can destroy the item, plus every equipment piece that has upgrade slots, all
// from the client via maplestory.io. A scroll fits an item when its id names the item's category: scroll 204XXyy fits
// equipment 1XX....(2040801 Gloves Attack -> gloves 108xxxx). Run by hand: node scripts/fetch-forge.mjs
import fs from 'node:fs';

const API = 'https://maplestory.io/api/MCW/1';
const all = await (await fetch(`${API}/item?count=50000`)).json();
const STAT = { incSTR: 'STR', incDEX: 'DEX', incINT: 'INT', incLUK: 'LUK', incPAD: 'PAD', incWAT: 'PAD', incMAD: 'MAD', incPDD: 'PDD', incMDD: 'MDD',
  incACC: 'ACC', incEVA: 'EVA', incSpeed: 'Speed', incJump: 'Jump', incMHP: 'MHP', incMMP: 'MMP', incCRT: 'CRT', incCRD: 'CRD' };
const unknown = new Set();
const stats = (m) => {
  const o = {};
  for (const [k, v] of Object.entries(m || {})) { if (STAT[k] && Number(v)) o[STAT[k]] = (o[STAT[k]] || 0) + Number(v); else if (/^inc/.test(k) && Number(v)) unknown.add(k); }
  return o;
};
const pool = async (list, n, fn) => {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k]); } }));
  return out;
};
const getItem = async (id) => {
  for (let t = 0; t < 3; t++) {
    try { const r = await fetch(`${API}/item/${id}`); if (r.ok) return await r.json(); } catch {}
    await new Promise((r) => setTimeout(r, 500 * (t + 1)));
  }
  return null;
};

const scrollRows = all.filter((x) => ['Armor Scroll', 'Weapon Scroll'].includes(x.typeInfo?.category) && x.typeInfo.subCategory !== 'Pet');
const scrolls = (await pool(scrollRows, 8, async (x) => {
  const d = await getItem(x.id);
  const m = d?.metaInfo || {};
  if (!m.success) return null;
  return { id: x.id, en: d.description?.names?.en || x.name, ko: d.description?.names?.ko || null, sub: x.typeInfo.subCategory,
    cat: 100 + Math.floor((x.id - 2040000) / 100), success: m.success, destroy: m.cursed || 0, inc: stats(m) };
})).filter(Boolean);

// Equipment with upgrade slots, in the categories some scroll fits.
const cats = new Set(scrolls.map((s) => s.cat));
const equipRows = all.filter((x) => x.typeInfo?.overallCategory === 'Equip' && !x.isCash && cats.has(Math.floor(x.id / 10000)));
const equips = (await pool(equipRows, 8, async (x) => {
  const d = await getItem(x.id);
  const m = d?.metaInfo || {};
  if (!m.tuc) return null;
  return { id: x.id, en: d.description?.names?.en || x.name, ko: d.description?.names?.ko || null, cat: Math.floor(x.id / 10000), sub: x.typeInfo.subCategory,
    lv: m.reqLevel || 0, slots: m.tuc, inc: stats(m), req: { STR: m.reqSTR || 0, DEX: m.reqDEX || 0, INT: m.reqINT || 0, LUK: m.reqLUK || 0 }, job: m.reqJob || 0 };
})).filter(Boolean);

fs.writeFileSync('data/forge.json', JSON.stringify({ updated: new Date().toISOString().slice(0, 10), source: `${API}/item/<id>`, scrolls, equips }) + '\n');
if (unknown.size) console.log('unmapped stats', [...unknown]);
console.log('scrolls', scrolls.length, 'destroying', scrolls.filter((s) => s.destroy).length, 'equips', equips.length, 'no ko', [...scrolls, ...equips].filter((x) => !x.ko).length);
