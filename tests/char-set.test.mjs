import test from 'node:test';
import assert from 'node:assert/strict';
import { wear, setTotal, slotOf, renderUrl } from '../assets/char-set.js';

const SUB = { 1: 'Overall', 2: 'Bottom', 3: 'Top', 4: 'Two-Handed Sword', 5: 'Shield', 6: 'One-Handed Sword', 7: 'Hat', 8: 'Claw' };
const subOf = (id) => SUB[id];

test('slots: weapons, tops and overalls go to the right slot', () => {
  assert.equal(slotOf('Claw'), 'weapon'); assert.equal(slotOf('Overall'), 'top'); assert.equal(slotOf('Top'), 'top');
  assert.equal(slotOf('Earrings'), 'earrings'); assert.equal(slotOf('Ring'), null);
});
test('an overall takes the bottom off, a bottom takes the overall off', () => {
  let s = wear({}, 2, subOf); s = wear(s, 1, subOf);
  assert.deepEqual(s, { top: 1 });
  s = wear(s, 2, subOf);
  assert.deepEqual(s, { bottom: 2 });
  s = wear(wear({}, 3, subOf), 2, subOf);
  assert.deepEqual(s, { top: 3, bottom: 2 });
});
test('a two-handed weapon and a shield cannot go together', () => {
  let s = wear(wear({}, 6, subOf), 5, subOf);
  assert.deepEqual(s, { weapon: 6, shield: 5 });
  s = wear(s, 4, subOf);
  assert.deepEqual(s, { weapon: 4 });
  s = wear(s, 5, subOf);
  assert.deepEqual(s, { shield: 5 });
});
test('total counts known prices and pieces without one', () => {
  assert.deepEqual(setTotal({ hat: 7, weapon: 6, top: 3 }, (id) => ({ 7: 1000, 6: 25000 })[id]), { sum: 26000, missing: 1, n: 3 });
});
test('the picture uses a two-handed stance for two-handed weapons', () => {
  assert.match(renderUrl({ weapon: 8, hat: 7 }, subOf), /,8,7\/stand2\//);
  assert.match(renderUrl({ weapon: 6 }, subOf), /\/stand1\//);
});
