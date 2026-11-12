import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import { discordInteractions, handleInteraction, COMMANDS } from '../worker/src/discord-bot.js';
import { indexEntry } from '../assets/search-index.js';

const entry = (id, ko, en) => { const { names, ...e } = indexEntry({ id, title: en, ko, en, names: [ko, en] }); return e; };
const DATA = {
  items: [entry(2040804, '장갑 공격력 주문서 60%', 'Gloves Attack Scroll: Intermediate'), entry(2070005, '뇌전 수리검', 'Steely Throwing Knives')],
  mobs: [{ id: 12, ko: '문어', en: 'Octopus', aka: ['옥토퍼스'], lv: 12, hp: 191, exp: 23, maps: [['축축한 숲', 'Damp Forest', 15]], drops: [['', 'Red Headband']] }],
  routes: [{ id: 'a', min: 20, max: 35, jobs: ['assassin'], title: { ko: '어쌔신 길', en: 'Sin route' }, monsters: { ko: '문어', en: 'Octopus' }, summary: { ko: '요약', en: 'Summary' } },
    { id: 'b', min: 20, max: 30, jobs: [], title: { ko: '공용', en: 'Anyone' }, monsters: { ko: '돼지', en: 'Pig' }, summary: { ko: '요약', en: 'Summary' } },
    { id: 'c', min: 20, max: 30, jobs: ['cleric'], title: { ko: '클레릭', en: 'Cleric' }, monsters: { ko: '좀비', en: 'Zombie' }, summary: { ko: '요약', en: 'Summary' } }],
};
const deps = { fetcher: async () => Response.json(DATA), discord: 'https://discord.gg/x',
  prices: async (id) => ({ [id]: { n: 2, median: 295000, basis: 'sold', low: 290000, high: 299999, last: '2026-11-02 14:10:20', mega: null } }) };
const run = async (i) => (await handleInteraction(i, deps)).json();

test('requests without a valid Discord signature are refused; a signed ping is answered', async () => {
  const { publicKey, privateKey } = await webcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const pub = Buffer.from(await webcrypto.subtle.exportKey('raw', publicKey)).toString('hex');
  const body = JSON.stringify({ type: 1 }), ts = '1700000000';
  const sig = Buffer.from(await webcrypto.subtle.sign('Ed25519', privateKey, Buffer.from(ts + body))).toString('hex');
  const req = (s, b = body) => new Request('https://t.invalid/discord/interactions', { method: 'POST', body: b, headers: { 'X-Signature-Ed25519': s, 'X-Signature-Timestamp': ts } });
  assert.equal((await discordInteractions(req('00'.repeat(64)), { DISCORD_PUBLIC_KEY: pub }, deps)).status, 401);
  assert.equal((await discordInteractions(req(sig, body + ' '), { DISCORD_PUBLIC_KEY: pub }, deps)).status, 401);
  assert.equal((await discordInteractions(req(sig), {}, deps)).status, 401);
  assert.deepEqual(await (await discordInteractions(req(sig), { DISCORD_PUBLIC_KEY: pub }, deps)).json(), { type: 1 });
});

test('item suggestions understand Korean short names, and /price answers with the price and a site link', async () => {
  const ac = await run({ type: 4, locale: 'ko', data: { name: 'price', options: [{ name: 'item', value: '장공', focused: true }] } });
  assert.equal(ac.type, 8); assert.equal(ac.data.choices[0].value, '2040804'); assert.match(ac.data.choices[0].name, /장갑 공격력/);
  const r = await run({ type: 2, locale: 'en-US', data: { name: 'price', options: [{ name: 'item', value: 'steely' }] } });
  const e = r.data.embeds[0];
  assert.equal(e.title, 'Steely Throwing Knives'); assert.match(e.url, /\/en\/tools\/market\/\?item=2070005&utm_source=discord/);
  assert.match(e.fields[0].value, /295K/);
  const miss = await run({ type: 2, locale: 'ko', data: { name: 'price', options: [{ name: 'item', value: 'zzzzqq' }] } });
  assert.equal(miss.data.flags, 64);
});

test('/mob and /train answer in the caller language; a class sees its own and shared routes, not other classes', async () => {
  const m = (await run({ type: 2, locale: 'ko', data: { name: 'mob', options: [{ name: 'name', value: '옥토퍼스' }] } })).data.embeds[0];
  assert.equal(m.title, '문어 (Octopus)'); assert.match(m.fields[3].value, /축축한 숲 \(15\)/);
  const t = (await run({ type: 2, locale: 'en-GB', data: { name: 'train', options: [{ name: 'level', value: 25 }, { name: 'class', value: 'assassin' }] } })).data.embeds[0];
  assert.deepEqual(t.fields.map((f) => f.name), ['Sin route · Lv. 20–35', 'Anyone · Lv. 20–30']);
  const none = (await run({ type: 2, locale: 'ko', data: { name: 'train', options: [{ name: 'level', value: 150 }] } })).data.embeds[0];
  assert.match(none.description, /아직 없어요/);
});

