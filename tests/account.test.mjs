// Site-wide "Log in with Discord": signed sessions, the stored copy of a visitor's settings, and the browser merge rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { signSession, readSession, handleAccount, syncableKey as serverKey } from '../worker/src/account.js';
import { oauthStart, oauthCallback, readState, signState } from '../worker/src/discord-oauth.js';
import { plan, batches, fingerprint, syncableKey } from '../assets/account-sync.js';
import { recordContribution, contributorsData, leaderboardEmbed } from '../worker/src/contributors.js';

function env(extra = {}) {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of ['0025_accounts.sql', '0026_contributions.sql', '0027_contributor_sellers.sql']) sqlite.exec(fs.readFileSync(new URL(`../worker/migrations/${f}`, import.meta.url), 'utf8'));
  const DB = { prepare(sql, args = []) {
    return { bind: (...v) => DB.prepare(sql, v), all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
      first: async () => sqlite.prepare(sql).get(...args) ?? null,
      run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }) };
  }, batch: async (stmts) => Promise.all(stmts.map((x) => x.run())) };
  return { DB, sqlite, DISCORD_BOT_TOKEN: 'bot', DISCORD_CLIENT_SECRET: 'sec', DISCORD_APP_ID: '55', DISCORD_GUILD_ID: '77', ...extra };
}
const W = 'https://w.example';
const req = (method, token, body) => new Request(`${W}/account/data`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

test('a session is signed, expires, and an OAuth state cannot pass as one', async () => {
  const t = await signSession('sec', { id: '123456789', name: '혹스', avatar: 'abc' });
  assert.equal((await readSession('sec', t)).n, '혹스');
  assert.equal(await readSession('other', t), null);
  assert.equal(await readSession('sec', t, Date.now() + 181 * 864e5), null);
  assert.equal(await readSession('sec', await signState('sec', { login: 1 })), null);
});

test('the account keeps the newest copy per key, refuses owner keys and needs a session', async () => {
  const e = env();
  const t = await signSession('sec', { id: '123456789', name: 'a' });
  assert.equal((await handleAccount(req('GET'), e, {})).status, 401);
  let r = await handleAccount(req('POST', t, { set: { 'gms-char': { v: '{"job":"fighter","lv":40}', t: 100 }, cb_admin_token: { v: 'x', t: 100 }, 'gms-theme': { v: 'dark', t: 100 } } }), e, {});
  assert.equal((await r.json()).saved, 2);
  await handleAccount(req('POST', t, { set: { 'gms-char': { v: 'old', t: 50 }, 'gms-theme': { v: null, t: 200 } } }), e, {});
  const { data, user } = await (await handleAccount(req('GET', t), e, {})).json();
  assert.equal(user.id, '123456789');
  assert.equal(data['gms-char'].v, '{"job":"fighter","lv":40}', 'an older write does not win');
  assert.equal(data['gms-theme'].v, null, 'a removal is kept so it reaches other devices');
  assert.ok(!data.cb_admin_token);
  assert.equal((await handleAccount(req('DELETE', t), e, {})).status, 200);
  assert.deepEqual((await (await handleAccount(req('GET', t), e, {})).json()).data, {});
});

test('login goes to Discord with a login state and comes back with the session in the fragment', async () => {
  const e = env();
  const start = new URL((await oauthStart(new URL(`${W}/discord/oauth/start?intent=login&lang=ja&ret=/ja/tools/damage/`), e, async () => false)).headers.get('Location'));
  assert.equal(start.searchParams.get('scope'), 'identify guilds.join');
  const st = await readState('sec', start.searchParams.get('state'));
  assert.deepEqual([st.login, st.lang, st.ret], [1, 'ja', '/ja/tools/damage/']);
  const evil = new URL((await oauthStart(new URL(`${W}/discord/oauth/start?intent=login&lang=ko&ret=//evil.com`), e, async () => false)).headers.get('Location'));
  assert.equal((await readState('sec', evil.searchParams.get('state'))).ret, '/ko/');
  const real = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push([init.method || 'GET', String(url)]);
    if (String(url).endsWith('/oauth2/token')) return Response.json({ access_token: 'at' });
    if (String(url).endsWith('/users/@me')) return Response.json({ id: '987654321', global_name: 'Hooks', avatar: 'av' });
    return new Response(null, { status: 204 });
  };
  try {
    const back = new URL((await oauthCallback(new URL(`${W}/discord/oauth?code=c&state=${encodeURIComponent(start.searchParams.get('state'))}`), e, () => '')).headers.get('Location'));
    assert.equal(back.pathname, '/ja/tools/damage/');
    const token = back.hash.replace('#gmslogin=', '');
    assert.equal((await readSession('sec', token)).n, 'Hooks');
    assert.ok(calls.some(([m, u]) => m === 'PUT' && u.endsWith('/guilds/77/members/987654321')), 'joins the server');
    assert.equal(e.sqlite.prepare('SELECT name FROM accounts').get().name, 'Hooks');
    const cancel = new URL((await oauthCallback(new URL(`${W}/discord/oauth?error=access_denied&state=${encodeURIComponent(start.searchParams.get('state'))}`), e, () => '')).headers.get('Location'));
    assert.equal(cancel.searchParams.get('login'), 'cancel');
  } finally { globalThis.fetch = real; }
});

