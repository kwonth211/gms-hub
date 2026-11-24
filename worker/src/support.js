// The support widget on every page (assets/support.js): bug reports, data reports, ideas and questions.
// A visitor logged in with Discord gets a thread: what they wrote, the owner's answers, an unread mark, and a Discord DM
// when an answer arrives. Without a login the message only goes to the owner's private Discord channel: nothing is kept
// for the sender and there is nowhere to answer to, and the widget says so before sending.
// Threads live in one SQLite-backed Durable Object, so the shared D1 tables and their budget are not touched.
import { readSession } from './account.js';
import { dmChannel, sendDm } from './discord-alerts.js';
import { sameSecret } from './secure.js';

export const KINDS = { bug: '오류 신고', data: '정보 제보', idea: '건의', ask: '문의' };
export const MAX_TEXT = 1000;
export const PER_DAY = 10;
const DAY = 86400000;
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);
const pagePath = (v) => (/^\/[\w\-./]*$/.test(String(v ?? '')) ? String(v).slice(0, 120) : '');

export class Support {
  constructor(state) {
    this.sql = state.storage.sql;
    this.recent = new Map(); // sender -> times, for the day limit (memory only)
    this.sql.exec(`CREATE TABLE IF NOT EXISTS msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, name TEXT, who TEXT NOT NULL, kind TEXT, text TEXT NOT NULL, page TEXT, env TEXT, at INTEGER NOT NULL, seen INTEGER NOT NULL DEFAULT 0)`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS msgs_uid ON msgs (uid, id)');
  }
  // Only the worker can reach this object; it has already checked the login or the owner key.
  async fetch(req) {
    const b = await req.json(), now = Date.now(), all = (q, ...a) => this.sql.exec(q, ...a).toArray();
    if (b.op === 'allow') {
      const list = (this.recent.get(b.from) || []).filter((t) => now - t < DAY);
      if (list.length >= b.max || (list.length && now - list.at(-1) < 5000)) return Response.json({ ok: false });
      list.push(now);
      this.recent.set(b.from, list);
      if (this.recent.size > 5000) this.recent.clear();
      return Response.json({ ok: true });
    }
    if (b.op === 'mine') {
      const rows = all('SELECT id, who, kind, text, at, seen FROM msgs WHERE uid = ? ORDER BY id DESC LIMIT 100', b.uid).reverse();
      return Response.json({ list: rows, unread: rows.filter((r) => r.who === 'staff' && !r.seen).length });
    }
    if (b.op === 'seen') { all("UPDATE msgs SET seen = 1 WHERE uid = ? AND who = 'staff' AND seen = 0", b.uid); return Response.json({ ok: true }); }
    if (b.op === 'add') {
      const n = all('SELECT COUNT(*) AS n FROM msgs WHERE uid = ? AND at > ?', b.uid, now - DAY)[0].n;
      if (b.who === 'user' && n >= PER_DAY * 3) return Response.json({ error: 'daily' });
      const id = all('INSERT INTO msgs (uid, name, who, kind, text, page, env, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id', b.uid, b.name || '', b.who, b.kind || '', b.text, b.page || '', b.env || '', now)[0].id;
      // An answer settles what came before it.
      if (b.who === 'staff') all("UPDATE msgs SET seen = 1 WHERE uid = ? AND who = 'user'", b.uid);
      return Response.json({ ok: true, id, at: now });
    }
    if (b.op === 'threads') {
      return Response.json({ threads: all(`SELECT m.uid, (SELECT name FROM msgs x WHERE x.uid = m.uid AND x.who = 'user' ORDER BY id DESC LIMIT 1) AS name, MAX(m.at) AS at, COUNT(*) AS n,
        SUM(CASE WHEN m.who = 'user' AND m.seen = 0 THEN 1 ELSE 0 END) AS waiting FROM msgs m GROUP BY m.uid ORDER BY waiting > 0 DESC, at DESC LIMIT 200`) });
    }
    if (b.op === 'thread') return Response.json({ list: all('SELECT id, who, kind, text, page, env, at, seen FROM msgs WHERE uid = ? ORDER BY id DESC LIMIT 200', b.uid).reverse() });
    if (b.op === 'done') { all("UPDATE msgs SET seen = 1 WHERE uid = ? AND who = 'user'", b.uid); return Response.json({ ok: true }); }
    if (b.op === 'forget') { all('DELETE FROM msgs WHERE uid = ?', b.uid); return Response.json({ ok: true }); }
    return Response.json({ error: 'op' }, { status: 400 });
  }
}

const room = (env, body) => env.SUPPORT.get(env.SUPPORT.idFromName('site')).fetch('https://support/', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
export const forgetSupport = async (env, uid) => { if (env.SUPPORT) await room(env, { op: 'forget', uid }).catch(() => null); };

async function tellOwner(env, title, text, foot) {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_SUPPORT_CHANNEL) return false;
  const safe = (s) => String(s).replace(/`/g, "'");
  return sendDm(env, env.DISCORD_SUPPORT_CHANNEL, `${title}\n>>> ${safe(text).slice(0, 1400)}\n${safe(foot)}`);
}

async function visitorHash(env, ip) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.VOTE_SALT || ''}|support|${ip}`)));
  return [...h.slice(0, 12)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// GET: the logged-in visitor's thread. POST {seen:true}: answers read. POST {kind, text, page, env}: a message.
export async function handleSupport(req, env, cors) {
  const headers = { ...cors, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  const reply = (d, status = 200) => new Response(JSON.stringify(d), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (!env.SUPPORT) return reply({ error: 'off' }, 503);
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const s = token ? await readSession(env.DISCORD_CLIENT_SECRET, token) : null;
  if (token && !s) return reply({ error: 'login' }, 401);
  if (req.method === 'GET') return s ? reply(await room(env, { op: 'mine', uid: s.u })) : reply({ error: 'login' }, 401);
  if (req.method !== 'POST') return reply({ error: 'method' }, 405);
  const b = await req.json().catch(() => null);
  if (b?.seen === true) return s ? reply(await room(env, { op: 'seen', uid: s.u })) : reply({ error: 'login' }, 401);
  const text = clean(b?.text, MAX_TEXT), kind = Object.hasOwn(KINDS, b?.kind) ? b.kind : null;
  if (!kind) return reply({ error: 'kind' }, 400);
  if (text.length < 5) return reply({ error: 'short' }, 400);
  const page = pagePath(b.page), info = clean(b.env, 80).replace(/\s+/g, ' ');
  const from = s ? `u${s.u}` : await visitorHash(env, req.headers.get('CF-Connecting-IP') || '');
  if (!(await room(env, { op: 'allow', from, max: s ? PER_DAY : 3 })).ok) return reply({ error: 'daily' }, 429);
  const foot = `${page || '/'} · ${info}`;
  if (!s) {
    const sent = await tellOwner(env, `📩 **${KINDS[kind]}** · 비회원 (답변 불가)`, text, foot);
    return sent ? reply({ ok: true, kept: false }) : reply({ error: 'send' }, 502);
  }
  const r = await room(env, { op: 'add', uid: s.u, name: clean(s.n, 40), who: 'user', kind, text, page, env: info });
  if (r.error) return reply(r, 429);
  await tellOwner(env, `📩 **${KINDS[kind]}** · ${clean(s.n, 40).replace(/[*_`~|>@]/g, '')} · 답변: https://gms-hub.com/admin/support/`, text, foot);
  return reply({ ok: true, kept: true, id: r.id, at: r.at });
}

// Owner: list | thread {uid} | reply {uid, text} | done {uid}. Same key as the traffic dashboard.
export async function handleSupportAdmin(req, env, allowedOrigins) {
  const origin = req.headers.get('Origin') || '';
  const cors = { 'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
  const reply = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method' }, 405);
  const b = await req.json().catch(() => ({}));
  if (!env.DASH_TOKEN || typeof b.token !== 'string' || b.token.length > 256 || !(await sameSecret(b.token, env.DASH_TOKEN))) return reply({ error: 'forbidden' }, 403);
  if (!env.SUPPORT) return reply({ error: 'off' }, 503);
  const uid = /^\d{5,25}$/.test(String(b.uid ?? '')) ? String(b.uid) : null;
  if (b.action === 'list') return reply(await room(env, { op: 'threads' }));
  if (!uid) return reply({ error: 'uid' }, 400);
  if (b.action === 'thread') return reply(await room(env, { op: 'thread', uid }));
  if (b.action === 'done') return reply(await room(env, { op: 'done', uid }));
  if (b.action === 'reply') {
    const text = clean(b.text, MAX_TEXT);
    if (text.length < 1) return reply({ error: 'short' }, 400);
    const r = await room(env, { op: 'add', uid, who: 'staff', text });
    if (r.error) return reply(r, 429);
    const ch = await dmChannel(env, uid).catch(() => null);
    const dm = ch ? await sendDm(env, ch, `💬 GMS Hub 문의에 답변이 왔어요 · Your GMS Hub message has an answer\n>>> ${text.replace(/`/g, "'").slice(0, 1500)}`) : false;
    return reply({ ok: true, dm });
  }
  return reply({ error: 'action' }, 400);
}
