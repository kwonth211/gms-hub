// Website price alerts through "Log in with Discord": signed state, safe return paths, join + save + DM on the callback.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { oauthStart, oauthCallback, signState, readState } from '../worker/src/discord-oauth.js';

function env(extra = {}) {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of ['0011_discord_alerts.sql', '0016_discord_price_alerts.sql']) sqlite.exec(fs.readFileSync(new URL(`../worker/migrations/${f}`, import.meta.url), 'utf8'));
  const DB = { prepare(sql, args = []) {
    return { bind: (...v) => DB.prepare(sql, v), all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
      run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }) };
  } };
  return { DB, sqlite, DISCORD_BOT_TOKEN: 'bot', DISCORD_CLIENT_SECRET: 'sec', DISCORD_APP_ID: '55', DISCORD_GUILD_ID: '77', ...extra };
}
const W = 'https://w.example';
const loc = (r) => new URL(r.headers.get('Location'));

test('state is signed and expires; a tampered state is refused', async () => {
  const s = await signState('k', { item: 1, price: 5 });
  assert.equal((await readState('k', s)).price, 5);
  assert.equal(await readState('other', s), null);
  assert.equal(await readState('k', s.replace(/^./, 'x')), null);
});

test('start sends a valid request to Discord, and falls back to the page without the secret or with a bad item', async () => {
  const known = async (id) => id === 2070005;
  const r = await oauthStart(new URL(`${W}/discord/oauth/start?item=2070005&price=3000000&lang=ko&ret=/ko/tools/market/?item=2070005`), env(), known);
  const u = loc(r);
  assert.equal(u.origin + u.pathname, 'https://discord.com/oauth2/authorize');
  assert.equal(u.searchParams.get('scope'), 'identify guilds.join');
  assert.equal(u.searchParams.get('redirect_uri'), `${W}/discord/oauth`);
  assert.equal((await readState('sec', u.searchParams.get('state'))).ret, '/ko/tools/market/?item=2070005');
  assert.equal(loc(await oauthStart(new URL(`${W}/discord/oauth/start?item=2070005&price=1&lang=ko`), env({ DISCORD_CLIENT_SECRET: '' }), known)).searchParams.get('dalert'), 'off');
  assert.equal(loc(await oauthStart(new URL(`${W}/discord/oauth/start?item=9&price=1&lang=en`), env(), known)).searchParams.get('dalert'), 'bad');
  // Never a redirect off the site.
  const evil = await oauthStart(new URL(`${W}/discord/oauth/start?item=2070005&price=1&lang=en&ret=//evil.com/x`), env(), known);
  assert.equal((await readState('sec', loc(evil).searchParams.get('state'))).ret, '/en/tools/market/');
});

test('callback joins the server, saves the price alert, DMs and returns to the page', async () => {
  const e = env(), calls = [], real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push([init.method || 'GET', String(url)]);
    if (String(url).endsWith('/oauth2/token')) return Response.json({ access_token: 'at' });
    if (String(url).endsWith('/users/@me')) return Response.json({ id: '42' });
    if (String(url).endsWith('/users/@me/channels')) return Response.json({ id: 'dm42' });
    return new Response(null, { status: 204 });
  };
  try {
    const state = await signState('sec', { item: 2070005, price: 3000000, intent: 'sell', lang: 'ko', ret: '/ko/tools/market/?item=2070005' });
    const r = await oauthCallback(new URL(`${W}/discord/oauth?code=c&state=${encodeURIComponent(state)}`), e, (id, lang) => (lang === 'ko' ? '뇌전 수리검' : 'Steely'));
    const u = loc(r);
    assert.equal(u.pathname, '/ko/tools/market/');
    assert.equal(u.searchParams.get('dalert'), 'ok');
    assert.ok(calls.some(([m, url]) => m === 'PUT' && url.endsWith('/guilds/77/members/42')));
    assert.deepEqual({ ...e.sqlite.prepare('SELECT user_id, item, intent, price, dm_channel FROM discord_alerts').get() }, { user_id: '42', item: 2070005, intent: 'sell', price: 3000000, dm_channel: 'dm42' });
    const cancelled = await oauthCallback(new URL(`${W}/discord/oauth?error=access_denied&state=${encodeURIComponent(state)}`), e, () => '');
    assert.equal(loc(cancelled).searchParams.get('dalert'), 'cancel');
    assert.equal(loc(await oauthCallback(new URL(`${W}/discord/oauth?code=c&state=forged.sig`), e, () => '')).searchParams.get('dalert'), 'expired');
  } finally { globalThis.fetch = real; }
});
