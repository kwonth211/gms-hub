import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnLevels } from '../scripts/map-pages.mjs';

test('spawn floors: a sloped single ground is one floor, separate platforms add floors', () => {
  const flat = [[1, 0, 1500], [1, 100, 1520], [1, 200, 1541], [1, 300, 1494]];
  assert.equal(spawnLevels(flat), 1, 'a gentle slope stays one floor');
  assert.equal(spawnLevels([...flat, [2, 50, 1200], [2, 80, 1210], [3, 10, 900]]), 3);
  assert.equal(spawnLevels([]), 0);
});
