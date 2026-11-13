// Shared EXP tracker runs (POST /exp-runs) and their per-spot summary (GET /exp-runs/summary). A run is only stored when
// the player presses "add to the spot rankings" on a finished session; the page sends level, class, party size, the
// monster and/or training route, minutes and EXP per hour. The summary shows a spot only once 3 different players have
// shared it, uses the median, and drops runs far outside the rest, so one bad or fake run cannot move it.
const JOBS = new Set(['warrior', 'fighter', 'page', 'spear', 'archer', 'hunter', 'crossbow', 'mage', 'fire', 'ice', 'cleric', 'thief', 'assassin', 'bandit', 'beginner']);
const MIN_VOTERS = 3;
const DAILY_CAP = 20;

async function hash(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);

export async function addExpRun(req, env) {
  const b = await req.json().catch(() => null);
  if (!b) return { status: 400, body: { error: 'bad body' } };
  const level = int(b.level, 1, 200), party = int(b.party ?? 1, 1, 6), minutes = int(b.minutes, 10, 600), perHour = int(b.perHour, 1, 20000000);
  const mob = b.mob == null ? null : int(b.mob, 1, 99999999);
  const route = typeof b.route === 'string' && /^[a-z0-9-]{1,60}$/.test(b.route) ? b.route : null;
  const job = typeof b.job === 'string' && JOBS.has(b.job) ? b.job : null;
  const run = typeof b.run === 'string' && /^[a-z0-9:-]{6,80}$/i.test(b.run) ? b.run : null;
  const client = typeof b.client === 'string' && /^[a-z0-9-]{8,64}$/i.test(b.client) ? b.client : null;
  if (!level || !party || !minutes || !perHour || !job || !run || !client || (!mob && !route)) return { status: 400, body: { error: 'bad run' } };
  const voter = await hash(`${env.VOTE_SALT}:exp:${req.headers.get('CF-Connecting-IP') || ''}:${client}`);
  const today = await env.DB.prepare("SELECT COUNT(*) AS n FROM exp_runs WHERE voter = ? AND created_at >= datetime('now', '-1 day')").bind(voter).first();
  if ((today?.n || 0) >= DAILY_CAP) return { status: 429, body: { error: 'too many' } };
  const r = await env.DB.prepare('INSERT OR IGNORE INTO exp_runs (voter, run, mob, route, level, job, party, minutes, per_hour, lang) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(voter, run, mob, route, level, job, party, minutes, perHour, typeof b.lang === 'string' ? b.lang.slice(0, 5) : null).run();
  return { status: 200, body: { ok: true, added: r.meta.changes === 1 } };
}

const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
// Keep runs within a factor of 3 of the median: a misread or a made-up number does not drag the result.
function summarizeGroup(rows) {
  const mid = median(rows.map((r) => r.per_hour));
  const kept = rows.filter((r) => r.per_hour >= mid / 3 && r.per_hour <= mid * 3);
  const voters = new Set(kept.map((r) => r.voter)).size;
  if (voters < MIN_VOTERS) return null;
  // One player with many runs counts once: each player's own median first, then the median across players.
  const byVoter = new Map();
  for (const r of kept) (byVoter.get(r.voter) || byVoter.set(r.voter, []).get(r.voter)).push(r.per_hour);
  return { perHour: median([...byVoter.values()].map(median)), runs: kept.length, players: voters,
    lvMin: Math.min(...kept.map((r) => r.level)), lvMax: Math.max(...kept.map((r) => r.level)), minutes: kept.reduce((s, r) => s + r.minutes, 0) };
}

export async function expRunsSummary(env) {
  const { results } = await env.DB.prepare("SELECT voter, mob, route, level, job, party, minutes, per_hour FROM exp_runs WHERE created_at >= datetime('now', '-60 days')").all();
  const group = (key) => {
    const m = new Map();
    for (const r of results) { const k = r[key]; if (k == null) continue; (m.get(k) || m.set(k, []).get(k)).push(r); }
    const out = {};
    for (const [k, rows] of m) { const s = summarizeGroup(rows); if (s) out[k] = s; }
    return out;
  };
  return { at: new Date().toISOString(), runs: results.length, players: new Set(results.map((r) => r.voter)).size, routes: group('route'), mobs: group('mob') };
}
