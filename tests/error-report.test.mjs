import test from 'node:test';
import assert from 'node:assert/strict';
import { errorReport, logError, noteError } from '../worker/src/traffic.js';

test('a route error is written with its noted message, path and status', () => {
  const points = [];
  const env = { ERRORS: { writeDataPoint: (p) => points.push(p) } };
  const req = new Request('https://x.dev/market/scan-shops');
  const orig = console.error; console.error = () => {};
  try { noteError(req, new RangeError('Invalid time value')); } finally { console.error = orig; }
  logError(env, 'api', '/market/scan-shops', 503, { req });
  logError(env, 'cron', 'news', 0, { e: new Error('fetch failed') });
  assert.equal(points.length, 2);
  assert.deepEqual(points[0].blobs.slice(0, 4), ['api', '/market/scan-shops', '503', 'GET']);
  assert.match(points[0].blobs[4], /^RangeError: Invalid time value/);
  assert.match(points[1].blobs[4], /^Error: fetch failed/);
});

test('the report groups by path and status, counts today and the week, keeps the newest message', async () => {
  const now = Date.parse('2026-11-27T12:00:00Z'), s = (ms) => Math.floor(ms / 1000);
  const data = [
    { t: s(now - 60000), kind: 'api', path: '/market/scan-shops', status: '503', msg: 'B', n: 1 },
    { t: s(now - 3600000), kind: 'api', path: '/market/scan-shops', status: '503', msg: 'A', n: 2 },
    { t: s(now - 3 * 86400000), kind: 'cron', path: 'news', status: '0', msg: 'x', n: 1 }
  ];
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data }));
  try {
    const r = await errorReport({ CF_ACCOUNT_ID: 'a', CF_ANALYTICS_TOKEN: 't' }, now);
    assert.equal(r.rows.length, 2);
    const [a, b] = r.rows;
    assert.equal(a.path, '/market/scan-shops'); assert.equal(a.today, 3); assert.equal(a.week, 3); assert.equal(a.msg, 'B'); assert.equal(a.kinds, 2);
    assert.equal(b.kind, 'cron'); assert.equal(b.today, 0); assert.equal(b.week, 1);
  } finally { globalThis.fetch = orig; }
});

test('a dataset with nothing written yet reads as no errors', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response('unable to find type of column', { status: 422 });
  try { assert.deepEqual(await errorReport({}, Date.now()), { rows: [] }); } finally { globalThis.fetch = orig; }
});
