import test from 'node:test';
import assert from 'node:assert/strict';
import { rollingTotals, overFlags, meterDb, flushUsage, isOver, LIMITS, BudgetError } from '../worker/src/usage-guard.js';

const now = Date.parse('2026-12-20T05:00:00Z');

test('usage: 31-day window sums metered days and the seed, older days drop out', () => {
  const rows = [{ key: 'usage:2026-12-20', json: '{"w":10,"r":20,"q":3,"d":1}' }, { key: 'usage:2026-11-10', json: '{"w":999,"r":0,"q":0,"d":0}' }];
  const t = rollingTotals(rows, now, { '2026-11-20': [5, 5, 5, 5], '2026-11-19': [100, 0, 0, 0] });
  assert.deepEqual(t, { w: 15, r: 25, q: 8, d: 6 });
});

test('usage: the fuse trips at 98% of each included amount', () => {
  assert.equal(overFlags({ w: LIMITS.w * 0.979, r: 0, q: 0, d: 0 }).w, false);
  assert.equal(overFlags({ w: LIMITS.w * 0.98, r: 0, q: 0, d: 0 }).w, true);
  assert.equal(overFlags({ w: 0, r: 0, q: 0, d: LIMITS.d }).d, true);
});

// Fake D1: statements report meta like D1 does; the usage row lives in a map.
function fakeD1(store) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => { if (sql.includes('INSERT INTO snapshots')) store.set(args[0], { w: (store.get(args[0])?.w || 0) + args[1] }); return { meta: { rows_written: 3, rows_read: 1 } }; },
    all: async () => sql.startsWith('SELECT key, json') ? { results: [...store].map(([key, v]) => ({ key, json: JSON.stringify(v) })), meta: {} } : { results: [{ a: 1 }], meta: { rows_read: 7, rows_written: 0 } },
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => list.map(() => ({ meta: { rows_written: 4, rows_read: 0 } })) };
}

test('usage: metered statements are counted, flushed, and writes are refused once over', async () => {
  const store = new Map();
  const raw = fakeD1(store);
  const db = meterDb(raw);
  assert.deepEqual(await db.prepare('SELECT 1').first(), { a: 1 });
  assert.equal(await db.prepare('SELECT 1').first('a'), 1);
  await db.prepare('INSERT INTO x VALUES (1)').run();
  await db.batch([db.prepare('INSERT INTO x VALUES (?)').bind(1), db.prepare('UPDATE x SET a=1')]);
  await flushUsage(raw, now, true);
  assert.equal(store.get('usage:2026-12-20').w, 3 + 8 + 2);
  assert.equal(isOver('w'), false);
  store.set('usage:2026-12-19', { w: LIMITS.w });
  await flushUsage(raw, now, true);
  assert.equal(isOver('w'), true);
  await assert.rejects(db.prepare('INSERT INTO x VALUES (1)').run(), BudgetError);
  await assert.rejects(db.batch([db.prepare('DELETE FROM x')]), BudgetError);
  assert.deepEqual(await db.prepare('SELECT 1').first(), { a: 1 });
  store.delete('usage:2026-12-19');
  await flushUsage(raw, now, true);
  assert.equal(isOver('w'), false);
});
