import test from 'node:test';
import assert from 'node:assert/strict';
import { expRunsSummary, addExpRun } from '../worker/src/exp-runs.js';

// A tiny stand-in for D1: the summary only runs one SELECT ... .all().
const envWith = (rows) => ({ DB: { prepare: () => ({ all: async () => ({ results: rows }), bind: () => ({ first: async () => ({ n: 0 }), run: async () => ({ meta: { changes: 1 } }) }) }) }, VOTE_SALT: 's' });
const run = (voter, perHour, extra = {}) => ({ voter, mob: 17, route: 'kerning-subway', level: 22, job: 'thief', party: 1, minutes: 20, per_hour: perHour, ...extra });

test('a spot shows only once three different players shared it', async () => {
  const two = await expRunsSummary(envWith([run('a', 50000), run('a', 52000), run('b', 48000)]));
  assert.equal(two.routes['kerning-subway'], undefined);
  const three = await expRunsSummary(envWith([run('a', 50000), run('b', 48000), run('c', 60000)]));
  assert.equal(three.routes['kerning-subway'].players, 3);
  assert.equal(three.routes['kerning-subway'].perHour, 50000);
});

test('one far-off run does not move the median, and one player with many runs counts once', async () => {
  const s = await expRunsSummary(envWith([run('a', 50000), run('a', 51000), run('a', 52000), run('a', 53000), run('b', 40000), run('c', 45000), run('d', 9000000)]));
  const r = s.routes['kerning-subway'];
  assert.equal(r.players, 3);
  assert.equal(r.perHour, 45000);
});

test('runs that are too short or missing class are refused', async () => {
  const req = (body) => ({ json: async () => body, headers: { get: () => '1.2.3.4' } });
  const ok = { client: 'abcdef12-3456', run: 'r123456', mob: 17, level: 22, job: 'thief', party: 1, minutes: 20, perHour: 50000 };
  assert.equal((await addExpRun(req(ok), envWith([]))).status, 200);
  assert.equal((await addExpRun(req({ ...ok, minutes: 5 }), envWith([]))).status, 400);
  assert.equal((await addExpRun(req({ ...ok, job: 'king' }), envWith([]))).status, 400);
  assert.equal((await addExpRun(req({ ...ok, mob: null, route: null }), envWith([]))).status, 400);
});
