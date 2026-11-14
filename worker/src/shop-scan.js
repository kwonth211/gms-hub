import { refreshItemMarket } from './market-browser.js';
import { validRoom } from '../../assets/place.js';
// Authenticated ingestion for the in-game shop collector: it walks one Free Market room, opens every shop and sends
// what it read as one snapshot of that room. Unlike the public /listings route it takes sold slots and bundles as seen,
// and the latest snapshot decides qty and sold. Sending the same snapshot again changes nothing.
const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const digest = async (value) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((x) => x.toString(16).padStart(2, '0')).join('');
const MAX_ROWS = 600;

export function validScan(body, known, now = Date.now()) {
  if (!body || !Number.isInteger(body.channel) || body.channel < 1 || body.channel > 40 || !validRoom(body.room) ||
      !Array.isArray(body.rows) || !body.rows.length || body.rows.length > MAX_ROWS) return false;
  const seen = typeof body.seen === 'string' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(body.seen) ? Date.parse(body.seen.replace(' ', 'T') + 'Z') : NaN;
  // A snapshot is sent right after its room is finished; anything older than a day or from the future is a clock fault.
  if (!Number.isFinite(seen) || seen > now + 60000 || now - seen > 24 * 3600000 ||
      new Date(seen).toISOString().slice(0, 19).replace('T', ' ') !== body.seen) return false;
  const keys = new Set();
  for (const r of body.rows) {
    if (!r || !known.has(r.item) || !Number.isSafeInteger(r.price) || r.price < 1 || r.price > 1e10 ||
        !Number.isInteger(r.qty) || r.qty < 1 || r.qty > 10000 || typeof r.sold !== 'boolean' ||
        typeof r.seller !== 'string' || !/^[A-Za-z0-9]{2,13}$/.test(r.seller)) return false;
    const key = JSON.stringify([r.item, r.price, r.seller]);
    if (keys.has(key)) return false;
    keys.add(key);
  }
  return true;
}

export async function handleShopScan(req, env, knownItems, onListings) {
  if (!env.SHOP_SCAN_TOKEN) return reply({ error: 'collector not configured' }, 503);
  const auth = req.headers.get('Authorization') || '';
  if (auth.length > 256 || await digest(auth) !== await digest(`Bearer ${env.SHOP_SCAN_TOKEN}`)) return reply({ error: 'unauthorized' }, 401);
  if (req.method !== 'POST') return reply({ error: 'method not allowed' }, 405);
  const raw = await req.text();
  if (raw.length > 400000) return reply({ error: 'body too large' }, 413);
  let body; try { body = JSON.parse(raw); } catch { return reply({ error: 'invalid JSON' }, 400); }
  const known = await knownItems().catch(() => null);
  if (!known) return reply({ error: 'item index unavailable' }, 503);
  if (!validScan(body, known)) return reply({ error: 'invalid scan' }, 400);
  const stmt = env.DB.prepare(`INSERT INTO listings (item,price,qty,sold,seller,channel,room,reporter,first_seen,last_seen)
    VALUES (?,?,?,?,?,?,?,'collector:shop',?,?)
    ON CONFLICT (seller,item,price,channel,room) DO UPDATE SET last_seen=excluded.last_seen, qty=excluded.qty, sold=excluded.sold
    WHERE excluded.last_seen > listings.last_seen`);
  try {
    const results = await env.DB.batch(body.rows.map((r) => stmt.bind(r.item, r.price, r.qty, r.sold ? 1 : 0, r.seller, body.channel, body.room, body.seen, body.seen)));
    const changedRows = body.rows.filter((_, i) => results[i].meta.changes > 0);
    await refreshItemMarket(env, body.rows.map((r) => r.item)).catch(() => null);
    if (onListings) onListings(changedRows.filter((r) => !r.sold).map((r) => ({ ...r, channel: body.channel, room: body.room })));
    return reply({ ok: true, accepted: body.rows.length, listingsChanged: changedRows.length });
  } catch {
    return reply({ error: 'database transaction failed' }, 503);
  }
}
