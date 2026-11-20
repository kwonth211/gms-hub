import test from 'node:test';
import assert from 'node:assert/strict';
import { optionFilter, parseOptionFilter, encodeOptionFilter } from '../assets/option-filter.js';
import { marketSharePath } from '../assets/market-share.js';

test('equipment links preserve observed stats and zero slots/upgrades across market and item pages', () => {
  const observed = { stats: { INT: 21, PDD: 57, CRD: 0 }, slots: 0, ups: 6, used: 7, clean: false, attackSpeed: 'fast' };
  const expected = { stats: { INT: 21, PDD: 57, CRD: 0 }, slots: 0, ups: 6 };
  for (const path of [
    marketSharePath({ marketPath: '/ko/tools/market/', id: 1050006, opt: 57, opts: observed }),
    marketSharePath({ itemPath: '/ko/items/1050006-blue-moonlight/', opts: observed }),
    marketSharePath({ fixed: 1, pathname: '/en/items/1050006-blue-moonlight/', opts: observed }),
  ]) {
    const url = new URL(path, 'https://test');
    assert.deepEqual(parseOptionFilter(url.searchParams.get('opts')), expected);
    assert.equal(url.searchParams.has('opt'), false);
  }
  assert.deepEqual(parseOptionFilter(encodeOptionFilter({ slots: 0, ups: 0 })), { slots: 0, ups: 0 });
});

test('scroll gains and fixed equipment properties never become listing comparisons', () => {
  assert.equal(optionFilter({ scroll: { chance: 60, stats: { PAD: 2 } } }), null);
  assert.equal(optionFilter({ attackSpeed: 'fast', knockback: 45, clean: true }), null);
  assert.equal(marketSharePath({ marketPath: '/ko/tools/market/', id: 2043301, opts: { scroll: { chance: 60, stats: { PAD: 2 } } } }), '/ko/tools/market/?item=2043301');
});

test('malformed or unsupported query conditions cannot be silently widened', () => {
  for (const raw of ['', '{', '{}', '[]', 'null', '{"stats":{}}', '{"stats":{"INT":21,"injected":2}}', '{"stats":{"INT":"21"}}', '{"stats":{"INT":999}}', '{"stats":{"INT":1.5}}', '{"slots":-1}', '{"slots":21}', '{"ups":null}', '{"clean":true}', '{"scroll":{"chance":60}}', ' '.repeat(1025)]) {
    assert.equal(parseOptionFilter(raw), null, raw.slice(0, 60));
  }
});
