import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { noteScanShops, scanShops, refreshFaces, pruneScanShops, cleanTitle } from '../worker/src/scan-shops.js';

// /trade/'s list of shops people scanned (owner 2026-11-26): scan_shops remembers the shops in each Shop Scan upload,
// and the list shows each with what it still sells, read from listings.
function environment() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['schema.sql', 'migrations/0001_market_batch.sql', 'migrations/0002_listing_history.sql', 'migrations/0019_item_options.sql', 'migrations/0033_scan_shops.sql', 'migrations/0034_scan_shop_title.sql'])
    sqlite.exec(fs.readFileSync(new URL('../worker/' + file, import.meta.url), 'utf8'));
  const DB = { prepare(sql, args = []) { return { bind(...a) { return DB.prepare(sql, a); }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes } }; } }; },
    async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; } };
  return { DB, sqlite };
}
const add = (e, seller, item, price, { qty = 1, sold = 0, ch = 3, room = 7, ago = 10, reporter = 'v1', opts = null } = {}) =>
  e.sqlite.prepare(`INSERT INTO listings (item, price, qty, sold, seller, channel, room, reporter, first_seen, last_seen, opts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?), datetime('now', ?), ?)`)
    .run(item, price, qty, sold, seller, ch, room, reporter, `-${ago} minutes`, `-${ago} minutes`, opts);

test('an upload notes each shop once; the list shows scanned shops with their items, open first and dearest first', async () => {
  const e = environment();
  add(e, 'Hookstk', 2040801, 1600000);
  add(e, 'Hookstk', 4010000, 60, { qty: 100 });
  add(e, 'Hookstk', 1082000, 2000000, { sold: 1, opts: '{"stats":{"PAD":4},"slots":1}' });
  add(e, 'OtherShop', 2040801, 1500000, { reporter: 'collector:shop' }); // never scanned by a visitor: not listed
  await noteScanShops(e, [{ seller: 'Hookstk', channel: 3, room: 7 }, { seller: 'Hookstk', channel: 3, room: 7 }]);
  assert.equal(e.sqlite.prepare('SELECT COUNT(*) n FROM scan_shops').get().n, 1);
  const { shops } = await scanShops(e);
  assert.equal(shops.length, 1);
  assert.deepEqual([shops[0].seller, shops[0].ch, shops[0].room], ['Hookstk', 3, 7]);
  assert.deepEqual(shops[0].items.map((i) => [i[0], i[3]]), [[2040801, 0], [4010000, 0], [1082000, 1]]);
  assert.deepEqual(shops[0].items[2][4], { stats: { PAD: 4 }, slots: 1 });
  assert.equal(shops[0].face, null);
});

test('a shop scanned more than a day ago, or with everything sold, is not listed; old rows are pruned after a week', async () => {
  const e = environment();
  add(e, 'Early', 2040801, 1600000);
  add(e, 'AllSold', 2040801, 1600000, { sold: 1 });
  await noteScanShops(e, [{ seller: 'Early', channel: 3, room: 7 }, { seller: 'AllSold', channel: 3, room: 7 }]);
  e.sqlite.exec("UPDATE scan_shops SET at = datetime('now', '-25 hours') WHERE seller = 'Early'");
  assert.deepEqual((await scanShops(e)).shops, []);
  e.sqlite.exec("UPDATE scan_shops SET at = datetime('now', '-8 days') WHERE seller = 'Early'");
  await pruneScanShops(e);
  assert.deepEqual(e.sqlite.prepare('SELECT seller FROM scan_shops').all().map((r) => r.seller), ['AllSold']);
});

test('owner pictures come from the ranking a few at a time; a missing character is remembered, not asked again', async () => {
  const e = environment();
  add(e, 'Hookstk', 2040801, 1600000);
  add(e, 'NoRank', 2040801, 1600000, { room: 8 });
  await noteScanShops(e, [{ seller: 'Hookstk', channel: 3, room: 7 }, { seller: 'NoRank', channel: 3, room: 8 }]);
  const asked = [];
  const lookup = async (name) => { asked.push(name); return name === 'Hookstk' ? { status: 200, body: { data: { name: 'Hookstk', level: 61, job: 'Hermit', photo: 'https://classicrank.com/p/1.png' } } } : { status: 404, body: {} }; };
  assert.deepEqual(await refreshFaces(e, lookup), { asked: 2, found: 1 });
  assert.deepEqual(await refreshFaces(e, lookup), { asked: 0, found: 0 });
  assert.equal(asked.length, 2);
  const { shops } = await scanShops(e);
  assert.deepEqual(shops.find((s) => s.seller === 'Hookstk').face, { photo: 'https://classicrank.com/p/1.png', level: 61, job: 'Hermit' });
  assert.equal(shops.find((s) => s.seller === 'NoRank').face, null);
  // A failed lookup (ranking down) is tried again next run.
  e.sqlite.exec('DELETE FROM seller_faces');
  assert.deepEqual(await refreshFaces(e, async () => ({ status: 503 })), { asked: 2, found: 0 });
  assert.equal(e.sqlite.prepare('SELECT COUNT(*) n FROM seller_faces').get().n, 0);
});

