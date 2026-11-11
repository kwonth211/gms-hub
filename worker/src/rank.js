// Character rankings from ClassicRank's public read API (https://classicrank.com/developer). Keyless use allows the
// level ranking's first 1,000 rows at 50 a page and 30 requests a minute per IP; data must be credited with a visible
// link to classicrank.com wherever it is shown. The worker fetches the list at most once an hour on its schedule and
// stores one snapshot row, so page views never call ClassicRank; single-name lookups are cached for an hour.
const API = 'https://classicrank.com/api/v1';
const FIELDS = 'name,level,job,job_tier,family,fame,overall_rank,job_rank,photo,verified,last_checked';
const PAGES = 20;
const REFRESH_MS = 55 * 60000;
const HEADERS = { 'User-Agent': 'GMS Hub (https://gms-hub.com) ranking snapshot', Accept: 'application/json' };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Keep only the fields the page shows; anything ClassicRank adds later is ignored.
const pick = (c) => ({ name: c.name, level: c.level, job: c.job, tier: c.job_tier, family: c.family, fame: c.fame,
  rank: c.overall_rank, jobRank: c.job_rank, photo: c.photo, verified: !!c.verified, checked: c.last_checked });

export async function refreshRank(env, now = Date.now(), fetcher = fetch, wait = pause) {
  const last = await env.DB.prepare("SELECT at FROM snapshots WHERE key = 'rank'").first().catch(() => null);
  if (last && now - Date.parse(last.at.replace(' ', 'T') + 'Z') < REFRESH_MS) return { skipped: 'recent' };
  const rows = [];
  for (let page = 1; page <= PAGES; page++) {
    const r = await fetcher(`${API}/characters?sort=level&limit=50&page=${page}&fields=${FIELDS}`, { headers: HEADERS });
    if (!r.ok) break;
    const body = await r.json();
    rows.push(...(body.data || []).map(pick));
    if (!body.meta?.next) break;
    // Two seconds apart keeps a refresh well under the 30-a-minute keyless limit.
    await wait(2000);
  }
  if (rows.length < 50) return { skipped: 'fetch failed', rows: rows.length };
  const stats = await fetcher(`${API}/stats`, { headers: HEADERS }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const data = { at: new Date(now).toISOString(), source: 'https://classicrank.com', stats: stats?.data || null, rows };
  await env.DB.prepare("INSERT OR REPLACE INTO snapshots (key, json, at) VALUES ('rank', ?, datetime('now'))").bind(JSON.stringify(data)).run();
  return { stored: rows.length };
}

export async function rankSnapshot(env) {
  const row = await env.DB.prepare("SELECT json FROM snapshots WHERE key = 'rank'").first().catch(() => null);
  return row ? JSON.parse(row.json) : null;
}

// One character by name, for "find my character". Names are 2-13 letters and digits in this world.
export async function lookupCharacter(name, fetcher = fetch) {
  if (!/^[A-Za-z0-9]{2,13}$/.test(name || '')) return { status: 400, body: { error: 'bad name' } };
  const r = await fetcher(`${API}/characters/${encodeURIComponent(name)}?fields=${FIELDS}`, { headers: HEADERS });
  if (r.status === 404) return { status: 404, body: { error: 'not found' } };
  if (!r.ok) return { status: 503, body: { error: 'ranking unavailable' } };
  const body = await r.json();
  return { status: 200, body: { data: pick(body.data || {}) } };
}
