// In-game megaphones. The admin collector posts what it reads from a shared game window; the public page polls the
// newest rows. color is the background band the line was drawn on (Y gold, P pink, C cyan, N none). Writes need MEGAPHONE_TOKEN; rows older than three days are dropped by the schedule.
const reply = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
const KINDS = new Set(['super', 'item', 'double', 'mega']);
const digest = async (value) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((x) => x.toString(16).padStart(2, '0')).join('');
const stamp = (t) => new Date(t).toISOString().slice(0, 19).replace('T', ' ');

export function validMegaphone(r, now = Date.now()) {
  const seen = Date.parse(r?.seen);
  return r && KINDS.has(r.kind) && typeof r.nick === 'string' && /^[A-Za-z0-9]{2,13}$/.test(r.nick) &&
    typeof r.text === 'string' && r.text.trim().length >= 2 && r.text.length <= 200 &&
    (r.color == null || /^[YPCN]$/.test(r.color)) && (r.channel == null || (Number.isInteger(r.channel) && r.channel >= 1 && r.channel <= 40)) &&
    Number.isFinite(seen) && seen <= now + 60000 && now - seen < 3600000;
}

export async function postMegaphones(req, env) {
  if (!env.MEGAPHONE_TOKEN) return reply({ error: 'megaphones not configured' }, 503);
  const auth = req.headers.get('Authorization') || '';
  if (auth.length > 256 || (await digest(auth)) !== (await digest(`Bearer ${env.MEGAPHONE_TOKEN}`))) return reply({ error: 'unauthorized' }, 401);
  let body;
  try { body = await req.json(); } catch { return reply({ error: 'invalid JSON' }, 400); }
  const rows = (Array.isArray(body?.rows) ? body.rows : []).slice(0, 50).filter((r) => validMegaphone(r));
  if (!rows.length) return reply({ ok: true, accepted: 0 });
  // The same line stays on screen for a while and scrolls through several frames: one row per nick+text per 10 minutes.
  const insert = env.DB.prepare('INSERT OR IGNORE INTO megaphones (seen_at, kind, color, channel, nick, text, hash) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const stmts = await Promise.all(rows.map(async (r) => insert.bind(stamp(r.seen), r.kind, r.color ?? null, r.channel ?? null, r.nick, r.text.trim(), await digest(`${r.nick}|${r.text.trim().toLowerCase()}|${Math.floor(Date.parse(r.seen) / 600000)}`))));
  const results = await env.DB.batch(stmts);
  return reply({ ok: true, accepted: results.filter((x) => x.meta.changes > 0).length });
}

export async function listMegaphones(env, params) {
  const after = Math.max(0, Number(params.get('after')) || 0);
  const limit = Math.min(200, Math.max(1, Number(params.get('limit')) || 100));
  // ?q=<English item name>: megaphones naming that item (the market's item panel), newest first, last 3 days.
  const q = String(params.get('q') || '').trim().slice(0, 60);
  if (q.length >= 3) {
    const { results } = await env.DB.prepare("SELECT id, seen_at AS seen, kind, color, channel, nick, text FROM megaphones WHERE text LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT ?")
      .bind(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`, Math.min(limit, 30)).all();
    return { rows: results, at: new Date().toISOString() };
  }
  const { results } = await env.DB.prepare('SELECT id, seen_at AS seen, kind, color, channel, nick, text FROM megaphones WHERE id > ? ORDER BY id DESC LIMIT ?').bind(after, limit).all();
  return { rows: results, at: new Date().toISOString() };
}

export const pruneMegaphones = (env) => env.DB.prepare("DELETE FROM megaphones WHERE seen_at < datetime('now', '-3 days')").run();
