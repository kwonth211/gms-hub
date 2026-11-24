import test from 'node:test';
import assert from 'node:assert/strict';
import { uniqueListings, sellCurve, bandAt, sellAdvice, rankAmong, groupKey, optionGroups, inGroup, scrollOdds, scrollProfit, finishedPieces, cleanRange, fairPrice, parseMesos, medianPrice } from '../assets/trade-math.js';

const row = (price, sold = 0, extra = {}) => ({ price, sold, qty: 1, seller: `s${price}-${Math.random()}`, channel: 1, room: 1, seen: '2026-11-24 01:00:00', ...extra });

test('uniqueListings: one row per listing, sold when any day says so', () => {
  const a = { price: 100, sold: 0, seller: 'A', channel: 3, room: 2, seen: '2026-11-22 10:00:00' };
  const rows = [a, { ...a, seen: '2026-11-23 10:00:00', sold: 1 }, { ...a, price: 120 }, { ...a, seller: 'B' }, { ...a, price: 0 }];
  const u = uniqueListings(rows);
  assert.equal(u.length, 3);
  const first = u.find((r) => r.seller === 'A' && r.price === 100);
  assert.equal(first.sold, 1);
  assert.equal(first.seen, '2026-11-23 10:00:00');
  // Two pieces at one price in one shop with different options are two listings.
  const g = [{ ...a, opts: { ups: 1, slots: 2, stats: { PAD: 2 } } }, { ...a, opts: { ups: 2, slots: 1, stats: { PAD: 4 } } }];
  assert.equal(uniqueListings(g).length, 2);
  assert.deepEqual(uniqueListings(null), []);
});

test('sellCurve: too little data says nothing', () => {
  assert.deepEqual(sellCurve([]), []);
  assert.deepEqual(sellCurve(Array.from({ length: 23 }, (_, i) => row(100 + i, 1))), []);
  assert.deepEqual(sellCurve(Array.from({ length: 60 }, (_, i) => row(100 + i, i < 2 ? 1 : 0))), []);
});

test('sellCurve: bands cover every listing once, never split a price, share never rises with price', () => {
  const list = [];
  for (let i = 0; i < 400; i++) { const price = 1000 + (i % 40) * 10; list.push(row(price, Math.random() < 0.9 - (i % 40) / 50 ? 1 : 0)); }
  for (let i = 0; i < 120; i++) list.push(row(1500, i % 3 === 0 ? 1 : 0)); // a crowd at one price
  const c = sellCurve(list);
  assert.ok(c.length >= 2 && c.length <= 12);
  assert.equal(c.reduce((s, b) => s + b.n, 0), list.length);
  assert.equal(c.reduce((s, b) => s + b.sold, 0), list.filter((r) => r.sold).length);
  for (let i = 1; i < c.length; i++) {
    assert.ok(c[i].lo > c[i - 1].hi, 'bands do not overlap');
    assert.ok(c[i].rate <= c[i - 1].rate, 'share never rises');
  }
  assert.equal(c.filter((b) => b.lo <= 1500 && b.hi >= 1500).length, 1);
  for (const b of c) assert.equal(b.rate, b.sold / b.n);
});

test('sellCurve: a noisy dearer band is pooled with the cheaper one', () => {
  const list = [...Array.from({ length: 30 }, (_, i) => row(100 + i, i < 6 ? 1 : 0)), ...Array.from({ length: 30 }, (_, i) => row(200 + i, i < 15 ? 1 : 0)), ...Array.from({ length: 30 }, (_, i) => row(300 + i, 0))];
  const c = sellCurve(list, { bands: 3 });
  assert.equal(c.length, 2);
  assert.deepEqual(c[0], { lo: 100, hi: 229, n: 60, sold: 21, rate: 21 / 60 });
  assert.equal(c[1].rate, 0);
});

