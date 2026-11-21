import test from 'node:test';
import assert from 'node:assert/strict';
import { megaphoneLine, pack, trendMessage, megaphonesToDiscord, marketEmbed, won } from '../worker/src/discord.js';

test('a megaphone goes to Discord as inline code, so player text cannot mention, link or format', () => {
  const line = megaphoneLine({ kind: 'super', channel: 2, nick: 'Eugy', text: 'S> `x` @everyone https://a.b  now' });
  assert.equal(line, "📣 CH 2 · **Eugy** `S> 'x' @everyone https://a.b now`");
  assert.equal(megaphoneLine({ kind: 'item', nick: 'A1', text: 'hi' }), '🟡 **A1** `hi`');
});

test('lines are packed under the Discord message limit without splitting a line', () => {
  const lines = Array.from({ length: 50 }, (_, i) => `${i} ${'x'.repeat(200)}`);
  const msgs = pack(lines);
  assert.ok(msgs.length > 1 && msgs.every((m) => m.length <= 1900));
  assert.deepEqual(msgs.join('\n').split('\n'), lines);
});

test('the trend summary names items, and nothing is posted without data or without a webhook', async () => {
  const stats = { today: { n: 9300, nicks: 1200 }, items: [{ item: 1, n: 5, sell: 4, buy: 1, before: 2 }], wanted: [{ item: 2, buy: 3, sell: 0 }] };
  const msg = trendMessage(stats, (id) => ({ 1: 'Steely' })[id]);
  assert.match(msg, /🥇 \*\*Steely\*\*  🟢 팝 4 · 🔵 삽 1 ↑/);
  assert.match(msg, /• \*\*#2\*\*  삽 3 \/ 팝 0/);
  assert.equal(trendMessage({ items: [] }, () => null), null);
  const real = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(null, { status: 204 }); };
  try {
    await megaphonesToDiscord({}, [{ kind: 'super', nick: 'A1', text: 'hi' }]);
    assert.equal(calls, 0);
    await megaphonesToDiscord({ DISCORD_MEGA_WEBHOOK: 'https://discord.invalid/hook' }, [{ kind: 'super', nick: 'A1', text: 'hi' }]);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = real; }
});

test('the daily market card lists moves, best sellers and most listed with Korean names and prices', () => {
  const names = { 1: ['Steely', '스틸리'], 2: ['Ilbi', '일비'], 3: ['Pot', '냄비'] };
  const nameOf = (id, lang) => names[id]?.[lang === 'ko' ? 1 : 0];
  const cat = { stats: { listings: 88000, items: 1200, shops: 13000 }, items: [
    { item: 1, open: 40, typical: 50000, typicalDay: 12.5, sold: 9, soldMedian: 48000, median: 52000 },
    { item: 2, open: 10, typical: 2500000, typicalDay: -8, sold: 3, median: 2600000 },
    { item: 3, open: 5, typical: 900, typicalDay: 50, sold: 0, median: 900 },
    { item: 9, open: 99, typical: 1, typicalDay: 1, sold: 1 } ] };
  const e = marketEmbed(cat, nameOf);
  assert.match(e.description, /판매 중 매물 \*\*88,000\*\*건/);
  assert.match(e.fields[0].value, /스틸리.*5만.*\+12\.5%/);
  assert.match(e.fields[1].value, /일비.*250만.*-8%/);
  assert.doesNotMatch(e.fields[0].value, /냄비/); // under 1,000 mesos or under 8 listings: not a move
  assert.match(e.fields[2].value, /🥇 \*\*스틸리\*\*  9건/);
  assert.doesNotMatch(JSON.stringify(e), /#9/); // unknown items are left out
  assert.equal(won(123456789), '1.23억');
  assert.equal(marketEmbed({ items: [] }, nameOf), null);
});

test('notice cards carry the Korean summary, English and the maintenance window; free megaphone cards show intent, price and nick', async () => {
  const { noticeEmbed, freeMegaEmbed, newsToDiscord } = await import('../worker/src/discord.js');
  const e = noticeEmbed({ id: 1, cat: 'maintenance', ko: '11월 18일 업데이트 점검', en: 'Scheduled Game Update', url: 'https://x', date: '2026-11-16T00:00:00Z',
    sum: { ko: ['점검 시간: 22:00~03:00'], en: ['Maintenance: 13:00–18:00 UTC'] }, maint: { start: '2026-11-18T13:00:00.000Z', end: '2026-11-18T18:00:00.000Z' } });
  assert.equal(e.title, '🛠 [점검] 11월 18일 업데이트 점검');
  assert.match(e.fields[0].value, /<t:1795006800:f> ~ <t:1795024800:t>/);
  assert.equal(e.fields[1].name, 'English');
  const f = freeMegaEmbed({ id: 7, intent: 'sell', ko: '일비 표창', price: 2500000, channel: 5, nick: 'Hook', text: '싸게 팔아요', at: '2026-11-18 12:00:00' });
  assert.equal(f.title, '🟢 팝니다 · 일비 표창');
  assert.match(JSON.stringify(f.fields), /250만/);
  assert.match(f.url, /\?f=7&/);
  // First run: remembers the listed notices without posting them.
  const writes = [];
  const env = { DISCORD_BOT_TOKEN: 't', DISCORD_NOTICE_CHANNEL: 'c', DB: { prepare: (q) => ({ first: async () => null, bind: (...a) => ({ run: async () => writes.push(a) }) }) } };
  const real = globalThis.fetch; let calls = 0; globalThis.fetch = async () => { calls++; return new Response('{}'); };
  await newsToDiscord(env, { items: [{ id: 5, cat: 'general', date: '2026-11-01T00:00:00Z', sum: { ko: ['a'], en: ['b'] } }] }, Date.parse('2026-11-18T00:00:00Z'));
  globalThis.fetch = real;
  assert.equal(calls, 0);
  assert.deepEqual(JSON.parse(writes[0][0]).sent, ['5']);
});

test('a notice waits for its Korean summary, and a card that had to go out in English is edited when Korean arrives', async () => {
  const { newsToDiscord } = await import('../worker/src/discord.js');
  let state = JSON.stringify({ sent: [], reminded: [] });
  const env = { DISCORD_BOT_TOKEN: 't', DISCORD_NOTICE_CHANNEL: 'c', DB: { prepare: (q) => ({ first: async () => ({ json: state }), bind: (v) => ({ run: async () => { state = v; } }) }) } };
  const real = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init) => { calls.push([init.method, String(url)]); return Response.json({ id: 'm1' }); };
  const en = { id: 7, cat: 'general', en: 'Black Sacks', ko: 'Black Sacks', date: '2026-11-20T22:00:00Z', sum: { en: ['English line'], ko: ['English line'] } };
  await newsToDiscord(env, { items: [en] }, Date.parse('2026-11-20T23:00:00Z'));
  assert.equal(calls.length, 0); // one hour in: still waiting for Korean
  await newsToDiscord(env, { items: [en] }, Date.parse('2026-11-21T05:00:00Z'));
  assert.equal(calls.at(-1)[0], 'POST'); // six hours: goes out in English
  await newsToDiscord(env, { items: [{ ...en, ko: '검은 자루', sum: { en: ['English line'], ko: ['한국어 요약이에요.'] } }] }, Date.parse('2026-11-21T06:00:00Z'));
  globalThis.fetch = real;
  assert.deepEqual(calls.at(-1), ['PATCH', 'https://discord.com/api/v10/channels/c/messages/m1']);
  assert.deepEqual(JSON.parse(state).english, []);
});
