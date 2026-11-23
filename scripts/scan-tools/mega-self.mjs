// Self check when no other collector is uploading: of the item megaphones this PC read (equipment or scroll link,
// not cash), how many got their options read. Run: node mega-self.mjs [minutes=15]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const minutes = Number(process.argv[2]) || 15, since = Date.now() - minutes * 60000;
const cat = JSON.parse(fs.readFileSync(new URL('../../assets/items-catalog.json', import.meta.url)));
const key = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const byName = new Map(cat.map((i) => [key(i.en), i]));
const log = fs.readFileSync(path.join(os.homedir(), 'gms-hub-samples', 'mega-collector.log'), 'utf8').split(/\r?\n/);
const want = new Map(), done = new Map(), why = {};
for (const l of log) {
  let m = l.match(/^(\d\d):(\d\d):(\d\d) (item|double)\s+CH\s*(\d+) ([^:]+): (.*)$/);
  if (m) { const d = new Date(); d.setHours(+m[1], +m[2], +m[3], 0); if (d.getTime() < since || d.getTime() > Date.now() - 60000) continue;
    const links = [...m[7].matchAll(/\[([^\]]+)\]/g)]; if (links.length !== 1) continue; const it = byName.get(key(links[0][1]));
    if (it && !it.cash && (it.cat === 'Equip' || / Scroll: /i.test(it.en))) want.set(`${key(m[6])}|${key(it.en)}`, `${m[6]} [${it.en}]`); continue; }
  m = l.match(/^options( partial)? (\S+) \[([^\]]+)\] \{/);
  if (m) { const k = `${key(m[2])}|${key(m[3])}`; if (!m[1] || !done.has(k)) done.set(k, m[1] ? 'partial' : 'full'); continue; }
  m = l.match(/^options unfinished (\S+) \[([^\]]+)\]: (.*?); attempts/);
  if (m) why[`${key(m[1])}|${key(m[2])}`] = m[3];
}
let full = 0, part = 0; const reasons = {};
for (const k of want.keys()) { const d = done.get(k); if (d === 'full') full++; else if (d === 'partial') part++; else { const r = (why[k] || '기록 없음').replace(/missing .*/, 'missing'); reasons[r] = (reasons[r] || 0) + 1; } }
console.log(`최근 ${minutes}분 · 옵션 읽을 대상(장비·주문서 링크) ${want.size}건 · 끝까지 읽음 ${full} (${want.size ? Math.round(full / want.size * 100) : 0}%) · 일부 ${part}`);
for (const [r, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log(`   못 읽음 ${n}: ${r}`);
