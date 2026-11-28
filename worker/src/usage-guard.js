// Budget fuse (owner's call 2026-11-15): the Workers Paid plan ($5) bills anything past its included monthly amounts and
// Cloudflare has no spending cap, so the worker stops itself at 98% of each included amount instead.
// - Every D1 statement goes through meterDb, which adds the rows it read and wrote (D1's own meta) to a small in-memory
//   tally; requests and live-viewer (Durable Object) requests are counted at the entry point.
// - About once a minute per isolate the tally is added to the day's row 'usage:YYYY-MM-DD' in snapshots, and the last
//   31 days are summed. A billing cycle is at most 31 days, so the rolling sum never undercounts the current cycle.
// - Past 98% of D1 writes, every write statement throws (reads keep working, the site stays readable); past 98% of reads,
//   every statement throws; past 98% of requests, the API answers 503; past 98% of Durable Object requests, the live
//   viewer count is switched off. Collectors and forms then fail and retry later, which costs nothing.
// Historical usage is supplied by the private USAGE_BASELINE Worker secret, separate from ongoing D1 counters.
const DAY = 86400000;
export const LIMITS = { w: 50_000_000, r: 25_000_000_000, q: 10_000_000, d: 1_000_000 };
export const SHARE = 0.98;
const KEYS = ['w', 'r', 'q', 'd'];
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

const pending = { w: 0, r: 0, q: 0, d: 0 };
let state = { over: {}, totals: null, checked: 0 };
let lastFlush = 0;

export const count = (k, n = 1) => { pending[k] += n; };
export const usageState = () => state;
export const isOver = (k) => !!state.over[k];

// JSON object: UTC date -> [rows written, rows read, Worker requests, Durable Object requests].
// New installations explicitly use {}; existing installations retain their original baseline.
export function parseUsageBaseline(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > 100000) throw new Error('USAGE_BASELINE must be configured');
  const seed = JSON.parse(raw);
  if (!seed || typeof seed !== 'object' || Array.isArray(seed)) throw new Error('Invalid USAGE_BASELINE');
  for (const [day, values] of Object.entries(seed)) {
    const time = Date.parse(day);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(time) || dayOf(time) !== day ||
        !Array.isArray(values) || values.length !== 4 || values.some(n => !Number.isSafeInteger(n) || n < 0))
      throw new Error('Invalid USAGE_BASELINE');
  }
  return seed;
}

// Sum of the last 31 UTC days (today included): metered rows plus the seed for days before the meter.
export function rollingTotals(rows, now = Date.now(), seed = {}) {
  const from = dayOf(now - 30 * DAY), to = dayOf(now);
  const t = { w: 0, r: 0, q: 0, d: 0 };
  for (const [day, v] of Object.entries(seed)) if (day >= from && day <= to) KEYS.forEach((k, i) => { t[k] += v[i]; });
  for (const row of rows) {
    const day = row.key.slice(6);
    if (day < from || day > to) continue;
    const v = JSON.parse(row.json);
    for (const k of KEYS) t[k] += Number(v[k]) || 0;
  }
  return t;
}
export const overFlags = (t) => Object.fromEntries(KEYS.map((k) => [k, t[k] >= LIMITS[k] * SHARE]));

const WRITE = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i;
export class BudgetError extends Error {}
function guard(sql) {
  if (state.over.r || (state.over.w && WRITE.test(sql))) throw new BudgetError('monthly budget reached');
}
const addMeta = (meta) => { if (meta) { pending.w += meta.rows_written || 0; pending.r += meta.rows_read || 0; } };

// A D1 binding that counts and, past the fuse, refuses. Same surface the worker uses: prepare/bind/run/all/first, batch.
// onHeavy(sql, rowsRead) is told about any single statement that read HEAVY_ROWS or more (2026-11-28: a 1.1 million row
// read in a request overloaded D1 and failed other routes; such a statement now shows on the owner's error table first).
export const HEAVY_ROWS = 800000;
export function meterDb(db, onHeavy = null) {
  const add = (meta, sql) => { addMeta(meta); if (onHeavy && meta?.rows_read >= HEAVY_ROWS) { try { onHeavy(sql, meta.rows_read); } catch { /* logging only */ } } };
  const wrap = (stmt, sql) => ({
    __stmt: stmt,
    __sql: sql,
    bind: (...args) => wrap(stmt.bind(...args), sql),
    run: async () => { guard(sql); const r = await stmt.run(); add(r?.meta, sql); return r; },
    all: async () => { guard(sql); const r = await stmt.all(); add(r?.meta, sql); return r; },
    // first() has no meta in D1, so it runs as all() and picks the first row (D1's first() reads the same rows).
    first: async (col) => {
      guard(sql);
      const r = await stmt.all();
      add(r?.meta, sql);
      const row = r?.results?.[0] ?? null;
      return col == null ? row : (row?.[col] ?? null);
    },
    raw: async (opts) => { guard(sql); return stmt.raw(opts); },
  });
  return {
    prepare: (sql) => wrap(db.prepare(sql), sql),
    batch: async (stmts) => {
      for (const s of stmts) guard(s.__sql || '');
      const rs = await db.batch(stmts.map((s) => s.__stmt || s));
      (rs || []).forEach((r, i) => add(r?.meta, stmts[i]?.__sql || ''));
      return rs;
    },
    exec: async (sql) => { guard(sql); return db.exec(sql); },
  };
}

// Adds the tally to today's row and re-reads the 31-day totals. Runs at most once a minute per isolate (sooner when a lot
// was written), always on the raw binding so the fuse can never block its own bookkeeping.
export async function flushUsage(db, now = Date.now(), force = false, baseline) {
  let seed;
  try { seed = parseUsageBaseline(baseline); }
  catch (error) {
    // A missing deployment setting must not silently reset historic usage to zero.
    state = { ...state, over: Object.fromEntries(KEYS.map(k => [k, true])) };
    throw error;
  }
  if (!force && now - lastFlush < 60000 && pending.w < 5000) return state;
  lastFlush = now;
  const p = { ...pending };
  for (const k of KEYS) pending[k] = 0;
  p.w += 2; // this upsert (row + primary key)
  try {
    await db.prepare(`INSERT INTO snapshots (key, json, at) VALUES (?1, json_object('w', ?2, 'r', ?3, 'q', ?4, 'd', ?5), datetime('now'))
      ON CONFLICT(key) DO UPDATE SET json = json_object('w', json_extract(json, '$.w') + ?2, 'r', json_extract(json, '$.r') + ?3,
        'q', json_extract(json, '$.q') + ?4, 'd', json_extract(json, '$.d') + ?5), at = datetime('now')`)
      .bind(`usage:${dayOf(now)}`, p.w, p.r, p.q, p.d).run();
    const { results } = await db.prepare('SELECT key, json FROM snapshots WHERE key >= ? AND key <= ?')
      .bind(`usage:${dayOf(now - 30 * DAY)}`, `usage:${dayOf(now)}`).all();
    const totals = rollingTotals(results, now, seed);
    state = { over: overFlags(totals), totals, checked: now };
  } catch {
    for (const k of KEYS) pending[k] += p[k];
  }
  return state;
}

// For the status route: how far each counter is, in percent of the included amount.
export const usageView = () => state.totals && {
  checked: new Date(state.checked).toISOString(),
  share: SHARE,
  percent: Object.fromEntries(KEYS.map((k) => [k, +((state.totals[k] / LIMITS[k]) * 100).toFixed(2)])),
  over: state.over,
};
