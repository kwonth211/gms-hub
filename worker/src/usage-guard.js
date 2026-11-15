// Budget fuse (owner's call 2026-11-15): the Workers Paid plan ($5) bills anything past its included monthly amounts and
// Cloudflare has no spending cap, so the worker stops itself at 98% of each included amount instead.
// - Every D1 statement goes through meterDb, which adds the rows it read and wrote (D1's own meta) to a small in-memory
//   tally; requests and live-viewer (Durable Object) requests are counted at the entry point.
// - About once a minute per isolate the tally is added to the day's row 'usage:YYYY-MM-DD' in snapshots, and the last
//   31 days are summed. A billing cycle is at most 31 days, so the rolling sum never undercounts the current cycle.
// - Past 98% of D1 writes, every write statement throws (reads keep working, the site stays readable); past 98% of reads,
//   every statement throws; past 98% of requests, the API answers 503; past 98% of Durable Object requests, the live
//   viewer count is switched off. Collectors and forms then fail and retry later, which costs nothing.
// Days before the meter existed come from Cloudflare's analytics (SEED, through 2026-11-15 06:00 UTC); they age out of
// the 31-day window by mid-December.
const DAY = 86400000;
export const LIMITS = { w: 50_000_000, r: 25_000_000_000, q: 10_000_000, d: 1_000_000 };
export const SHARE = 0.98;
// [rows written, rows read, worker requests, Durable Object requests] per UTC day.
const SEED = {
  '2026-10-28': [78, 830, 30, 0], '2026-10-29': [15, 7725, 150, 0], '2026-10-30': [2, 5408, 170, 0], '2026-10-31': [0, 6221, 170, 0],
  '2026-11-01': [3, 6404, 230, 0], '2026-11-02': [9508, 475402, 880, 0], '2026-11-03': [2584, 1568657, 2600, 0],
  '2026-11-04': [877, 227589, 2290, 0], '2026-11-05': [579, 73444, 1880, 0], '2026-11-06': [576, 40532, 1370, 0],
  '2026-11-07': [635, 117018, 1730, 0], '2026-11-08': [576, 150692, 1900, 0], '2026-11-09': [82740, 3816944, 2830, 0],
  '2026-11-10': [6654, 2563204, 2230, 0], '2026-11-11': [44550, 2567245, 11040, 3210], '2026-11-12': [127410, 12687888, 20880, 4870],
  '2026-11-13': [84286, 11429290, 27860, 8350], '2026-11-14': [229573, 9719706, 40320, 13650], '2026-11-15': [154490, 6333012, 13280, 4460],
};
const KEYS = ['w', 'r', 'q', 'd'];
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

const pending = { w: 0, r: 0, q: 0, d: 0 };
let state = { over: {}, totals: null, checked: 0 };
let lastFlush = 0;

export const count = (k, n = 1) => { pending[k] += n; };
export const usageState = () => state;
export const isOver = (k) => !!state.over[k];

// Sum of the last 31 UTC days (today included): metered rows plus the seed for days before the meter.
export function rollingTotals(rows, now = Date.now(), seed = SEED) {
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
const add = (meta) => { if (meta) { pending.w += meta.rows_written || 0; pending.r += meta.rows_read || 0; } };

// A D1 binding that counts and, past the fuse, refuses. Same surface the worker uses: prepare/bind/run/all/first, batch.
export function meterDb(db) {
  const wrap = (stmt, sql) => ({
    __stmt: stmt,
    __sql: sql,
    bind: (...args) => wrap(stmt.bind(...args), sql),
    run: async () => { guard(sql); const r = await stmt.run(); add(r?.meta); return r; },
    all: async () => { guard(sql); const r = await stmt.all(); add(r?.meta); return r; },
    // first() has no meta in D1, so it runs as all() and picks the first row (D1's first() reads the same rows).
    first: async (col) => {
      guard(sql);
      const r = await stmt.all();
      add(r?.meta);
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
      for (const r of rs || []) add(r?.meta);
      return rs;
    },
    exec: async (sql) => { guard(sql); return db.exec(sql); },
  };
}

// Adds the tally to today's row and re-reads the 31-day totals. Runs at most once a minute per isolate (sooner when a lot
// was written), always on the raw binding so the fuse can never block its own bookkeeping.
export async function flushUsage(db, now = Date.now(), force = false) {
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
    const totals = rollingTotals(results, now);
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
