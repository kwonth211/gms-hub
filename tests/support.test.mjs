import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/src/index.js';
import { Support } from '../worker/src/support.js';
import { signSession } from '../worker/src/account.js';

const ORIGIN = 'https://gms-hub.com';
function setup() {
  const db = new DatabaseSync(':memory:');
  const sql = { exec: (q, ...a) => { const st = db.prepare(q); const rows = /^\s*(SELECT)|RETURNING/i.test(q) ? st.all(...a) : (st.run(...a), []); return { toArray: () => rows }; } };
  const obj = new Support({ storage: { sql } });
  const DB = { prepare: () => ({ bind() { return this; }, async first() { return null; }, async all() { return { results: [] }; }, async run() { return { meta: { changes: 0 } }; } }) };
  return { env: { DB, VOTE_SALT: 's', DISCORD_CLIENT_SECRET: 'secret-for-tests', DASH_TOKEN: 'dash-for-tests', DISCORD_BOT_TOKEN: 'bot', DISCORD_SUPPORT_CHANNEL: '1', SUPPORT: { idFromName: (n) => n, get: () => ({ fetch: (u, o) => obj.fetch(new Request(u, o)) }) } }, db };
}
async function withDiscord(fn) {
  const real = globalThis.fetch, sent = [];
  globalThis.fetch = async (u, o) => { sent.push([String(u), JSON.parse(o?.body || '{}')]); return Response.json({ id: 'dm1' }); };
  try { return await fn(sent); } finally { globalThis.fetch = real; }
}
const post = (env, path, body, h = {}) => worker.fetch(new Request(`https://w${path}`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': h.ip || '1.1.1.1', ...(h.auth ? { Authorization: `Bearer ${h.auth}` } : {}) }, body: JSON.stringify(body) }), env);

test('a visitor without a login: the owner is told, nothing is kept, nothing can be read back', () => withDiscord(async (sent) => {
  const { env, db } = setup();
  const r = await post(env, '/support', { kind: 'bug', text: '시세 페이지가 안 열려요', page: '/ko/tools/market/', env: 'Windows Chrome' });
  assert.deepEqual(await r.json(), { ok: true, kept: false });
  assert.equal(sent.length, 1);
  assert.match(sent[0][1].content, /비회원/);
  assert.deepEqual(sent[0][1].allowed_mentions, { parse: [] });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM msgs').get().n, 0);
  assert.equal((await worker.fetch(new Request('https://w/support', { headers: { Origin: ORIGIN } }), env)).status, 401);
}));

test('a member keeps a thread, gets the answer with an unread mark and a DM, and only sees their own', () => withDiscord(async (sent) => {
  const { env } = setup();
  const a = await signSession(env.DISCORD_CLIENT_SECRET, { id: '11111111', name: 'A', avatar: '' }), b = await signSession(env.DISCORD_CLIENT_SECRET, { id: '22222222', name: 'B', avatar: '' });
  assert.equal((await (await post(env, '/support', { kind: 'ask', text: '답변 주세요', page: '/ko/' }, { auth: a })).json()).kept, true);
  const admin = async (x) => (await post(env, '/internal/support', { token: 'dash-for-tests', ...x })).json();
  assert.equal((await admin({ action: 'list' })).threads[0].waiting, 1);
  assert.equal((await admin({ action: 'reply', uid: '11111111', text: '고쳤어요' })).dm, true);
  assert.match(sent.at(-1)[1].content, /고쳤어요/);
  const mine = async (t) => (await worker.fetch(new Request('https://w/support', { headers: { Origin: ORIGIN, Authorization: `Bearer ${t}` } }), env)).json();
  const got = await mine(a);
  assert.equal(got.unread, 1);
  assert.deepEqual(got.list.map((m) => m.who), ['user', 'staff']);
  assert.deepEqual((await mine(b)).list, []);
  await post(env, '/support', { seen: true }, { auth: a });
  assert.equal((await mine(a)).unread, 0);
  assert.equal((await admin({ action: 'list' })).threads[0].waiting, 0);
}));

test('the inbox needs the owner key, other sites cannot post, and floods and empty messages are refused', () => withDiscord(async () => {
  const { env } = setup();
  assert.equal((await post(env, '/internal/support', { token: 'wrong', action: 'list' })).status, 403);
  assert.equal((await worker.fetch(new Request('https://w/support', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' }), env)).status, 403);
  assert.equal((await post(env, '/support', { kind: 'bug', text: 'a' })).status, 400);
  assert.equal((await post(env, '/support', { kind: 'constructor', text: 'hello there' })).status, 400);
  assert.equal((await post(env, '/support', { kind: 'bug', text: 'hello there' }, { ip: '9.9.9.9' })).status, 200);
  assert.equal((await post(env, '/support', { kind: 'bug', text: 'hello again' }, { ip: '9.9.9.9' })).status, 429); // 5 seconds apart at least
}));
