import test from 'node:test';
import assert from 'node:assert/strict';
import { shopPreviewHtml } from '../worker/src/shop-preview.js';

test('shop link preview lists the current spot, count and priciest items with Korean names', () => {
  const names = { 1: ['Gloves ATT', '장갑 공격력 중급'], 2: ['DEX 10%', '전신 DEX 상급'], 3: ['Old', '예전 물건'] };
  const nameOf = (id, lang) => names[id]?.[lang === 'ko' ? 1 : 0];
  const rows = [
    { item: 2, price: 22999, channel: 10, room: 7 },
    { item: 1, price: 1750000, channel: 10, room: 7 },
    { item: 3, price: 5000, channel: 4, room: 7 },
  ];
  const html = shopPreviewHtml({ name: 'hookstk', rows, ko: true, url: 'https://gms-hub.com/ko/shop/?n=hookstk', image: 'x.png', nameOf });
  assert.match(html, /og:title" content="🛒 hookstk의 상점 · CH 10 · FM 7 · 2개 판매 중"/);
  assert.match(html, /og:description" content="장갑 공격력 중급 175만 · 전신 DEX 상급 2.3만"/);
  assert.doesNotMatch(html, /예전 물건/);
  assert.match(html, /http-equiv="refresh" content="0;url=https:\/\/gms-hub.com\/ko\/shop\/\?n=hookstk"/);
  const empty = shopPreviewHtml({ name: 'nobody', rows: [], ko: true, url: 'u', image: 'i', nameOf });
  assert.match(empty, /최근 24시간 안에 확인된 매물이 없어요/);
  assert.match(shopPreviewHtml({ name: 'a<b', rows: [], ko: false, url: 'u', image: 'i', nameOf }), /a&lt;b/);
});
