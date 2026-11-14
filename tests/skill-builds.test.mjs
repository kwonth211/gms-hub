import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { POOLS, checkBuild, levelsAt, timeline, spAt } from '../assets/skill-tree.js';
const read = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const skills = read('data/skills.json').jobs;
const { classes, sources } = read('data/skill-builds.json');

test('every build fits its SP pool, respects master levels and prerequisites, and cites real sources', () => {
  for (const c of classes) {
    const all = [[c.job, POOLS[1], c.builds], ...c.second.map((j) => [j.job, POOLS[2], j.builds])];
    for (const [job, pool, builds] of all) for (const b of builds) {
      const r = checkBuild(b.steps, pool, skills[job].skills);
      assert.deepEqual(r.errors, [], `${job} ${b.id}`);
      assert.ok(r.used >= pool.total - 1, `${job} ${b.id} leaves ${pool.total - r.used} SP`);
      for (const a of b.agree) assert.ok(a === 'guide' || sources[a], `${job} ${b.id} source ${a}`);
      assert.ok(b.agree.length >= 1);
    }
  }
});

test('SP pools and timelines', () => {
  assert.equal(spAt(POOLS[1], 30), 61);
  assert.equal(spAt(POOLS[2], 70), 121);
  assert.equal(spAt(POOLS[1], 9), 0);
  const warrior = classes.find((c) => c.id === 'warrior').builds[0];
  const t = timeline(warrior.steps, POOLS[1]);
  assert.equal(t[1].at, 17); // Power Strike mastered around 17, as the videos say
  assert.equal(t[2].at, 22); // HP Recovery mastered around 22
  assert.deepEqual(levelsAt(warrior.steps, 1), { 1001001: 1 });
});
