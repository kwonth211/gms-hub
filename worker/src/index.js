import { addForgeCounts, forgeCounts } from './forge-counts.js';
import { addExpRun, expRunsSummary } from './exp-runs.js';
import { handleEmail, handleSendMail } from './inbox.js';
// GMS Hub vote API (Cloudflare Worker + D1).
// GET  /votes        -> { "<siteId>": count, ... }
// POST /vote {site}  -> { site, count, counted }  (one vote per visitor per site; visitors are salted IP hashes)
// GET  /prices?ids=1,2 -> { "<itemId>": { n, median, low, high, last, sold, selling, buying } }  (last 14 days, outliers dropped)
// GET  /prices/recent  -> [{ item, price, kind, at }]  (newest player reports)
// POST /price {item, price, kind} -> { ok }  (kind: sold | selling | buying)
// POST /listings {items: [{item, price (per item), qty (bundle size), sold, seller, channel, room}]} -> { stored }  (shop scanner; one row per listing)
// POST /listings/fix {from: {item, price, seller, channel, room}, to: {item, price, qty, sold, seller}} -> { fixed }
// GET  /listings/recent -> [{ item, price, qty, sold, seller, channel, room, seen }]
// GET  /market/top -> { at, stats, items: [{ item, rank, move, avg, n, sold, change, spark: [7 daily medians] }] }  (stored every 30 min)
// GET  /market/item?id= -> { item, listings: [...last 7 days], trend }
// POST /alerts {endpoint, keys, item, price, name, lang} · GET /alerts?endpoint= · DELETE /alerts?endpoint=&item= · GET /alerts/hits?endpoint=
//      (price alerts by Web Push; see src/alerts.js)
// GET  /megaphones?after=<id> -> { rows: [{ id, seen, kind, channel, nick, text }] }  (newest first)
// POST /internal/megaphone {rows} (Bearer MEGAPHONE_TOKEN)  (admin collector)
// GET  /rank -> { at, source, stats, rows: [top 1,000 by level] }  (ClassicRank, refreshed hourly by the schedule)
// GET  /news -> { at, items: [{ id, cat, date, en, ko, url, maint? }] }  (official Classic World notices, edge-cached 10 min; news.js)
// GET  /rank/lookup?name= -> { data: one character }  (ClassicRank, cached an hour)
// POST /internal/traffic {token, day?} -> owner-only traffic dashboard data from Cloudflare Web Analytics (see traffic.js)
// GET  /internal/presence-peak (Bearer MAIL_ADMIN_TOKEN) -> { peak, at, now }: record of pages open at once (owner only)
// GET  /presence?p=<path> (WebSocket) -> messages { site, here }: open pages on the whole site and on this page
// The shop scanner runs from the local dev server for now, so its origin may post scans too.
import { handleMarketBatch, getCollectionStatus, collectorView, handleMarketBoost } from './market-batch.js';
import { handleShopScan } from './shop-scan.js';
import { parseOptions } from './item-options.js';
import { marketCatalog, browseListings, browseReports, marketHistory, dailyPoints, openShops, archiveListings, refreshItemMarket, reconcileItemMarket } from './market-browser.js';
import { cachedPublicResponse } from './public-cache.js';
import { refreshNews } from './news.js';
import { Presence, handlePresence, handlePresencePeak } from './presence.js';
import { adsTxtReads, handleHit, handleToolReport, handleTraffic, logBlock, logError, noteError, noteText } from './traffic.js';
import { refreshRank, rankSnapshot, lookupCharacter } from './rank.js';
import { noteScanShops, scanShops, refreshFaces, pruneScanShops } from './scan-shops.js';
import { validRoom } from '../../assets/place.js';
import { handleShopLink } from './shop-preview.js';
import { trendsToDiscord, marketToDiscord, newsToDiscord, freeMegaToDiscord, freeMegaGoneFromDiscord } from './discord.js';
import { discordInteractions } from './discord-bot.js';
import { notifyMegaphones, notifyListings, notifyTradeRequest } from './discord-alerts.js';
import { oauthStart, oauthCallback } from './discord-oauth.js';
import { postMegaphones, listMegaphones, pruneMegaphones, megaphoneAsks, megaphoneStats } from './megaphone.js';
import { listFreeMegas, postFreeMega, deleteFreeMega, reportFreeMega, pruneFreeMegas, requestTrade } from './free-mega.js';
import { storeDailyRollups, reportRaw } from './report.js';
import { count, flushUsage, isOver, meterDb, usageView } from './usage-guard.js';
import { createAlert, listAlerts, deleteAlert, takeHits, checkAlerts } from './alerts.js';
import { bodyTooLarge, sameSecret } from './secure.js';
import { handleAccount, handleAccountAlerts, readSession } from './account.js';
import { Support, handleSupport, handleSupportAdmin } from './support.js';
import { recordContribution, handleContributors, priceBoardToDiscord, leaderboardToDiscord } from './contributors.js';
import { recordScamMegaphones, scamList, postScamReport, postScamAppeal, handleScamAdmin, refreshProfiles } from './scam.js';
export { Presence, Support };
const ALLOWED_ORIGINS = ['https://gms-hub.com', 'https://www.gms-hub.com', 'http://localhost:8790', 'http://127.0.0.1:8790'];

// Paths that carry their own credential (collector tokens, Discord signatures) and are not rate limited per IP.
const TRUSTED = new Set(['/internal/market-batch', '/internal/shop-scan', '/internal/megaphone', '/internal/mail/send', '/internal/presence-peak', '/discord/interactions']);

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin'
  };
}

function json(data, headers, status = 200, cache = 'no-store') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' }
  });
}

async function visitorHash(ip, site, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${ip}:${site}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}


const KINDS = ['sold', 'selling', 'buying'];
export const SOLD_HEADLINE_MIN = 3;
const WINDOW = "datetime('now', '-14 days')";
const ITEMS_URL = 'https://gms-hub.com/assets/items.json';

// Tradeable item ids, loaded from the site's own item index once per worker instance, so a forged scan cannot invent items.
let itemIds = null, itemNamesMap = null, itemCats = null, itemLabels = null, itemKo = null;
async function loadItems() {
  if (itemIds) return;
  const r = await fetch(ITEMS_URL, { cf: { cacheTtl: 3600 } });
  if (!r.ok) throw new Error(`items ${r.status}`);
  const rows = await r.json();
  itemIds = new Set(rows.map((row) => row[0]));
  // English name → id (for megaphones) and id → category (Equip, Use, Etc, Setup, Cash).
  itemNamesMap = new Map(rows.map((row) => [String(row[2]).toLowerCase(), row[0]]));
  itemCats = new Map(rows.map((row) => [row[0], row[3]]));
  itemLabels = new Map(rows.map((row) => [row[0], String(row[2])]));
  itemKo = new Map(rows.map((row) => [row[0], String(row[1] || row[2])]));
}
async function knownItems() { await loadItems(); return itemIds; }
async function itemNames() { await loadItems(); return itemNamesMap; }
async function itemCategories() { await loadItems(); return itemCats; }
async function itemLabel() { await loadItems().catch(() => null); return (id, lang) => (lang === 'ko' ? itemKo : itemLabels)?.get(id); }

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

