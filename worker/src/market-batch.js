import { refreshItemMarket } from './market-browser.js';
// Authenticated, idempotent ingestion for the private deterministic collector.
const reply = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
const limits = env => ({
  dailyRows: Math.max(1, Math.min(20000, Number(env.MARKET_BATCH_DAILY_ROWS) || 2000)),
  intervalSeconds: env.MARKET_BATCH_MIN_INTERVAL_SECONDS === undefined ? 21600 : Math.max(0, Number(env.MARKET_BATCH_MIN_INTERVAL_SECONDS) || 0),
  maxBatchRows: Math.max(1, Math.min(500, Number(env.MARKET_BATCH_MAX_ROWS) || 500)),
  // How far one run looks on the source site. Served with the preflight so the extension follows changes without a reload.
  maxItems: Math.max(1, Math.min(60, Number(env.MARKET_BATCH_MAX_ITEMS) || 12)),
  shopsPerItem: Math.max(1, Math.min(50, Number(env.MARKET_BATCH_SHOPS_PER_ITEM) || 20)),
  maxShops: Math.max(1, Math.min(600, Number(env.MARKET_BATCH_MAX_SHOPS) || 120))
});
const usageSql = `SELECT
  (SELECT COALESCE(SUM(accepted),0) FROM market_batch_runs WHERE received_at >= date('now')) AS rows,
  (SELECT MAX(received_at) FROM market_batch_runs) AS lastAt`;
export function collectionPolicy(env, usage, now = Date.now(), requestedRows = 1) {
  const policy = limits(env), remaining = Math.max(0, policy.dailyRows - usage.rows);
  const last = usage.lastAt ? Date.parse(usage.lastAt.replace(' ', 'T') + 'Z') : 0;
  const reset = new Date(now); reset.setUTCHours(24, 0, 0, 0);
  const budgetAvailable = remaining >= requestedRows;
  const next = Math.max(last + policy.intervalSeconds * 1000, budgetAvailable ? now : reset.getTime());
  const paused = env.MARKET_BATCH_PAUSED === 'true';
  return { policy, usage, ready: !paused && budgetAvailable && next <= now,
    reason: paused ? 'paused' : !budgetAvailable ? 'daily_budget' : next > now ? 'cooldown' : 'ready',
    nextEligibleAt: paused ? null : new Date(next).toISOString(), maxRows: Math.min(remaining, policy.maxBatchRows) };
}
export async function getCollectionStatus(env) {
  const usage = await env.DB.prepare(usageSql).first();
  const result = collectionPolicy(env, usage);
  const lastSuccessAt = usage.lastAt ? usage.lastAt.replace(' ', 'T') + 'Z' : null;
  const age = lastSuccessAt ? Date.now() - Date.parse(lastSuccessAt) : Infinity;
  return { ...result, lastSuccessAt,
    state: result.reason === 'paused' ? 'paused' : result.reason === 'daily_budget' ? 'budget_wait' :
      !lastSuccessAt ? 'waiting' : age <= result.policy.intervalSeconds * 1500 ? 'recent' : 'delayed',
    asOf: new Date().toISOString() };
}
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

