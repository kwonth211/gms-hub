import test from 'node:test';
import assert from 'node:assert/strict';
import { mailNewErrors } from '../worker/src/traffic.js';

// 2026-11-27 10:20 UTC run → window 10:00–10:15, previous hour 09:00–10:00.
const RUN = Date.UTC(2026, 10, 27, 10, 20), sec = (h, m) => Date.UTC(2026, 10, 27, h, m) / 1000;
const env = (sent) => ({ ALERT_TO: 'owner@example.com', CF_ACCOUNT_ID: 'a', CF_ANALYTICS_TOKEN: 't', EMAIL: { send: async (m) => sent.push(m) } });
const withRows = async (rows, fn) => {
  const old = globalThis.fetch; globalThis.fetch = async () => new Response(JSON.stringify({ data: rows }));
  try { return await fn(); } finally { globalThis.fetch = old; }
};

test('a new 500 in the closed window is mailed once with its path and message', async () => {
  const sent = [];
  const r = await withRows([{ t: sec(10, 5), kind: 'api', path: '/contributors', status: '500', msg: 'D1_ERROR: too many SQL variables', n: 1 },
    { t: sec(10, 6), kind: 'api', path: '/market', status: '429', msg: '', n: 3 }], () => mailNewErrors(env(sent), RUN));
  assert.equal(r.sent, 1); assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /\/contributors/); assert.match(sent[0].text, /too many SQL variables/); assert.doesNotMatch(sent[0].text, /429/);
});

test('an error already seen in the hour before is not mailed again outside the hourly run', async () => {
  const sent = [];
  const rows = [{ t: sec(10, 5), kind: 'cron', path: 'discord-leaderboard', status: '0', msg: 'boom', n: 1 }, { t: sec(9, 30), kind: 'cron', path: 'discord-leaderboard', status: '0', msg: 'boom', n: 1 }];
  assert.equal((await withRows(rows, () => mailNewErrors(env(sent), RUN))).sent, 0);
  // The run whose window ends on the hour reminds about it.
  const hourlyRun = Date.UTC(2026, 10, 27, 10, 5), r2 = [{ t: sec(9, 50), kind: 'cron', path: 'discord-leaderboard', status: '0', msg: 'boom', n: 1 }, { t: sec(9, 0), kind: 'cron', path: 'discord-leaderboard', status: '0', msg: 'boom', n: 1 }];
  assert.equal((await withRows(r2, () => mailNewErrors(env(sent), hourlyRun))).sent, 1);
  assert.match(sent[0].text, /계속 나고 있는 오류/);
});

test('nothing is sent without a recipient', async () => {
  assert.deepEqual(await mailNewErrors({ EMAIL: { send: async () => assert.fail() } }, RUN), { skipped: 'no ALERT_TO or EMAIL' });
});