test('bandAt, sellAdvice, rankAmong', () => {
  const list = [...Array.from({ length: 40 }, (_, i) => row(100 + i, i % 10 < 8 ? 1 : 0)), ...Array.from({ length: 40 }, (_, i) => row(200 + i, i % 10 < 5 ? 1 : 0)), ...Array.from({ length: 40 }, (_, i) => row(300 + i, i % 10 < 1 ? 1 : 0))];
  const c = sellCurve(list, { bands: 3 });
  assert.equal(bandAt(c, 50).edge, 'below');
  assert.equal(bandAt(c, 50).index, 0);
  assert.equal(bandAt(c, 239).index, 1);
  assert.equal(bandAt(c, 250).index, 2); // dearer than the whole middle band
  assert.equal(bandAt(c, 9999).edge, 'above');
  assert.equal(bandAt(c, 0), null);
  assert.equal(bandAt([], 100), null);
  const a = sellAdvice(c, list);
  assert.equal(a.quick, 239);
  assert.equal(a.slow, 300);
  assert.equal(a.best.lo, 100);
  assert.equal(a.soldMedian, medianPrice(list.filter((r) => r.sold)));
  assert.deepEqual(sellAdvice([], list), { quick: null, slow: null, best: null, soldMedian: null });
  assert.deepEqual(rankAmong([{ price: 10 }, { price: 20 }, { price: 20 }, { price: 30 }], 20), { cheaper: 1, same: 2, total: 4, place: 2 });
  assert.equal(rankAmong([], 5).place, 1);
});

test('gear groups: clean by slots, scrolled by passes, attack and slots', () => {
  assert.equal(groupKey(null), null);
  assert.equal(groupKey({ stats: {} }), null);
  assert.equal(groupKey({ slots: 5, ups: 0, stats: { PDD: 6 } }), 'c:5');
  assert.equal(groupKey({ slots: 0, ups: 3, stats: { PAD: 6, PDD: 6 } }), 'u:3:PAD6:0');
  assert.equal(groupKey({ slots: 0, ups: 3, stats: { PDD: 12 } }), 'u:3::0');
  assert.equal(groupKey({ slots: 2, ups: 1, stats: { PAD: 50, MAD: 80 } }, 'Wand'), 'u:1:MAD80:2');
  const list = [row(1, 0, { opts: { slots: 5, ups: 0, stats: {} } }), row(2, 1, { opts: { slots: 5, ups: 0, stats: {} } }), row(3, 0, { opts: { slots: 0, ups: 3, stats: { PAD: 6 } } }), row(4)];
  const g = optionGroups(list);
  assert.deepEqual(g.map((x) => [x.key, x.n, x.sold]), [['c:5', 2, 1], ['u:3:PAD6:0', 1, 0]]);
  assert.equal(g[1].value, 6);
  assert.equal(inGroup(list, 'c:5').length, 2);
});

test('scrollOdds: binomial without destruction, sums to one with it', () => {
  const o = scrollOdds(5, 60);
  assert.equal(o.passes.length, 6);
  assert.ok(Math.abs(o.passes[5] - 0.6 ** 5) < 1e-12);
  assert.ok(Math.abs(o.passes[0] - 0.4 ** 5) < 1e-12);
  assert.ok(Math.abs(o.passes.reduce((s, x) => s + x, 0) - 1) < 1e-12);
  assert.equal(o.boom, 0);
  assert.equal(o.used, 5);
  assert.deepEqual(scrollOdds(3, 100).passes.map((x) => Math.round(x)), [0, 0, 0, 1]);
  const c = scrollOdds(5, 10, 50);
  assert.ok(Math.abs(c.passes.reduce((s, x) => s + x, 0) + c.boom - 1) < 1e-12);
  assert.ok(Math.abs(c.passes[5] - 0.1 ** 5) < 1e-15);
  // One scroll: 45% of pieces are destroyed; a destroyed piece uses no more scrolls.
  assert.ok(Math.abs(scrollOdds(1, 10, 50).boom - 0.45) < 1e-12);
  assert.ok(Math.abs(c.used - (1 - 0.55 ** 5) / 0.45) < 1e-9);
  assert.deepEqual(scrollOdds(0, 60), { passes: [1], boom: 0, used: 0 });
});