test('browser and server agree on which keys sync; owner keys and live state never do', () => {
  for (const k of ['gms-char', 'gms-char-img', 'gmshub_dmg', 'gms-quest-pia', 'gms-quest-pia-have', 'gms-market-wishlist', 'fg-best-1302000', 'mk-mine-names-ko', 'cb_lang', 'gms-theme'])
    assert.ok(syncableKey(k) && serverKey(k), k);
  for (const k of ['cb_admin_token', 'gms-traffic-key', 'gmshub_internal', 'gms-presence', 'gms-account', 'gms-sync-meta', 'gms-market-seen', 'other', 'gmshub_voted'])
    assert.ok(!syncableKey(k) && !serverKey(k), k);
});

test('caches a page rewrites by itself never sync (they flooded a logged-in visitor\'s saves, 2026-11-26)', () => {
  for (const k of ['gms-ticker-options-v1', 'gmshub_scan_loc']) { assert.equal(syncableKey(k), false, k); assert.equal(serverKey(k), false, k); }
  for (const k of ['gms-market-wishlist', 'gmshub_scan_me', 'gms-free-nick']) { assert.equal(syncableKey(k), true, k); assert.equal(serverKey(k), true, k); }
  // The page never sends more often than once every 20 seconds, whatever changes.
  const src = fs.readFileSync(new URL('../assets/account.js', import.meta.url), 'utf8');
  assert.match(src, /const GAP = 20000;/);
  assert.match(src, /setTimeout\(flush, Math\.max\(2000, lastFlush \+ GAP - Date\.now\(\)\)\)/);
});

test('merge: the account wins on a new device, local-only settings go up, later edits win, removals travel', () => {
  // New device: it had its own theme before logging in (never timed), the account has another one.
  let p = plan({ 'gms-theme': 'light', 'gms-char': 'c1' }, {}, { 'gms-theme': { v: 'dark', t: 100 } }, 1000);
  assert.deepEqual(p.apply, { 'gms-theme': 'dark' });
  assert.deepEqual(Object.keys(p.push), ['gms-char']);
  // Later this device edits the character (meta fingerprint changes) while the account still has the old one.
  p = plan({ 'gms-theme': 'dark', 'gms-char': 'c2' }, p.meta, { 'gms-theme': { v: 'dark', t: 100 }, 'gms-char': { v: 'c1', t: 1000 } }, 2000);
  assert.deepEqual(p.push['gms-char'], { v: 'c2', t: 2000 });
  assert.deepEqual(p.apply, {});
  // Another device removed the theme after that.
  p = plan({ 'gms-theme': 'dark', 'gms-char': 'c2' }, p.meta, { 'gms-theme': { v: null, t: 3000 }, 'gms-char': { v: 'c2', t: 2000 } }, 3500);
  assert.deepEqual(p.apply, { 'gms-theme': null });
  // A removal made here goes up as null.
  const m = plan({ 'gms-char': 'c2' }, { 'gms-char': { t: 2000, h: fingerprint('c2') }, 'gmshub_dmg': { t: 2000, h: fingerprint('x') } }, { 'gmshub_dmg': { v: 'x', t: 2000 }, 'gms-char': { v: 'c2', t: 2000 } }, 4000);
  assert.deepEqual(m.push, { gmshub_dmg: { v: null, t: 4000 } });
  // Nothing changed anywhere: nothing to do.
  const still = plan({ 'gms-char': 'c2' }, { 'gms-char': { t: 2000, h: fingerprint('c2') } }, { 'gms-char': { v: 'c2', t: 2000 } }, 5000);
  assert.deepEqual([still.apply, still.push], [{}, {}]);
});

test('uploads are split under the worker body limit and oversized values are skipped', () => {
  const push = { a1: { v: 'x'.repeat(40000), t: 1 }, a2: { v: 'y'.repeat(40000), t: 1 }, a3: { v: 'z'.repeat(70000), t: 1 } };
  const b = batches(push);
  assert.equal(b.length, 2);
  assert.ok(b.every((x) => JSON.stringify({ set: x }).length < 64 * 1024));
  assert.ok(!b.some((x) => x.a3));
});

test('contributions: logged-in uploads count under the Discord name, others together as not logged in', async () => {
  const e = env();
  const t = await signSession('sec', { id: '123456789', name: '혹스', avatar: 'av' });
  const withSession = new Request(`${W}/listings`, { method: 'POST', headers: { Authorization: `Bearer ${t}` } });
  const anon = new Request(`${W}/listings`, { method: 'POST' });
  await recordContribution(e, withSession, 'scan', 12, 'hashA');
  await recordContribution(e, withSession, 'gone', 1, 'hashA');
  await recordContribution(e, anon, 'scan', 5, 'hashB', ['Leepz', 'Leepz', 'Leepz', 'Leepz', 'Other']);
  await recordContribution(e, anon, 'scan', 0, 'hashC');
  const d = await contributorsData(e, '123456789');
  assert.deepEqual(d.week.map((r) => [r.name || r.game, r.scans, r.gone, r.points]), [['혹스', 12, 1, 13], ['Leepz', 5, 0, 5]]);
  assert.deepEqual([d.anonWeek.points, d.anonWeek.people], [5, 1]);
  assert.deepEqual(d.me, { week: 13, total: 13 });
  assert.match(leaderboardEmbed(d).fields[0].value, /혹스\*\* · 아이템 12개 · 판매 확인 1건[\s\S]*Leepz\*\* · 아이템 5개/);
});
