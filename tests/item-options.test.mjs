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
  assert.ok(normalizeOptions({ stats: Object.fromEntries(['PAD', 'MAD', 'STR', 'DEX', 'INT', 'LUK', 'ACC', 'EVA', 'MHP', 'MMP', 'PDD', 'MDD', 'Speed', 'Jump', 'CRT', 'CRD'].map((k) => [k, 99])), slots: 7, used: 3 }).length < 300);
});
