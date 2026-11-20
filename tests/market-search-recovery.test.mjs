import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeMarketIndex, matchingIds } from '../assets/market-catalog.js';
import { koreanScrollQuery } from '../assets/search-index.js';

const source = JSON.parse(fs.readFileSync(new URL('../data/items.json', import.meta.url))).items;
const items = makeMarketIndex(source.map((i) => [i.id, i.ko, i.en, i.cat, i.sub, i.lv]), 'ko');
test('real Korean percentage queries find the correct scroll tier without applying an equipment option', () => {
  for (const q of ['장공60', '장공 60', '장공60%', '장갑 공격력 주문서 60%', '장공100', '장공10']) {
    const expected = /100/.test(q) ? 2040800 : /10/.test(q) ? 2040802 : 2040801;
    const ids = matchingIds(items, q);
    assert.equal(ids[0], expected, q);
    assert.ok(!ids.includes(2040805), `physical shorthand must not include magic: ${q}`);
  }
  assert.equal(koreanScrollQuery('슬레인60'), null);
  assert.equal(koreanScrollQuery('48슬레인'), null);
  assert.equal(koreanScrollQuery('1472001'), null);
});

test('failed-search terms recover real names and equivalent two-handed gear types', () => {
  assert.ok(matchingIds(items, '타니아').includes(1047108));
  assert.ok(matchingIds(items, '타니아 모자').length === 0, 'do not invent a Tania hat');
  assert.ok(matchingIds(items, '두손검').includes(2044001));
  assert.ok(matchingIds(items, '양손검').includes(1402000));
  assert.ok(matchingIds(items, '아대공겨').includes(2044701));
  assert.deepEqual(matchingIds(items, 'Steel Titans'), [1472001]);
  assert.ok(matchingIds(items, '뇌전').includes(2070005));
});
