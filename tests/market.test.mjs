import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parsePriceLine, priceFromLine, matchItem, findShopRows, readLine, readOwner, findRoom } from '../assets/shop-reader.js';
import { canUpload, sameShop, listingKey, fingerprint, verifiedPrice } from '../assets/scan-state.js';
import { marketRows, DAY, parseUtc } from '../assets/market-data.js';

const listing = () => ({ shop: { id: 1 }, item: { id: 4000000 }, price: 80, qty: 25, sold: false, owner: 'Seller', channel: 20, room: 3, sure: true, confirmations: 2 });

test('prices accept complete groups and quantities, never partial or guessed digits', () => {
  for (const [text, value] of [['25 for 2,000 mesos', { qty: 25, price: 2000 }], ['1 for 1.234.567 mesos', { qty: 1, price: 1234567 }], ['1for12345mesos', { qty: 1, price: 12345 }], ['1,000 for 25 000 mesos', { qty: 1000, price: 25000 }]]) assert.deepEqual(parsePriceLine(text), value);
  for (const text of ['?1 for 200 mesos', '1 for 1,23 mesos', '1 for 1O0 mesos', '0 for 20 mesos', '1 for 0 mesos', '10001 for 20 mesos', '1 for 10000000001 mesos', '1 for 20 mesos garbage']) assert.equal(parsePriceLine(text), null, text);
  assert.deepEqual(priceFromLine('1for2,000?sos'), { qty: 1, price: 2000 });
});

test('cut-short names keep alternatives until the player or icon resolves them', () => {
  const items = [{ id: 1, en: 'Gloves Attack Scroll: Lesser' }, { id: 2, en: 'Gloves Attack Scroll: Greater' }];
  assert.equal(matchItem('Gloves Attack Scr...', items).alternatives.length, 2);
});

test('upload requires two identical reads or a valid explicit correction', () => {
  assert.equal(canUpload(listing()), true);
  for (const change of [{ confirmations: 1 }, { room: null }, { channel: 41 }, { price: 0 }, { price: 2.5 }, { qty: 1.5 }, { owner: '?' }, { sure: false }, { alternatives: [{ id: 1 }] }]) assert.equal(canUpload({ ...listing(), ...change }), false, JSON.stringify(change));
  assert.equal(canUpload({ ...listing(), edited: true, confirmations: 1 }), true);
  assert.equal(canUpload({ ...listing(), edited: true, room: null }), false);
});

test('same merchandise at a different seller/channel/room never merges', () => {
  const shop = { channel: 20, room: 3, votes: new Map([['Seller', 2]]) };
  assert.equal(sameShop(shop, [listing()], 20, 3), true);
  assert.equal(sameShop(shop, [{ ...listing(), owner: 'Other' }], 20, 3), false);
  assert.equal(sameShop(shop, [listing()], 21, 3), false);
  assert.equal(sameShop(shop, [listing()], 20, 4), false);
  assert.notEqual(listingKey(listing()), listingKey({ ...listing(), qty: 1 }));
  assert.notEqual(fingerprint(listing()), fingerprint({ ...listing(), sold: true }));
});

test('asking and sold medians stay separate; stale prices do not become the current cheapest', () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  const row = (price, age, sold = false) => ({ price, qty: 1, sold, seen: new Date(now - age).toISOString() });
  const data = marketRows([row(1000, 1000), row(1100, 2000), row(1200, 3000), row(100000, 4000), row(1, 2 * DAY), row(10, 1000, true), row(12, 1000, true), row(14, 1000, true), row(500, 9 * DAY)], now);
  assert.equal(data.askingMedian, 1100);
  assert.equal(data.soldMedian, 12);
  assert.equal(data.open[0].price, 1000);
  assert.equal(data.excluded, 2);
  assert.equal(data.rows.length, 6);
  const stale = marketRows([row(100, 2 * DAY)], now);
  assert.equal(stale.open.length, 0);
  assert.equal(stale.stale.length, 1);
  assert.equal(stale.askingMedian, null);
  assert.equal(parseUtc('2026-11-02 12:00:00'), now);
  assert.equal(parseUtc('2026-11-02T21:00:00+09:00'), now);
});

test('saved screenshots retain their known names, prices, sold states and room', async (t) => {
  const dir = path.join(os.homedir(), 'gms-hub-samples');
  const fixture = path.join(dir, 'frame-2026-11-02T13-36-32-610Z.png');
  if (!fs.existsSync(fixture)) return t.skip('Local game samples are not checked into the repository');
  let PNG;
  try { ({ PNG } = await import('../scripts/scan-tools/node_modules/pngjs/lib/png.js')); } catch { return t.skip('Install scripts/scan-tools dependencies for sample regression'); }
  const glyphs = JSON.parse(fs.readFileSync(new URL('../data/shop-glyphs.json', import.meta.url)));
  const img = PNG.sync.read(fs.readFileSync(fixture));
  const rows = findShopRows(img);
  assert.equal(rows.length, 6);
  assert.equal(readOwner(img, rows[0].top, rows[0].x0, glyphs.glyphs), 'pipinstall');
  assert.equal(findRoom(img, glyphs.map), 10);
  assert.deepEqual(rows.map((r) => priceFromLine(readLine(img, r, 1, glyphs.glyphs)).price), [11111, 3555, 3222, 1999, 4999, 80]);
  assert.deepEqual(rows.map((r) => r.sold), [false, false, false, false, true, false]);
  assert.equal(readLine(img, rows[0], 0, glyphs.glyphs), 'Mithril Pole Arm');
  const img2 = PNG.sync.read(fs.readFileSync(path.join(dir, 'frame-2026-11-02T13-36-35-021Z.png')));
  const rows2 = findShopRows(img2);
  assert.deepEqual(rows2.map((r) => priceFromLine(readLine(img2, r, 1, glyphs.glyphs)).price), [80, 25, 28, 23, 21, 78]);
});

test('blurred prices need independent OCR agreement even when the bitmap result looks valid', () => {
  const a = { qty: 1, price: 46888 };
  assert.deepEqual(verifiedPrice(a, { ...a }, true), a);
  assert.equal(verifiedPrice({ qty: 1, price: 468838 }, a, true), null);
  assert.equal(verifiedPrice(a, { qty: 2, price: 46888 }, true), null);
  assert.equal(verifiedPrice(a, null, true), null);
  assert.deepEqual(verifiedPrice(a, null, false), a);
});