test('scrollProfit: average, chance to come out ahead, what a missing price must reach', () => {
  const odds = scrollOdds(2, 50); // 25% / 50% / 25%
  const r = scrollProfit({ item: 100, scroll: 50, odds, values: [0, 150, 500] });
  assert.equal(r.cost, 200);
  assert.equal(r.ev, 200);
  assert.equal(r.profit, 0);
  assert.equal(r.win, 0.25);
  assert.equal(r.needs, 2);
  const m = scrollProfit({ item: 100, scroll: 50, odds, values: [0, 150, null] });
  assert.equal(m.ev, null);
  assert.equal(m.profit, null);
  assert.deepEqual(m.missing, [2]);
  assert.equal(m.breakEven, (200 - 75) / 0.25);
  assert.equal(scrollProfit({ item: 100, scroll: 50, odds, values: [null, null, 500] }).breakEven, null);
  // 100% scrolls: the results that cannot happen need no price.
  const sure = scrollProfit({ item: 10, scroll: 5, odds: scrollOdds(3, 100), values: [null, null, null, 40] });
  assert.equal(sure.ev, 40);
  assert.equal(sure.win, 1);
  // Chaos: scrolls stop when the piece is destroyed, so the average cost is below the full one.
  const chaos = scrollProfit({ item: 0, scroll: 100, odds: scrollOdds(5, 10, 50), values: [0, 0, 0, 0, 0, 0] });
  assert.ok(chaos.cost < chaos.full);
  assert.equal(chaos.full, 500);
});

test('finished pieces, clean range and fair price', () => {
  const piece = (pad, slots, ups, price, sold = 0) => row(price, sold, { opts: { stats: pad ? { PAD: pad, PDD: 6 } : { PDD: 6 }, slots, ups, used: 5 - slots } });
  const list = [piece(0, 5, 0, 10), piece(6, 0, 3, 400), piece(6, 0, 3, 420, 1), piece(6, 2, 3, 900), piece(0, 0, 3, 50), piece(5, 0, 5, 300), row(999)];
  assert.deepEqual(cleanRange(list, 'PAD', 0), { lo: 0, hi: 0 });
  assert.equal(finishedPieces(list, { stat: 'PAD', gain: 2, k: 3, baseLo: 0, baseHi: 0 }).length, 2);
  assert.equal(finishedPieces(list, { stat: 'PAD', gain: 2, k: 0, baseLo: 0, baseHi: 0 }).length, 0);
  // A weapon whose clean attack rolls 48 to 52: three passes of +2 land on 54 to 58.
  const w = [row(1, 0, { opts: { stats: { PAD: 48 }, slots: 7, ups: 0, used: 0 } }), row(1, 0, { opts: { stats: { PAD: 52 }, slots: 7, ups: 0, used: 0 } }), row(5, 0, { opts: { stats: { PAD: 57 }, slots: 0, ups: 3, used: 7 } }), row(5, 0, { opts: { stats: { PAD: 60 }, slots: 0, ups: 3, used: 7 } })];
  const cr = cleanRange(w, 'PAD', 50);
  assert.deepEqual(cr, { lo: 48, hi: 52 });
  assert.equal(finishedPieces(w, { stat: 'PAD', gain: 2, k: 3, baseLo: cr.lo, baseHi: cr.hi }).length, 1);
  assert.deepEqual(cleanRange([], 'PAD', 50), { lo: 50, hi: 50 });
  assert.equal(fairPrice([]), null);
  assert.deepEqual(fairPrice([row(100), row(200), row(300), row(400)]), { price: 200, basis: 'ask', n: 4, sold: 0 });
  assert.deepEqual(fairPrice([row(100, 1), row(200, 1), row(300, 1), row(900)]), { price: 200, basis: 'sold', n: 4, sold: 3 });
});

test('parseMesos reads the ways players write prices', () => {
  assert.equal(parseMesos('150만'), 1500000);
  assert.equal(parseMesos('1.5m'), 1500000);
  assert.equal(parseMesos('1,500,000'), 1500000);
  assert.equal(parseMesos('3억 2000만'), 320000000);
  assert.equal(parseMesos('1.2억'), 120000000);
  assert.equal(parseMesos('250k'), 250000);
  assert.equal(parseMesos('2B'), 2000000000);
  assert.equal(parseMesos('1만5000'), 15000);
  for (const bad of ['', 'abc', '0', '-5', '5억x', '30억', null]) assert.equal(parseMesos(bad), null, String(bad));
});
