import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { study, binomial, matchesGlove, latestListings } from '../scripts/work-gloves-study.mjs';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('five independent 60% scrolls include failures, sum to one, and average three successes', () => {
  const p = binomial(5, 0.6);
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12);
  near(p.reduce((a, b) => a + b, 0), 1);
  near(p.reduce((a, b, k) => a + k * b, 0), 3);
  near(p[0], 0.4 ** 5); near(p[5], 0.6 ** 5);
  near(p[3], 10 * 0.6 ** 3 * 0.4 ** 2);
  assert.deepEqual(binomial(5, 1), [0, 0, 0, 0, 0, 1]);
});
test('different base stats, spare slots and extra stats never enter the finished 6 ATT group', () => {
  const row = { opts: { stats: { PAD: 6, PDD: 6, CRT: 2 }, slots: 0, ups: 3 } };
  assert.ok(matchesGlove(row, 6, 0, 3));
  for (const mutate of [r => r.opts.stats.CRT = 1, r => r.opts.stats.PDD = 7, r => r.opts.slots = 1, r => r.opts.ups = 2, r => r.opts.stats.STR = 1, r => delete r.opts]) {
    const bad = structuredClone(row); mutate(bad); assert.equal(matchesGlove(bad, 6, 0, 3), false);
  }
  assert.deepEqual(latestListings([{ key: 'a', seen: '2026-11-27', sold: true }, { key: 'a', seen: '2026-11-28', sold: false }]), [{ key: 'a', seen: '2026-11-28', sold: true }]);
});
test('published figures reproduce the frozen inputs and bilingual article arithmetic', () => {
  const r = study(JSON.parse(read('data/editorial/work-gloves-2026-11-28.json')));
  assert.deepEqual(r, JSON.parse(read('assets/research/work-gloves-2026-11-28.json')));
  assert.equal(r.cost, 9839999); assert.equal(r.lowCost, 8429999);
  assert.equal(r.groups.find(g => g.attack === 6).open.low, 4199999);
  assert.equal(r.lowCost - r.groups.find(g => g.attack === 6).open.low, 4230000);
  assert.equal(r.groups.find(g => g.attack === 10).sold.n, 4);
  for (const lang of ['ko', 'en']) {
    const article = read(`data/guides/work-gloves-buy-or-scroll.${lang}.html`);
    for (const n of [r.cost, r.lowCost, r.fivePiecesCost]) assert.ok(article.includes(n.toLocaleString('en-US')));
    for (const n of r.outcomes) assert.ok(article.includes((n.probability * 100).toFixed(3) + '%'));
    assert.ok(article.includes(`/${lang}/tools/market/?item=1082000`));
    assert.ok(article.includes('plan=2040801.2040801.2040801.2040801.2040801&amp;n=1'));
  }
  for (const file of ['scripts/trade-pages.mjs', 'assets/market.js', 'data/guides/work-gloves-buy-or-scroll.ko.html', 'data/guides/work-gloves-buy-or-scroll.en.html']) {
    for (const [, feature] of read(file).matchAll(/data-discover="(glove_[^"]+)"/g)) assert.match(feature, /^[a-z_]{1,24}$/);
  }
});