// The item list's reference prices ride along with a run. A bad summary is dropped on its own; it never fails the run.
const SUMMARY_EVERY_MS = 3 * 3600000;
export function validSummary(summary, known) {
  if (!Array.isArray(summary) || !summary.length || summary.length > 3000) return null;
  const pct = (v) => v === null || (Number.isFinite(v) && Math.abs(v) < 100000);
  const seen = new Set();
  const ok = summary.filter((s) => s && known.has(s.item) && !seen.has(s.item) && seen.add(s.item) &&
    Number.isSafeInteger(s.typical) && s.typical > 0 && s.typical <= 1e11 && pct(s.day) && pct(s.week) &&
    (s.sales === null || (Number.isSafeInteger(s.sales) && s.sales >= 0)));
  return ok.length ? ok.map(({ item, typical, day, week, sales }) => ({ item, typical, day, week, sales })) : null;
}
// Writes only rows whose numbers changed, plus one row per item per day, and at most every three hours.
export async function storeSummary(env, summary, now = Date.now(), force = false) {
  const last = force ? null : await env.DB.prepare("SELECT at FROM snapshots WHERE key = 'item-summary'").first().catch(() => null);
  if (last && now - Date.parse(last.at.replace(' ', 'T') + 'Z') < SUMMARY_EVERY_MS) return { stored: 0, skipped: 'recent' };
  const at = new Date(now).toISOString().slice(0, 19).replace('T', ' ');
  const json = JSON.stringify(summary);
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO item_summary (item, typical, day, week, sales, at)
      SELECT j.value->>'item', j.value->>'typical', j.value->>'day', j.value->>'week', j.value->>'sales', ? FROM json_each(?) j WHERE true
      ON CONFLICT (item) DO UPDATE SET typical = excluded.typical, day = excluded.day, week = excluded.week, sales = excluded.sales, at = excluded.at
      WHERE excluded.typical IS NOT item_summary.typical OR excluded.sales IS NOT item_summary.sales
        OR excluded.day IS NOT item_summary.day OR excluded.week IS NOT item_summary.week`).bind(at, json),
    env.DB.prepare(`INSERT OR IGNORE INTO item_summary_daily (item, day, typical)
      SELECT j.value->>'item', date(?), j.value->>'typical' FROM json_each(?) j`).bind(at, json),
    env.DB.prepare("INSERT OR REPLACE INTO snapshots (key, json, at) VALUES ('item-summary', ?, ?)").bind(JSON.stringify({ items: summary.length }), at)
  ]);
  return { stored: results[0].meta.changes, daily: results[1].meta.changes };
}

export async function handleMarketBatch(req, env, knownItems, onListings) {
  if (!env.MARKET_BATCH_TOKEN) return reply({ error: 'collector not configured' }, 503);
  const auth = req.headers.get('Authorization') || '';
  if (auth.length > 256 || await digest(auth) !== await digest(`Bearer ${env.MARKET_BATCH_TOKEN}`)) return reply({ error: 'unauthorized' }, 401);
  if (req.method === 'GET') {
    const status = await getCollectionStatus(env);
    const params = new URL(req.url).searchParams;
    // Only the dedicated collector browser (it sends its name) collects. An older install left in the admin's own
    // Chrome sends none and is told the collection is paused, so it switches itself off before opening its window.
    if (params.has('preflight')) return reply(params.get('instance') ? status : { ...status, ready: false, reason: 'paused' });
    const { results } = await env.DB.prepare('SELECT run_id, started_at, finished_at, received_at, shops, accepted FROM market_batch_runs ORDER BY received_at DESC, rowid DESC LIMIT 20').all();
    return reply({ runs: results, ...status });
  }
  if (req.method !== 'POST') return reply({ error: 'method not allowed' }, 405);
  // The collector's heartbeat: a few fields about its current state, kept as one snapshot row so the collector can be
  // watched from outside the browser (GET /market/collector) without opening its window.
  if (new URL(req.url).searchParams.has('heartbeat')) {
    const raw = await req.text();
    if (raw.length > 4000) return reply({ error: 'body too large' }, 413);
    let b; try { b = JSON.parse(raw); } catch { return reply({ error: 'invalid JSON' }, 400); }
    const str = (v, n = 120) => (typeof v === 'string' ? v.slice(0, n) : null);
    // Heartbeats without an instance come from the switched-off old install in the admin's own Chrome; they would
    // overwrite the real collector's status, so they are dropped.
    if (!str(b.instance, 32)) return reply({ ok: true, ignored: true });
    const num = v => (Number.isFinite(Number(v)) ? Number(v) : null);
    const beat = { version: str(b.version, 16), instance: str(b.instance, 32), enabled: !!b.enabled, phase: str(b.phase, 24), shops: num(b.shops), rows: num(b.rows), item: str(b.item, 60),
      hidden: !!b.hidden, error: str(b.error, 200), runId: str(b.runId, 36), startedAt: num(b.startedAt), nextAt: num(b.nextAt), event: str(b.event, 24) };
    // Progress beats arrive every few seconds; only a change of run, phase, event or error (or two quiet minutes) is
    // worth a database write.
    const prev = await env.DB.prepare("SELECT json, at FROM snapshots WHERE key = 'collector'").first().catch(() => null);
    const old = prev ? JSON.parse(prev.json) : null;
    const age = prev ? Date.now() - Date.parse(prev.at.replace(' ', 'T') + 'Z') : Infinity;
    const same = old && ['runId', 'phase', 'event', 'error', 'enabled', 'hidden', 'instance'].every((k) => old[k] === beat[k]);
    if (same && age < 120000) return reply({ ok: true, skipped: true });
    await env.DB.prepare("INSERT OR REPLACE INTO snapshots (key,json,at) VALUES ('collector',?,datetime('now'))").bind(JSON.stringify(beat)).run();
    return reply({ ok: true });
  }
  if (Number(req.headers.get('Content-Length')) > 400000) return reply({ error: 'body too large' }, 413);
  const raw = await req.text();
  if (raw.length > 400000) return reply({ error: 'body too large' }, 413);
  let body; try { body = JSON.parse(raw); } catch { return reply({ error: 'invalid JSON' }, 400); }
  const hash = await digest(raw);
  const previous = async () => env.DB.prepare('SELECT payload_hash, accepted FROM market_batch_runs WHERE run_id = ?').bind(body?.runId || '').first();
  const replay = row => row.payload_hash === hash ? reply({ ok: true, duplicate: true, accepted: row.accepted, observationsAdded: 0, listingsChanged: 0 }) : reply({ error: 'run ID reused with different data' }, 409);
  const existing = await previous();
  if (existing) return replay(existing);
  if (env.MARKET_BATCH_PAUSED === 'true') return reply({ error: 'collection paused to protect database quota' }, 423);
  const known = await knownItems().catch(() => null);
  if (!known) return reply({ error: 'item index unavailable' }, 503);
  // A summary-only upload from the panel's "read prices now" button: no listings, no run budget, written right away.
  if (body?.summaryOnly === true) {
    const summary = validSummary(body.summary, known);
    if (!summary) return reply({ error: 'invalid summary' }, 400);
    return reply({ ok: true, summary: await storeSummary(env, summary, Date.now(), true) });
  }
  if (!validBatch(body, known)) return reply({ error: 'invalid batch' }, 400);
  const policy = limits(env);
  if (body.rows.length > policy.maxBatchRows) return reply({ error: 'batch exceeds configured row limit', policy }, 400);
  const usage = await env.DB.prepare(usageSql).first();
  const quotaReply = async () => {
    const latestUsage = await env.DB.prepare(usageSql).first();
    const status = collectionPolicy(env, latestUsage, Date.now(), body.rows.length);
    return reply({ error: 'collector daily budget or interval reached', ...status }, 429,
      { 'Retry-After': String(Math.max(60, Math.ceil((Date.parse(status.nextEligibleAt) - Date.now()) / 1000))) });
  };
  if (usage.rows + body.rows.length > policy.dailyRows || (usage.lastAt && Date.now() - Date.parse(usage.lastAt.replace(' ', 'T') + 'Z') < policy.intervalSeconds * 1000)) return quotaReply();
  // Recheck inside the transaction so concurrent clients cannot pass the same budget check.
  const receipt = env.DB.prepare(`INSERT INTO market_batch_runs (run_id, payload_hash, started_at, finished_at, shops, accepted)
    SELECT ?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(accepted),0) FROM market_batch_runs WHERE received_at >= date('now')) + ? <= ?
    AND NOT EXISTS (SELECT 1 FROM market_batch_runs WHERE received_at > datetime('now', ?))`)
    .bind(body.runId, hash, body.startedAt, body.finishedAt, body.shops, body.rows.length, body.rows.length, policy.dailyRows, `-${policy.intervalSeconds} seconds`);
  const listing = env.DB.prepare(`INSERT INTO listings (item,price,qty,sold,seller,channel,room,reporter,first_seen,last_seen)
    SELECT ?,?,1,0,?,?,?,'batch:market',?,?
    WHERE EXISTS (SELECT 1 FROM market_batch_runs WHERE run_id=? AND payload_hash=?)
    AND NOT EXISTS (SELECT 1 FROM listings WHERE item=? AND price=? AND seller=? AND channel=? AND room=? AND last_seen>=?)
    ON CONFLICT (seller,item,price,channel,room) DO UPDATE SET
    last_seen=excluded.last_seen, qty=CASE WHEN listings.sold=0 THEN excluded.qty ELSE listings.qty END
    WHERE excluded.last_seen > listings.last_seen`);
  try {
    // listing_history triggers already preserve these observations. Keep the legacy archive read-only.
    const results = await env.DB.batch([receipt, ...body.rows.map(r => listing.bind(r.item,r.price,r.seller,r.channel,r.room,r.seen,r.seen,
      body.runId,hash,r.item,r.price,r.seller,r.channel,r.room,r.seen))]);
    if (!results[0].meta.changes) return quotaReply();
    const changed = results.slice(1).filter(r => r.meta.changes > 0).length;
    const summary = validSummary(body.summary, known);
    const summaryReceipt = summary ? await storeSummary(env, summary).catch(() => ({ stored: 0, skipped: 'error' })) : null;
    // Keep the per-item market summary current for just the items this run saw.
    await refreshItemMarket(env, body.rows.map((r) => r.item)).catch(() => null);
    // New or re-seen listings go to the Discord price alerts (the caller runs it after the reply).
    if (onListings) onListings(body.rows.filter((_, i) => results[i + 1].meta.changes > 0));
    return reply({ ok: true, duplicate: false, accepted: body.rows.length, summary: summaryReceipt,
      listingsChanged: changed, observationsAdded: changed, historyStorage: 'listing_history',
      rowsRead: results.reduce((n,r) => n + (r.meta.rows_read || 0), 0),
      rowsWritten: results.reduce((n,r) => n + (r.meta.rows_written || 0), 0) });
  } catch {
    // A concurrent identical retry is harmless. Any other failed transaction has no partial writes.
    const raced = await previous().catch(() => null);
    return raced ? replay(raced) : reply({ error: 'database transaction failed' }, 503);
  }
}

// What the collector last reported about itself plus its last three stored runs: enough to tell "running", "stuck",
// "stopped with error" and "never uploaded today" apart from the command line.
export async function collectorView(env) {
  const beat = await env.DB.prepare("SELECT json, at FROM snapshots WHERE key = 'collector'").first().catch(() => null);
  const { results } = await env.DB.prepare('SELECT received_at AS at, shops, accepted FROM market_batch_runs ORDER BY received_at DESC, rowid DESC LIMIT 3').all();
  const status = await getCollectionStatus(env);
  return { heartbeat: beat ? { ...JSON.parse(beat.json), at: beat.at.replace(' ', 'T') + 'Z', ageSeconds: Math.round((Date.now() - Date.parse(beat.at.replace(' ', 'T') + 'Z')) / 1000) } : null,
    runs: results, state: status.state, lastSuccessAt: status.lastSuccessAt, nextEligibleAt: status.nextEligibleAt, todayRows: status.usage?.rows ?? null, asOf: status.asOf };
}
