#!/usr/bin/env node
// GMS Hub operations briefing: one Markdown report of traffic, database usage, both collectors, site health and the
// machine, with rule-based flags at the end. Facts only — a person or any LLM (Claude, GPT, …) turns it into advice
// with scripts/briefing-prompt.md. No dependencies; runs on the admin's Mac.
//
//   node scripts/briefing.mjs            → Markdown on stdout, copy saved to ~/gms-hub-samples/briefings/
//   node scripts/briefing.mjs --json     → the same numbers as JSON
//
// Credentials: the Cloudflare OAuth token that wrangler keeps in ~/Library/Preferences/.wrangler/config/default.toml
// (refresh it with `npx wrangler whoami` if the API answers 401), or CF_TOKEN in the environment. Nothing is written
// anywhere but the local report file.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ACCOUNT = '2d797e9348660f2d5a228739b19cd956';
const HOST = 'gms-hub.com';
const API = 'https://gms-hub-votes.kwonth211.workers.dev';
const FREE_READS = 5_000_000, FREE_WRITES = 100_000; // D1 free-tier daily limits (UTC day)
const JSON_OUT = process.argv.includes('--json');
const HOME = os.homedir();

const sh = (cmd, ms = 15000) => { try { return execSync(cmd, { encoding: 'utf8', timeout: ms, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const n = (v) => (v == null ? '—' : Number(v).toLocaleString('ko-KR'));
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const kst = (d = new Date()) => new Date(d.getTime() + 9 * 3600000);
const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
const hhmm = (d) => kst(d).toISOString().slice(11, 16);

function token() {
  if (process.env.CF_TOKEN) return process.env.CF_TOKEN;
  try {
    const t = fs.readFileSync(path.join(HOME, 'Library/Preferences/.wrangler/config/default.toml'), 'utf8');
    return /oauth_token\s*=\s*"([^"]+)"/.exec(t)?.[1] || '';
  } catch { return ''; }
}
async function graphql(query) {
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(30000) });
  const d = await r.json();
  if (d.errors?.length) throw new Error(d.errors.map((e) => e.message).join('; '));
  return d.data.viewer.accounts[0];
}
async function getJson(url) { try { const r = await fetch(url, { signal: AbortSignal.timeout(15000) }); return r.ok ? await r.json() : { error: r.status }; } catch (e) { return { error: e.message }; } }

