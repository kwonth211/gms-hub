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
