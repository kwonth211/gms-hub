// Owner-only traffic dashboard data (/admin/traffic/ on the site). Reads Cloudflare Web Analytics (RUM) through the
// GraphQL API with a read-only Account Analytics token (secret CF_ANALYTICS_TOKEN) and the live presence room, so
// nothing touches D1. POST /internal/traffic {token, day?} -> one JSON for one KST day; answers are cached 2 minutes.
// Counts are Cloudflare's sampled estimates, the same numbers used in the owner's reports.

const HOST = 'gms-hub.com';
const HOUR = 3600000;
const KST = 9 * HOUR;
const GQL = 'https://api.cloudflare.com/client/v4/graphql';

const kstDay = (ms) => new Date(ms + KST).toISOString().slice(0, 10);
const utcStart = (day) => Date.parse(`${day}T00:00:00Z`) - KST;
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

async function rum(env, from, to, dims, { limit = 1000, order = 'sum_visits_DESC', where = '' } = {}) {
  const query = `{viewer{accounts(filter:{accountTag:"${env.CF_ACCOUNT_ID}"}){rumPageloadEventsAdaptiveGroups(limit:${limit},filter:{datetime_geq:"${iso(from)}",datetime_leq:"${iso(to - 1000)}",requestHost:"${HOST}"${where}},orderBy:[${order}]){count sum{visits} avg{sampleInterval} dimensions{${dims}}}}}}`;
  const r = await fetch(GQL, { method: 'POST', headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.errors?.length) throw new Error(`analytics ${r.status}: ${j?.errors?.[0]?.message || 'no data'}`);
  return j.data.viewer.accounts[0]?.rumPageloadEventsAdaptiveGroups || [];
}

// A dimension breakdown answered from a coarse sample (countries read "US 0 visits, 10000 views") is asked again after
// a pause, up to twice; the last answer is used either way and the report is then marked so it is not cached.
async function fine(env, from, to, dims, opts) {
  let rows = await rum(env, from, to, dims, opts);
  for (let i = 0; i < 2 && rows.some((r) => (r.avg?.sampleInterval || 1) > 3); i++) {
    await new Promise((r) => setTimeout(r, 1500));
    rows = await rum(env, from, to, dims, opts);
  }
  rows.coarse = rows.some((r) => (r.avg?.sampleInterval || 1) > 3);
  return rows;
}

// 24 hourly [visits, views] for one KST day, cut at `upto` (now) when the day is today.
async function hourly(env, day, upto, where = '') {
  const from = utcStart(day), to = Math.min(from + 24 * HOUR, upto);
  const out = Array.from({ length: 24 }, () => [0, 0]);
  if (to <= from) return out;
  let coarse = false;
  for (const r of await rum(env, from, to, 'datetimeHour', { order: 'datetimeHour_ASC', where })) {
    const h = new Date(Date.parse(r.dimensions.datetimeHour) + KST).getUTCHours();
    out[h][0] += r.sum.visits; out[h][1] += r.count;
    // Cloudflare answers some queries from a 1-in-10 or 1-in-100 sample (hours read as 0 / 100); flag those.
    if ((r.avg?.sampleInterval || 1) > 3) coarse = true;
  }
  out.coarse = coarse;
  return out;
}

// A finished KST day never changes, so its 24 hours are kept in the edge cache for a month: a refresh then only asks
// Cloudflare about today (Cloudflare answers at a coarser sample rate once many queries have run in a short time).
async function pastDay(env, day) {
  const cache = globalThis.caches?.default;
  const key = new Request(`https://cache.gms-hub.internal/traffic-day4/${day}`);
  const hit = cache && (await cache.match(key));
  if (hit) { const j = await hit.json(); const h = j.h; h.coarse = j.coarse; return h; }
  // A coarse answer is retried after a pause; one that stays coarse (old, already down-sampled days) is kept but
  // flagged, so it never sets the busiest-hour record.
  let h = await hourly(env, day, utcStart(day) + 24 * HOUR);
  for (let i = 0; i < 2 && h.coarse; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    h = await hourly(env, day, utcStart(day) + 24 * HOUR);
  }
  if (cache && h.some(([v]) => v > 0)) await cache.put(key, new Response(JSON.stringify({ h, coarse: h.coarse }), { headers: { 'Cache-Control': 'max-age=2592000' } })).catch(() => null);
  return h;
}

const SOURCES = [
  [/google\./, 'Google'], [/blog\.naver/, 'Naver blog'], [/naver/, 'Naver search'], [/dcinside/, 'DCinside'],
  [/bing\./, 'Bing'], [/chatgpt|openai/, 'ChatGPT'], [/reddit/, 'Reddit'], [/discord/, 'Discord'],
  [/arca\.live/, 'Arca.live'], [/daum|kakao/, 'Daum/Kakao'], [/yahoo/, 'Yahoo'], [/duckduckgo/, 'DuckDuckGo'], [/tistory/, 'Tistory']
];
const sourceOf = (host) => (!host ? 'Direct / app' : (SOURCES.find(([re]) => re.test(host)) || [null, host])[1]);
// Every count includes automated browsers (owner's choice); they are also reported on their own as an estimate, since a
// headless Chrome in Israel opened /en/tools/market/ 74 times on 2026-11-16 (a price scraper) and swung "abroad".
const BOTS = JSON.stringify(['ChromeHeadless', 'BingBot', 'Googlebot', 'YandexBot', 'Baiduspider', 'DuckDuckBot', 'AhrefsBot', 'SemrushBot', 'PetalBot', 'Bytespider']);
const pageKey = (p) => p.replace(/^\/(ko|en|zh|ja)(?=\/|$)/, '') || '/';

// Requests that were turned away, from two places: Cloudflare's firewall on gms-hub.com (zone firewall events: the
// headless-browser rule, managed rules, browser integrity check) and this worker's own refusals on the API host (403 and
// 429 answers, written to the Analytics Engine dataset by logBlock below). Either half can fail on its own (a token
// without zone access, a dataset not created yet); the page then shows the reason instead of an empty list.
const BLOCK_ACTIONS = '["block","challenge","jschallenge","managed_challenge","connection_close","challenge_failed","jschallenge_failed"]';
async function firewallBlocks(env, from, to) {
  if (!env.CF_ZONE_ID) return { error: 'zone id not set' };
  const filter = `{datetime_geq:"${iso(from)}",datetime_leq:"${iso(to - 1000)}",action_in:${BLOCK_ACTIONS}}`;
  const ask = async (body) => {
    const query = `{viewer{zones(filter:{zoneTag:"${env.CF_ZONE_ID}"}){${body}}}}`;
    const r = await fetch(GQL, { method: 'POST', headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.errors?.length) throw new Error(j?.errors?.[0]?.message || `firewall ${r.status}`);
    const z = j.data?.viewer?.zones?.[0];
    if (!z) throw new Error('not authorized for this zone');
    return z;
  };
  try {
    // The free plan has no grouped firewall dataset ("does not have access to the path"), only the single events, newest
    // first; they are counted here. A full page means there were more than `cap` in the day.
    const cap = 5000;
    const z = await ask(`rows:firewallEventsAdaptive(limit:${cap},filter:${filter},orderBy:[datetime_DESC]){action source ruleId clientIP clientAsn clientASNDescription clientCountryName userAgent clientRequestPath datetime}`);
    const groups = new Map(), hours = new Map();
    for (const e of z.rows) {
      const r = { action: e.action, source: e.source, rule: e.ruleId, ip: e.clientIP, org: e.clientASNDescription || `AS${e.clientAsn}`, country: e.clientCountryName || '??', ua: (e.userAgent || '').slice(0, 220), path: (e.clientRequestPath || '').slice(0, 160) };
      const k = Object.values(r).join('|'), g = groups.get(k) || { n: 0, ...r };
      g.n++; groups.set(k, g);
      const h = Math.floor(Date.parse(e.datetime) / HOUR) * HOUR;
      hours.set(h, (hours.get(h) || 0) + 1);
    }
    return { rows: [...groups.values()].sort((a, b) => b.n - a.n).slice(0, 600), hours: [...hours], full: z.rows.length >= cap || undefined };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

const AE_SET = 'gms_hub_blocks';
async function workerBlocks(env, from, to) {
  const sql = async (q) => {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, { method: 'POST', headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` }, body: `${q} FORMAT JSON` });
    const t = await r.text();
    if (!r.ok) throw new Error(t.slice(0, 160) || `sql ${r.status}`);
    return JSON.parse(t).data || [];
  };
  const range = `timestamp >= toDateTime(${Math.floor(from / 1000)}) AND timestamp < toDateTime(${Math.floor(to / 1000)})`;
  try {
    // 'watch' rows are calls from outside the site that were answered, not refused: they are reported apart (outside).
    const [rows, hours, all] = await Promise.all([
      sql(`SELECT blob1 AS reason, blob2 AS path, blob3 AS country, blob4 AS org, blob5 AS ua, blob6 AS ip, sum(_sample_interval) AS n FROM ${AE_SET} WHERE ${range} AND blob1 NOT IN ('watch', 'bot', 'adstxt') GROUP BY reason, path, country, org, ua, ip ORDER BY n DESC LIMIT 400`),
      sql(`SELECT intDiv(toUInt32(timestamp), 3600) AS h, sum(_sample_interval) AS n FROM ${AE_SET} WHERE ${range} AND blob1 NOT IN ('watch', 'bot', 'adstxt') GROUP BY h ORDER BY h`),
      // Every counted API call with its hour: answered from outside the site (watch), verified crawlers (bot) and every
      // refusal. The page builds one list and one chart from these, leaving out the owner's own addresses.
      sql(`SELECT intDiv(toUInt32(timestamp), 3600) AS h, blob1 AS reason, blob2 AS path, blob3 AS country, blob4 AS org, blob5 AS ua, blob6 AS ip, sum(_sample_interval) AS n FROM ${AE_SET} WHERE ${range} AND blob1 != 'adstxt' GROUP BY h, reason, path, country, org, ua, ip ORDER BY n DESC LIMIT 4000`)
    ]);
    const num = (list) => list.map((r) => ({ ...r, n: Number(r.n) })), byHour = (list) => list.map((r) => [Number(r.h) * HOUR, Number(r.n)]);
    return { rows: num(rows), hours: byHour(hours), all: all.map((r) => ({ ...r, n: Number(r.n), h: Number(r.h) * HOUR })) };
  } catch (e) {
    // A dataset nothing has been written to yet does not exist; that is an empty list, not a failure.
    if (/unable to find|does not exist|unknown table/i.test(String(e.message))) return { rows: [], hours: [] };
    return { error: String(e.message || e) };
  }
}

export async function blockedReport(env, from, to) {
  const [fw, wk] = await Promise.all([firewallBlocks(env, from, to), workerBlocks(env, from, to)]);
  const hourly = Array.from({ length: 24 }, () => [0, 0]); // [firewall, worker] per KST hour
  for (const [i, part] of [fw, wk].entries()) for (const [ms, n] of part.hours || []) { const h = Math.floor((ms - from) / HOUR); if (h >= 0 && h < 24) hourly[h][i] += n; }
  // Every counted API call of the day, each with its KST hour (0-23): see workerBlocks.
  const api = wk.error ? { error: wk.error } : { rows: (wk.all || []).map(({ h, ...r }) => ({ ...r, hour: Math.floor((h - from) / HOUR) })).filter((r) => r.hour >= 0 && r.hour < 24), full: (wk.all || []).length >= 4000 || undefined };
  return { hourly, firewall: fw.error ? { error: fw.error } : { rows: fw.rows, full: fw.full }, worker: wk.error ? { error: wk.error } : { rows: wk.rows }, api };
}

// One data point per refused API request. Never awaited and never allowed to throw: a refusal must cost nothing extra.
// Who reads /ads.txt (owner, 2026-11-26): AdSense listed it as "not found" for weeks while it served fine, so every fetch
// is noted (reason 'adstxt', kept out of the refusal views) and GET /internal/adstxt lists the last 30 days.
export async function adsTxtReads(env, now = Date.now()) {
  const q = `SELECT toUInt32(timestamp) AS t, blob3 AS country, blob4 AS org, blob5 AS ua, blob6 AS ip FROM ${AE_SET} WHERE blob1 = 'adstxt' AND timestamp >= toDateTime(${Math.floor(now / 1000) - 30 * 86400}) ORDER BY t DESC LIMIT 500 FORMAT JSON`;
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, { method: 'POST', headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` }, body: q });
  const t = await r.text();
  if (!r.ok) return /unable to find|does not exist|unknown table/i.test(t) ? [] : { error: t.slice(0, 160) };
  return (JSON.parse(t).data || []).map((x) => ({ ...x, t: new Date(Number(x.t) * 1000).toISOString() }));
}

export function logBlock(env, req, reason) {
  try {
    const cf = req.cf || {};
    env.BLOCKS?.writeDataPoint({
      indexes: [reason],
      blobs: [reason, new URL(req.url).pathname.slice(0, 120), cf.country || '??', (cf.asOrganization || '').slice(0, 80), (req.headers.get('User-Agent') || '').slice(0, 220), req.headers.get('CF-Connecting-IP') || ''],
      doubles: [1]
    });
  } catch { /* logging only */ }
}

export async function trafficReport(env, dayParam, now = Date.now()) {
  const today = kstDay(now);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(dayParam || '') && dayParam <= today ? dayParam : today;
  const from = utcStart(day), to = Math.min(from + 24 * HOUR, now);
  const minus = (d, n) => kstDay(utcStart(d) + 12 * HOUR - n * 24 * HOUR);
  const isToday = day === today;
  // Yesterday and the same weekday last week come as whole days; the page cuts them at today's clock time.
  const past = Array.from({ length: 14 }, (_, i) => minus(day, 14 - i)); // the 14 days before `day`
  const jobs = [
    () => (isToday ? hourly(env, day, now) : pastDay(env, day)),
    () => hourly(env, day, isToday ? now : to, ',countryName:"KR"'),
    () => fine(env, from, to, 'countryName', { limit: 40 }),
    () => fine(env, from, to, 'requestPath', { limit: 300, order: 'count_DESC' }),
    () => fine(env, from, to, 'refererHost', { limit: 60 }),
    () => fine(env, from, to, 'deviceType', { limit: 5 }),
    () => hourly(env, day, isToday ? now : to, `,userAgentBrowser_in:${BOTS}`),
    () => fine(env, from, to, 'userAgentBrowser countryName requestPath', { limit: 12, where: `,userAgentBrowser_in:${BOTS}` }),
    () => blockedReport(env, from, to),
    () => toolRuns(env, now),
    () => peopleReport(env, day, now),
    ...past.map((d) => () => pastDay(env, d).then((h) => [d, h]))
  ];
  // A few at a time: twenty queries in flight at once come back at a coarse sample rate (hours read as 0 or 100).
  const results = [];
  for (let k = 0; k < jobs.length; k += 3) results.push(...(await Promise.all(jobs.slice(k, k + 3).map((f) => f()))));
  // Busiest-hour record ignores coarse days, and the day record is only as good as each day's sample.
  const [h0, krHours, countries, paths, refs, devices, botHours, botRows, blocked, tools, people, ...days] = results;
  const dayMap = new Map(days);
  const h1 = dayMap.get(minus(day, 1)), h7 = dayMap.get(minus(day, 7));
  days.push([day, h0]);
  days.splice(0, 1); // keep 14 days ending with `day`
  // Hourly visits split into Korea and everywhere else.
  const split = h0.map(([v], h) => [krHours[h][0], Math.max(0, v - krHours[h][0])]);
  // Pages: views and landings per page, then the same grouped across languages.
  const pageRows = paths.map((r) => ({ path: r.dimensions.requestPath, views: r.count, landings: r.sum.visits }));
  const grouped = new Map();
  for (const p of pageRows) {
    const k = pageKey(p.path), g = grouped.get(k) || { page: k, views: 0, landings: 0, langs: {} };
    g.views += p.views; g.landings += p.landings;
    const lang = (p.path.match(/^\/(ko|en|zh|ja)(?=\/|$)/) || [])[1] || '-';
    g.langs[lang] = (g.langs[lang] || 0) + p.views;
    grouped.set(k, g);
  }
  const sources = new Map();
  for (const r of refs) {
    const host = r.dimensions.refererHost;
    if (host && host.endsWith(HOST)) continue; // moves inside the site
    const k = sourceOf(host);
    sources.set(k, (sources.get(k) || 0) + r.sum.visits);
  }
  const daily = new Map(days.map(([d, h]) => [d, h.reduce((a, [v, p]) => [a[0] + v, a[1] + p], [0, 0])]));
  let live = null;
  if (env.PRESENCE) live = await env.PRESENCE.get(env.PRESENCE.idFromName('site')).fetch('https://presence/peak').then((r) => r.json()).catch(() => null);
  return {
    day, today, isToday, at: new Date(now).toISOString(), cutHour: isToday ? new Date(now + KST).getUTCHours() : 24, cutMinute: isToday ? new Date(now + KST).getUTCMinutes() : 0,
    compare: { yesterday: minus(day, 1), lastWeek: minus(day, 7) },
    hourly: { day: h0, yesterday: h1, lastWeek: h7, koreaAbroad: split },
    countries: countries.map((r) => ({ country: r.dimensions.countryName || '??', visits: r.sum.visits, views: r.count })),
    pages: [...grouped.values()].sort((a, b) => b.views - a.views).slice(0, 40),
    landings: pageRows.filter((p) => p.landings > 0).sort((a, b) => b.landings - a.landings).slice(0, 20),
    sources: [...sources.entries()].map(([source, visits]) => ({ source, visits })).sort((a, b) => b.visits - a.visits),
    devices: devices.map((r) => ({ device: r.dimensions.deviceType || '?', visits: r.sum.visits, views: r.count })),
    // The Korea split is one more query: a coarse or empty answer (Korea read 0 for a whole day on 2026-11-17 while the
    // day had 500 visits) marks the report so the page asks again instead of showing "Korea 0".
    coarse: [countries, paths, refs, devices].some((r) => r.coarse) || h0.coarse || krHours.coarse
      || (h0.some(([v]) => v > 0) && !krHours.some(([v]) => v > 0)) || undefined,
    bots: {
      hourly: botHours.map(([v, p]) => [v, p]),
      top: botRows.map((r) => ({ browser: r.dimensions.userAgentBrowser, country: r.dimensions.countryName || '??', path: r.dimensions.requestPath, visits: r.sum.visits, views: r.count }))
    },
    blocked,
    tools,
    people,
    daily: [...daily.entries()].sort().map(([d, [visits, views]]) => ({ day: d, visits, views })),
    live
  };
}

const sha = async (t) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)));
// Compares digests so the time taken does not depend on how much of the key matched.
async function same(a, b) {
  const [x, y] = await Promise.all([sha(a), sha(b)]);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

export async function handleTraffic(req, env, ctx, allowedOrigins) {
  const origin = req.headers.get('Origin') || '';
  const cors = {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin'
  };
  const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method' }, 405);
  const body = await req.json().catch(() => ({}));
  // Its own read-only key (DASH_TOKEN), never the mail key: this one sits in the owner's browser storage on gms-hub.com,
  // where ad and analytics scripts also run, so a leak can only show traffic numbers.
  if (!env.DASH_TOKEN || typeof body.token !== 'string' || body.token.length > 256 || !(await same(body.token, env.DASH_TOKEN))) return reply({ error: 'forbidden' }, 403);
  if (!env.CF_ANALYTICS_TOKEN || !env.CF_ACCOUNT_ID) return reply({ error: 'analytics token not set' }, 503);
  // The live room is always read fresh (who holds how many tabs changes by the second); { live: true } asks for it alone.
  const liveNow = () => (env.PRESENCE ? env.PRESENCE.get(env.PRESENCE.idFromName('site')).fetch('https://presence/peak').then((r) => r.json()).catch(() => null) : null);
  if (body.live === true) return reply({ live: await liveNow() });
  const key = new Request(`https://cache.gms-hub.internal/traffic/${body.day || 'today'}`);
  const cache = globalThis.caches?.default;
  const hit = cache && (await cache.match(key));
  // The viewer's own address, so the page can tag blocked rows that came from the owner's own connection.
  const you = req.headers.get('CF-Connecting-IP') || '';
  if (hit) { const data = await hit.json(); const live = await liveNow(); return reply(live ? { ...data, live, you } : { ...data, you }); }
  try {
    const data = await trafficReport(env, body.day);
    if (cache && !data.coarse) ctx?.waitUntil?.(cache.put(key, new Response(JSON.stringify(data), { headers: { 'Cache-Control': 'max-age=120' } })));
    return reply({ ...data, you });
  } catch (e) {
    return reply({ error: String(e.message || e) }, 502);
  }
}

// People and sessions, counted the GA4 way by assets/analytics.js (owner 2026-11-27): POST /hit with
// { k: ['u' first time today, 's' new session], c: random browser id, n: 1 if the id is new, p: page, l: language,
// r: referrer host of the session }. One data point per kind; nothing else about the person is kept.
const VISIT_SET = 'gms_hub_visits';
export async function handleHit(req, env) {
  const ua = req.headers.get('User-Agent') || '';
  if (/bot|crawl|spider|headless|lighthouse/i.test(ua)) return;
  let b; try { b = JSON.parse((await req.text()).slice(0, 2000)); } catch { return; }
  const id = String(b?.c || '').replace(/[^\w-]/g, '').slice(0, 40);
  if (id.length < 8 || !Array.isArray(b.k)) return;
  const clip = (v, n) => String(v ?? '').replace(/[^\w./:-]/g, '').slice(0, n);
  const device = /iPad|Tablet/.test(ua) ? 'tablet' : /Mobi|Android|iPhone/.test(ua) ? 'mobile' : 'desktop';
  for (const k of new Set(b.k.filter((x) => x === 'u' || x === 's'))) {
    try {
      env.VISITS?.writeDataPoint({ indexes: [id], blobs: [k, id, req.cf?.country || '??', device, clip(b.p, 120), clip(b.l, 5), k === 's' ? clip(b.r, 60) : '', b.n ? '1' : '0'], doubles: [1] });
    } catch { /* counting only */ }
  }
}

async function aeSql(env, q) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, { method: 'POST', headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` }, body: `${q} FORMAT JSON` });
  const t = await r.text();
  if (!r.ok) throw new Error(t.slice(0, 160) || `sql ${r.status}`);
  return JSON.parse(t).data || [];
}

// For one KST day: people, new people, sessions, Korea vs abroad, sessions by source and per hour, cut at the same clock
// time for yesterday and last week when the day is today; plus people and sessions for the 14 days up to the day.
export async function peopleReport(env, day, now = Date.now()) {
  const from = utcStart(day), isToday = kstDay(now) === day;
  const span = isToday ? now - from : 24 * HOUR;
  const win = (back) => `timestamp >= toDateTime(${Math.floor((from - back) / 1000)}) AND timestamp < toDateTime(${Math.floor((from - back + span) / 1000)})`;
  const sums = (back) => aeSql(env, `SELECT blob1 AS k, blob3 = 'KR' AS kr, blob8 AS nu, count(DISTINCT blob2) AS people, sum(_sample_interval) AS n FROM ${VISIT_SET} WHERE ${win(back)} GROUP BY k, kr, nu`);
  const pack = (rows) => {
    const o = { people: 0, kr: 0, newPeople: 0, sessions: 0, krSessions: 0 };
    for (const r of rows) {
      const people = Number(r.people), n = Number(r.n), kr = Number(r.kr) === 1;
      if (r.k === 'u') { o.people += people; if (kr) o.kr += people; if (r.nu === '1') o.newPeople += people; }
      if (r.k === 's') { o.sessions += n; if (kr) o.krSessions += n; }
    }
    return o;
  };
  try {
    const [d0, d1, d7, hours, src, days] = await Promise.all([
      sums(0), sums(24 * HOUR), sums(7 * 24 * HOUR),
      aeSql(env, `SELECT intDiv(toUInt32(timestamp) + 32400, 3600) % 24 AS h, blob1 AS k, count(DISTINCT blob2) AS people, sum(_sample_interval) AS n FROM ${VISIT_SET} WHERE ${win(0)} GROUP BY h, k ORDER BY h`),
      aeSql(env, `SELECT blob7 AS ref, sum(_sample_interval) AS n FROM ${VISIT_SET} WHERE ${win(0)} AND blob1 = 's' GROUP BY ref ORDER BY n DESC LIMIT 30`),
      aeSql(env, `SELECT intDiv(toUInt32(timestamp) + 32400, 86400) AS d, blob1 AS k, count(DISTINCT blob2) AS people, sum(_sample_interval) AS n FROM ${VISIT_SET} WHERE timestamp >= toDateTime(${Math.floor((from - 13 * 24 * HOUR) / 1000)}) AND timestamp < toDateTime(${Math.floor((from + 24 * HOUR) / 1000)}) GROUP BY d, k ORDER BY d`)
    ]);
    const hourly = Array.from({ length: 24 }, () => [0, 0]); // [people first seen that hour, sessions started]
    for (const r of hours) hourly[Number(r.h)][r.k === 'u' ? 0 : 1] += r.k === 'u' ? Number(r.people) : Number(r.n);
    const daily = new Map();
    for (const r of days) {
      const d = new Date(Number(r.d) * 86400000).toISOString().slice(0, 10), v = daily.get(d) || { day: d, people: 0, sessions: 0 };
      if (r.k === 'u') v.people += Number(r.people); else v.sessions += Number(r.n);
      daily.set(d, v);
    }
    return { today: pack(d0), yesterday: pack(d1), lastWeek: pack(d7), hourly, sources: src.map((r) => ({ source: sourceOf(r.ref || ''), host: r.ref || '', n: Number(r.n) })), daily: [...daily.values()].sort((a, b) => a.day.localeCompare(b.day)) };
  } catch (e) {
    if (/unable to find|does not exist|unknown table/i.test(String(e.message))) return { empty: true };
    return { error: String(e.message || e) };
  }
}

// How runs of the screen-reading tools end (EXP tracker, shop scan): POST /tool-report from the site, one point per run.
// Only the outcome, sizes and browser are kept, never the picture, the numbers read or an address.
const TOOL_SET = 'gms_hub_tools';
const TOOL_OK = { exp: ['ok', 'no_bar', 'read_fail', 'black', 'share_error'], scan: ['first_rows', 'black_frame', 'no_shop', 'unsure_rows', 'read_error', 'video_play', 'upload_fail', 'no_location', 'no_channel', 'no_room'] };
const osOf = (ua) => (/Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'Mac' : /Linux|X11/.test(ua) ? 'Linux' : '?');
const browserOf = (ua) => (/Whale/.test(ua) ? 'Whale' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox/.test(ua) ? 'Firefox' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : '?');
export async function handleToolReport(req, env) {
  const b = await req.json().catch(() => null);
  const word = (v, n) => String(v ?? '').replace(/[^\w.x-]/g, '').slice(0, n), num = (v, max) => Math.max(-1, Math.min(max, Number(v) || 0));
  if (!b || !TOOL_OK[b.tool]?.includes(b.outcome)) return { error: 'bad report' };
  try {
    const ua = req.headers.get('User-Agent') || '';
    env.TOOLS?.writeDataPoint({
      indexes: [b.tool],
      blobs: [b.tool, b.outcome, word(b.size, 12), osOf(ua), browserOf(ua), word(b.surface, 12), word(b.how, 30), req.cf?.country || '??', `${num(b.sw, 20000)}x${num(b.sh, 20000)}`, word(b.lang, 5)],
      doubles: [num(b.first, 3600), num(b.dpr, 10), num(b.level, 1), num(b.pitch, 2000)]
    });
  } catch { /* recording only */ }
  return { ok: true };
}
export async function toolRuns(env, now = Date.now()) {
  const to = Math.floor(now / 1000), from = to - 7 * 86400;
  const ask = async (q) => {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, { method: 'POST', headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` }, body: `${q} FORMAT JSON` });
    const t = await r.text();
    if (!r.ok) throw new Error(t.slice(0, 160) || `sql ${r.status}`);
    return JSON.parse(t).data || [];
  };
  const range = `timestamp >= toDateTime(${from}) AND timestamp < toDateTime(${to})`;
  try {
    const [days, why] = await Promise.all([
      ask(`SELECT blob1 AS tool, blob2 AS outcome, intDiv(toUInt32(timestamp) + 32400, 86400) AS d, sum(_sample_interval) AS n, sum(_sample_interval * double3) AS lv FROM ${TOOL_SET} WHERE ${range} GROUP BY tool, outcome, d ORDER BY d`),
      ask(`SELECT blob1 AS tool, blob2 AS outcome, blob3 AS size, blob4 AS os, blob5 AS browser, blob6 AS surface, blob7 AS how, blob9 AS screen, double2 AS dpr, double4 AS pitch, sum(_sample_interval) AS n, min(toUInt32(timestamp)) AS first, max(toUInt32(timestamp)) AS last FROM ${TOOL_SET} WHERE ${range} GROUP BY tool, outcome, size, os, browser, surface, how, screen, dpr, pitch ORDER BY n DESC LIMIT 200`)
    ]);
    return { days: days.map((r) => ({ tool: r.tool, outcome: r.outcome, day: new Date(Number(r.d) * 86400000).toISOString().slice(0, 10), n: Number(r.n), lv: Number(r.lv) })), why: why.map((r) => ({ ...r, n: Number(r.n), dpr: Number(r.dpr), pitch: Number(r.pitch) || 0, first: Number(r.first) || 0, last: Number(r.last) || 0 })) };
  } catch (e) {
    if (/unable to find|does not exist|unknown table/i.test(String(e.message))) return { days: [], why: [] };
    return { error: String(e.message || e) };
  }
}
