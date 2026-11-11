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
