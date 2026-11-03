// Refreshes data/mobs.json and data/weapons.json for the hits-to-kill calculator: every Classic World monster's level, HP,
// defence, avoid and elements, and every weapon's attack, read from the client data maplestory.io serves (MCW region).
// Run by hand after a game patch: node scripts/fetch-combat.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const VERSION = process.argv[2] || '1';
const API = `https://maplestory.io/api/MCW/${VERSION}`;
const today = new Date().toISOString().slice(0, 10);

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

// Test dummies and placeholder entries have no place in a monster search.
const SKIP_MOB = /^(Test\(|Tutorial |Straw Tra|Monsters Near)/;
// Ids from 800000 are party-quest and event copies of field monsters with their own stats.
const list = (await get('/mob?count=100000')).filter((m) => !SKIP_MOB.test(m.name) && !(m.id >= 800000 && m.id < 1000000));
const mobs = (await pool(list, 8, async (m) => {
  const d = await get(`/mob/${m.id}`);
  const x = d?.meta;
  // Event dummies give no experience and sit far above the level cap.
  if (!x?.maxHP || !x.exp || x.level > 150) return null;
  const ko = m.names?.ko;
  return {
    id: m.id,
    en: m.names?.en || m.name,
    ...(ko ? { ko } : {}),
    lv: x.level,
    hp: x.maxHP,
    mp: x.maxMP || 0,
    wdef: x.physicalDefense || 0,
    mdef: x.magicDefense || 0,
    eva: x.evasion || 0,
    exp: x.exp || 0,
    ...(x.elementalAttributes ? { el: x.elementalAttributes } : {}),
    ...(x.isUndead ? { undead: 1 } : {}),
    ...(m.isBoss ? { boss: 1 } : {})
  };
})).filter(Boolean);

// Same monster can appear under several ids (event or quest copies); keep one per name and stats.
const seen = new Set();
const unique = mobs.filter((m) => {
  const k = [m.en, m.lv, m.hp].join('|');
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
}).sort((a, b) => a.lv - b.lv || a.hp - b.hp);

writeFileSync(new URL('../data/mobs.json', import.meta.url), JSON.stringify({ updated: today, source: `${API}/mob`, mobs: unique }) + '\n');
console.log(`${unique.length} monsters`);

const WEAPON_TYPES = {
  'One-Handed Sword': '1h_sword', 'Two-Handed Sword': '2h_sword', 'One-Handed Axe': '1h_axe', 'One-Handed Blunt Weapon': '1h_blunt',
  'Two-Handed Axe': '2h_axe', 'Two-Handed Blunt': '2h_blunt', Spear: 'spear', 'Pole Arm': 'polearm', Dagger: 'dagger', Claw: 'claw',
  Bow: 'bow', Crossbow: 'crossbow', Wand: 'wand', Staff: 'staff'
};
// Weapon ids sit in 1300000-1499999; scrolls for a weapon type share its sub-category name and are skipped.
const items = JSON.parse(readFileSync(new URL('../data/items.json', import.meta.url), 'utf8')).items.filter((x) => WEAPON_TYPES[x.sub] && x.id >= 1300000 && x.id < 1500000);
const weapons = (await pool(items, 8, async (it) => {
  const m = (await get(`/item/${it.id}`))?.metaInfo;
  if (!m || (!m.incWAT && !m.incMAD)) return null;
  return {
    id: it.id,
    en: it.en,
    ...(it.ko ? { ko: it.ko } : {}),
    type: WEAPON_TYPES[it.sub],
    lv: m.reqLevel || 0,
    ...(m.incWAT ? { watk: m.incWAT } : {}),
    ...(m.incMAD ? { matk: m.incMAD } : {}),
    ...(m.attackSpeed ? { speed: m.attackSpeed } : {})
  };
})).filter(Boolean).sort((a, b) => a.type.localeCompare(b.type) || a.lv - b.lv);

writeFileSync(new URL('../data/weapons.json', import.meta.url), JSON.stringify({ updated: today, source: `${API}/item`, weapons }) + '\n');
console.log(`${weapons.length} weapons`);
