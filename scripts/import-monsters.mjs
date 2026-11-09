// Import reviewed, rendered browser observations and MCW client API snapshots.
// No scheduled scraping, database access, or network requests. See data/editorial/monsters.json.
import fs from 'node:fs';
import path from 'node:path';
const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/import-monsters.mjs <snapshot-directory>');
const read = name => JSON.parse(fs.readFileSync(path.join(input, name)));
const rendered = read('gms-monster-dom.json').ko;
const rows = read('gms-monster-list-dom.json');
const client = read('gms-api-mob-details.json');
const maps = read('gms-api-maps.json');
const items = read('gms-api-items-full.json');
const base = JSON.parse(fs.readFileSync('data/mobs.json')).mobs;
const overrides = JSON.parse(fs.readFileSync('data/mob-overrides.json'));
const updated = '2026-11-10';
const stats = { lv: 2, hp: 3, mp: 4, watk: 5, matk: 6, wdef: 7, mdef: 8, acc: 9, eva: 10, exp: 11 };
const evidence = [];
const monsters = base.map(m => {
  const raw = rendered[m.id];
  const row = rows.find(r => Number(r.url?.split('/').pop()) === m.id);
  if (!raw || !row || !client[m.id]) throw new Error(`Missing monster ${m.id}`);
  if (/^(Loading\.\.\.|불러오는 중)/m.test(raw.status || '')) throw new Error(`Unfinished drops ${m.id}`);
  const o = overrides[m.en] || {};
  const values = Object.fromEntries(Object.entries(stats).map(([k, i]) => [k, Number(row.cells[i].replaceAll(',', ''))]));
  const locations = raw.maps.map(r => {
    const id = Number(r.url.split('/').pop());
    const known = maps.find(m => m.id === id);
    const text = r.cells[0].split('\n')[0];
    const region = known?.streetName || text.match(/(Hidden Street|Shallow Passage|Deep Passage|El Nath|Orbis)$/)?.[1];
    if (!known && !region) throw new Error(`Unresolved map name ${id}`);
    const name = known?.name || text.slice(0, -region.length);
    const share = r.cells[2].match(/(\d+)\s*\/\s*(\d+)/);
    if (!share || Number(share[1]) !== Number(r.cells[1])) throw new Error(`Bad spawn counts ${m.id}/${id}`);
    return { id, en: name, ...(known?.names?.ko ? { ko: known.names.ko } : {}), region,
      count: Number(share[1]), total: Number(share[2]), types: Number(r.cells[3]),
      availability: /11월 18일/.test(r.cells[0]) ? 'upcoming' : /초기 출시에 미포함/.test(r.cells[0]) ? 'unavailable' : 'open',
      ...(/11월 18일/.test(r.cells[0]) ? { opensOn: '2026-11-18' } : {}) };
  });
  const dropEvidence = raw.drops.map(d => {
    const itemId = Number(d.img?.match(/\/(\d+)\.png/)?.[1]);
    const up = Number(d.votes[0]?.replace(/[^\d.]/g, ''));
    const down = Number(d.votes[1]?.replace(/[^\d.]/g, ''));
    if (!itemId || !Number.isFinite(up) || !Number.isFinite(down)) throw new Error(`Unresolved drop ${m.id}: ${d.label}`);
    return { itemId, reportedName: d.label.split('\n')[0], up, down, quest: /Quest Item/.test(d.label), url: `https://meowdb.com${d.url}` };
  });
  const published = dropEvidence.filter(d => d.up > d.down);
  const status = locations.some(l => l.availability === 'open') ? 'active' : locations.some(l => l.availability === 'upcoming') ? 'upcoming' : locations.length ? 'unavailable' : 'unplaced';
  const drops = published.map(d => {
    const i = items.find(i => i.id === d.itemId);
    if (!i) throw new Error(`Missing item ${d.itemId}`);
    return { itemId: d.itemId, en: i.names?.en || i.name, ...(i.names?.ko ? { ko: i.names.ko } : {}),
      cat: d.quest ? 'Quest' : i.typeInfo.overallCategory, ...(i.requiredLevel ? { lv: i.requiredLevel } : {}),
      confidence: d.up >= 10 && d.up >= d.down * 3 ? 'repeated' : 'limited' };
  });
  evidence.push({ id: m.id, url: `https://meowdb.com/msclassic/ko/monsters/${m.id}`, clientUrl: `https://maplestory.io/api/MCW/1/mob/${m.id}`, drops: dropEvidence });
  return { id: m.id, en: m.en, ko: o.ko || (/[가-힣]/.test(raw.title) ? raw.title : m.ko) || m.en, aka: [...new Set([m.ko, ...(o.aka || [])].filter(Boolean))], ...values,
    speed: client[m.id].meta.speed, knockback: client[m.id].meta.minimumPushDamage,
    el: client[m.id].meta.elementalAttributes || '', undead: Boolean(client[m.id].meta.isUndead), boss: Boolean(m.boss),
    status, locations, drops, excludedDrops: dropEvidence.length - drops.length };
});
fs.writeFileSync('data/monsters.json', JSON.stringify({ updated, monsters }, null, 2) + '\n');
fs.writeFileSync('data/editorial/monsters.json', JSON.stringify({ updated,
  scope: '78 existing MCW monsters. Stats compared against rendered current monster table; speed/knockback/elements from MCW client. Map spawn points from rendered location tables; official Korean map/item names from MCW API. Community drop reports are observations, not authoritative server tables or measured rates. Closed/unreleased areas retain their reference reports but are explicitly unavailable.',
  dropRule: 'Only positive net weighted votes are listed. repeated: up >= 10 and up >= 3*down; otherwise limited. Vote weights are not player counts. No historic GMS/MSEA drop tables or probabilities imported.',
  sources: ['https://meowdb.com/msclassic/ko/monsters', 'https://maplestory.io/api/MCW/1/map?count=5000', 'https://maplestory.io/api/MCW/1/item?count=50000'],
  monsters: evidence }, null, 2) + '\n');
console.log(`${monsters.length} monsters, ${monsters.reduce((n,m)=>n+m.locations.length,0)} map placements, ${monsters.reduce((n,m)=>n+m.drops.length,0)} drop reports`);
