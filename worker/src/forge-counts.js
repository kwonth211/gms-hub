// Scroll forge counter: every visitor's applied scrolls added up per KST day. The page batches its own results and sends
// them now and then (one row write per batch), so the counter costs almost nothing in D1.
const MAX_PER_BATCH = 500;
export const kstDay = (now = Date.now()) => new Date(now + 9 * 3600e3).toISOString().slice(0, 10);

const count = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_PER_BATCH) : 0;
};

export async function addForgeCounts(env, body, now = Date.now()) {
  const ok = count(body?.ok), fail = count(body?.fail), boom = count(body?.boom);
  if (!ok && !fail && !boom) return { status: 400, body: { error: 'empty' } };
  if (ok + fail + boom > MAX_PER_BATCH) return { status: 400, body: { error: 'too many' } };
  await env.DB.prepare('INSERT INTO forge_counts (day, ok, fail, boom) VALUES (?, ?, ?, ?) ON CONFLICT(day) DO UPDATE SET ok = ok + excluded.ok, fail = fail + excluded.fail, boom = boom + excluded.boom')
    .bind(kstDay(now), ok, fail, boom).run();
  return { status: 200, body: { ok: true } };
}

export async function forgeCounts(env, now = Date.now()) {
  const day = kstDay(now);
  const row = await env.DB.prepare('SELECT SUM(ok) AS ok, SUM(fail) AS fail, SUM(boom) AS boom, SUM(CASE WHEN day = ? THEN ok ELSE 0 END) AS tok, SUM(CASE WHEN day = ? THEN fail ELSE 0 END) AS tfail, SUM(CASE WHEN day = ? THEN boom ELSE 0 END) AS tboom FROM forge_counts')
    .bind(day, day, day).first();
  const n = (v) => Number(v) || 0;
  return { day, today: { ok: n(row?.tok), fail: n(row?.tfail), boom: n(row?.tboom) }, total: { ok: n(row?.ok), fail: n(row?.fail), boom: n(row?.boom) } };
}
