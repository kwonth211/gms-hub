// 30-minute tracking of both collectors on the Windows PC. Prints one block and appends one line to
// ~/gms-hub-samples/track.log. Run: node mega-track.mjs [minutes=30]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const minutes = Number(process.argv[2]) || 30, now = Date.now(), since = now - minutes * 60000;
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const cat = JSON.parse(fs.readFileSync(path.join(here, '../../assets/items-catalog.json')));
const key = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const byName = new Map(cat.map((i) => [key(i.en), i]));
const target = (text) => { const l = [...text.matchAll(/\[([^\]]+)\]/g)]; if (l.length !== 1) return false; const it = byName.get(key(l[0][1])); return !!it && !it.cash && (it.cat === 'Equip' || / Scroll: /i.test(it.en)); };
// site
let site = { n: 0, kinds: {}, want: 0, got: 0, newest: null };
try {
  const rows = (await (await fetch('https://gms-hub-votes.kwonth211.workers.dev/megaphones?limit=200', { headers: { 'User-Agent': 'shop-collector' } })).json()).rows;
  for (const r of rows) { const t = Date.parse(r.seen.replace(' ', 'T') + 'Z'); if (!site.newest) site.newest = t; if (t < since) continue; site.n++; site.kinds[r.kind] = (site.kinds[r.kind] || 0) + 1; if (['item', 'double'].includes(r.kind) && target(r.text)) { site.want++; if (r.opts) site.got++; } }
} catch (e) { site.error = e.message; }
// megaphone collector log
const mlog = fs.readFileSync(path.join(os.homedir(), 'gms-hub-samples', 'mega-collector.log'), 'utf8').split(/\r?\n/);
const start = mlog.map((l, i) => (/collecting and posting|dry run/.test(l) ? i : -1)).filter((i) => i >= 0);
const tail = mlog.slice(-4000);
const stamp = (l) => { const m = l.match(/^(\d\d):(\d\d):(\d\d) /); if (!m) return null; const d = new Date(now); d.setHours(+m[1], +m[2], +m[3], 0); if (d.getTime() > now + 60000) d.setDate(d.getDate() - 1); return d.getTime(); };
let lines = 0, lastLine = 0, junk = 0;
for (const l of tail) { const t = stamp(l); if (t && /^\S+ (super|item|double)/.test(l)) { if (t >= since) { lines++; if (/——|[=_]{3}|\b[A-Z]{1,2}[a-z]?=|^\S+ \w+\s+CH\s*\d+ \w+: .{0,3}$/.test(l)) junk++; } lastLine = Math.max(lastLine, t); } }
const restarts = mlog.filter((l) => /watchdog|restart: memory/.test(l)).length, postFail = tail.filter((l) => /post failed/.test(l) && Date.parse(l.slice(0, 24)) >= since).length;
// shop collector log (newest runall*.log)
const rec = 'C:/Users/PC/Desktop/price-collector/records';
const newest = fs.readdirSync(rec).filter((f) => f.startsWith('runall') && f.endsWith('.log')).map((f) => [f, fs.statSync(path.join(rec, f)).mtimeMs]).sort((a, b) => b[1] - a[1])[0];
const slog = fs.readFileSync(path.join(rec, newest[0]), 'utf8').split(/\r?\n/);
let shops = 0, fail = 0, errs = 0, clicks = 0, ch = '?', room = '?';
for (const l of slog) { const t = stamp(l); const mc = l.match(/##### 채널 (\d+)/); if (mc) ch = mc[1]; const mr = l.match(/== (\d+)번 방 시작/); if (mr) room = mr[1]; if (!t || t < since) continue; if (/ {3}방\d+ "/.test(l)) shops++; if (/열리지 않음/.test(l)) fail++; if (/못 나감|나가지 못함|Traceback|입장이 연달아|건너뜀|화면 크기 이상/.test(l)) errs++; if (/확성기\] click/.test(l)) clicks++; }
const shopAge = Math.round((now - newest[1]) / 1000);
let rows = 0; try { const csv = 'C:/Users/PC/Desktop/price-collector/data/listings_v2.csv'; const fd = fs.openSync(csv, 'r'), size = fs.fstatSync(fd).size, len = Math.min(size, 6e6), buf = Buffer.alloc(len); fs.readSync(fd, buf, 0, len, size - len); fs.closeSync(fd); const cut = new Date(since - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' '); for (const l of buf.toString('utf8').split('\n')) if (l.slice(0, 19) >= cut && /^\d{4}-/.test(l)) rows++; } catch {}
const pct = (a, b) => (b ? Math.round(a / b * 100) + '%' : '-');
const megaAge = lastLine ? Math.round((now - lastLine) / 1000) : null, siteAge = site.newest ? Math.round((now - site.newest) / 1000) : null;
const alerts = [];
if (shopAge > 180) alerts.push(`상점 수집기 기록이 ${shopAge}초째 멈춤`);
if (errs) alerts.push(`상점 수집기 오류 ${errs}건`);
if (megaAge === null || megaAge > 300) alerts.push(`확성기 수집기가 ${megaAge ?? '?'}초째 새 글 없음`);
if (siteAge === null || siteAge > 420) alerts.push(`사이트에 ${siteAge ?? '?'}초째 새 확성기 없음`);
if (site.want >= 10 && site.got / site.want < 0.85) alerts.push(`옵션 비율 ${pct(site.got, site.want)}`);
if (postFail >= 8) alerts.push(`업로드 실패 ${postFail}건`);
const hhmm = new Date(now).toTimeString().slice(0, 5);
const line = `${new Date(now - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)} ${hhmm} | 옵션 ${site.got}/${site.want} ${pct(site.got, site.want)} | 확성기 ${site.n}건 (${Object.entries(site.kinds).map(([k, v]) => k + ' ' + v).join(', ')}) | 깨진 글 의심 ${junk}/${lines} | 상점 ${shops}개 ${rows}줄 열기실패 ${fail} 오류 ${errs} 채널 ${ch} 방 ${room} | 확성기 클릭 ${clicks} | 재시작 ${restarts} 업로드 재시도 ${postFail} | ${alerts.length ? '경고: ' + alerts.join('; ') : '정상'}`;
fs.appendFileSync(path.join(os.homedir(), 'gms-hub-samples', 'track.log'), line + '\n');
console.log(line);
