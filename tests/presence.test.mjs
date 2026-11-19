import test from 'node:test';
import assert from 'node:assert/strict';
import { pageKey, Presence } from '../worker/src/presence.js';

test('presence groups a page across languages and queries', () => {
  assert.equal(pageKey('/ko/tools/market/?item=2040001'), '/tools/market/');
  assert.equal(pageKey('/en/tools/market/'), '/tools/market/');
  assert.equal(pageKey('/ko/'), '/');
  assert.equal(pageKey('/korean-guide/'), '/korean-guide/');
  assert.equal(pageKey(''), '/');
});

test('presence tells each open page the site total and its own page count', () => {
  const msgs = [];
  const sock = (page) => ({ page, readyState: 1, send: (m) => msgs.push([page, JSON.parse(m)]) });
  const a = sock('/'), b = sock('/'), c = sock('/tools/market/');
  const state = { getWebSockets: () => [a, b, c], getTags: (ws) => [ws.page], setWebSocketAutoResponse() {} };
  new Presence(state).broadcast(c);
  assert.deepEqual(msgs, [['/', { site: 2, here: 2 }], ['/', { site: 2, here: 2 }]]);
});

test('chat lines need a name, stay short, carry no links and come at most every 3 seconds', async () => {
  const { chatLine } = await import('../worker/src/presence.js');
  assert.equal(chatLine({ type: 'say', name: '모험가', text: '안녕하세요' }, 0).text, '안녕하세요');
  assert.equal(chatLine({ type: 'say', name: 'a', text: 'hi' }, 0).error, 'name');
  assert.equal(chatLine({ type: 'say', name: '모험가', text: 'x'.repeat(141) }, 0).error, 'length');
  assert.equal(chatLine({ type: 'say', name: '모험가', text: 'go to discord.gg/abc' }, 0).error, 'link');
  assert.equal(chatLine({ type: 'say', name: '모험가', text: 'hi' }, Date.now()).error, 'slow');
  assert.equal(chatLine({ type: 'say', name: '모험가', text: '이 병신' }, 0).text, '이 **');
});

test('presence keeps one record of pages open at once and rewrites it only when beaten', async () => {
  const store = new Map(); let puts = 0;
  const state = { getWebSockets: () => [], getTags: () => [], setWebSocketAutoResponse() {}, storage: { get: async (k) => store.get(k), put: async (k, v) => { puts++; store.set(k, v); } } };
  const room = new Presence(state);
  assert.equal(await room.notePeak(3, new Date('2026-11-15T12:00:00Z')), true);
  assert.equal(await room.notePeak(3), false);
  assert.equal(await room.notePeak(2), false);
  assert.equal(await room.notePeak(7, new Date('2026-11-15T13:00:00Z')), true);
  assert.equal(puts, 2);
  // A woken object (fresh instance) reads the record back.
  assert.deepEqual(await new Presence(state).loadPeak(), { n: 7, at: '2026-11-15T13:00:00.000Z' });
});

test('the owner view counts every holder, not only the rows of its table', async () => {
  const socks = Array.from({ length: 70 }, (_, i) => ({ readyState: 1, page: '/', a: { t: Date.now(), who: `w${i}` } }));
  socks.forEach((s) => { s.deserializeAttachment = () => s.a; });
  const state = { getWebSockets: () => socks, getTags: (ws) => [ws.page], setWebSocketAutoResponse() {}, storage: { get: async () => null, put: async () => {} } };
  const d = await (await new Presence(state).fetch(new Request('https://presence/peak'))).json();
  assert.equal(d.now, 70);
  assert.equal(d.people, 70); // was the table length, capped at 40
  assert.equal(d.who.length, 60);
});