// One typo (an extra zero) should not move the price, so reports far from the item's median are ignored once there are a few.
function summarize(rows) {
  const kept = KINDS.flatMap((kind) => {
    const group = rows.filter((r) => r.kind === kind);
    const mid = median(group.map((r) => r.price));
    return group.length >= 3 ? group.filter((r) => r.price <= mid * 5 && r.price >= mid / 5) : group;
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const prices = kept.map((r) => r.price);
  const byKind = Object.fromEntries(
    KINDS.map((k) => {
      const ps = kept.filter((r) => r.kind === k).map((r) => r.price);
      return [k, ps.length ? { n: ps.length, median: median(ps) } : null];
    })
  );
  // The headline uses observed sales when there are at least three of them, then asks, then buy offers; one stray sale
  // must not outrank a hundred asking prices. Unlike kinds are never averaged together.
  const basis = byKind.sold?.n >= SOLD_HEADLINE_MIN ? 'sold' : byKind.selling ? 'selling' : byKind.sold ? 'sold' : 'buying';
  const primary = byKind[basis];
  return { n: kept.length, median: primary.median, basis, low: Math.min(...prices), high: Math.max(...prices), last: kept[0].created_at, ...byKind };
}

// The headline price follows the market of the last 24 hours (owner 2026-11-23: scroll prices fell ~40% in a day and
// a 14-day median still showed the old level). Wider windows are only a fallback for thinly traded items: 24 h when it
// holds at least three sales or three asks, else 3 days, else the full 14. `window` says which one was used.
const WINDOWS = [['24h', 1], ['3d', 3]];
export function recentSummary(rows, now = Date.now()) {
  for (const [name, days] of WINDOWS) {
    const since = new Date(now - days * DAY).toISOString().slice(0, 19).replace('T', ' ');
    const recent = rows.filter((r) => r.created_at >= since);
    const count = (k) => recent.filter((r) => r.kind === k).length;
    if (count('sold') >= SOLD_HEADLINE_MIN || count('selling') >= SOLD_HEADLINE_MIN) return { ...summarize(recent), window: name };
  }
  return { ...summarize(rows), window: '14d' };
}

// ---------- live ranking ----------
const DAY = 86400000;
const TOP_N = 10;
const parseUtc = (s) => Date.parse(`${s.replace(' ', 'T')}Z`);
const trimmed = (prices) => {
  const mid = median(prices);
  return prices.length >= 3 ? prices.filter((p) => p <= mid * 5 && p >= mid / 5) : prices;
};

// Items ranked by how much market activity players saw in the last 24 hours: every listing seen counts once and a sale
// counts three times, since a sale is the stronger signal. Rank movement compares with the same window an hour earlier.
function rankAt(obs, end) {
  const score = new Map();
  for (const o of obs) if (o.t > end - DAY && o.t <= end) score.set(o.item, (score.get(o.item) || 0) + (o.sold ? 3 : 1));
  return [...score.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([item]) => item);
}

const HOUR = 3600000;

// The ranking itself comes from item_market (one row per item, kept current by every collector run): the 24-hour
// score is open asks + 3 x sales, the same weights rankAt uses. "An hour ago" is the order this function stored an
// hour earlier (snapshot 'market-rank-hist'), so no 26-hour window of raw listings is re-read to rebuild it.
async function rankBoard(env, now = Date.now()) {
  const since = new Date(now - DAY).toISOString().slice(0, 19).replace('T', ' ');
  const { results: rows } = await env.DB.prepare('SELECT item, open, sold FROM item_market WHERE last >= ?').bind(since).all();
  const reports = await env.DB.prepare("SELECT item, kind FROM prices WHERE created_at >= ? AND kind != 'buying'").bind(since).all()
    .then((r) => r.results).catch(() => []);
  const score = new Map();
  for (const r of rows) if (r.open + r.sold) score.set(r.item, r.open + 3 * r.sold);
  for (const r of reports) score.set(r.item, (score.get(r.item) || 0) + (r.kind === 'sold' ? 3 : 1));
  const order = [...score.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([item]) => item);
  const kept = await env.DB.prepare("SELECT json FROM snapshots WHERE key = 'market-rank-hist'").first().catch(() => null);
  const hist = (kept ? JSON.parse(kept.json) : []).filter((h) => now - h.at < 3 * HOUR && h.at < now);
  const old = hist.filter((h) => now - h.at >= HOUR).at(-1) || hist[0];
  hist.push({ at: now, order: order.slice(0, 50) });
  await env.DB.prepare("INSERT OR REPLACE INTO snapshots (key,json,at) VALUES ('market-rank-hist',?,datetime('now'))").bind(JSON.stringify(hist)).run().catch(() => null);
  const sold = rows.reduce((n, r) => n + r.sold, 0) + reports.filter((r) => r.kind === 'sold').length;
  return {
    order,
    before: old ? old.order : order,
    stats: { listings: rows.reduce((n, r) => n + r.open + r.sold, 0) + reports.length, sold, items: score.size }
  };
}

async function marketTop(env, only = null) {
  // Reads stay proportional to one day of activity: the ranking needs the last 25 hours of everything, and the 8-day history
  // is fetched only for the ten items that made the list (or the one item asked for).
  const recent = (sql, ...args) => env.DB.prepare(sql).bind(...args).all().then((r) => r.results);
  // Day-by-day history: each listing counts once on every day between its first and last sighting (see dailyPoints),
  // so a shop seen on Monday and again on Wednesday at the same price shows on all three days.
  // The same listings hour by hour for the last day feed the sparkline, which reads as a line long before a week fills in.
  let hourly = [];
  const history = async (filter, ...ids) => {
    const listed = await recent(`SELECT item, price, sold, first_seen, last_seen AS seen FROM listings WHERE last_seen >= datetime('now', '-192 hours') ${filter}`, ...ids);
    const reports = await recent(`SELECT item, price, kind = 'sold' AS sold, created_at AS t FROM prices WHERE kind != 'buying' AND created_at >= datetime('now', '-192 hours') ${filter}`, ...ids);
    const point = (r) => ({ item: r.item, price: r.price, sold: r.sold, t: r.seen });
    hourly = dailyPoints(listed, Date.now(), 24, HOUR).map(point).concat(reports);
    return dailyPoints(listed, Date.now(), 8).map(point).concat(reports);
  };
  let results, board = null;
  if (only) results = await history('AND item = ?', only);
  else {
    board = await rankBoard(env);
    const ids = board.order.slice(0, TOP_N);
    const marks = ids.map(() => '?').join(',') || 'NULL';
    results = ids.length ? await history(`AND item IN (${marks})`, ...ids) : [];
  }
  const now = Date.now();
  const obs = results.map((r) => ({ item: r.item, price: r.price, sold: !!r.sold, t: parseUtc(r.t) }));
  const ranked = only ? (obs.some((o) => o.t > now - DAY) ? [only] : []) : board.order.slice(0, TOP_N);
  const before = only ? rankAt(obs, now - 3600000) : board.before;
  const byItem = new Map();
  for (const o of obs) (byItem.get(o.item) || byItem.set(o.item, []).get(o.item)).push(o);
  const hourlyBy = new Map();
  for (const r of hourly) (hourlyBy.get(r.item) || hourlyBy.set(r.item, []).get(r.item)).push({ ...r, t: parseUtc(r.t) });
  const items = ranked.map((item, i) => {
    const mine = byItem.get(item) || [];
    const useSold = mine.some((o) => o.sold && o.t > now - DAY && o.t <= now);
    const window = (from, to) => trimmed(mine.filter((o) => o.sold === useSold && o.t > from && o.t <= to).map((o) => o.price));
    const day = window(now - DAY, now);
    const prev = window(now - 2 * DAY, now - DAY);
    const prevRank = before.indexOf(item);
    return {
      item,
      rank: i + 1,
      // Positive = moved up; null = new to the ranking within the hour.
      move: prevRank < 0 ? null : prevRank - i,
      avg: day.length ? Math.round(day.reduce((a, b) => a + b, 0) / day.length) : null,
      median: day.length ? median(day) : null,
      basis: useSold ? 'sold' : 'selling',
      n: mine.filter((o) => o.t > now - DAY).length,
      sold: mine.filter((o) => o.sold && o.t > now - DAY).length,
      change: prev.length ? Math.round(((median(day) - median(prev)) / median(prev)) * 1000) / 10 : null,
      // Oldest first; a day with no observations is null so the line shows a gap instead of inventing a value.
      spark: Array.from({ length: 7 }, (_, k) => {
        const ps = window(now - (7 - k) * DAY, now - (6 - k) * DAY);
        return ps.length ? median(ps) : null;
      }),
      // 24 hourly medians, oldest first, from the same kind of price (sold or asking) as the daily line.
      hours: Array.from({ length: 24 }, (_, k) => {
        const ps = trimmed(hourlyBy.get(item)?.filter((o) => !!o.sold === useSold && o.t > now - (24 - k) * HOUR && o.t <= now - (23 - k) * HOUR).map((o) => o.price) || []);
        return ps.length ? median(ps) : null;
      })
    };
  });
  const day = obs.filter((o) => o.t > now - DAY);
  const stats = board ? { ...board.stats } : {
    listings: day.length,
    sold: day.filter((o) => o.sold).length,
    items: new Set(day.map((o) => o.item)).size
  };
  stats.shops = await openShops(env, new Date(now - DAY).toISOString().slice(0, 19).replace('T', ' '));
  return { at: new Date(now).toISOString(), stats, items };
}

// The ranking is computed on a schedule (every 30 minutes) and stored, so the database work does not grow with visitors:
// every page view reads one stored row.
async function refreshSnapshot(env) {
  const data = { ...(await marketTop(env)), version: await dataVersion(env) };
  await env.DB.prepare("INSERT OR REPLACE INTO snapshots (key, json, at) VALUES ('market', ?, datetime('now'))").bind(JSON.stringify(data)).run();
  return data;
}

// Read diet (D1 free plan: 5M rows read/day; 11/9 used 3.8M). New data arrives about hourly, but the ranking and the
// catalog were rebuilt every 15 and 5 minutes, each reading thousands of listings. A two-row version check (newest
// sighting, newest report) lets a stored snapshot stand until something changed, up to an hour, since "open in the last
// 24 hours" windows still move with the clock.
async function dataVersion(env) {
  const r = await env.DB.prepare('SELECT (SELECT MAX(last_seen) FROM listings) AS l, (SELECT MAX(id) FROM prices) AS p').first();
  return `${r?.l || ''}|${r?.p || ''}`;
}
async function freshSnapshot(env, key, minutes) {
  const row = await env.DB.prepare('SELECT json, at FROM snapshots WHERE key = ?').bind(key).first();
  if (!row) return null;
  const age = (Date.now() - Date.parse(`${row.at.replace(' ', 'T')}Z`)) / 60000;
  const data = JSON.parse(row.json);
  if (age < minutes) return data;
  if (age < 60 && data.version && data.version === (await dataVersion(env))) return data;
  return null;
}

// Everything the item view needs for one item: its listings of the last week (newest first, for the charts and the
// where-to-buy list), and its ranking-style summary.
async function itemDetail(env, item) {
  const { results } = await env.DB.prepare(
    `SELECT price, qty, sold, seller, channel, room, last_seen AS seen FROM listings WHERE item = ? AND last_seen >= datetime('now', '-7 days')
     ORDER BY last_seen DESC, id DESC LIMIT 401`
  )
    .bind(item)
    .all();
  const top = await marketTop(env, item);
  return { item, listings: results.slice(0, 400), trend: top.items[0] || null,
    asOf: new Date().toISOString(), limit: 400, truncated: results.length > 400 };
}

// Price summaries for a list of items (14 days of shop scans and reports, with reference and megaphone fallbacks).
async function pricesFor(env, ids) {
  // Player reports and scanned shops feed the same summary: a sold slot is a sale, an open slot an asking price.
  const { results } = await env.DB.prepare(
    `SELECT item, price, kind, created_at FROM prices WHERE item IN (SELECT value FROM json_each(?1)) AND created_at >= ${WINDOW}
     UNION ALL
     SELECT item, price, CASE WHEN sold THEN 'sold' ELSE 'selling' END, last_seen FROM listings WHERE item IN (SELECT value FROM json_each(?1)) AND last_seen >= ${WINDOW}
     ORDER BY created_at DESC`
  )
    .bind(JSON.stringify(ids))
    .all();
  // Items nobody has scanned or reported yet fall back to the source site's reference price (basis 'typical').
  const { results: refs } = await env.DB.prepare(`SELECT item, typical, day, week, sales, at FROM item_summary WHERE item IN (SELECT value FROM json_each(?))`)
    .bind(JSON.stringify(ids)).all().catch(() => ({ results: [] }));
  const ref = new Map(refs.map((r) => [r.item, r]));
  // Megaphone asking prices stand in for consumables, scrolls and cash items that no shop scan covers (scrolled
  // equipment sells in megaphones at prices unrelated to clean shop copies, so Equip never takes them).
  const [asks, cats] = await Promise.all([megaphoneAsks(env, ids).catch(() => ({})), itemCategories().catch(() => new Map())]);
  const out = {};
  for (const id of ids) {
    const rows = results.filter((r) => r.item === id);
    const t = ref.get(id);
    const typical = t ? { price: t.typical, day: t.day, week: t.week, sales: t.sales, at: t.at } : null;
    const mega = cats.get(id) !== 'Equip' && asks[id]?.n >= 5 && asks[id].p75 <= asks[id].p25 * 2 ? asks[id] : null;
    if (rows.length) out[id] = { ...recentSummary(rows), typical, mega };
    else if (mega) out[id] = { n: 0, median: mega.median, basis: 'mega', low: mega.p25, high: mega.p75, last: null, sold: null, selling: null, buying: null, typical, mega };
    else if (t) out[id] = { n: 0, median: t.typical, basis: 'typical', low: null, high: null, last: t.at, sold: null, selling: null, buying: null, typical, mega: null };
  }
  return out;
}

// /prices is cached per item, not per id list: a page asking for 30 items and another asking for 3 of them share the
// same entries, so database reads follow the number of distinct items looked at in five minutes, not the number of
// visitors or of id combinations. Items with nothing to show are cached too (as null), so they are not re-read either.
const PRICE_TTL = 1800; // 30 min (the headline is now a 24-hour median, still fine at this age; and each miss re-reads hundreds of raw rows (was 5 min: ~4.5M reads/day)
// Item share card PNG: /og/item/<id>-<ko|en>.png (gms-hub.com route and workers.dev). Item pages point og:image here
// with the build date in the query, so chat apps that cache previews still get a fresh card each day.
async function itemCard(req, env, ctx) {
  const m = new URL(req.url).pathname.match(/^\/og\/item\/(\d{7})-(ko|en)\.png$/);
  if (!m) return new Response('not found', { status: 404 });
  // The design version is part of the cache key, so a new look is not hidden behind six hours of cached old cards.
  const key = new Request(`${req.url}${req.url.includes('?') ? '&' : '?'}design=3`), cache = caches.default, hit = await cache.match(key);
  if (hit) return hit;
  const id = Number(m[1]), ko = m[2] === 'ko';
  const nameOf = await itemLabel();
  const [prices, hist, meta] = await Promise.all([
    cachedPrices(env, [id], new URL(req.url).origin, ctx).catch(() => ({})),
    marketHistory(env, new URLSearchParams({ id: String(id) })).catch(() => null),
    fetch(`https://maplestory.io/api/MCW/1/item/${id}`, { cf: { cacheTtl: 86400, cacheEverything: true } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const s = prices[id] || {}, mi = meta?.metaInfo || {};
  const price = s.typical?.price || s.median || null;
  // Days far from the usual price (a scrolled glove among clean ones) would bend the line; keep days within 3x of the middle.
  const raw = (hist?.daily || []).slice(-14).map((d) => d.typical || d.median).filter((v) => v > 0);
  const mid = [...raw].sort((a, b) => a - b)[Math.floor(raw.length / 2)] || 0;
  const daily = raw.filter((v) => v <= mid * 3 && v >= mid / 3);
  const atk = mi.incPAD ? (ko ? `공격력 +${mi.incPAD}` : `ATT +${mi.incPAD}`) : mi.incMAD ? (ko ? `마력 +${mi.incMAD}` : `M.ATT +${mi.incMAD}`) : null;
  const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(5, 16).replace('-', '/').replace('T', ' ');
  const counts = ko
    ? `팝니다 ${s.selling?.n || 0} · 팔림 ${s.sold?.n || 0}${s.mega?.n ? ` · 고확 ${s.mega.n}` : ''} · ${day} 기준`
    : `Selling ${s.selling?.n || 0} · Sold ${s.sold?.n || 0}${s.mega?.n ? ` · Megaphones ${s.mega.n}` : ''} · as of ${day} KST`;
  try {
    // Loaded only here: the renderer is WebAssembly, which the Node test runner cannot import with the rest of the worker.
    const { renderCard } = await import('./og-card.js');
    const png = await renderCard({
      ko, name: nameOf(id, ko ? 'ko' : 'en') || meta?.description?.name || `#${id}`, en: ko ? nameOf(id, 'en') : null, price,
      priceLabel: price ? (s.typical?.price ? (ko ? '보통 거래가 · 최근 실제 판매 기준' : 'Typical trade price · recent sales') : (ko ? '상점 매물 중간 가격' : 'Median shop price')) : (ko ? '아직 시세가 없어요' : 'No price yet'),
      daily, counts, req: mi.reqLevel || null, stat: atk, iconUrl: `https://maplestory.io/api/MCW/1/item/${id}/icon`,
    });
    const res = new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=21600', 'Access-Control-Allow-Origin': '*' } });
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (e) {
    return Response.redirect(`https://gms-hub.com/assets/og-market-${ko ? 'ko' : 'en'}.png`, 302);
  }
}

// Monster and quest-guide share cards: /og/monster/<id>-<lang>.png, /og/quest/<slug>-<lang>.png. The facts come from
// assets/og-cards.json, which the site build writes; no database reads.
async function pageCard(req, ctx) {
  const m = new URL(req.url).pathname.match(/^\/og\/(monster|quest)\/([a-z0-9-]+?)-(ko|en)\.png$/);
  if (!m) return new Response('not found', { status: 404 });
  const key = new Request(`${req.url}${req.url.includes('?') ? '&' : '?'}design=3`), cache = caches.default, hit = await cache.match(key);
  if (hit) return hit;
  const [, kind, id, lang] = m, ko = lang === 'ko';
  const data = await fetch('https://gms-hub.com/assets/og-cards.json', { cf: { cacheTtl: 3600, cacheEverything: true } }).then((r) => r.json()).catch(() => null);
  const nf = (n) => Number(n).toLocaleString('en-US');
  let card = null;
  const og = await import('./og-card.js');
  if (kind === 'monster' && data?.monsters?.[id]) {
    const x = data.monsters[id];
    card = { ko, tag: ko ? '몬스터 도감' : 'Monster', name: ko ? x.ko : x.en, en: ko ? x.en : null, main: `Lv. ${x.lv}`,
      label: `HP ${nf(x.hp)} · EXP ${nf(x.exp)}${x.boss ? (ko ? ' · 보스' : ' · Boss') : ''}`, mapName: x.map ? (ko ? x.map.ko : x.map.en) : null,
      picUrls: x.drops.map((d) => `https://maplestory.io/api/MCW/1/item/${d}/icon`),
      counts: ko ? `출현 맵 ${x.maps}곳 · 드롭 ${x.nDrops}종` : `${x.maps} maps · ${x.nDrops} drops`,
      iconUrl: x.gif ? `https://gms-hub.com/assets/monsters/${id}.gif` : `https://maplestory.io/api/MCW/1/mob/${id}/render/stand` };
    card.extra = og.monsterExtra(card);
  } else if (kind === 'quest' && data?.guides?.[id]) {
    const x = data.guides[id];
    card = { ko, tag: ko ? '퀘스트 공략' : 'Quest guide', name: x.title?.[lang] || id, en: ko ? x.title?.en : null, main: x.level?.[lang] || '',
      label: ko ? `퀘스트 ${x.quests}개 · NPC 위치·사냥터·재료까지` : `${x.quests} quests · NPCs, hunting spots and items`, reward: x.reward?.[lang] || null,
      picUrls: x.rewardItem ? [`https://maplestory.io/api/MCW/1/item/${x.rewardItem}/icon`] : [],
      counts: ko ? '단계별 공략 · 진행 체크' : 'Step-by-step walkthrough with progress',
      iconUrl: x.npc ? `https://maplestory.io/api/MCW/1/npc/${x.npc}/render/stand` : null };
    card.extra = og.questExtra(card);
  }
  if (!card) return Response.redirect(`https://gms-hub.com/assets/og-${ko ? 'ko' : 'en'}.png`, 302);
  try {
    const png = await og.renderCard(card);
    const res = new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=21600', 'Access-Control-Allow-Origin': '*' } });
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (e) {
    return Response.redirect(`https://gms-hub.com/assets/og-${ko ? 'ko' : 'en'}.png`, 302);
  }
}

async function cachedPrices(env, ids, origin, ctx) {
  const cache = globalThis.caches?.default;
  if (!cache) return pricesFor(env, ids);
  const key = (id) => new Request(`${origin}/__price-item/${id}`);
  const hits = await Promise.all(ids.map((id) => cache.match(key(id)).then((r) => (r ? r.json() : undefined)).catch(() => undefined)));
  const found = new Map();
  const miss = [];
  ids.forEach((id, i) => (hits[i] && 'v' in hits[i] ? found.set(id, hits[i].v) : miss.push(id)));
  if (miss.length) {
    // Shared store first: one row per item, recomputed only when its summary is over PRICE_TTL old (any region).
    const now = Date.now(), fresh = {}, stale = [];
    const { results: stored } = await env.DB.prepare('SELECT item, json, at FROM price_cache WHERE item IN (SELECT value FROM json_each(?))')
      .bind(JSON.stringify(miss)).all().catch(() => ({ results: [] }));
    const byItem = new Map(stored.map((r) => [r.item, r]));
    for (const id of miss) { const r = byItem.get(id); if (r && now - r.at < PRICE_TTL * 1000) fresh[id] = JSON.parse(r.json); else stale.push(id); }
    if (stale.length) {
      const computed = await pricesFor(env, stale);
      const rows = stale.map((id) => env.DB.prepare('INSERT OR REPLACE INTO price_cache (item, json, at) VALUES (?, ?, ?)').bind(id, JSON.stringify(computed[id] ?? null), now));
      const write = env.DB.batch(rows).catch(() => null);
      if (ctx?.waitUntil) ctx.waitUntil(write); else await write;
      for (const id of stale) fresh[id] = computed[id] ?? null;
    }
    const puts = miss.map((id) => {
      found.set(id, fresh[id] ?? null);
      return cache.put(key(id), new Response(JSON.stringify({ v: fresh[id] ?? null }),
        { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${PRICE_TTL}` } })).catch(() => {});
    });
    if (ctx?.waitUntil) ctx.waitUntil(Promise.all(puts)); else await Promise.all(puts);
  }
  const out = {};
  for (const id of ids) if (found.get(id)) out[id] = found.get(id);
  return out;
}

const api = {
  async scheduled(event, env, ctx) {
    // A failed job is written to the owner dashboard's error table (traffic.js logError) and the run goes on.
    const fail = (job) => (err) => { console.log(`${job} failed`, String(err)); logError(env, 'cron', job, 0, { e: err }); return null; };
    // The home top-10 snapshot reads the whole 8-day listings window, so it is remade hourly, not every tick.
    ctx.waitUntil(freshSnapshot(env, 'market', 50).then((data) => data || refreshSnapshot(env)).catch(fail('market-top')));
    ctx.waitUntil(refreshRank(env).catch(fail('rank')));
    // Official notices (site + followed Discord channel), with Korean for new ones: one row read, one or two writes.
    ctx.waitUntil(refreshNews(env).then((d) => newsToDiscord(env, d)).catch(fail('news')));
    // Once a day (the 16:00 UTC run, a quiet hour in Korea): old megaphones are dropped by a table scan. The megaphone
    // trend snapshot is refreshed once an hour. Both are read-heavy, so they are not run on every tick.
    const now = new Date();
    // The weekly report's daily rollups (yesterday's megaphones, today's ranking) are written before the prune runs.
    if (now.getUTCHours() === 16 && now.getUTCMinutes() < 15)
      ctx.waitUntil(storeDailyRollups(env).catch(fail('daily-rollups')).then(() => pruneMegaphones(env)).then(() => pruneFreeMegas(env)).then(() => pruneScanShops(env)).then(() => env.DB.prepare("DELETE FROM listing_gone WHERE at < datetime('now', '-31 days')").run()).catch(fail('daily-prune')));
    // Retention first, then the safety-net re-summary of everything seen in the last day (one 1-day scan).
    if (now.getUTCHours() === 16 && now.getUTCMinutes() < 15)
      ctx.waitUntil(archiveListings(env).catch(fail('archive-listings')).then(() => reconcileItemMarket(env)).catch(fail('reconcile-market')));
    // Four times a day (00, 06, 12, 18 UTC) the same snapshot also goes to the Discord trends channel.
    if (now.getUTCMinutes() < 15) ctx.waitUntil(itemNames().catch(() => null).then((names) => megaphoneStats(env, Date.now(), names)).then(async (d) => {
      await env.DB.prepare("INSERT OR REPLACE INTO snapshots (key,json,at) VALUES ('mega-stats',?,datetime('now'))").bind(JSON.stringify(d)).run();
      if (now.getUTCHours() % 6 === 0) await trendsToDiscord(env, d, await itemLabel(), (await freshSnapshot(env, 'market-catalog', 60).catch(() => null)) || (await marketCatalog(env).catch(() => null)));
    }).catch(fail('megaphone-stats')));
    // Live price board (pinned card edited twice an hour) and the contributor leaderboard (hourly) in #시세-거래-market.
    if (now.getUTCMinutes() % 30 < 15) ctx.waitUntil((async () => {
      const cat = (await freshSnapshot(env, 'market-catalog', 60)) || (await marketCatalog(env));
      await priceBoardToDiscord(env, cat, await itemLabel());
    })().catch(fail('discord-price-board')));
    if (now.getUTCMinutes() < 15) ctx.waitUntil(leaderboardToDiscord(env).catch(fail('discord-leaderboard')));
    // Scam report cards: reported characters' level, job and picture, read again every few days (5 names an hour).
    if (now.getUTCMinutes() < 15) ctx.waitUntil(refreshProfiles(env, lookupCharacter).catch(fail('scam-profiles')));
    // Scanned shops' owner pictures (/trade/): a few names on the other three ticks of the hour, kept for a week.
    if (now.getUTCMinutes() >= 15) ctx.waitUntil(refreshFaces(env, lookupCharacter, 10).catch(fail('shop-faces')));
    // Daily market summary in #시세-거래-market at 21:00 KST (12:00 UTC run), once a day (snapshot key per KST day).
    if (now.getUTCHours() === 12 && now.getUTCMinutes() < 15) ctx.waitUntil((async () => {
      const key = `discord-market:${new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)}`;
      if (await env.DB.prepare('SELECT 1 FROM snapshots WHERE key = ?').bind(key).first()) return;
      const cat = (await freshSnapshot(env, 'market-catalog', 60)) || (await marketCatalog(env));
      if (await marketToDiscord(env, cat, await itemLabel())) await env.DB.prepare("INSERT OR REPLACE INTO snapshots (key,json,at) VALUES (?,'1',datetime('now'))").bind(key).run();
    })().catch(fail('discord-market')));
    ctx.waitUntil(checkAlerts(env).catch(fail('price-alerts')));
  },

  async fetch(req, env, ctx) {
    // gms-hub.com/s/<name>: short shop link with a link preview (src/shop-preview.js, worker route on the site's zone).
    if (new URL(req.url).pathname.startsWith('/s/')) return handleShopLink(req, env, ctx, await itemLabel());
    if (new URL(req.url).pathname.startsWith('/og/item/')) return itemCard(req, env, ctx);
    // gms-hub.com/ads.txt (worker route): note who read it, then hand the request to the site unchanged.
    if (new URL(req.url).pathname === '/ads.txt' && new URL(req.url).hostname === 'gms-hub.com') { logBlock(env, req, 'adstxt'); return fetch(req); }
    if (/^\/og\/(monster|quest)\//.test(new URL(req.url).pathname)) return pageCard(req, ctx);
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const cors = corsHeaders(origin);
    // Per-IP rate limits (Workers rate limiting, counted per Cloudflare location). The collectors and Discord carry their
    // own credentials and skip this. Limits are loose because many Korean players share a few VPN exits.
    if (!TRUSTED.has(url.pathname) && req.method !== 'OPTIONS') {
      const ip = req.headers.get('CF-Connecting-IP') || '';
      const write = req.method !== 'GET' && req.method !== 'HEAD';
      const rl = write ? env.RL_WRITE : null; // reads (prices, listings) are never limited (owner's call)
      const verdict = rl && ip ? await rl.limit({ key: ip }).catch((e) => { console.log('ratelimit error', String(e)); return { success: true }; }) : null;
      if (verdict && !verdict.success)
        return json({ error: 'too many requests' }, { ...cors, 'Retry-After': '60' }, 429);
      // Public forms are small; an oversized body is turned away before any of it is parsed.
      if (write && bodyTooLarge(req)) return json({ error: 'body too large' }, cors, 413);
    }
    // Private extension service worker uses a narrowly scoped ingestion token, never public CORS.
    if (url.pathname === '/internal/market-batch') return handleMarketBatch(req, env, knownItems, (rows) => {
      if (rows.length && ctx?.waitUntil) ctx.waitUntil(itemLabel().then((nameOf) => notifyListings(env, rows, nameOf)).catch(() => null));
    });
    // The in-game shop collector sends one Free Market room at a time with its own token.
    if (url.pathname === '/internal/shop-scan') return handleShopScan(req, env, knownItems, (rows) => {
      if (rows.length && ctx?.waitUntil) ctx.waitUntil(itemLabel().then((nameOf) => notifyListings(env, rows, nameOf)).catch(() => null));
    });
    if (url.pathname === '/internal/market-boost') return handleMarketBoost(req, env);
    if (url.pathname === '/internal/mail/send' && req.method === 'POST') return handleSendMail(req, env);
    if (url.pathname === '/internal/presence-peak' && req.method === 'GET') return handlePresencePeak(req, env);
    if (url.pathname === '/internal/adstxt' && req.method === 'GET') return ownerOnly(req, env) ? Response.json(await adsTxtReads(env)) : new Response('forbidden', { status: 403 });
    // GA-style people count from every page (assets/analytics.js); a beacon, so the answer carries nothing.
    if (url.pathname === '/hit' && req.method === 'POST') {
      if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'forbidden origin' }, cors, 403);
      await handleHit(req, env);
      return new Response(null, { status: 204, headers: cors });
    }
    if (url.pathname === '/tool-report' && req.method === 'POST') {
      if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'forbidden origin' }, cors, 403);
      const out = await handleToolReport(req, env);
      return json(out, cors, out.error ? 400 : 200);
    }
    if (url.pathname === '/internal/traffic') return handleTraffic(req, env, ctx, ALLOWED_ORIGINS);
    if (url.pathname === '/internal/scam') return handleScamAdmin(req, env, ALLOWED_ORIGINS, lookupCharacter);
    // The collector page runs on gms-hub.com (or localhost while testing) and sends the admin key, so it needs CORS.
    // Discord slash commands (signed by Discord; see discord-bot.js). Prices come from this worker's own summary.
    // Price alerts set on the website through "Log in with Discord" (see discord-oauth.js).
    if (url.pathname === '/discord/oauth/start' && req.method === 'GET') return oauthStart(url, env, async (id) => (await knownItems().catch(() => null))?.has(id));
    if (url.pathname === '/discord/oauth' && req.method === 'GET') {
      await loadItems().catch(() => null);
      return oauthCallback(url, env, (id, lang) => (lang === 'ko' ? itemKo : itemLabels)?.get(id));
    }
    // Site-wide "Log in with Discord": the visitor's own settings, copied between their devices (see account.js).
    if (url.pathname === '/support') {
      if (req.method !== 'GET' && req.method !== 'OPTIONS' && !ALLOWED_ORIGINS.includes(origin)) return json({ error: 'forbidden origin' }, cors, 403);
      return handleSupport(req, env, cors);
    }
    if (url.pathname === '/internal/support') return handleSupportAdmin(req, env, ALLOWED_ORIGINS);
    if (url.pathname === '/account/data') return handleAccount(req, env, cors);
    if (url.pathname === '/contributors' && (req.method === 'GET' || req.method === 'OPTIONS')) return handleContributors(req, env, cors);
    if (url.pathname === '/account/alerts') {
      await loadItems().catch(() => null);
      return handleAccountAlerts(req, env, cors, async (id) => (await knownItems().catch(() => null))?.has(id), (id, lang) => (lang === 'ko' ? itemKo : itemLabels)?.get(id));
    }
    if (url.pathname === '/discord/interactions' && req.method === 'POST') {
      return discordInteractions(req, env, { env, discord: env.DISCORD_INVITE,
        prices: (id) => api.fetch(new Request(`https://internal.invalid/prices?ids=${id}`), env, ctx).then((r) => r.json()),
        // Read-only site API (listings, catalog, megaphones) for /listings, /movers and /megaphone; same edge caches.
        get: (p) => api.fetch(new Request(`https://internal.invalid${p}`), env, ctx).then((r) => (r.ok ? r.json() : null)) });
    }
    if (url.pathname === '/internal/megaphone') {
      const allow = { ...corsHeaders(req.headers.get('Origin') || ''), 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
      if (req.method === 'OPTIONS') return new Response(null, { headers: allow });
      if (req.method !== 'POST') return json({ error: 'method not allowed' }, allow, 405);
      const r = await postMegaphones(req, env, itemNames, (rows, enriched = false) => {
        const p = enriched ? Promise.resolve() : itemLabel().then((nameOf) => notifyMegaphones(env, rows, nameOf)).catch(() => null);
        // Every open page gets the new megaphones at once over its presence socket (ticker and megaphone page redraw).
        const push = env.PRESENCE ? env.PRESENCE.get(env.PRESENCE.idFromName('site')).fetch('https://presence/push', { method: 'POST', body: JSON.stringify({ type: 'megaphones', rows: rows.map((x) => ({ id: x.id, seen: x.seen, kind: x.kind, color: x.color ?? null, channel: x.channel ?? null, nick: x.nick, text: x.text, item: x.item ?? null, intent: x.intent ?? null, price: x.price ?? null, ...(x.opts ? { opts: x.opts } : {}) })) }) }).catch(() => null) : null;
        if (ctx?.waitUntil) { ctx.waitUntil(p); if (push) ctx.waitUntil(push); }
        // Warnings about other players ("X is a scammer") are kept for the scam report page (scam.js).
        if (!enriched && ctx?.waitUntil) ctx.waitUntil(recordScamMegaphones(env, rows, lookupCharacter).catch((e) => console.log('scam record failed', String(e))));
      });
      for (const [k, v] of Object.entries(allow)) r.headers.set(k, v);
      return r;
    }
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    if (url.pathname === '/market/status' && req.method === 'GET') {
      const s = await getCollectionStatus(env);
      return json({ state: s.state, lastSuccessAt: s.lastSuccessAt, nextEligibleAt: s.nextEligibleAt,
        intervalSeconds: s.policy.intervalSeconds, asOf: s.asOf }, cors, 200, 'public, max-age=180');
    }

    // Collector watch (assets: none; for operators and the daily check): the extension's last heartbeat and last runs.
    if (url.pathname === '/report/raw' && req.method === 'GET') {
      try { return json(await reportRaw(env), cors, 200, 'public, max-age=3600'); } catch (e) { noteError(req, e); return json({ error: 'report unavailable' }, cors, 503); }
    }
    if (url.pathname === '/market/collector' && req.method === 'GET') {
      if (!(await ownerOnly(req, env))) return json({ error: 'forbidden' }, cors, 403);
      return json(await collectorView(env), cors, 200, 'no-store');
    }

    if (url.pathname === '/votes' && req.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT site, count FROM votes').all();
      return json(Object.fromEntries(results.map((r) => [r.site, r.count])), cors, 200, 'public, max-age=30');
    }

    // Scroll forge counter (forge-counts.js): batches of results posted as text (no preflight), totals read with a short cache.
    if (url.pathname === '/forge/count' && req.method === 'POST') {
      if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'forbidden origin' }, cors, 403);
      const body = await req.text().then((t) => JSON.parse(t)).catch(() => null);
      const r = await addForgeCounts(env, body);
      return json(r.body, cors, r.status);
    }
    if (url.pathname === '/forge/count' && req.method === 'GET') return json(await forgeCounts(env), cors, 200, 'public, max-age=30');

    // Shared EXP tracker runs (exp-runs.js): stored only when a player presses the share button; read as per-spot medians.
    if (url.pathname === '/exp-runs' && req.method === 'POST') {
      if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'forbidden origin' }, cors, 403);
      const r = await addExpRun(req, env);
      if (r.status === 200) await env.DB.prepare("DELETE FROM snapshots WHERE key = 'exp-runs'").run();
      return json(r.body, cors, r.status);
    }
    if (url.pathname === '/exp-runs/summary' && req.method === 'GET') {
      const cached = await freshSnapshot(env, 'exp-runs', 30);
      const data = cached || (await expRunsSummary(env));
      if (!cached) await env.DB.prepare("INSERT OR REPLACE INTO snapshots (key,json,at) VALUES ('exp-runs',?,datetime('now'))").bind(JSON.stringify(data)).run();
      return json(data, cors, 200, 'public, max-age=300');
    }

    if (url.pathname === '/vote' && req.method === 'POST') {
      if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'forbidden origin' }, cors, 403);
      const body = await req.json().catch(() => null);
      const site = typeof body?.site === 'string' ? body.site : '';
      if (!/^[a-z0-9-]{1,80}$/.test(site)) return json({ error: 'bad site' }, cors, 400);
      // Only sites seeded from the directory can receive votes.
      const row = await env.DB.prepare('SELECT count FROM votes WHERE site = ?').bind(site).first();
      if (!row) return json({ error: 'unknown site' }, cors, 404);

      const ip = req.headers.get('CF-Connecting-IP') || '';
      const voter = await visitorHash(ip, site, env.VOTE_SALT);
      const ins = await env.DB.prepare('INSERT OR IGNORE INTO voters (site, voter) VALUES (?, ?)').bind(site, voter).run();
      const counted = ins.meta.changes === 1;
      if (counted) await env.DB.prepare('UPDATE votes SET count = count + 1 WHERE site = ?').bind(site).run();
      const after = await env.DB.prepare('SELECT count FROM votes WHERE site = ?').bind(site).first();
      return json({ site, count: after.count, counted }, cors);
    }

    if (url.pathname === '/prices' && req.method === 'GET') {
      const ids = [...new Set((url.searchParams.get('ids') || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 60);
      if (!ids.length) return json({}, cors);
      const out = await cachedPrices(env, ids, url.origin, ctx);
      return json(out, cors, 200, 'public, max-age=300');
    }

    if (url.pathname === '/prices/all' && req.method === 'GET') {
      // Item pages bake these into static HTML for search engines, so only player scans and reports count, never imported rows.
      const real = "reporter NOT LIKE 'initial:%' AND reporter NOT LIKE 'seed:%'";
      const { results } = await env.DB.prepare(
        `SELECT item, price, kind, created_at FROM prices WHERE created_at >= ${WINDOW} AND ${real}
         UNION ALL
         SELECT item, price, CASE WHEN sold THEN 'sold' ELSE 'selling' END, last_seen FROM listings WHERE last_seen >= ${WINDOW} AND ${real}
         ORDER BY created_at DESC`
      ).all();
      const byItem = new Map();
      for (const r of results) (byItem.get(r.item) || byItem.set(r.item, []).get(r.item)).push(r);
      const out = {};
      for (const [item, rows] of byItem) out[item] = recentSummary(rows);
      // Read by the site build only (item pages bake it); six hours of staleness is fine and keeps the 14-day scan rare.
      return json(out, cors, 200, 'public, max-age=21600');
    }

    if (url.pathname === '/prices/recent' && req.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT item, price, kind, created_at AS at FROM prices ORDER BY id DESC LIMIT 40').all();
      // Same outlier rule as the summaries, so a troll price never shows up in the feed either.
      const mids = {};
      for (const r of results) (mids[r.item] ||= []).push(r.price);
      for (const k in mids) mids[k] = mids[k].length >= 3 ? median(mids[k]) : null;
      const shown = results.filter((r) => !mids[r.item] || (r.price <= mids[r.item] * 5 && r.price >= mids[r.item] / 5)).slice(0, 20);
      return json(shown, cors, 200, 'public, max-age=30');
    }

    if (req.method === 'GET' && ['/market/catalog', '/market/listings', '/market/reports', '/market/history'].includes(url.pathname)) {
      try {
        let data;
        if (url.pathname === '/market/catalog') {
          const cached = await freshSnapshot(env, 'market-catalog', 15);
          data = cached || { ...(await marketCatalog(env)), version: await dataVersion(env) };
          if (!cached) await env.DB.prepare("INSERT OR REPLACE INTO snapshots (key,json,at) VALUES ('market-catalog',?,datetime('now'))").bind(JSON.stringify(data)).run();
        } else if (url.pathname === '/market/listings') data = await browseListings(env, url.searchParams);
        else if (url.pathname === '/market/reports') data = await browseReports(env, url.searchParams);
        else data = await marketHistory(env, url.searchParams);
        // Edge cache: data changes about hourly, so a minute (catalog five) saves repeat reads without visible lag.
        // The catalog itself is recomputed at most every 15 minutes (the collector uploads about that often), since each
        // recomputation reads the whole 7-day listings window.
        return json(data, cors, 200, ['/market/catalog', '/market/history'].includes(url.pathname) && !data.filtered ? 'public, max-age=300' : 'public, max-age=60');
      } catch (e) {
        const invalid = e.message?.startsWith('bad ');
        if (!invalid) noteError(req, e);
        return json({error: invalid ? e.message : 'market unavailable'}, cors, invalid ? 400 : 503);
      }
    }

    if (url.pathname === '/alerts' || url.pathname === '/alerts/hits') {
      const endpoint = url.searchParams.get('endpoint') || '';
      if (req.method !== 'GET' && !ALLOWED_ORIGINS.includes(origin)) return json({ error: 'forbidden origin' }, cors, 403);
      let out;
      if (url.pathname === '/alerts/hits' && req.method === 'GET') out = await takeHits(env, endpoint);
      else if (req.method === 'POST') out = await createAlert(env, await req.json().catch(() => null));
      else if (req.method === 'DELETE') out = await deleteAlert(env, endpoint, url.searchParams.get('item'));
      else if (req.method === 'GET') out = await listAlerts(env, endpoint);
      else out = [{ error: 'method' }, 405];
      return json(out[0], cors, out[1], 'no-store');
    }

    // Official game notices for the home page: the snapshot the schedule stores every 15 minutes (rebuilt here only
    // when it is missing or stale), edge-cached.
    if (url.pathname === '/news' && req.method === 'GET') {
      try { return json((await freshSnapshot(env, 'news', 40)) || (await refreshNews(env)), cors, 200, 'public, max-age=600'); }
      catch (e) { noteError(req, e); return json({ error: 'news unavailable' }, cors, 502); }
    }

    if (url.pathname === '/megaphones/stats' && req.method === 'GET') {
      // Served from the snapshot the schedule writes every three hours; computed on demand only when none exists yet.
      const data = (await freshSnapshot(env, 'mega-stats', 90)) || (await itemNames().catch(() => null).then((names) => megaphoneStats(env, Date.now(), names)).then(async (d) => {
        await env.DB.prepare("INSERT OR REPLACE INTO snapshots (key,json,at) VALUES ('mega-stats',?,datetime('now'))").bind(JSON.stringify(d)).run();
        return d;
      }));
      return json(data, cors, 200, 'public, max-age=300');
    }

    // 무료 고확: site-written trade posts (free-mega.js). New and removed posts reach every open page over the presence
    // socket at once, like game megaphones; the list itself is edge-cached for 10 s.
    if (url.pathname === '/free-megas' || url.pathname === '/free-megas/report' || url.pathname === '/free-megas/request') {
      const push = (msg) => {
        const p = env.PRESENCE?.get(env.PRESENCE.idFromName('site')).fetch('https://presence/push', { method: 'POST', body: JSON.stringify(msg) }).catch(() => null);
        if (p && ctx?.waitUntil) ctx.waitUntil(p);
      };
      // Item names ride along so the header ticker can print a post without loading the item index.
      const named = async (rows) => { const nameOf = await itemLabel(); return rows.map((r) => (r.item ? { ...r, en: nameOf(r.item, 'en') || null, ko: nameOf(r.item, 'ko') || null } : r)); };
      if (req.method === 'GET' && url.pathname === '/free-megas') { const d = await listFreeMegas(env, url.searchParams); return json({ ...d, rows: await named(d.rows) }, cors, 200, 'public, max-age=10'); }
      // Posting, deleting and reporting only from the site's own pages, like every other public write.
      if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'forbidden origin' }, cors, 403);
      const who = await visitorHash(req.headers.get('CF-Connecting-IP') || '', 'free-mega', env.VOTE_SALT);
      if (req.method === 'POST' && url.pathname === '/free-megas') {
        // Logged in with Discord: the post remembers its writer, so a 거래 신청 can reach them by DM.
        const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
        const writer = bearer ? (await readSession(env.DISCORD_CLIENT_SECRET, bearer).catch(() => null))?.u || null : null;
        const [out, status] = await postFreeMega(env, await req.json().catch(() => null), who, await knownItems().catch(() => null), writer);
        if (out.row) { out.row = (await named([out.row]))[0]; push({ type: 'free', rows: [out.row] }); ctx?.waitUntil?.(freeMegaToDiscord(env, out.row).catch(() => null)); }
        return json(out, cors, status, 'no-store');
      }
      if (req.method === 'DELETE' && url.pathname === '/free-megas') {
        const id = Number(url.searchParams.get('id'));
        const msg = (await env.DB.prepare('SELECT discord_msg FROM free_megaphones WHERE id = ?').bind(id).first().catch(() => null))?.discord_msg;
        const [out, status] = await deleteFreeMega(env, id, url.searchParams.get('key'));
        if (out.ok) { push({ type: 'free-gone', id }); ctx?.waitUntil?.(freeMegaGoneFromDiscord(env, msg)); }
        return json(out, cors, status, 'no-store');
      }
      if (req.method === 'POST' && url.pathname === '/free-megas/request') {
        const [out, status, send] = await requestTrade(env, await req.json().catch(() => null), who);
        if (send) { const nameOf = await itemLabel().catch(() => null); out.dm = await notifyTradeRequest(env, send, send.post.item && nameOf ? nameOf(send.post.item, send.post.lang === 'en' ? 'en' : 'ko') || nameOf(send.post.item, 'en') : '').catch(() => false); }
        return json(out, cors, status, 'no-store');
      }
      if (req.method === 'POST' && url.pathname === '/free-megas/report') {
        const id = Number((await req.json().catch(() => null))?.id);
        const [out, status] = await reportFreeMega(env, id, who);
        if (out.hidden) { push({ type: 'free-gone', id }); const msg = (await env.DB.prepare('SELECT discord_msg FROM free_megaphones WHERE id = ?').bind(id).first().catch(() => null))?.discord_msg; ctx?.waitUntil?.(freeMegaGoneFromDiscord(env, msg)); }
        return json(out, cors, status, 'no-store');
      }
      return json({ error: 'method not allowed' }, cors, 405);
    }

    // Scam reports (scam.js): the list is one stored snapshot, rebuilt only when a report is added or reviewed.
    if (url.pathname === '/scam' && req.method === 'GET') return json(await scamList(env), cors, 200, 'public, max-age=60');
    if ((url.pathname === '/scam/report' || url.pathname === '/scam/appeal') && req.method === 'POST') {
      if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'forbidden origin' }, cors, 403);
      const who = await visitorHash(req.headers.get('CF-Connecting-IP') || '', 'scam', env.VOTE_SALT);
      const body = await req.json().catch(() => null);
      const [out, status] = url.pathname === '/scam/report' ? await postScamReport(env, body, who) : await postScamAppeal(env, body, who);
      return json(out, cors, status, 'no-store');
    }

    if (url.pathname === '/megaphones' && req.method === 'GET') {
      // The plain latest list (header ticker on every page, first load of the megaphone page) is one shared URL: 30 s keeps
      // it to two reads a minute per data centre however many tabs are open; new megaphones are pushed over the socket.
      // ?after=<id> catch-ups are per tab but only read the rows newer than that id.
      const mp = url.searchParams;
      return json(await listMegaphones(env, mp), cors, 200, mp.get('item') ? 'public, max-age=120' : mp.get('after') ? 'public, max-age=5' : 'public, max-age=30');
    }

    if (url.pathname === '/rank' && req.method === 'GET') {
      const data = await rankSnapshot(env);
      return data ? json(data, cors, 200, 'public, max-age=300') : json({ error: 'ranking not ready' }, cors, 503);
    }

    if (url.pathname === '/rank/lookup' && req.method === 'GET') {
      const r = await lookupCharacter(url.searchParams.get('name'));
      return json(r.body, cors, r.status, r.status === 200 || r.status === 404 ? 'public, max-age=3600' : 'no-store');
    }

    // 상점 스캔으로 올라온 상점 for /trade/ (scan-shops.js): a 5-minute snapshot, edge-cached a minute.
    if (url.pathname === '/market/scan-shops' && req.method === 'GET') {
      try {
        let data = await freshSnapshot(env, 'scan-shops', 5);
        if (!data) {
          data = await scanShops(env);
          await env.DB.prepare("INSERT OR REPLACE INTO snapshots (key,json,at) VALUES ('scan-shops',?,datetime('now'))").bind(JSON.stringify(data)).run();
        }
        return json(data, cors, 200, 'public, max-age=60');
      } catch (e) { noteError(req, e); return json({ error: 'shops unavailable' }, cors, 503); }
    }

    if (url.pathname === '/market/top' && req.method === 'GET') {
      const data = (await freshSnapshot(env, 'market', 30)) || (await refreshSnapshot(env));
      return json(data, cors, 200, 'public, max-age=60');
    }

    if (url.pathname === '/market/item' && req.method === 'GET') {
      const item = Number(url.searchParams.get('id'));
      if (!Number.isInteger(item) || item < 1000000 || item > 9999999) return json({ error: 'bad item' }, cors, 400);
      return json(await itemDetail(env, item), cors, 200, 'public, max-age=300');
    }

    if (url.pathname === '/listings/recent' && req.method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT item, price, qty, sold, seller, channel, room, last_seen AS seen, opts FROM listings ORDER BY last_seen DESC, id DESC LIMIT ?'
      )
        .bind(Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 30)))
        .all();
      // Options (when the shop reader sent them) go out parsed, so the home feed can show them.
      return json(results.map(({ opts, ...r }) => (opts ? { ...r, opts: parseOptions(opts) } : r)), cors, 200, 'public, max-age=20');
    }

    // Players name Free Market rooms the scanner does not know; collected here and merged into the shared table by hand.
    if (url.pathname === '/room-title' && req.method === 'POST') {
      if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'forbidden origin' }, cors, 403);
      const body = await req.json().catch(() => null);
      const room = Number(body?.room);
      const key = typeof body?.key === 'string' ? body.key : '';
      if (!validRoom(room) || !/^[0-9.]{10,4000}$/.test(key)) return json({ error: 'bad input' }, cors, 400);
      const reporter = await visitorHash(req.headers.get('CF-Connecting-IP') || '', 'room', env.VOTE_SALT);
      await env.DB.prepare('INSERT INTO room_titles (key, room, reporter) VALUES (?, ?, ?)').bind(key, room, reporter).run();
      return json({ ok: true }, cors);
    }

    // A player correcting a line they sent: the row is matched by its old values and by the sender's hash, so nobody can edit
    // someone else's scans. If the corrected listing already exists, the mistaken row is simply removed.
    if (url.pathname === '/listings/fix' && req.method === 'POST') {
      if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'forbidden origin' }, cors, 403);
      const body = await req.json().catch(() => null);
      const from = body?.from || {};
      const to = { ...body?.to, channel: body?.to?.channel ?? from.channel, room: body?.to?.room ?? from.room };
      const valid = await knownItems().catch(() => null);
      if (!valid) return json({ error: 'item index unavailable' }, cors, 503);
      const okTo =
        valid.has(to.item) && Number.isInteger(to.price) && to.price >= 1 && to.price <= 10_000_000_000 &&
        Number.isInteger(to.qty) && to.qty >= 1 && to.qty <= 10000 && typeof to.seller === 'string' && /^[A-Za-z0-9]{4,13}$/.test(to.seller) &&
        typeof to.sold === 'boolean' && Number.isInteger(to.channel) && to.channel >= 1 && to.channel <= 40 &&
        validRoom(to.room);
      if (!okTo || !Number.isInteger(from.item) || !Number.isInteger(from.price) ||
          typeof from.seller !== 'string' || !/^[A-Za-z0-9]{2,13}$/.test(from.seller) ||
          !Number.isInteger(from.channel) || from.channel < 1 || from.channel > 40 ||
          !validRoom(from.room)) return json({ error: 'bad input' }, cors, 400);
      const reporter = await visitorHash(req.headers.get('CF-Connecting-IP') || '', 'scan', env.VOTE_SALT);
      const where = 'seller = ? AND item = ? AND price = ? AND channel = ? AND room = ? AND reporter = ?';
      const keys = [from.seller, from.item, from.price, from.channel, from.room, reporter];
      const original = await env.DB.prepare(`SELECT id FROM listings WHERE ${where}`).bind(...keys).first();
      const target = await env.DB.prepare('SELECT id, reporter, qty, sold FROM listings WHERE seller = ? AND item = ? AND price = ? AND channel = ? AND room = ?')
        .bind(to.seller, to.item, to.price, to.channel, to.room).first();
      // A lost response may be retried. Acknowledge only a correction belonging to this reporter with identical values.
      if (!original) return target?.reporter === reporter && target.qty === to.qty && target.sold === Number(to.sold)
        ? json({ fixed: 1 }, cors) : json({ error: 'listing not found' }, cors, 404);
      if (target && target.id !== original.id) return json({ error: 'listing already exists' }, cors, 409);
      try {
        const res = await env.DB.prepare(`UPDATE listings SET item = ?, price = ?, qty = ?, sold = ?, seller = ?, channel = ?, room = ? WHERE ${where}`)
          .bind(to.item, to.price, to.qty, to.sold ? 1 : 0, to.seller, to.channel, to.room, ...keys)
          .run();
        return json({ fixed: res.meta.changes }, cors);
      } catch (e) {
        // A database error must never erase the original observation.
        noteError(req, e);
        return json({ error: 'correction failed' }, cors, 503);
      }
    }

    // The scan page's "remove this misread line": deletes one listing, only if this same connection reported it (the same
    // reporter hash as /listings and /listings/fix), so nobody can remove other people's or the collectors' rows.
    // "팔렸어요": one press from a visitor who found the listing gone at the shop (owner 2026-11-18). Counted once per
    // visitor (IP hash) per listing; only open listings count. Answers the listing's new count.
    if (url.pathname === '/listings/gone' && req.method === 'POST') {
      if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'forbidden origin' }, cors, 403);
      const body = await req.json().catch(() => null);
      const id = Number(body?.id);
      if (!Number.isInteger(id) || id < 1) return json({ error: 'bad input' }, cors, 400);
      const reporter = await visitorHash(req.headers.get('CF-Connecting-IP') || '', 'gone', env.VOTE_SALT);
      const mode = String(body?.mode || '');
      // Undo (owner 2026-11-18): the visitor takes back their own report.
      if (mode === 'undo') {
        const del = await env.DB.prepare('DELETE FROM listing_gone WHERE listing = ? AND reporter = ?').bind(id, reporter).run();
        if (!del.meta.changes) return json({ ok: true, n: (await env.DB.prepare('SELECT gone_n FROM listings WHERE id = ?').bind(id).first())?.gone_n || 0 }, cors);
        const row = await env.DB.prepare("UPDATE listings SET gone_n = MAX(gone_n - 1, 0), gone_at = CASE WHEN gone_n - 1 > 0 THEN gone_at END WHERE id = ? RETURNING gone_n").bind(id).first();
        return json({ ok: true, n: row?.gone_n || 0 }, cors);
      }
      // "아직 있어요": someone at the shop saw it still there, so earlier reports are cleared.
      if (mode === 'here') {
        await env.DB.batch([env.DB.prepare('DELETE FROM listing_gone WHERE listing = ?').bind(id), env.DB.prepare('UPDATE listings SET gone_n = 0, gone_at = NULL WHERE id = ? AND gone_n > 0').bind(id)]);
        return json({ ok: true, n: 0 }, cors);
      }
      const add = await env.DB.prepare('INSERT OR IGNORE INTO listing_gone (listing, reporter) SELECT id, ? FROM listings WHERE id = ? AND sold = 0').bind(reporter, id).run();
      if (!add.meta.changes) {
        const row = await env.DB.prepare('SELECT gone_n FROM listings WHERE id = ?').bind(id).first();
        return json({ ok: !!row, n: row?.gone_n || 0, again: !!row }, cors, row ? 200 : 404);
      }
      const row = await env.DB.prepare("UPDATE listings SET gone_n = gone_n + 1, gone_at = datetime('now') WHERE id = ? RETURNING gone_n").bind(id).first();
      if (ctx?.waitUntil) ctx.waitUntil(recordContribution(env, req, 'gone', 1, reporter).catch(() => null));
      return json({ ok: true, n: row?.gone_n || 1 }, cors);
    }

    if (url.pathname === '/listings/remove' && req.method === 'POST') {
      if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'forbidden origin' }, cors, 403);
      const l = (await req.json().catch(() => null))?.listing || {};
      if (!Number.isInteger(l.item) || !Number.isInteger(l.price) || typeof l.seller !== 'string' || !/^[A-Za-z0-9]{2,13}$/.test(l.seller) ||
          !Number.isInteger(l.channel) || l.channel < 1 || l.channel > 40 || !validRoom(l.room)) return json({ error: 'bad input' }, cors, 400);
      const reporter = await visitorHash(req.headers.get('CF-Connecting-IP') || '', 'scan', env.VOTE_SALT);
      const res = await env.DB.prepare('DELETE FROM listings WHERE seller = ? AND item = ? AND price = ? AND channel = ? AND room = ? AND reporter = ?')
        .bind(l.seller, l.item, l.price, l.channel, l.room, reporter).run();
      return json({ removed: res.meta.changes }, cors);
    }

    if (url.pathname === '/listings' && req.method === 'POST') {
      if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'forbidden origin' }, cors, 403);
      const body = await req.json().catch(() => null);
      if (!Array.isArray(body?.items) || !body.items.length || body.items.length > 100) return json({ error: 'send 1 to 100 listings' }, cors, 400);
      const rows = body.items;
      const valid = await knownItems().catch(() => null);
      if (!valid) return json({ error: 'item index unavailable' }, cors, 503);
      const ok = rows.filter(
        (r) =>
          valid.has(r.item) &&
          Number.isInteger(r.price) && r.price >= 1 && r.price <= 10_000_000_000 &&
          typeof r.sold === 'boolean' &&
          (r.qty === undefined || (Number.isInteger(r.qty) && r.qty >= 1 && r.qty <= 10000)) &&
          typeof r.seller === 'string' && /^[A-Za-z0-9]{4,13}$/.test(r.seller) &&
          Number.isInteger(r.channel) && r.channel >= 1 && r.channel <= 40 &&
          validRoom(r.room)
      );
      if (ok.length !== rows.length) return json({ error: 'invalid listing', stored: 0 }, cors, 400);
      const ip = req.headers.get('CF-Connecting-IP') || '';
      const reporter = await visitorHash(ip, 'scan', env.VOTE_SALT);
      // An identical observation of someone else's listing needs no write. Conflicting observations must not
      // change their quantity, sold state or timestamp; /listings/fix uses the same reporter boundary.
      const conflict = () => env.DB.prepare(`SELECT 1 FROM json_each(?) AS incoming JOIN listings AS existing
        ON existing.seller = json_extract(incoming.value, '$.seller')
        AND existing.item = json_extract(incoming.value, '$.item')
        AND existing.price = json_extract(incoming.value, '$.price')
        AND existing.channel = json_extract(incoming.value, '$.channel')
        AND existing.room = json_extract(incoming.value, '$.room')
        WHERE existing.reporter != ? AND (existing.qty != COALESCE(json_extract(incoming.value, '$.qty'), 1)
          OR existing.sold != json_extract(incoming.value, '$.sold')) LIMIT 1`).bind(JSON.stringify(ok), reporter).first();
      if (await conflict()) return json({ error: 'listing belongs to another reporter' }, cors, 409);
      // Enforce ownership in the write too, including when another writer inserts between the check and this batch.
      const stmt = env.DB.prepare(
        `INSERT INTO listings (item, price, qty, sold, seller, channel, room, reporter) SELECT ?, ?, ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM listings WHERE seller=? AND item=? AND price=? AND channel=? AND room=?
           AND (reporter != ? OR (qty=? AND sold>=? AND last_seen>=datetime('now','-15 minutes'))))
         ON CONFLICT (seller, item, price, channel, room) DO UPDATE SET last_seen = datetime('now'), qty = excluded.qty, sold = MAX(sold, excluded.sold)
         WHERE listings.reporter = excluded.reporter`
      );
      const results = await env.DB.batch(ok.map((r) => stmt.bind(r.item, r.price, r.qty || 1, r.sold ? 1 : 0, r.seller, r.channel, r.room, reporter,
        r.seller,r.item,r.price,r.channel,r.room,reporter,r.qty || 1,r.sold ? 1 : 0)));
      const changed = ok.filter((_, i) => results[i].meta.changes > 0);
      // The shops in this upload go on /trade/'s list of scanned shops (scan-shops.js), whoever's rows they are.
      if (ctx?.waitUntil) ctx.waitUntil(noteScanShops(env, ok).then(() => refreshFaces(env, lookupCharacter, 2, [...new Set(ok.map((r) => r.seller))])).catch(() => null));
      // Leaderboard points for the uploader (logged-in visitors under their Discord name, see contributors.js).
      if (changed.length && ctx?.waitUntil) ctx.waitUntil(recordContribution(env, req, 'scan', changed.length, reporter, changed.map((r) => r.seller)).catch(() => null));
      if (changed.length) {
        await refreshItemMarket(env, changed.map((r) => r.item)).catch(() => null);
        if (ctx?.waitUntil) ctx.waitUntil(itemLabel().then((nameOf) => notifyListings(env, changed, nameOf)).catch(() => null));
      }
      if (changed.length < ok.length && await conflict()) return json({ error: 'listing belongs to another reporter' }, cors, 409);
      return json({ stored: ok.length }, cors);
    }

    if (url.pathname === '/price' && req.method === 'POST') {
      if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'forbidden origin' }, cors, 403);
      const body = await req.json().catch(() => null);
      const item = Number(body?.item);
      const price = Number(body?.price);
      const kind = body?.kind;
      if (!Number.isInteger(item) || item < 1000000 || item > 9999999) return json({ error: 'bad item' }, cors, 400);
      if (!Number.isInteger(price) || price < 1 || price > 10_000_000_000) return json({ error: 'bad price' }, cors, 400);
      if (!KINDS.includes(kind)) return json({ error: 'bad kind' }, cors, 400);

      const ip = req.headers.get('CF-Connecting-IP') || '';
      const reporter = await visitorHash(ip, 'price', env.VOTE_SALT);
      const recent = await env.DB.prepare(
        "SELECT COUNT(*) AS same FROM prices WHERE reporter = ? AND item = ? AND kind = ? AND created_at >= datetime('now', '-1 hour')"
      )
        .bind(reporter, item, kind)
        .first();
      // A repeat report of the same item within the hour replaces the earlier one instead of stacking votes.
      if (recent.same) {
        await env.DB.prepare(
          "UPDATE prices SET price = ?, created_at = datetime('now') WHERE id = (SELECT id FROM prices WHERE reporter = ? AND item = ? AND kind = ? ORDER BY id DESC LIMIT 1)"
        )
          .bind(price, reporter, item, kind)
          .run();
      } else {
        await env.DB.prepare('INSERT INTO prices (item, price, kind, reporter) VALUES (?, ?, ?, ?)').bind(item, price, kind, reporter).run();
      }
      return json({ ok: true }, cors);
    }

    return json({ error: 'not found' }, cors, 404);
  }
};

