import test from 'node:test';
import assert from 'node:assert/strict';
import { megaphoneLine, pack, trendMessage, megaphonesToDiscord } from '../worker/src/discord.js';

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
  assert.match(msg, /1\. Steely: 팝니다\/sell 4, 삽니다\/buy 1 \(전날\/day before 2\)/);
  assert.match(msg, /- #2: 삽니다\/buy 3/);
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
