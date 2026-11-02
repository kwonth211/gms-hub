// GMS Hub vote API (Cloudflare Worker + D1).
// GET  /votes        -> { "<siteId>": count, ... }
// POST /vote {site}  -> { site, count, counted }  (one vote per visitor per site; visitors are salted IP hashes)
// GET  /prices?ids=1,2 -> { "<itemId>": { n, median, low, high, last, sold, selling, buying } }  (last 14 days, outliers dropped)
// GET  /prices/recent  -> [{ item, price, kind, at }]  (newest player reports)
// POST /price {item, price, kind} -> { ok }  (kind: sold | selling | buying)
// POST /listings {items: [{item, price (per item), qty (bundle size), sold, seller, channel, room}]} -> { stored }  (shop scanner; one row per listing)
// POST /listings/fix {from: {item, price, seller, channel, room}, to: {item, price, qty, sold, seller}} -> { fixed }
// GET  /listings/recent -> [{ item, price, qty, sold, seller, channel, room, seen }]
// GET  /market/top -> { at, stats, items: [{ item, rank, move, avg, n, sold, change, spark: [7 daily medians] }] }  (stored every 5 min)
// GET  /market/item?id= -> { item, listings: [...last 7 days], trend }
// The shop scanner runs from the local dev server for now, so its origin may post scans too.
const ALLOWED_ORIGINS = ['https://gms-hub.com', 'https://www.gms-hub.com', 'http://localhost:8790', 'http://127.0.0.1:8790'];

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin'
  };
}

function json(data, headers, status = 200, cache = 'no-store') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache }
  });
}

async function visitorHash(ip, site, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${ip}:${site}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}


const KINDS = ['sold', 'selling', 'buying'];
const WINDOW = "datetime('now', '-14 days')";
const ITEMS_URL = 'https://gms-hub.com/assets/items.json';