// ---------- traffic (Cloudflare Web Analytics, sampled) ----------
const kind = (p) => {
  p = p.replace(/^\/(ko|en|zh|ja)/, '') || '/';
  for (const [re, name] of [[/^\/$/, '홈'], [/^\/tools\/market\/today/, '시세 리포트'], [/^\/tools\/market/, '실시간 시세'], [/^\/megaphone/, '실시간 확성기'], [/^\/tools\/exp/, '경험치 측정기'], [/^\/tools\/training/, '사냥터 추천'], [/^\/tools\/scroll/, '주문서 계산기'], [/^\/tools\/drop-rate/, '확률 계산기'], [/^\/tools\/damage/, '몇 방 컷'], [/^\/tools\/price/, '가격 검색'], [/^\/tools\//, '기타 도구'], [/^\/monsters\/[^/]+/, '몬스터 상세'], [/^\/monsters/, '몬스터 목록'], [/^\/items\//, '아이템'], [/^\/maps\//, '맵'], [/^\/quests\//, '퀘스트'], [/^\/guides\//, '가이드'], [/^\/equipment/, '장비'], [/^\/bosses/, '보스']]) if (re.test(p)) return name;
  return '기타';
};
async function rum(since, until, dims) {
  const a = await graphql(`{viewer{accounts(filter:{accountTag:"${ACCOUNT}"}){rumPageloadEventsAdaptiveGroups(limit:5000,filter:{datetime_geq:"${since}",datetime_lt:"${until}",requestHost:"${HOST}"}){count sum{visits} dimensions{${dims}}}}}}`);
  return a.rumPageloadEventsAdaptiveGroups;
}
async function traffic() {
  const now = new Date();
  const dayStart = new Date(kst(now).toISOString().slice(0, 10) + 'T00:00:00Z'); dayStart.setTime(dayStart.getTime() - 9 * 3600000); // KST midnight in UTC
  const yStart = new Date(dayStart.getTime() - 86400000), ySame = new Date(now.getTime() - 86400000);
  const sum = (rows) => ({ views: rows.reduce((s, r) => s + r.count, 0), visits: rows.reduce((s, r) => s + r.sum.visits, 0), kr: rows.filter((r) => r.dimensions.countryName === 'KR').reduce((s, r) => s + r.sum.visits, 0) });
  const [today, ySameRows, yAll] = await Promise.all([rum(iso(dayStart), iso(now), 'requestPath countryName'), rum(iso(yStart), iso(ySame), 'countryName'), rum(iso(yStart), iso(dayStart), 'countryName')]);
  const byPage = {}; for (const r of today) { const k = kind(r.dimensions.requestPath); byPage[k] = (byPage[k] || 0) + r.count; }
  const langs = {}; for (const r of today) { const l = /^\/(ko|en|zh|ja)/.exec(r.dimensions.requestPath)?.[1] || 'root'; langs[l] = (langs[l] || 0) + r.count; }
  const hours = await rum(iso(dayStart), iso(now), 'datetimeHour');
  return { today: sum(today), yesterdaySameTime: sum(ySameRows), yesterday: sum(yAll), byPage: Object.entries(byPage).sort((a, b) => b[1] - a[1]).slice(0, 10), langs,
    hours: hours.sort((a, b) => a.dimensions.datetimeHour.localeCompare(b.dimensions.datetimeHour)).map((r) => [(Number(r.dimensions.datetimeHour.slice(11, 13)) + 9) % 24, r.sum.visits]) };
}

// ---------- database (D1 analytics, UTC days) ----------
async function d1() {
  const since = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const a = await graphql(`{viewer{accounts(filter:{accountTag:"${ACCOUNT}"}){d1AnalyticsAdaptiveGroups(limit:20,filter:{date_geq:"${since}"}){dimensions{date}sum{readQueries writeQueries rowsRead rowsWritten}}}}}`);
  const days = {};
  for (const g of a.d1AnalyticsAdaptiveGroups) { const d = g.dimensions.date; days[d] = days[d] || { rowsRead: 0, rowsWritten: 0, readQueries: 0, writeQueries: 0 }; for (const k of Object.keys(days[d])) days[d][k] += g.sum[k]; }
  const todayUtc = new Date().toISOString().slice(0, 10);
  const utcHour = new Date().getUTCHours() + new Date().getUTCMinutes() / 60;
  const t = days[todayUtc] || { rowsRead: 0, rowsWritten: 0 };
  return { days: Object.entries(days).sort(), todayUtc, utcHour: Math.round(utcHour * 10) / 10, projectedReads: Math.round((t.rowsRead / Math.max(utcHour, 0.5)) * 24), projectedWrites: Math.round((t.rowsWritten / Math.max(utcHour, 0.5)) * 24) };
}

// ---------- collectors ----------
async function collectors() {
  const market = await getJson(`${API}/market/collector`);
  const megaLog = path.join(HOME, 'gms-hub-samples/mega-collector.log');
  const megaLines = sh(`grep -E '^[0-9]{2}:[0-9]{2}:[0-9]{2} ' "${megaLog}" | tail -3`).split('\n').filter(Boolean);
  const megaPid = sh('cat ~/.config/gms-hub/mega-collector.pid');
  const megaRunning = megaPid && sh(`kill -0 ${megaPid} && echo yes`) === 'yes';
  const megaLast = await getJson(`${API}/megaphones?limit=1`);
  const megaStats = await getJson(`${API}/megaphones/stats`);
  const lastSeen = megaLast.rows?.[0]?.seen ? new Date(megaLast.rows[0].seen.replace(' ', 'T') + 'Z') : null;
  const launchd = sh('launchctl print gui/$(id -u)/com.gmshub.market-collector | grep -E "state = " | head -1').replace('state = ', '').trim();
  const browserPid = sh('pgrep -f "Google Chrome for Testing" | head -1');
  const game = sh('pgrep -f "maplestory" | head -1') ? true : false;
  return { market, megaRunning, megaPid, megaLines, megaLastSeen: lastSeen, megaLastAgeMin: lastSeen ? Math.round((Date.now() - lastSeen.getTime()) / 60000) : null, megaToday: megaStats.today || null, launchd: launchd || 'not loaded', browserPid, game };
}

// ---------- site and machine ----------
async function site() {
  const pages = ['/ko/', '/ko/tools/market/', '/ko/tools/training/', '/ko/megaphone/', '/en/'];
  const out = [];
  for (const p of pages) {
    const t0 = Date.now();
    try { const r = await fetch(`https://${HOST}${p}?nc=${Date.now()}`, { signal: AbortSignal.timeout(15000) }); out.push([p, r.status, Date.now() - t0]); } catch (e) { out.push([p, 'ERR', Date.now() - t0]); }
  }
  const t0 = Date.now(); const top = await getJson(`${API}/market/top`); const apiMs = Date.now() - t0;
  const commit = sh('cd ~/gms-hub && git log -1 --format="%h %ad %s" --date=format:"%m-%d %H:%M"');
  return { pages, out, apiOk: !top.error, apiMs, commit };
}
function machine() {
  const top = sh('top -l 1 -n 0');
  const cpu = /CPU usage: ([\d.]+)% user, ([\d.]+)% sys, ([\d.]+)% idle/.exec(top);
  const mem = /PhysMem: (\S+) used \((\S+) wired, (\S+) compressor\), (\S+) unused/.exec(top);
  const disk = sh("df -h / | tail -1 | awk '{print $4}'");
  const up = sh('uptime').replace(/.*up /, '').replace(/,\s+\d+ users?.*/, '');
  return { cpuIdle: cpu ? Number(cpu[3]) : null, memUnused: mem?.[4] || null, memCompressed: mem?.[3] || null, diskFree: disk, uptime: up };
}

// ---------- flags (rules a reader should act on) ----------
function flags(T, D, C, S, M) {
  const f = [];
  const t = D.days.find(([d]) => d === D.todayUtc)?.[1];
  if (t && (t.rowsRead > FREE_READS * 0.7 || D.projectedReads > FREE_READS * 0.9)) f.push(`D1 읽기 ${n(t.rowsRead)}행 (하루 추정 ${n(D.projectedReads)}, 무료 한도 ${n(FREE_READS)}) — 70%를 넘었거나 넘을 전망`);
  if (t && (t.rowsWritten > FREE_WRITES * 0.7 || D.projectedWrites > FREE_WRITES * 0.9)) f.push(`D1 쓰기 ${n(t.rowsWritten)}행 (하루 추정 ${n(D.projectedWrites)}, 무료 한도 ${n(FREE_WRITES)})`);
  const hb = C.market.heartbeat;
  if (C.market.error) f.push(`시세 수집 상태 API 오류: ${C.market.error}`);
  else {
    if (C.market.state === 'delayed' || C.market.state === 'waiting') f.push(`시세 수집 ${C.market.state}: 마지막 저장 ${C.market.lastSuccessAt || '없음'}`);
    if (hb && hb.ageSeconds > 1800) f.push(`시세 수집기 상태 보고가 ${Math.round(hb.ageSeconds / 60)}분째 없음 (브라우저가 죽었거나 멈춤)`);
    if (hb?.error) f.push(`시세 수집기 오류: ${hb.error}`);
    if (hb && !hb.enabled) f.push('시세 수집기 자동 수집이 꺼져 있음');
  }
  if (!C.megaRunning) f.push('확성기 수집기 프로세스가 없음 (mega.sh start)');
  if (C.megaLastAgeMin != null && C.megaLastAgeMin > 30) f.push(`확성기가 ${C.megaLastAgeMin}분째 안 들어옴 (게임 창/채팅창 확인)`);
  if (C.launchd !== 'running') f.push(`시세 수집 브라우저 launchd 상태: ${C.launchd}`);
  for (const [p, s, ms] of S.out) if (s !== 200) f.push(`사이트 ${p} 응답 ${s}`); else if (ms > 3000) f.push(`사이트 ${p} 느림 ${ms}ms`);
  if (!S.apiOk) f.push('API /market/top 응답 실패');
  if (T.today.visits < T.yesterdaySameTime.visits * 0.6 && T.yesterdaySameTime.visits >= 20) f.push(`방문자가 어제 같은 시각보다 ${pct(T.yesterdaySameTime.visits - T.today.visits, T.yesterdaySameTime.visits)} 적음`);
  if (M.memUnused && /M$/.test(M.memUnused) && parseInt(M.memUnused) < 300) f.push(`맥 메모리 여유 ${M.memUnused} (압축 ${M.memCompressed})`);
  if (M.cpuIdle != null && M.cpuIdle < 20) f.push(`맥 CPU 여유 ${M.cpuIdle}%`);
  return f;
}

// ---------- report ----------
function markdown(T, D, C, S, M, F) {
  const now = kst(new Date());
  const L = [];
  L.push(`# GMS Hub 운영 브리핑 — ${now.toISOString().slice(0, 16).replace('T', ' ')} KST`, '');
  L.push('## 한눈에', `- 오늘 방문 **${n(T.today.visits)}** (한국 ${n(T.today.kr)} · 해외 ${n(T.today.visits - T.today.kr)}) · 조회 ${n(T.today.views)} — 어제 같은 시각 방문 ${n(T.yesterdaySameTime.visits)} · 어제 하루 ${n(T.yesterday.visits)}`);
  const t = D.days.find(([d]) => d === D.todayUtc)?.[1] || { rowsRead: 0, rowsWritten: 0 };
  L.push(`- D1 오늘(UTC, ${D.utcHour}시간 경과) 읽기 ${n(t.rowsRead)} / 쓰기 ${n(t.rowsWritten)} 행 → 하루 추정 읽기 ${n(D.projectedReads)} (${pct(D.projectedReads, FREE_READS)} of 무료) · 쓰기 ${n(D.projectedWrites)} (${pct(D.projectedWrites, FREE_WRITES)})`);
  const hb = C.market.heartbeat;
  L.push(`- 시세 수집: ${C.market.state || C.market.error} · 오늘 ${n(C.market.todayRows)}건 · ${hb ? `${hb.phase} (상점 ${hb.shops ?? 0}·매물 ${hb.rows ?? 0}, 보고 ${hb.ageSeconds}초 전${hb.hidden ? ', 창 가려짐' : ''})` : '상태 보고 없음'}`);
  L.push(`- 확성기 수집: ${C.megaRunning ? `실행 중 (pid ${C.megaPid})` : '멈춤'} · 마지막 확성기 ${C.megaLastAgeMin == null ? '—' : `${C.megaLastAgeMin}분 전`} · 오늘 ${C.megaToday ? `${n(C.megaToday.n)}개 / ${n(C.megaToday.nicks)}명` : '—'}`);
  L.push(`- 사이트: ${S.out.map(([p, s, ms]) => `${p} ${s} ${ms}ms`).join(' · ')} · API ${S.apiOk ? `정상 ${S.apiMs}ms` : '오류'}`);
  L.push(`- 맥: CPU 여유 ${M.cpuIdle ?? '—'}% · 메모리 미사용 ${M.memUnused ?? '—'} (압축 ${M.memCompressed ?? '—'}) · 디스크 여유 ${M.diskFree} · 켜진 지 ${M.uptime}`, '');
  L.push('## 트래픽 (오늘, KST)', '| 페이지 | 조회 | 비중 |', '|---|---|---|');
  for (const [k, v] of T.byPage) L.push(`| ${k} | ${n(v)} | ${pct(v, T.today.views)} |`);
  L.push('', `언어: ${Object.entries(T.langs).sort((a, b) => b[1] - a[1]).map(([l, v]) => `${l} ${n(v)}`).join(' · ')}`);
  L.push(`시간대별 방문: ${T.hours.map(([h, v]) => `${h}시 ${v}`).join(' · ')}`, '');
  L.push('## 데이터베이스 (D1, UTC 하루 단위)', '| 날짜(UTC) | 읽기 행 | 쓰기 행 | 읽기 쿼리 | 쓰기 쿼리 |', '|---|---|---|---|---|');
  for (const [d, v] of D.days) L.push(`| ${d}${d === D.todayUtc ? ' (진행 중)' : ''} | ${n(v.rowsRead)} | ${n(v.rowsWritten)} | ${n(v.readQueries)} | ${n(v.writeQueries)} |`);
  L.push(`무료 한도: 읽기 ${n(FREE_READS)} · 쓰기 ${n(FREE_WRITES)} / 일 (한국 시간 09:00 초기화). 현재 요금제: Workers Paid($5)지만 무료 한도 안에서 운영하는 것이 목표.`, '');
  L.push('## 수집기');
  L.push(`- 시세 수집 브라우저: launchd ${C.launchd}${C.browserPid ? ` · 브라우저 pid ${C.browserPid}` : ' · 브라우저 프로세스 없음'}`);
  if (hb) L.push(`- 마지막 상태 보고: ${hb.instance || '?'} v${hb.version} · ${hb.event} · ${hb.phase} · 자동 수집 ${hb.enabled ? '켜짐' : '꺼짐'} · 오류 ${hb.error || '없음'} · 다음 예약 ${hb.nextAt ? hhmm(new Date(hb.nextAt)) : '—'}`);
  if (C.market.runs) L.push(`- 최근 저장: ${C.market.runs.map((r) => `${hhmm(new Date(r.at.replace(' ', 'T') + 'Z'))} 상점 ${r.shops}·저장 ${r.accepted}`).join(' / ')}`);
  L.push(`- 확성기: ${C.megaRunning ? '실행 중' : '멈춤'} · 게임 ${C.game ? '실행 중' : '안 떠 있음'}`);
  for (const l of C.megaLines) L.push(`  - ${l}`);
  L.push('', `## 사이트`, `- 마지막 배포 커밋: ${S.commit || '—'}`, '');
  L.push('## 확인 필요', ...(F.length ? F.map((x) => `- ⚠️ ${x}`) : ['- 없음 — 모두 정상 범위']));
  return L.join('\n') + '\n';
}

const [T, D, C, S] = await Promise.all([traffic().catch((e) => { throw new Error(`traffic: ${e.message}`); }), d1().catch((e) => { throw new Error(`d1: ${e.message}`); }), collectors(), site()]);
const M = machine();
const F = flags(T, D, C, S, M);
const data = { generatedAt: new Date().toISOString(), traffic: T, d1: D, collectors: C, site: S, machine: M, flags: F };
const dir = path.join(HOME, 'gms-hub-samples/briefings'); fs.mkdirSync(dir, { recursive: true });
const stamp = kst(new Date()).toISOString().slice(0, 16).replace('T', '-').replace(':', '');
if (JSON_OUT) { console.log(JSON.stringify(data, null, 1)); fs.writeFileSync(path.join(dir, `briefing-${stamp}.json`), JSON.stringify(data, null, 1)); }
else { const md = markdown(T, D, C, S, M, F); process.stdout.write(md); fs.writeFileSync(path.join(dir, `briefing-${stamp}.md`), md); }
