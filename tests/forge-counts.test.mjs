import test from 'node:test';
import assert from 'node:assert/strict';
import { addForgeCounts, forgeCounts, kstDay } from '../worker/src/forge-counts.js';

// A tiny stand-in for D1: records the statement and its bindings.
const fakeDb = (first = null) => {
  const calls = [];
  return { calls, DB: { prepare: (sql) => ({ bind: (...args) => ({ run: async () => calls.push({ sql, args }), first: async () => { calls.push({ sql, args }); return first; } }) }) } };
};

test('forge counts: KST day, one upsert per batch, bad input refused', async () => {
  assert.equal(kstDay(Date.parse('2026-11-14T15:30:00Z')), '2026-11-15');
  const env = fakeDb();
  assert.equal((await addForgeCounts(env, { ok: 3, fail: 2, boom: 1 }, Date.parse('2026-11-15T01:00:00Z'))).status, 200);
  assert.equal(env.calls.length, 1);
  assert.match(env.calls[0].sql, /ON CONFLICT\(day\) DO UPDATE/);
  assert.deepEqual(env.calls[0].args, ['2026-11-15', 3, 2, 1]);
  assert.equal((await addForgeCounts(env, { ok: 0 })).status, 400);
  assert.equal((await addForgeCounts(env, { ok: 400, fail: 400 })).status, 400);
  assert.equal((await addForgeCounts(env, { ok: -5, fail: 'x', boom: 2 })).status, 200);
  assert.deepEqual(env.calls.at(-1).args.slice(1), [0, 0, 2]);
});

test('forge counts: today and all-time totals', async () => {
  const env = fakeDb({ ok: 10, fail: 5, boom: 1, tok: 3, tfail: 2, tboom: 0 });
  const r = await forgeCounts(env, Date.parse('2026-11-15T01:00:00Z'));
  assert.deepEqual(r, { day: '2026-11-15', today: { ok: 3, fail: 2, boom: 0 }, total: { ok: 10, fail: 5, boom: 1 } });
});
