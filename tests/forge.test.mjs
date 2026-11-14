import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const F = JSON.parse(fs.readFileSync(new URL('../data/forge.json', import.meta.url), 'utf8'));

test('forge data: tiers, destroy chance and scroll-to-gear mapping', () => {
  assert.ok(F.scrolls.length >= 150 && F.equips.length >= 500);
  for (const s of F.scrolls) {
    assert.ok([100, 60, 10].includes(s.success), `${s.id} success ${s.success}`);
    assert.ok(Object.keys(s.inc).length, `${s.id} has stats`);
  }
  // Only the 10% Chaos tier can destroy (50%).
  assert.ok(F.scrolls.filter((s) => s.destroy).every((s) => s.success === 10 && s.destroy === 50));
  // Gloves Attack 60% fits gloves (108xxxx), e.g. 1082002.
  const glove = F.scrolls.find((s) => s.id === 2040801);
  assert.equal(glove.cat, 108);
  assert.ok(F.equips.some((e) => e.id === 1082002 && e.cat === 108 && e.slots > 0));
  // Every scroll category has gear to put it on.
  const cats = new Set(F.equips.map((e) => e.cat));
  assert.deepEqual(F.scrolls.filter((s) => !cats.has(s.cat)).map((s) => s.id), []);
});
