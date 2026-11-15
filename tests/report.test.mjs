import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeMegaDay, summarizeRank, storeDailyRollups } from '../worker/src/report.js';

test('report: one day of megaphones per item, sell/buy split with median prices', () => {
  const s = summarizeMegaDay([
    { nick: 'a', item: 1, intent: 'sell', price: 100 }, { nick: 'b', item: 1, intent: 'sell', price: 300 },
    { nick: 'a', item: 1, intent: 'buy', price: 50 }, { nick: 'c', item: 2, intent: 'sell', price: null },
    { nick: 'd', item: null, intent: null, price: null },
  ]);
  assert.equal(s.n, 5); assert.equal(s.nicks, 4); assert.equal(s.withItem, 4);
  assert.deepEqual(s.items[0], { item: 1, n: 3, sell: 2, buy: 1, sellPrice: 100, buyPrice: 50 });
  assert.deepEqual(s.items[1], { item: 2, n: 1, sell: 1, buy: 0, sellPrice: null, buyPrice: null });
});

test('report: ranking summary counts jobs and 5-level bands', () => {
  const r = summarizeRank({ stats: { characters: 9, highest_level: 92 }, rows: [
    { name: 'x', level: 92, job: 'Bandit' }, { name: 'y', level: 88, job: 'Bandit' }, { name: 'z', level: 71, job: 'Hunter' }] });
  assert.deepEqual(r.jobs, { Bandit: 2, Hunter: 1 });
  assert.deepEqual(r.levels, { 90: 1, 85: 1, 70: 1 });
  assert.equal(r.top.length, 3); assert.equal(r.highest, 92);
});

test('report: the 16:00 run stores yesterday once and today\'s ranking', async () => {
  const calls = [];
  const env = { DB: { prepare: (sql) => ({ bind: (...args) => ({
    first: async () => { calls.push({ sql, args }); return sql.includes("key = 'rank'") ? { json: '{"rows":[]}' } : null; },
    all: async () => { calls.push({ sql, args }); return { results: [{ nick: 'a', item: 1, intent: 'sell', price: 5 }] }; },
    run: async () => calls.push({ sql, args }) }), first: async () => { calls.push({ sql }); return { json: '{"rows":[]}' }; } }) } };
  await storeDailyRollups(env, Date.parse('2026-11-15T16:05:00Z'));
  const range = calls.find((c) => c.sql.includes('FROM megaphones'));
  assert.deepEqual(range.args, ['2026-11-14 00:00:00', '2026-11-15 00:00:00']);
  assert.ok(calls.some((c) => c.sql.startsWith('INSERT OR IGNORE') && c.args[0] === 'mega-day:2026-11-14'));
  assert.ok(calls.some((c) => c.sql.startsWith('INSERT OR REPLACE') && c.args[0] === 'rank-day:2026-11-15'));
});
