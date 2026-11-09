// Authenticated, idempotent ingestion for the private deterministic collector.
const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, '0')).join('');
export function validBatch(body, known, now = Date.now()) {
  if (!body || !/^[a-f0-9-]{36}$/.test(body.runId || '') || body.world !== 'Windia' ||
      !Array.isArray(body.rows) || !body.rows.length || body.rows.length > 500 ||
      !Number.isInteger(body.shops) || body.shops < body.rows.length || body.shops > 1000) return false;
  const started = Date.parse(body.startedAt), finished = Date.parse(body.finishedAt);
  if (!Number.isFinite(started) || !Number.isFinite(finished) || started > finished || finished > now + 60000 || now - started > 24 * 3600000 || finished - started > 15 * 60000) return false;
  const keys = new Set();
  for (const r of body.rows) {
    const seen = typeof r.seen === 'string' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(r.seen) ? Date.parse(r.seen.replace(' ', 'T') + 'Z') : NaN;
    if (!known.has(r.item) || !Number.isSafeInteger(r.price) || r.price < 1 || r.price > 1e10 || r.qty !== 1 || r.sold !== false ||
        !/^[A-Za-z0-9]{2,13}$/.test(r.seller || '') || !Number.isInteger(r.channel) || r.channel < 1 || r.channel > 40 ||
        !Number.isInteger(r.room) || r.room < 1 || r.room > 40 || !Number.isFinite(seen) || seen > finished || started - seen > 3 * 3600000 ||
        new Date(seen).toISOString().slice(0, 19).replace('T', ' ') !== r.seen) return false;
    const key = JSON.stringify([r.item, r.price, r.seller, r.channel, r.room]);
    if (keys.has(key)) return false;
    keys.add(key);
  }
  return true;
}

export async function handleMarketBatch(req, env, knownItems) {
  if (!env.MARKET_BATCH_TOKEN) return reply({ error: 'collector not configured' }, 503);
  const auth = req.headers.get('Authorization') || '';
  if (auth.length > 256 || await digest(auth) !== await digest(`Bearer ${env.MARKET_BATCH_TOKEN}`)) return reply({ error: 'unauthorized' }, 401);
  if (req.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT run_id, started_at, finished_at, received_at, shops, accepted FROM market_batch_runs ORDER BY received_at DESC, rowid DESC LIMIT 20').all();
    return reply({ runs: results });
  }
  if (req.method !== 'POST') return reply({ error: 'method not allowed' }, 405);
  if (Number(req.headers.get('Content-Length')) > 200000) return reply({ error: 'body too large' }, 413);
  const raw = await req.text();
  if (raw.length > 200000) return reply({ error: 'body too large' }, 413);
  let body; try { body = JSON.parse(raw); } catch { return reply({ error: 'invalid JSON' }, 400); }
  const hash = await digest(raw);
  const previous = async () => env.DB.prepare('SELECT payload_hash, accepted FROM market_batch_runs WHERE run_id = ?').bind(body?.runId || '').first();
  const replay = row => row.payload_hash === hash ? reply({ ok: true, duplicate: true, accepted: row.accepted, observationsAdded: 0, listingsChanged: 0 }) : reply({ error: 'run ID reused with different data' }, 409);
  const existing = await previous();
  if (existing) return replay(existing);
  const known = await knownItems().catch(() => null);
  if (!known) return reply({ error: 'item index unavailable' }, 503);
  if (!validBatch(body, known)) return reply({ error: 'invalid batch' }, 400);
  const receipt = env.DB.prepare('INSERT INTO market_batch_runs (run_id, payload_hash, started_at, finished_at, shops, accepted) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(body.runId, hash, body.startedAt, body.finishedAt, body.shops, body.rows.length);
  const listing = env.DB.prepare(`INSERT INTO listings (item,price,qty,sold,seller,channel,room,reporter,first_seen,last_seen)
    VALUES (?,?,1,0,?,?,?,'batch:market',?,?) ON CONFLICT (seller,item,price,channel,room) DO UPDATE SET
    last_seen=excluded.last_seen, qty=CASE WHEN listings.sold=0 THEN excluded.qty ELSE listings.qty END
    WHERE excluded.last_seen > listings.last_seen`);
  const observation = env.DB.prepare(`INSERT OR IGNORE INTO market_observations (item,price,seller,channel,room,seen,run_id) VALUES (?,?,?,?,?,?,?)`);
  try {
    const results = await env.DB.batch([receipt, ...body.rows.map(r => listing.bind(r.item,r.price,r.seller,r.channel,r.room,r.seen,r.seen)),
      ...body.rows.map(r => observation.bind(r.item,r.price,r.seller,r.channel,r.room,r.seen,body.runId))]);
    return reply({ ok: true, duplicate: false, accepted: body.rows.length,
      listingsChanged: results.slice(1, 1 + body.rows.length).reduce((n,r) => n + r.meta.changes, 0),
      observationsAdded: results.slice(1 + body.rows.length).reduce((n,r) => n + r.meta.changes, 0) });
  } catch {
    // A concurrent identical retry is harmless. Any other failed transaction has no partial writes.
    const raced = await previous().catch(() => null);
    return raced ? replay(raced) : reply({ error: 'database transaction failed' }, 503);
  }
}