// Tradeable item ids, loaded from the site's own item index once per worker instance, so a forged scan cannot invent items.
let itemIds = null;
async function knownItems() {
  if (itemIds) return itemIds;
  const r = await fetch(ITEMS_URL, { cf: { cacheTtl: 3600 } });
  if (!r.ok) throw new Error(`items ${r.status}`);
  itemIds = new Set((await r.json()).map((row) => row[0]));
  return itemIds;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

// One typo (an extra zero) should not move the price, so reports far from the item's median are ignored once there are a few.
function summarize(rows) {
  const all = rows.map((r) => r.price);
  const mid = median(all);
  const kept = rows.length >= 3 ? rows.filter((r) => r.price <= mid * 5 && r.price >= mid / 5) : rows;
  const prices = kept.map((r) => r.price);
  const byKind = Object.fromEntries(
    KINDS.map((k) => {
      const ps = kept.filter((r) => r.kind === k).map((r) => r.price);
      return [k, ps.length ? { n: ps.length, median: median(ps) } : null];
    })
  );
  return { n: kept.length, median: median(prices), low: Math.min(...prices), high: Math.max(...prices), last: kept[0].created_at, ...byKind };
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

async function marketTop(env, only = null) {
  // Reads stay proportional to one day of activity: the ranking needs the last 25 hours of everything, and the 8-day history
  // is fetched only for the ten items that made the list (or the one item asked for).
  const recent = (sql, ...args) => env.DB.prepare(sql).bind(...args).all().then((r) => r.results);
  const window = (hours, filter, ids) =>
    `SELECT item, price, sold, last_seen AS t FROM listings WHERE last_seen >= datetime('now', '-${hours} hours') ${filter}
     UNION ALL
     SELECT item, price, kind = 'sold', created_at FROM prices WHERE kind != 'buying' AND created_at >= datetime('now', '-${hours} hours') ${filter}`;
  let results;
  if (only) results = await recent(window(192, 'AND item = ?'), only, only);
  else {
    const day = await recent(window(26, ''));
    const now0 = Date.now();
    const dayObs = day.map((r) => ({ item: r.item, sold: !!r.sold, t: parseUtc(r.t) }));
    const ids = [...new Set([...rankAt(dayObs, now0).slice(0, TOP_N), ...rankAt(dayObs, now0 - 3600000).slice(0, TOP_N)])];
    const marks = ids.map(() => '?').join(',') || 'NULL';
    results = ids.length ? await recent(window(192, `AND item IN (${marks})`), ...ids, ...ids) : [];
    // Items outside the top ten still count for the ranking itself.
    const seen = new Set(ids);
    results = results.concat(day.filter((r) => !seen.has(r.item)));
  }
  const now = Date.now();
  const obs = results.map((r) => ({ item: r.item, price: r.price, sold: !!r.sold, t: parseUtc(r.t) }));
  const ranked = only ? (obs.some((o) => o.t > now - DAY) ? [only] : []) : rankAt(obs, now).slice(0, TOP_N);
  const before = rankAt(obs, now - 3600000);
  const byItem = new Map();
  for (const o of obs) (byItem.get(o.item) || byItem.set(o.item, []).get(o.item)).push(o);
  const items = ranked.map((item, i) => {
    const mine = byItem.get(item);
    const window = (from, to) => trimmed(mine.filter((o) => o.t > from && o.t <= to).map((o) => o.price));
    const day = window(now - DAY, now);
    const prev = window(now - 2 * DAY, now - DAY);
    const prevRank = before.indexOf(item);
    return {
      item,
      rank: i + 1,
      // Positive = moved up; null = new to the ranking within the hour.
      move: prevRank < 0 ? null : prevRank - i,
      avg: day.length ? Math.round(day.reduce((a, b) => a + b, 0) / day.length) : null,
      n: mine.filter((o) => o.t > now - DAY).length,
      sold: mine.filter((o) => o.sold && o.t > now - DAY).length,
      change: prev.length ? Math.round(((median(day) - median(prev)) / median(prev)) * 1000) / 10 : null,
      // Oldest first; a day with no observations is null so the line shows a gap instead of inventing a value.
      spark: Array.from({ length: 7 }, (_, k) => {
        const ps = window(now - (7 - k) * DAY, now - (6 - k) * DAY);
        return ps.length ? median(ps) : null;
      })
    };
  });
  const day = obs.filter((o) => o.t > now - DAY);
  const stats = {
    listings: day.length,
    sold: day.filter((o) => o.sold).length,
    items: new Set(day.map((o) => o.item)).size
  };
  const shops = await env.DB.prepare(
    "SELECT COUNT(DISTINCT seller || '|' || channel || '|' || room) AS n FROM listings WHERE last_seen >= datetime('now', '-1 day')"
  ).first();
  stats.shops = shops.n;
  return { at: new Date(now).toISOString(), stats, items };
}

// The ranking is computed on a schedule (every 5 minutes) and stored, so the database work does not grow with visitors:
// every page view reads one stored row.
async function refreshSnapshot(env) {
  const data = await marketTop(env);
  await env.DB.prepare("INSERT OR REPLACE INTO snapshots (key, json, at) VALUES ('market', ?, datetime('now'))").bind(JSON.stringify(data)).run();
  return data;
}

// Everything the item view needs for one item: its listings of the last week (cheapest open ones first, then sold), a
// summary and a 7-day trend.
async function itemDetail(env, item) {
  const { results } = await env.DB.prepare(
    `SELECT price, qty, sold, seller, channel, room, last_seen AS seen FROM listings WHERE item = ? AND last_seen >= datetime('now', '-7 days')
     ORDER BY sold ASC, price ASC LIMIT 60`
  )
    .bind(item)
    .all();
  const top = await marketTop(env, item);
  return { item, listings: results, trend: top.items[0] || null };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshSnapshot(env));
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const cors = corsHeaders(origin);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    if (url.pathname === '/votes' && req.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT site, count FROM votes').all();
      return json(Object.fromEntries(results.map((r) => [r.site, r.count])), cors, 200, 'public, max-age=30');
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
      // Player reports and scanned shops feed the same summary: a sold slot is a sale, an open slot an asking price.
      const marks = ids.map(() => '?').join(',');
      const { results } = await env.DB.prepare(
        `SELECT item, price, kind, created_at FROM prices WHERE item IN (${marks}) AND created_at >= ${WINDOW}
         UNION ALL
         SELECT item, price, CASE WHEN sold THEN 'sold' ELSE 'selling' END, last_seen FROM listings WHERE item IN (${marks}) AND last_seen >= ${WINDOW}
         ORDER BY created_at DESC`
      )
        .bind(...ids, ...ids)
        .all();
      const out = {};
      for (const id of ids) {
        const rows = results.filter((r) => r.item === id);
        if (rows.length) out[id] = summarize(rows);
      }
      return json(out, cors, 200, 'public, max-age=30');
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

    if (url.pathname === '/market/top' && req.method === 'GET') {
      const row = await env.DB.prepare("SELECT json FROM snapshots WHERE key = 'market'").first();
      const data = row ? JSON.parse(row.json) : await refreshSnapshot(env);
      return json(data, cors, 200, 'public, max-age=60');
    }

    if (url.pathname === '/market/item' && req.method === 'GET') {
      const item = Number(url.searchParams.get('id'));
      if (!Number.isInteger(item) || item < 1000000 || item > 9999999) return json({ error: 'bad item' }, cors, 400);
      return json(await itemDetail(env, item), cors, 200, 'public, max-age=30');
    }

    if (url.pathname === '/listings/recent' && req.method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT item, price, qty, sold, seller, channel, room, last_seen AS seen FROM listings ORDER BY last_seen DESC, id DESC LIMIT ?'
      )
        .bind(Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 30)))
        .all();
      return json(results, cors, 200, 'public, max-age=20');
    }

    // Players name Free Market rooms the scanner does not know; collected here and merged into the shared table by hand.
    if (url.pathname === '/room-title' && req.method === 'POST') {
      if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'forbidden origin' }, cors, 403);
      const body = await req.json().catch(() => null);
      const room = Number(body?.room);
      const key = typeof body?.key === 'string' ? body.key : '';
      if (!Number.isInteger(room) || room < 1 || room > 40 || !/^[0-9.]{10,4000}$/.test(key)) return json({ error: 'bad input' }, cors, 400);
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
      const to = body?.to || {};
      const valid = await knownItems().catch(() => null);
      if (!valid) return json({ error: 'item index unavailable' }, cors, 503);
      const okTo =
        valid.has(to.item) && Number.isInteger(to.price) && to.price >= 1 && to.price <= 10_000_000_000 &&
        Number.isInteger(to.qty) && to.qty >= 1 && to.qty <= 10000 && typeof to.seller === 'string' && /^[A-Za-z0-9]{2,13}$/.test(to.seller);
      if (!okTo || !Number.isInteger(from.item) || !Number.isInteger(from.price)) return json({ error: 'bad input' }, cors, 400);
      const reporter = await visitorHash(req.headers.get('CF-Connecting-IP') || '', 'scan', env.VOTE_SALT);
      const where = 'seller = ? AND item = ? AND price = ? AND channel = ? AND room = ? AND reporter = ?';
      const keys = [from.seller, from.item, from.price, from.channel, from.room, reporter];
      try {
        const res = await env.DB.prepare(`UPDATE listings SET item = ?, price = ?, qty = ?, sold = ?, seller = ?, last_seen = datetime('now') WHERE ${where}`)
          .bind(to.item, to.price, to.qty, to.sold ? 1 : 0, to.seller, ...keys)
          .run();
        return json({ fixed: res.meta.changes }, cors);
      } catch (e) {
        await env.DB.prepare(`DELETE FROM listings WHERE ${where}`).bind(...keys).run();
        return json({ fixed: 1, merged: true }, cors);
      }
    }

    if (url.pathname === '/listings' && req.method === 'POST') {
      if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'forbidden origin' }, cors, 403);
      const body = await req.json().catch(() => null);
      const rows = Array.isArray(body?.items) ? body.items.slice(0, 100) : [];
      const valid = await knownItems().catch(() => null);
      if (!valid) return json({ error: 'item index unavailable' }, cors, 503);
      const ok = rows.filter(
        (r) =>
          valid.has(r.item) &&
          Number.isInteger(r.price) && r.price >= 1 && r.price <= 10_000_000_000 &&
          (r.qty === undefined || (Number.isInteger(r.qty) && r.qty >= 1 && r.qty <= 10000)) &&
          typeof r.seller === 'string' && /^[A-Za-z0-9]{2,13}$/.test(r.seller) &&
          Number.isInteger(r.channel) && r.channel >= 1 && r.channel <= 40 &&
          Number.isInteger(r.room) && r.room >= 1 && r.room <= 40
      );
      if (!ok.length) return json({ stored: 0 }, cors);
      const ip = req.headers.get('CF-Connecting-IP') || '';
      const reporter = await visitorHash(ip, 'scan', env.VOTE_SALT);
      // Seeing the same listing again only moves its last-seen time, and a slot once seen sold stays sold.
      const stmt = env.DB.prepare(
        `INSERT INTO listings (item, price, qty, sold, seller, channel, room, reporter) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (seller, item, price, channel, room) DO UPDATE SET last_seen = datetime('now'), sold = MAX(sold, excluded.sold)`
      );
      await env.DB.batch(ok.map((r) => stmt.bind(r.item, r.price, r.qty || 1, r.sold ? 1 : 0, r.seller, r.channel, r.room, reporter)));
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