test('command definitions fit Discord limits and the built bot data has what the commands read', () => {
  for (const c of COMMANDS) { assert.match(c.name, /^[a-z]{1,32}$/); assert.ok(c.description.length <= 100); }
  const file = new URL('../dist/assets/bot.json', import.meta.url);
  if (!fs.existsSync(file)) return;
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(d.items.length > 1000 && d.items[0].searchNames && d.mobs[0].exp >= 0 && d.routes[0].title.ko);
});

// ----- /alert and /feedback: a small sqlite-backed D1 stand-in and a recorded Discord API -----
import { DatabaseSync } from 'node:sqlite';
import { notifyMegaphones } from '../worker/src/discord-alerts.js';
function botEnv() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(new URL('../worker/migrations/0011_discord_alerts.sql', import.meta.url), 'utf8'));
  const DB = { prepare(sql, args = []) {
    return { bind: (...v) => DB.prepare(sql, v), all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
      run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }) };
  } };
  return { DB, sqlite, DISCORD_BOT_TOKEN: 't', DISCORD_FEEDBACK_CHANNEL: '900' };
}
async function withDiscord(fn, { dmOk = true } = {}) {
  const real = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body); calls.push({ url: String(url).replace('https://discord.com/api/v10', ''), body });
    if (String(url).endsWith('/users/@me/channels')) return dmOk ? Response.json({ id: `dm-${body.recipient_id}` }) : new Response('{}', { status: 403 });
    return Response.json({ id: '1' });
  };
  try { return await fn(calls); } finally { globalThis.fetch = real; }
}
const cmd = (env, name, sub, options, user = { id: '42', username: 'neo' }, locale = 'ko') =>
  handleInteraction({ type: 2, locale, user, data: { name, options: sub ? [{ type: 1, name: sub, options }] : options } }, { ...deps, env }).then((r) => r.json());

test('/alert add saves the watch and confirms by DM; a megaphone naming the item notifies once in ten minutes', async () => {
  const env = botEnv();
  await withDiscord(async (calls) => {
    const r = await cmd(env, 'alert', 'add', [{ name: 'item', value: '2070005' }, { name: 'when', value: 'sell' }]);
    assert.equal(r.data.flags, 64); assert.match(r.data.content, /알림을 켰어요/);
    assert.deepEqual(calls.map((c) => c.url), ['/users/@me/channels', '/channels/dm-42/messages']);
    assert.match((await cmd(env, 'alert', 'list', [])).data.content, /뇌전 수리검 \(Steely Throwing Knives\) · 누가 팔 때/);
    calls.length = 0;
    const mega = { item: 2070005, intent: 'sell', nick: 'Eugy', channel: 3, text: 'S> steely `1m`' };
    assert.equal(await notifyMegaphones(env, [{ ...mega, intent: 'buy' }], () => 'Steely'), 0);
    assert.equal(await notifyMegaphones(env, [mega, { item: null, nick: 'x', text: 'hi' }], () => 'Steely'), 1);
    assert.match(calls[0].body.content, /Steely.*팝니다[\s\S]*CH 3 · \*\*Eugy\*\* `S> steely '1m'`[\s\S]*\/w Eugy/);
    assert.deepEqual(calls[0].body.allowed_mentions, { parse: [] });
    assert.equal(await notifyMegaphones(env, [mega], () => 'Steely'), 0);
    assert.match((await cmd(env, 'alert', 'remove', [{ name: 'item', value: '2070005' }])).data.content, /지웠어요/);
    assert.match((await cmd(env, 'alert', 'list', [])).data.content, /설정한 알림이 없어요/);
  });
});

test('/alert tells a user it cannot reach to join the server, and stops at ten items', async () => {
  const env = botEnv();
  await withDiscord(async () => {
    const r = await cmd(env, 'alert', 'add', [{ name: 'item', value: '2070005' }], { id: '7', username: 'far' }, 'en-US');
    assert.match(r.data.content, /cannot DM you[\s\S]*discord\.gg\/x/);
  }, { dmOk: false });
  for (let n = 1; n <= 10; n++) env.sqlite.prepare("INSERT OR REPLACE INTO discord_alerts (user_id, item) VALUES ('9', ?)").run(n);
  await withDiscord(async () => {
    assert.match((await cmd(env, 'alert', 'add', [{ name: 'item', value: '2070005' }], { id: '9', username: 'many' })).data.content, /10개까지/);
  });
});

test('/feedback lands in the feedback channel without mentions, once a minute per user', async () => {
  const env = botEnv();
  await withDiscord(async (calls) => {
    const r = await cmd(env, 'feedback', null, [{ name: 'text', value: 'please add @everyone   boss timers' }], { id: '55', username: 'neo', global_name: 'N*eo' });
    assert.match(r.data.content, /전달했어요/);
    assert.equal(calls[0].url, '/channels/900/messages');
    assert.match(calls[0].body.content, /\*\*Neo\*\* \(neo, DM\)\n>>> please add @everyone boss timers/);
    assert.deepEqual(calls[0].body.allowed_mentions, { parse: [] });
    assert.match((await cmd(env, 'feedback', null, [{ name: 'text', value: 'again again' }], { id: '55', username: 'neo' })).data.content, /1분 뒤/);
    assert.equal(calls.length, 1);
  });
});
