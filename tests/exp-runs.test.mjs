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

test('public table keeps conditions separate and requires three players for net mesos too', async () => {
  const rows = ['a','b','c'].map((v,i) => run(v, 50000+i*1000, { route: 'tree-slime', elapsed: 1, net_per_hour: [0,-10000,20000][i] }));
  const s = await expRunsSummary(envWith([...rows, run('d', 60000, { elapsed: 1, job: 'mage' }), run('e', 60000, { elapsed: 1, party: 2 }), run('f', 60000, { elapsed: 1, level: 28 })]));
  assert.equal(s.groups.length, 1); assert.equal(s.groups[0].netPerHour, 0); assert.equal(s.groups[0].perHour, 51000);
  rows[2].net_per_hour = null;
  assert.equal((await expRunsSummary(envWith(rows))).groups[0].netPerHour, null);
});
test('old active-time runs are not mixed into the elapsed-time public table', async () => {
  const s = await expRunsSummary(envWith(['a','b','c'].map(v => run(v, 50000))));
  assert.equal(s.groups.length, 0); assert.ok(s.routes['kerning-subway']);
});
test('invalid settlement values and unknown route IDs are refused', async () => {
  const req = body => ({ json: async () => body, headers: { get: () => '1.2.3.4' } });
  const base = { client:'abcdef12-3456',run:'r123456',route:'tree-slime',level:22,job:'thief',party:1,minutes:20,perHour:50000,elapsed:true };
  for (const netPerHour of [NaN, Infinity, '5', 1.5, -1000000001, 1000000001]) assert.equal((await addExpRun(req({ ...base, netPerHour }), envWith([]))).status,400);
  assert.equal((await addExpRun(req({ ...base, route:'invented-place' }), envWith([]))).status,400);
  assert.equal((await addExpRun(req({ ...base, netPerHour:-10000 }), envWith([]))).status,200);
});
