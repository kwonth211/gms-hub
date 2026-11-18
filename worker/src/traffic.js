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
    ...past.map((d) => () => pastDay(env, d).then((h) => [d, h]))
  ];
  // A few at a time: twenty queries in flight at once come back at a coarse sample rate (hours read as 0 or 100).
  const results = [];
  for (let k = 0; k < jobs.length; k += 3) results.push(...(await Promise.all(jobs.slice(k, k + 3).map((f) => f()))));
  // Busiest-hour record ignores coarse days, and the day record is only as good as each day's sample.
  const [h0, krHours, countries, paths, refs, devices, botHours, botRows, ...days] = results;
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
  if (hit) { const data = await hit.json(); const live = await liveNow(); return reply(live ? { ...data, live } : data); }
  try {
    const data = await trafficReport(env, body.day);
    if (cache && !data.coarse) ctx?.waitUntil?.(cache.put(key, new Response(JSON.stringify(data), { headers: { 'Cache-Control': 'max-age=120' } })));
    return reply(data);
  } catch (e) {
    return reply({ error: String(e.message || e) }, 502);
  }
}