// Operator views (collector heartbeat, budget meter) answer only to the owner's key (Bearer MAIL_ADMIN_TOKEN).
const ownerOnly = (req, env) => sameSecret(req.headers.get('Authorization') || '', `Bearer ${env.MAIL_ADMIN_TOKEN || ''}`);

async function usageAnswer(req, env) {
  const h = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (!(await ownerOnly(req, env))) return new Response('{"error":"forbidden"}', { status: 403, headers: h });
  return new Response(JSON.stringify(usageView() || { checking: true }), { headers: h });
}

// Every entry point runs on a metered D1 binding (src/usage-guard.js): it counts rows read and written and, past 98% of
// the plan's monthly included amounts, refuses (owner's call 2026-11-15: never pay more than the $5 plan).
const metered = (env) => ({ ...env, DB: meterDb(env.DB) });
// One address opening live-count sockets in a flood is refused before it reaches the room (each join wakes the room and
// messages every open page). 400 joins a minute per address is far above any real visitor, shared VPN exits included.
async function joinPresence(req, env) {
  const ip = req.headers.get('CF-Connecting-IP') || '';
  const verdict = env.RL_READ && ip ? await env.RL_READ.limit({ key: `ws:${ip}` }).catch(() => ({ success: true })) : null;
  if (verdict && !verdict.success) return new Response('too many requests', { status: 429, headers: { 'Retry-After': '60' } });
  return handlePresence(req, env);
}
// Refused already when the call does not come from a page of the site: the listing feed (2026-11-18) and the megaphone
// feed (owner, 2026-11-25: one address read /megaphones?after= every 30 seconds, all day, without ever opening the site).
// /megaphones/stats (a summary) stays open.
const SITE_ONLY = new Set(['/market/listings', '/megaphones']);
// Paths answered without coming from a page of the site: their own credentials, or links opened directly.
const openPath = (path) => path.startsWith('/internal/') || TRUSTED.has(path) || path.startsWith('/discord/') || path.startsWith('/og/') || path.startsWith('/s/') || path === '/usage' || path === '/presence' || path === '/chat';
const paused = () => new Response(JSON.stringify({ error: 'paused: monthly budget reached' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } });

