import test from 'node:test';
import assert from 'node:assert/strict';
import { radarDeals, marketSharePath } from '../assets/market-radar-data.js';

const now = Date.parse('2026-11-20T05:00:00Z');
const summary = { item: 2040801, open: 20, shops: 4, median: 1000000, low: 700000 };
const catalog = (items = [summary]) => ({ asOf: new Date(now - 60000).toISOString(), items });
const offer = { id: 1, item: 2040801, seller: 'ShopA', channel: 1, room: 2, price: 700000, qty: 2, seen: '2026-11-20 04:50:00', sold: 0 };

test('radar compares exact-ID asking prices and keeps cheapest fresh offer per item', () => {
  const r = radarDeals(catalog(), [offer, { ...offer, id: 2, price: 800000 }, { ...offer, id: 3, seen: '2026-11-20 04:55:00' }], now);
  assert.equal(r.length, 1); assert.equal(r[0].id, 3);
  assert.equal(r[0].below, 30); assert.equal(r[0].median, 1000000); assert.equal(r[0].sample, 20);
});

test('radar excludes stale, future, gone, sold, unknown options, insufficient samples and non-comparable equipment', () => {
  for (const patch of [{ sold: 1 }, { goneN: 1 }, { opts: { stats: { PAD: 40 } } }, { seen: '2026-11-20 03:59:59' }, { seen: '2026-11-20 05:01:00' }, { seen: 'invalid' }, { price: 900001 }, { price: 0 }, { seller: '' }]) {
    assert.deepEqual(radarDeals(catalog(), [{ ...offer, ...patch }], now), [], JSON.stringify(patch));
  }
  for (const patch of [{ open: 4 }, { shops: 1 }, { median: null }]) assert.deepEqual(radarDeals(catalog([{ ...summary, ...patch }]), [offer], now), []);
  assert.deepEqual(radarDeals(catalog([{ ...summary, item: 1472001 }]), [{ ...offer, item: 1472001 }], now), []);
  assert.deepEqual(radarDeals({ ...catalog(), asOf: '2026-11-20T04:00:00Z' }, [offer], now), []);
  assert.equal(radarDeals({ ...catalog(), asOf: '2026-11-20T04:40:00Z' }, [offer], now).length, 1, 'allow the existing catalog and edge-cache lifetime');
  assert.deepEqual(radarDeals({ ...catalog(), asOf: '2026-11-20T04:34:59Z' }, [offer], now), []);
});

test('radar respects freshness and discount boundaries, and does not claim the catalog low is a fresh offer', () => {
  assert.equal(radarDeals(catalog(), [{ ...offer, seen: '2026-11-20 04:00:00', price: 900000 }], now).length, 1);
  assert.deepEqual(radarDeals(catalog(), [], now), []);
  assert.equal(radarDeals(catalog(), [{ ...offer, price: 850000 }], now)[0].price, 850000);
});

test('shared item links use published pages and preserve stat filters across fallback and fixed pages', () => {
  assert.equal(marketSharePath({ itemPath: '/ko/items/1472001-steel-titans/', id: 1472001, opt: 48 }), '/ko/items/1472001-steel-titans/?opt=48');
  assert.equal(marketSharePath({ marketPath: '/ko/tools/market/', id: 1472001, opt: 0 }), '/ko/tools/market/?item=1472001&opt=0');
  assert.equal(marketSharePath({ fixed: 1, pathname: '/en/items/example/', opt: null }), '/en/items/example/');
});
