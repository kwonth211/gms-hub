import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { megaphoneItemAttrs } from '../assets/mega-option-text.js';

const code = fs.readFileSync(new URL('../assets/item-tip.js', import.meta.url), 'utf8');
const id = 1051019;
const captured = { stats: { INT: 21, PDD: 57 }, slots: 0, ups: 6, used: 10 };
const catalogue = { items: { [id]: ['블루 문라이트', 'Blue Moonlight', 'Equip', 'Overall', 40, 2, {}, { INT: 8, PDD: 58, MDD: 65 }, 10] }, mobs: {} };

// Run the shipped pointer handlers and renderer against a small DOM adapter.
function fixture(source=catalogue) {
  const handlers = new Map(), timers = [];
  const card = { style: {}, setAttribute() {}, offsetWidth: 280, offsetHeight: 300 };
  const body = { dataset: { tips: '/tips.json' }, append() {} };
  vm.runInNewContext(code, {
    document: { body, documentElement: { lang: 'ko' }, createElement: () => card, addEventListener: (name, fn) => handlers.set(name, fn) },
    matchMedia: () => ({ matches: true }), fetch: async () => ({ json: async () => source }),
    window: {}, innerWidth: 1200, innerHeight: 800,
    setTimeout: fn => timers.push(fn), clearTimeout() {}, addEventListener() {},
  });
  return { card, async hover(target) { handlers.get('pointerover')({ target }); while (timers.length) await timers.shift()(); return card.innerHTML; } };
}
test('cash megaphone items show no option note and invent no stats',async()=>{
 const t=['타니아 소드','Tania Sword','Equip','Cash',0,0,{}, {},0,0,0,[],0,0,1];
 const html=await fixture({items:{[id]:t},mobs:{}}).hover(link(megaphoneItemAttrs(id)));
 assert.doesNotMatch(html,/옵션 미확인|tip-stats/);
 // Cash items are never option-checked (owner, 2026-11-21), pet equipment included: no "not captured" note.
 t[3]='Pet Equipment';t[8]=5;
 const pet=await fixture({items:{[id]:t},mobs:{}}).hover(link(megaphoneItemAttrs(id)));
 assert.doesNotMatch(pet,/옵션 미확인/);
});
function link(attrs = '', href = `/ko/tools/market/?item=${id}`) {
  const decode = s => s.replace(/&(quot|amp|lt|gt|#39);/g, (_, k) => ({ quot: '"', amp: '&', lt: '<', gt: '>', '#39': "'" })[k]);
  const dataset = Object.fromEntries([...attrs.matchAll(/data-([a-z-]+)="([^"]*)"/g)].map(([, k, v]) => [k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), decode(v)]));
  return {
    dataset, matches: () => false, getAttribute: key => key === 'href' ? href : null,
    closest(selector) {
      if (selector === 'a[href]') return this;
      if (selector === '[data-opts]') return dataset.opts !== undefined ? this : null;
      if (selector === '[data-item-id], [data-item]') return dataset.itemId ? this : null;
      return null;
    },
  };
}

test('uncaptured megaphone never substitutes base stats or base slots', async () => {
  const f = fixture();
  const html = await f.hover(link(megaphoneItemAttrs(id)));
  assert.match(html, /옵션 미확인/);
  assert.doesNotMatch(html, /tip-stats|업그레이드 가능 횟수|정옵/);
  assert.equal(f.card.hidden, false);
});
test('captured options show actual totals and zero slots without filling missing stats', async () => {
    const html = await fixture().hover(link(megaphoneItemAttrs(id, captured)));
    assert.match(html, /이 고확에서 확인한 옵션/);
    assert.match(html, /인 <b class="tip-plus">\+21<\/b> <span class="tip-split">\(8 <em class="tip-plus">\+13<\/em>\)/);
    assert.match(html, /업그레이드 가능 횟수 <b>0<\/b>/);
    assert.doesNotMatch(html, /<b>\+8<\/b>|<b>\+65<\/b>/);
});
test('moving from a catalogue link to the same uncaptured item replaces its base tooltip', async () => {
  const f = fixture();
  assert.match(await f.hover(link()), /인 <b>\+8<\/b>/);
  const unknown = await f.hover(link(megaphoneItemAttrs(id)));
  assert.match(unknown, /옵션 미확인/);
  assert.doesNotMatch(unknown, /tip-stats/);
});
test('partial and malformed megaphone options never fill absent stats from the catalogue', async () => {
  const partial = await fixture().hover(link(megaphoneItemAttrs(id, { slots: 0 })));
  assert.match(partial, /업그레이드 가능 횟수 <b>0<\/b>/);
  assert.doesNotMatch(partial, /<b>\+8<\/b>|<b>\+58<\/b>/);
  const broken = await fixture().hover(link(` data-item-id="${id}" data-option-source="megaphone" data-opts="broken"`));
  assert.match(broken, /옵션 미확인/);
  assert.doesNotMatch(broken, /tip-stats/);
});
