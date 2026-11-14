// In-game megaphones. The admin collector posts what it reads from a shared game window; the public page polls the
// newest rows. color is the background band the line was drawn on (Y gold, P pink, C cyan, N none). Writes need MEGAPHONE_TOKEN; rows older than 2 days are dropped by the schedule (prices outlive them in listings and snapshots).
// At ingest the text is parsed once: the item it names, whether it sells or buys, and the asking price (see parseMegaphone).
const reply = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
const KINDS = new Set(['super', 'item', 'double', 'mega']);
const digest = async (value) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((x) => x.toString(16).padStart(2, '0')).join('');
const stamp = (t) => new Date(t).toISOString().slice(0, 19).replace('T', ' ');

const SELL = /(^|[^a-z])(s\s?>|wts|selling|sell(?:ing)?|s:)/i;
const BUY = /(^|[^a-z])(b\s?>|wtb|buying|buy(?:ing)?|b:)/i;
// "132K", "4m", "1.5b", "380k ea". A number glued to a stat word ("13M DEX", "+5 ATT") is a stat, not a price, and amounts
// outside 500 mesos to 300 million are OCR slips (no item trades there).
const PRICE = /(?<![+\d])(\d+(?:[.,]\d+)?)\s?(k|m|mil|b)\b(?!\s?(?:att|atk|atck|matk|m\.?att|dex|str|int|luk|acc|avoid|spd|speed|jump|hp|mp|def|slot|crit))/i;
export function parseMegaphone(text, names) {
  const s = SELL.exec(text), b = BUY.exec(text);
  const intent = s && (!b || s.index <= b.index) ? 'sell' : b ? 'buy' : null;
  const m = PRICE.exec(text);
  const raw = m ? Math.round(Number(m[1].replace(',', '.')) * { k: 1e3, m: 1e6, mil: 1e6, b: 1e9 }[m[2].toLowerCase()]) : null;
  const price = raw && raw >= 500 && raw <= 3e8 ? raw : null;
  let item = null;
  const br = /\[([^\]]{3,60})\]/.exec(text);
  if (br) item = names?.get(br[1].toLowerCase()) ?? null;
  return { item, intent, price };
}

export function validMegaphone(r, now = Date.now()) {
  const seen = Date.parse(r?.seen);
  return r && KINDS.has(r.kind) && typeof r.nick === 'string' && /^[A-Za-z0-9]{2,13}$/.test(r.nick) &&
    typeof r.text === 'string' && r.text.trim().length >= 2 && r.text.length <= 200 &&
    (r.color == null || /^[YPCN]$/.test(r.color)) && (r.channel == null || (Number.isInteger(r.channel) && r.channel >= 1 && r.channel <= 40)) &&
    Number.isFinite(seen) && seen <= now + 60000 && now - seen < 3600000;
}

