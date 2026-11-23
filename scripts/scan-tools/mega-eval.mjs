// Test-mode check (Windows move, 2026-11-23): compare what this PC's collector read (its log, --dry) with what the
// site already has from the collector that is uploading (the Mac). Site-based numbers, as the owner wants them.
// Run: node mega-eval.mjs [minutes=15]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const minutes = Number(process.argv[2]) || 15;
const until = Date.now() - 45000, since = until - minutes * 60000; // the newest lines may still be on their second look
const log = fs.readFileSync(path.join(os.homedir(), 'gms-hub-samples', 'mega-collector.log'), 'utf8').split(/\r?\n/);
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const ours = [], opts = [];
for (const l of log) {
  let m = l.match(/^options(?: partial)? (\S+) \[([^\]]+)\] (\{.*?\})(?: missing=(\S+))? \(.*seen=(\S+)$/);
  if (m) { const t = Date.parse(m[5]); if (t >= since - 120000) try { opts.push({ nick: m[1], item: m[2], opts: JSON.parse(m[3]), partial: !!m[4], t }); } catch {} continue; }
  m = l.match(/^(\d\d):(\d\d):(\d\d) (\w+)\s+CH\s*(\d+) ([^:]+): (.*)$/);
  if (!m) continue;
  const d = new Date(); d.setHours(+m[1], +m[2], +m[3], 0);
  if (d.getTime() > Date.now() + 60000) d.setDate(d.getDate() - 1);
  if (d.getTime() >= since - 60000 && d.getTime() <= until + 60000) ours.push({ kind: m[4], channel: +m[5], nick: m[6], text: m[7] });
}
const rows = [];
for (let after = 0, page = 0; page < 6; page++) {
  const r = await fetch(`https://gms-hub-votes.kwonth211.workers.dev/megaphones?limit=200${page ? `&before=${after}` : ''}`, { headers: { 'User-Agent': 'shop-collector' } });
  const got = (await r.json()).rows || [];
  rows.push(...got);
  if (!got.length || Date.parse(got.at(-1).seen.replace(' ', 'T') + 'Z') < since || page === 0 && got.length < 200) break;
  after = got.at(-1).id; break; // one page (200 rows) covers well over 15 minutes
}
const site = rows.map((r) => ({ ...r, t: Date.parse(r.seen.replace(' ', 'T') + 'Z') })).filter((r) => r.t >= since && r.t <= until);
const same = (o, r) => o.channel === r.channel && norm(o.text).slice(0, 12) === norm(r.text).slice(0, 12);
const by = {};
for (const r of site) { const k = by[r.kind] ??= { n: 0, hit: 0, exact: 0 }; k.n++; const o = ours.find((o) => same(o, r)); if (o) { k.hit++; if (o.text === r.text && o.nick === r.nick) k.exact++; } }
const pct = (a, b) => (b ? `${Math.round(a / b * 100)}%` : '-');
console.log(`최근 ${minutes}분 · 사이트 ${site.length}건 · 이 PC ${ours.length}건`);
for (const [k, v] of Object.entries(by)) console.log(`  ${k.padEnd(6)} 사이트 ${String(v.n).padStart(3)} · 이 PC도 읽음 ${v.hit} (${pct(v.hit, v.n)}) · 글자까지 같음 ${v.exact} (${pct(v.exact, v.n)})`);
const extra = ours.filter((o) => !site.some((r) => same(o, r)));
console.log(`  사이트에 없는 이 PC 줄 ${extra.length}건 (깨진 글이거나 맥이 놓친 글)`);
for (const e of extra.slice(0, 6)) console.log(`     ${e.kind} CH${e.channel} ${e.nick}: ${e.text.slice(0, 70)}`);
// options: site rows that carry opts are the reference
const withOpts = site.filter((r) => r.opts);
let read = 0, equal = 0, more = 0, wrong = [];
const flat = (o) => JSON.stringify([o.slots ?? null, o.ups ?? null, Object.entries(o.stats || {}).sort(), o.scroll ?? null]);
for (const r of withOpts) {
  const o = typeof r.opts === 'string' ? JSON.parse(r.opts) : r.opts;
  const mine = opts.filter((x) => norm(x.nick) === norm(r.nick) && r.text.toLowerCase().includes(`[${x.item.toLowerCase()}]`) && Math.abs(x.t - r.t) < 180000).sort((a, b) => a.partial - b.partial)[0];
  if (!mine) continue;
  read++;
  const sup = (mine.opts.slots ?? null) === (o.slots ?? null) && (mine.opts.ups ?? null) === (o.ups ?? null) && Object.entries(o.stats || {}).every(([k, v]) => mine.opts.stats?.[k] === v) && JSON.stringify(mine.opts.scroll ?? null) === JSON.stringify(o.scroll ?? null);
  if (flat(mine.opts) === flat(o)) equal++; else if (sup) { equal++; more++; } else wrong.push(`${r.nick} ${r.text.slice(0, 30)} | 사이트 ${JSON.stringify(o)} | 이 PC ${JSON.stringify(mine.opts)}${mine.partial ? ' (일부)' : ''}`);
}
console.log(`옵션: 사이트에 옵션 있는 글 ${withOpts.length}건 · 이 PC도 읽음 ${read} (${pct(read, withOpts.length)}) · 값까지 같음 ${equal} (${pct(equal, withOpts.length)}) — 그중 ${more}건은 이 PC가 능력치를 더 많이 읽음`);
for (const w of wrong.slice(0, 8)) console.log('   다름: ' + w);