test('a shop shows only what it held at its latest scan, not items from an earlier scan of the same shop', async () => {
  const e = environment();
  // Earlier today the owner sold a scroll and a candy here; now the shop holds one blue potion.
  add(e, 'Hookstk', 2040801, 32222, { ago: 300 });
  add(e, 'Hookstk', 2022179, 299, { ago: 300 });
  add(e, 'Hookstk', 2000003, 220, { ago: 2 });
  // Items sent together at the latest scan, a few minutes apart, all stay.
  add(e, 'Juky', 1302004, 40000, { ch: 28, room: 8, ago: 20 });
  add(e, 'Juky', 4031000, 7500, { ch: 28, room: 8, ago: 2 });
  await noteScanShops(e, [{ seller: 'Hookstk', channel: 3, room: 7 }, { seller: 'Juky', channel: 28, room: 8 }]);
  const { shops } = await scanShops(e);
  const by = Object.fromEntries(shops.map((s) => [s.seller, s.items.map((i) => i[0])]));
  assert.deepEqual(by.Hookstk, [2000003]);
  assert.deepEqual(by.Juky.sort(), [1302004, 4031000]);
  assert.equal(shops.find((s) => s.seller === 'Hookstk').items[0].length, 5);
});

test('a shop keeps the title read by Shop Scan; links and real-money words never go on the page', async () => {
  const e = environment();
  add(e, 'Hookstk', 2000003, 220, { ago: 2 });
  await noteScanShops(e, [{ seller: 'Hookstk', channel: 3, room: 7, title: '  222 ' }]);
  await noteScanShops(e, [{ seller: 'Hookstk', channel: 3, room: 7 }]); // a later upload before the title is read again
  const { shops } = await scanShops(e);
  assert.equal(shops[0].title, '222');
  assert.equal(cleanTitle('EQ/ETC ORE chip chip'), 'EQ/ETC ORE chip chip');
  assert.equal(cleanTitle('selling mesos paypal'), null);
  assert.equal(cleanTitle('visit www.cheap.com'), null);
  assert.equal(cleanTitle('$5 for 10m'), null);
  assert.equal(cleanTitle('   '), null);
  assert.equal(cleanTitle('x'.repeat(60)).length, 40);
});

test('a seller scanned at a new channel or room is listed there only; the older place is closed', async () => {
  const e = environment();
  add(e, 'Hookstk', 2000003, 219, { ch: 15, room: 7, ago: 20 });
  add(e, 'Hookstk', 4010004, 500, { ch: 15, room: 10, ago: 1 });
  e.sqlite.prepare("INSERT INTO scan_shops (seller, channel, room, at) VALUES ('Hookstk', 15, 7, datetime('now', '-20 minutes')), ('Hookstk', 15, 10, datetime('now', '-1 minutes'))").run();
  const { shops } = await scanShops(e);
  assert.deepEqual(shops.map((s) => [s.seller, s.room]), [['Hookstk', 10]]);
});

test('a new seller in an upload gets a picture right away; one already looked up is not asked again', async () => {
  const e = environment();
  e.sqlite.prepare("INSERT INTO seller_faces (key, nick, photo, level, job, checked_at) VALUES ('known1', 'Known1', 'p.png', 30, 'Thief', datetime('now'))").run();
  const asked = [];
  const lookup = async (n) => { asked.push(n); return { status: 200, body: { data: { name: n, photo: `https://x/${n}.png`, level: 10, job: 'Mage' } } }; };
  const r = await refreshFaces(e, lookup, 2, ['Known1', 'NewSeller1', 'NewSeller2', 'NewSeller3']);
  assert.deepEqual(asked, ['NewSeller1', 'NewSeller2']);
  assert.equal(r.found, 2);
  assert.equal(e.sqlite.prepare("SELECT photo FROM seller_faces WHERE key='newseller1'").get().photo, 'https://x/NewSeller1.png');
});