export default {
  scheduled: (event, env, ctx) => {
    count('q');
    ctx?.waitUntil?.(flushUsage(env.DB, Date.now(), false, env.USAGE_BASELINE).catch(() => null));
    return api.scheduled(event, metered(env), ctx);
  },
  email: (message, env, ctx) => handleEmail(message, metered(env), ctx),
  // The live viewer count is a WebSocket upgrade, so it skips the public response cache.
  fetch: async (req, env, ctx) => {
    const path = new URL(req.url).pathname;
    // Headless Chrome is refused on the public API, the same as the Cloudflare rule on gms-hub.com ("Block headless
    // browsers", 2026-11-17): a scraper in Israel was opening the market page hundreds of times a day. Checked here, ahead
    // of the public response cache. Our own collectors use the /internal/ paths with a token and are never refused.
    // Verified search-engine crawlers stay allowed: Bing renders pages with a HeadlessChrome user agent (seen blocked
    // from msnbot addresses on 2026-11-17), and a blocked renderer sees the pages without their live data.
    const goodBot = !!(req.cf && (req.cf.verifiedBotCategory || req.cf.botManagement?.verifiedBot));
    if (!goodBot && !path.startsWith('/internal/') && !TRUSTED.has(path) && (req.headers.get('User-Agent') || '').includes('HeadlessChrome')) {
      logBlock(env, req, 'headless');
      return new Response(JSON.stringify({ error: 'automated browsers are not allowed' }), { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    // Every public path answers the site's own pages only (owner, 2026-11-25: "모든 api는 우리 사이트 외의 요청은 막히게").
    // A browser on gms-hub.com always sends Origin to this host and, where it sends fetch metadata, marks the request
    // cross-site. A script that calls the API by its address does not. First applied to the listing feed (2026-11-18:
    // one address in Israel paged through it every 2-3 seconds, one in New York sent no headers at all).
    // Still answered without a page: verified search crawlers; paths with their own credential (/internal/, Discord);
    // links people and apps open directly (Discord login, share cards /s/ and /og/); the site build, which sends the
    // READ_KEY secret as X-Gms-Key; and the in-game shop collector, which sends its upload token the same way.
    // Verified search crawlers are answered as always; their calls are counted too, so the owner's list shows everyone.
    if (goodBot && req.method !== 'OPTIONS' && !openPath(path)) logBlock(env, req, 'bot');
    let outsideCall = false;
    if (!goodBot && req.method !== 'OPTIONS' && !openPath(path)) {
      const fs = req.headers.get('Sec-Fetch-Site'), key = req.headers.get('X-Gms-Key') || '';
      const fromSite = ALLOWED_ORIGINS.includes(req.headers.get('Origin') || '') && (!fs || fs === 'cross-site');
      // The in-game shop collector reads with the token it already uploads with, sent as X-Gms-Key (its name alone
      // opened /prices until 2026-11-25).
      const ours = Boolean(key) && (await sameSecret(key, env.READ_KEY) || await sameSecret(key, env.SHOP_SCAN_TOKEN));
      // The listing feed is refused as before. Every other path is only counted for now (reason 'watch', shown on the
      // owner's dashboard as calls from outside the site) and refused once API_GATE is "on".
      // Logged once the answer is known: a path we do not have (a scanner trying /user/reg.php, /conf.js…) is counted as
      // 'nopath', so the owner's list does not show it as data that went out.
      if (!fromSite && !ours && !SITE_ONLY.has(path) && env.API_GATE !== 'on') outsideCall = true;
      else if (!fromSite && !ours) {
        logBlock(env, req, path === '/market/listings' ? 'listings' : 'outside');
        return new Response(JSON.stringify({ error: 'This API is served to pages on gms-hub.com. Automated collection is not permitted: https://gms-hub.com/en/terms/' }), { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }
    }
    // Site chat has no page any more, so its socket route is closed (the room code stays in presence.js).
    if (path === '/chat') return new Response('not found', { status: 404 });
    const live = path === '/presence';
    count('q');
    if (live) count('d');
    // Without an execution context (tests) there is nothing to flush into.
    ctx?.waitUntil?.(flushUsage(env.DB, Date.now(), false, env.USAGE_BASELINE).catch(() => null));
    if (isOver('q') || (live && isOver('d'))) { logError(env, 'api', path, 503, { req, e: 'paused: monthly budget reached' }); return paused(); }
    if (path === '/usage') return usageAnswer(req, env);
    const e = metered(env);
    // Every other refusal (rate limits, wrong origin, wrong owner key) is recorded for the owner's dashboard by its status.
    // Every 5xx goes to the error table (traffic.js logError): the route's noted error, or else the answer's own error text.
    const noted = (res) => {
      if (outsideCall) logBlock(env, req, res?.status === 404 ? 'nopath' : 'watch');
      else if (res && (res.status === 403 || res.status === 429)) logBlock(env, req, res.status === 429 ? 'rate' : path.startsWith('/internal/') ? 'key' : 'forbidden');
      if (res && res.status >= 500) {
        const write = (text) => logError(env, 'api', path, res.status, { req, e: noteText(req) || text || '' });
        const read = res.clone().text().then((t) => { let m = t; try { m = JSON.parse(t).error || t; } catch { /* plain text */ } write(String(m).slice(0, 200)); }).catch(() => write(''));
        ctx?.waitUntil?.(read);
      }
      return res;
    };
    // A throw from a route answers a plain 500 that the error table records, instead of Cloudflare's error page.
    const guarded = () => Promise.resolve().then(() => api.fetch(req, e, ctx)).catch((err) => {
      noteError(req, err);
      return new Response(JSON.stringify({ error: 'internal error' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } });
    });
    const out = live ? joinPresence(req, e) : cachedPublicResponse(req, guarded, ctx);
    return out instanceof Promise ? out.then(noted) : noted(out);
  }
};