// onNew(rows) is handed the rows that were actually inserted (repeats left out) with their parsed item, intent and
// price, for the Discord alerts.
export async function postMegaphones(req, env, itemNames, onNew) {
  if (!env.MEGAPHONE_TOKEN) return reply({ error: 'megaphones not configured' }, 503);
  const auth = req.headers.get('Authorization') || '';
  if (auth.length > 256 || (await digest(auth)) !== (await digest(`Bearer ${env.MEGAPHONE_TOKEN}`))) return reply({ error: 'unauthorized' }, 401);
  let body;
  try { body = await req.json(); } catch { return reply({ error: 'invalid JSON' }, 400); }
  const rows = (Array.isArray(body?.rows) ? body.rows : []).slice(0, 50).filter((r) => validMegaphone(r));
  if (!rows.length) return reply({ ok: true, accepted: 0 });
  // The same line stays on screen for a while and scrolls through several frames: one row per nick+text per 10 minutes.
  const names = itemNames ? await itemNames().catch(() => null) : null;
  const insert = env.DB.prepare('INSERT OR IGNORE INTO megaphones (seen_at, kind, color, channel, nick, text, hash, item, intent, price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const parsed = [];
  const stmts = await Promise.all(rows.map(async (r, i) => {
    const text = r.text.trim(), p = parseMegaphone(text, names);
    parsed[i] = { ...r, text, ...p };
    return insert.bind(stamp(r.seen), r.kind, r.color ?? null, r.channel ?? null, r.nick, text, await digest(`${r.nick}|${text.toLowerCase()}|${Math.floor(Date.parse(r.seen) / 600000)}`), p.item, p.intent, p.price);
  }));
  const results = await env.DB.batch(stmts);
  // New rows carry their id and the stored time stamp, shaped like GET /megaphones rows, so they can be pushed to pages.
  const fresh = parsed.map((row, i) => ({ ...row, id: results[i].meta.last_row_id, seen: stamp(row.seen) })).filter((_, i) => results[i].meta.changes > 0);
  if (fresh.length && onNew) onNew(fresh);
  return reply({ ok: true, accepted: fresh.length });
}

export async function listMegaphones(env, params) {
  const after = Math.max(0, Number(params.get('after')) || 0);
  const limit = Math.min(200, Math.max(1, Number(params.get('limit')) || 100));
  // ?item=<id>: megaphones naming that item (the market's item panel), newest first, by index.
  const item = Number(params.get('item'));
  if (Number.isInteger(item) && item > 0) {
    const { results } = await env.DB.prepare('SELECT id, seen_at AS seen, kind, color, channel, nick, text, intent, price FROM megaphones WHERE item = ? ORDER BY id DESC LIMIT ?')
      .bind(item, Math.min(limit, 30)).all();
    return { rows: results, at: new Date().toISOString() };
  }
  const { results } = await env.DB.prepare('SELECT id, seen_at AS seen, kind, color, channel, nick, text FROM megaphones WHERE id > ? ORDER BY id DESC LIMIT ?').bind(after, limit).all();
  return { rows: results, at: new Date().toISOString() };
}

export const pruneMegaphones = (env) => env.DB.prepare("DELETE FROM megaphones WHERE seen_at < datetime('now', '-2 days')").run();

// Asking prices from megaphones for the price summaries: selling megaphones of the last 7 days, outliers past 5x the
// median dropped, with the middle half of the spread. Meant for consumables, scrolls and cash items, whose megaphone
// prices match shop prices; scrolled equipment is a different market and the caller leaves it out.
export async function megaphoneAsks(env, ids) {
  if (!ids.length) return {};
  const { results } = await env.DB.prepare(`SELECT item, price FROM megaphones WHERE item IN (SELECT value FROM json_each(?)) AND intent = 'sell' AND price IS NOT NULL AND seen_at >= datetime('now', '-2 days')`).bind(JSON.stringify(ids)).all();
  const by = new Map();
  for (const r of results) (by.get(r.item) || by.set(r.item, []).get(r.item)).push(r.price);
  const out = {};
  for (const [item, prices] of by) {
    const s = prices.sort((a, b) => a - b);
    const mid = s[s.length >> 1];
    const kept = s.length >= 3 ? s.filter((p) => p <= mid * 5 && p >= mid / 5) : s;
    if (!kept.length) continue;
    const q = (f) => kept[Math.min(kept.length - 1, Math.floor(f * (kept.length - 1) + 0.5))];
    out[item] = { n: kept.length, median: q(0.5), p25: q(0.25), p75: q(0.75) };
  }
  return out;
}

// Pattern content for the home and megaphone pages (snapshot hourly by the schedule, to keep D1 reads small): the items named most in the last 24
// hours with their change against the day before, how many sell vs buy, the busiest callers today, and megaphones per
// hour over the last day. Only what was read from the game; names and ids are resolved by the pages.
export async function megaphoneStats(env, now = Date.now()) {
  // Today's numbers need the last 24 hours row by row; "before" (the 24 hours before that) only needs per-item counts,
  // which never change once an hour is over. Those are kept per hour in the snapshot 'mega-hours', so an hourly run reads
  // one day of megaphones instead of two. Without a recent, complete store it reads both days once and starts one.
  const iso = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  const hourOf = (t) => t.slice(0, 13);
  const dayAgo = iso(now - 86400000), twoDays = iso(now - 2 * 86400000);
  const kept = await env.DB.prepare("SELECT json, at FROM snapshots WHERE key = 'mega-hours'").first().then((r) => r && { ...JSON.parse(r.json), at: r.at }).catch(() => null);
  const covered = kept && kept.from <= hourOf(twoDays) && now - Date.parse(`${kept.at.replace(' ', 'T')}Z`) < 23 * 3600000;
  const { results } = await env.DB.prepare("SELECT seen_at AS t, nick, item, intent FROM megaphones WHERE seen_at >= ?").bind(covered ? dayAgo : twoDays).all();
  const items = new Map(), before = new Map(), hours = new Map(), callers = new Map(), nicks = new Set();
  const hourItems = {};
  let n = 0, withItem = 0;
  for (const r of results) {
    if (r.item != null) { const h = (hourItems[hourOf(r.t)] ||= {}); h[r.item] = (h[r.item] || 0) + 1; }
    if (r.t < dayAgo) { if (r.item != null) before.set(r.item, (before.get(r.item) || 0) + 1); continue; }
    n++; nicks.add(r.nick);
    const h = r.t.slice(0, 13).replace(' ', 'T');
    hours.set(h, (hours.get(h) || 0) + 1);
    const c = callers.get(r.nick) || { nick: r.nick, n: 0, set: new Set() };
    c.n++; if (r.item != null) c.set.add(r.item); callers.set(r.nick, c);
    if (r.item == null) continue;
    withItem++;
    const it = items.get(r.item) || { item: r.item, n: 0, sell: 0, buy: 0 };
    it.n++; if (r.intent === 'sell') it.sell++; if (r.intent === 'buy') it.buy++;
    items.set(r.item, it);
  }
  // Hours read in full replace stored ones; the first, partly read hour keeps what an earlier run stored for it.
  const first = hourOf(covered ? dayAgo : twoDays);
  const store = {};
  for (const [h, v] of Object.entries(covered ? kept.hours : {})) if (h >= hourOf(twoDays)) store[h] = v;
  for (const [h, v] of Object.entries(hourItems)) if (h > first || !store[h]) store[h] = v;
  if (covered) {
    // Hour-grained: the 24 hours before the last 24, by whole hours.
    for (const [h, v] of Object.entries(store)) if (h >= hourOf(twoDays) && h < hourOf(dayAgo))
      for (const [item, c] of Object.entries(v)) before.set(Number(item), (before.get(Number(item)) || 0) + c);
  }
  const from = covered ? kept.from : hourOf(iso(now - 2 * 86400000 + 3600000));
  await env.DB.prepare("INSERT OR REPLACE INTO snapshots (key,json,at) VALUES ('mega-hours',?,datetime('now'))").bind(JSON.stringify({ from, hours: store })).run().catch(() => null);
  const day = [...items.values()].sort((a, b) => b.n - a.n || a.item - b.item).slice(0, 40);
  return {
    at: new Date(now).toISOString(),
    today: { n, nicks: nicks.size, withItem },
    items: day.map((r) => ({ ...r, before: before.get(r.item) || 0 })),
    // Items more wanted than offered (at least 3 buyers): a demand signal the shops cannot show.
    wanted: day.filter((r) => r.buy >= 3 && r.buy > r.sell).sort((a, b) => b.buy - a.buy).slice(0, 10),
    hourly: [...hours].sort((a, b) => a[0].localeCompare(b[0])).map(([h, c]) => ({ h, n: c })),
    callers: [...callers.values()].sort((a, b) => b.n - a.n).slice(0, 10).map((c) => ({ nick: c.nick, n: c.n, items: c.set.size })),
  };
}
