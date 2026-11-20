import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOptions, parseOptions } from '../worker/src/item-options.js';

test('item options keep known stats, slots and clean; drop junk', () => {
  const o = parseOptions(normalizeOptions({ stats: { PAD: 9, LUK: 2, FOO: 5, STR: 0, DEX: 1.5, MHP: 300 }, slots: 5, used: 0, clean: true, extra: 'x' }));
  assert.deepEqual(o, { stats: { PAD: 9, LUK: 2, MHP: 300 }, slots: 5, used: 0, clean: true });
  assert.equal(normalizeOptions(null), null);
  assert.equal(normalizeOptions({ stats: { FOO: 1 } }), null);
  assert.equal(normalizeOptions([1, 2]), null);
  assert.equal(normalizeOptions({ slots: 99 }), null);
  // "Clean" with upgrades already used contradicts itself: the claim goes, the numbers stay.
  assert.deepEqual(parseOptions(normalizeOptions({ clean: true, used: 2, slots: 3 })), { slots: 3, used: 2 });
  // Passed upgrades ('+N'): kept with the used count, dropped when they outnumber it, and never 'clean'.
  assert.deepEqual(parseOptions(normalizeOptions({ slots: 0, used: 7, ups: 2 })), { slots: 0, used: 7, ups: 2 });
  assert.deepEqual(parseOptions(normalizeOptions({ slots: 5, used: 2, ups: 3 })), { slots: 5, used: 2 });
  assert.deepEqual(parseOptions(normalizeOptions({ clean: true, ups: 1 })), { ups: 1 });
  assert.ok(normalizeOptions({ stats: Object.fromEntries(['PAD', 'MAD', 'STR', 'DEX', 'INT', 'LUK', 'ACC', 'EVA', 'MHP', 'MMP', 'PDD', 'MDD', 'Speed', 'Jump', 'CRT', 'CRD'].map((k) => [k, 99])), slots: 7, used: 3 }).length < 300);
});

test('tooltip speed, knockback and scroll gains are bounded and separate from equipment stats', () => {
  assert.deepEqual(parseOptions(normalizeOptions({ attackSpeed: 'average', knockback: 20, scroll: { chance: 60, stats: { PAD: 2, UNKNOWN: 5 } } })), { attackSpeed: 'average', knockback: 20, scroll: { chance: 60, stats: { PAD: 2 } } });
  assert.equal(normalizeOptions({ attackSpeed: '<script>', knockback: 101, scroll: { chance: 99, stats: { PAD: 9999 } } }), null);
});
