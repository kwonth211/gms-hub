import test from 'node:test';
import assert from 'node:assert/strict';
import { optionFilter, parseOptionFilter, encodeOptionFilter } from '../assets/option-filter.js';
import { marketSharePath } from '../assets/market-share.js';
import fs from 'node:fs';
import vm from 'node:vm';
import { optionParts } from '../assets/mega-option-text.js';

test('detail facts use selected options, omit unknown base stats, and restore labelled base facts after clearing', async () => {
  const source = fs.readFileSync(new URL('../assets/market.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function fillItemInfo(id) {');
  const end = source.indexOf('\n// Price at a glance', start);
  const boxes = { 'mb-info': { dataset: {} }, 'mb-facts': {} };
  let exact = { filter: { stats: { LUK: 18 }, slots: 0, ups: 8 } };
  const context = vm.createContext({
    loadTips: async () => ({ items: { 1050010: ['', '', 'Equip', 'Overall', 30, 0, {}, { STR: 1, LUK: 1 }, 10] }, mobs: {} }),
    lastOffers: [], $: id => boxes[id], selected: 1050010, exactFor: () => exact,
    tr: (ko) => ko, esc: String, TIP_JOBS: [], TIP_INC: { LUK: () => '럭', STR: () => '힘' },
    optionParts, ko: true, D: { lang: 'ko' }, document: { body: { dataset: {} } }, catalog: null, equipExtras: () => '',
  });
  vm.runInContext(source.slice(start, end), context);
  await context.fillItemInfo(1050010);
  assert.match(boxes['mb-facts'].innerHTML, /선택한 아이템 옵션/);
  assert.match(boxes['mb-facts'].innerHTML, /럭 18 · 남은 강화 0 · 성공한 강화 8/);
  assert.doesNotMatch(boxes['mb-facts'].innerHTML, /럭 \+1|힘 \+1|업그레이드 가능 횟수 10/);
  exact = { filter: null };
  await context.fillItemInfo(1050010);
  assert.match(boxes['mb-facts'].innerHTML, /옵션 조건을 확인할 수 없어요/);
  assert.doesNotMatch(boxes['mb-facts'].innerHTML, /럭 \+1/);
  exact = null;
  await context.fillItemInfo(1050010);
  assert.match(boxes['mb-facts'].innerHTML, /기본 능력치.*럭 \+1/);
  assert.match(boxes['mb-facts'].innerHTML, /업그레이드 가능 횟수 10/);
});

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
