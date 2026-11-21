// "Log in with Discord" for the whole site (owner, 2026-11-21): the site keeps working exactly as before without an
// account; logging in only adds a copy of the visitor's own settings (the same localStorage keys the pages already use,
// see assets/account-sync.js) so they follow them to another browser or phone.
//   GET  /discord/oauth/start?intent=login&lang=&ret=   → Discord consent (identify + guilds.join), see discord-oauth.js
//   GET  /discord/oauth?code=&state=                    → joins the GMS Hub server, back to ret with #gmslogin=<session>
//   GET  /account/data      (Authorization: Bearer)     → { user, data: { key: { v, t } } }
//   POST /account/data      { set: { key: { v, t } } }  → newer values win per key (t = when the browser changed it)
//   DELETE /account/data                                → removes everything stored for this account
// The session is a signed token (no session table): Discord id, name and avatar, valid for 180 days.
import { sameSecret } from './secure.js';

const enc = new TextEncoder();
const SESSION_DAYS = 180;
export const MAX_VALUE = 200 * 1024; // one key (a 240 px character picture fits)
export const MAX_TOTAL = 1024 * 1024; // everything one account keeps
export const MAX_KEYS = 400;
// Same rule as the browser (assets/account-sync.js): owner keys, analytics flags and per-tab state never leave the browser.
const KEY_RE = /^(gms|gmshub|fg-|mk-|cb_lang)[A-Za-z0-9_.\-]{0,80}$/;
const NEVER = new Set(['cb_admin_token', 'gms-traffic-key', 'gmshub_internal', 'gms-presence', 'gms-exp-session', 'gms-exp-client',
  'gms-market-catalog', 'gms-market-seen', 'gms-account', 'gms-sync-meta', 'gmshub_voted']);
export const syncableKey = (k) => typeof k === 'string' && KEY_RE.test(k) && !NEVER.has(k) && !k.startsWith('gms-sync');

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}
// A separate signing context, so an OAuth state can never pass as a session and the other way round.
const sessionKey = (secret) => `${secret}:account-session`;
const bytesB64 = (s) => b64url(enc.encode(s));
const textFromB64 = (s) => new TextDecoder().decode(Uint8Array.from(fromB64url(s), (c) => c.charCodeAt(0)));

export async function signSession(secret, user, now = Date.now()) {
  const body = bytesB64(JSON.stringify({ u: String(user.id), n: String(user.name || '').slice(0, 64), a: user.avatar || '', exp: now + SESSION_DAYS * 864e5 }));
  return `${body}.${await hmac(sessionKey(secret), body)}`;
}
export async function readSession(secret, token, now = Date.now()) {
  const [body, sig] = String(token || '').split('.');
  if (!secret || !body || !sig || !(await sameSecret(sig, await hmac(sessionKey(secret), body)))) return null;
  try {
    const d = JSON.parse(textFromB64(body));
    return d && /^\d{5,25}$/.test(d.u) && d.exp > now ? d : null;
  } catch { return null; }
}

// Called by the OAuth callback once Discord has said who this is.
export async function rememberAccount(env, me) {
  const name = me.global_name || me.username || '';
  await env.DB.prepare(`INSERT INTO accounts (id, name, avatar, created, seen) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar, seen = excluded.seen`)
    .bind(String(me.id), name, me.avatar || '', Date.now(), Date.now()).run();
  return signSession(env.DISCORD_CLIENT_SECRET, { id: me.id, name, avatar: me.avatar || '' });
}

function reply(data, headers, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export async function handleAccount(req, env, cors) {
  const headers = { ...cors, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS' };
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  const s = await readSession(env.DISCORD_CLIENT_SECRET, (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''));
  if (!s) return reply({ error: 'login' }, headers, 401);
  const user = { id: s.u, name: s.n, avatar: s.a };
  if (req.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT k, v, t FROM account_data WHERE id = ?').bind(s.u).all();
    const data = {};
    for (const r of results || []) data[r.k] = { v: r.v, t: r.t };
    return reply({ user, data }, headers);
  }
  if (req.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM account_data WHERE id = ?').bind(s.u).run();
    await env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(s.u).run();
    return reply({ ok: true }, headers);
  }
  if (req.method !== 'POST') return reply({ error: 'method' }, headers, 405);
  let body;
  try { body = await req.json(); } catch { return reply({ error: 'bad json' }, headers, 400); }
  const set = body && typeof body.set === 'object' && body.set ? body.set : {};
  const now = Date.now();
  const rows = [];
  for (const [k, x] of Object.entries(set)) {
    if (!syncableKey(k) || !x || typeof x !== 'object') continue;
    const v = x.v === null ? null : typeof x.v === 'string' ? x.v : null;
    if (x.v !== null && v === null) continue;
    if (v !== null && v.length > MAX_VALUE) continue;
    const t = Math.min(Number(x.t) || now, now + 60e3); // a clock far ahead cannot pin a value forever
    rows.push([k, v, t]);
  }
  if (!rows.length) return reply({ ok: true, saved: 0 }, headers);
  const have = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(v)), 0) AS size FROM account_data WHERE id = ?').bind(s.u).first();
  const adding = rows.reduce((a, [, v]) => a + (v ? v.length : 0), 0);
  // Rough caps (an update of an existing key counts as new here, hence the headroom).
  if ((have?.n || 0) >= MAX_KEYS || (have?.size || 0) + adding > MAX_TOTAL * 1.5) return reply({ error: 'full' }, headers, 413);
  const up = env.DB.prepare(`INSERT INTO account_data (id, k, v, t) VALUES (?, ?, ?, ?)
    ON CONFLICT(id, k) DO UPDATE SET v = excluded.v, t = excluded.t WHERE excluded.t > account_data.t`);
  for (const [k, v, t] of rows) await up.bind(s.u, k, v, t).run();
  return reply({ ok: true, saved: rows.length }, headers);
}
