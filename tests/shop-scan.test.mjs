import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { handleShopScan } from '../worker/src/shop-scan.js';
const stamp = (t) => new Date(t).toISOString().slice(0, 19).replace('T', ' ');
function environment() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['schema.sql', 'migrations/0001_market_batch.sql', 'migrations/0002_listing_history.sql']) sqlite.exec(fs.readFileSync(new URL('../worker/' + file, import.meta.url), 'utf8'));
  const DB = { prepare(sql, args = []) { return { bind(...a) { return DB.prepare(sql, a); }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; } }; },
    async batch(stmts) { sqlite.exec('BEGIN'); try { const out = []; for (const s of stmts) out.push(await s.run()); sqlite.exec('COMMIT'); return out; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };
  return { DB, sqlite, SHOP_SCAN_TOKEN: 'scan-token' };
}
const known = async () => new Set([2040801, 4010004]);
const scan = (at = Date.now() - 5000) => ({ channel: 1, room: 4, seen: stamp(at), rows: [
  { item: 2040801, price: 2444444, qty: 1, sold: false, seller: 'CapooStars' },
  { item: 4010004, price: 99, qty: 20, sold: true, seller: 'Aviya' } ] });
async function post(env, body, token = 'scan-token', notified) {
  const r = await handleShopScan(new Request('https://test/internal/shop-scan', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: JSON.stringify(body) }), env, known, notified);
  return { status: r.status, data: await r.json() };
}
const rows = (e) => e.sqlite.prepare('SELECT item, price, qty, sold, seller, channel, room, reporter, first_seen, last_seen FROM listings ORDER BY item').all();

test('a room snapshot needs the collector token and stores bundles and sold slots as read', async () => {
  const e = environment(), b = scan();
  assert.equal((await post(e, b, 'wrong')).status, 401);
  assert.equal((await post({ ...e, SHOP_SCAN_TOKEN: undefined }, b)).status, 503);
  assert.equal(rows(e).length, 0);
  const told = [];
  const first = await post(e, b, 'scan-token', (r) => told.push(...r));
  assert.deepEqual(first.data, { ok: true, accepted: 2, listingsChanged: 2 });
  const [scroll, ore] = rows(e);
  assert.deepEqual([scroll.price, scroll.qty, scroll.sold, scroll.seller, scroll.channel, scroll.room, scroll.reporter], [2444444, 1, 0, 'CapooStars', 1, 4, 'collector:shop']);
  assert.deepEqual([ore.qty, ore.sold, ore.last_seen], [20, 1, b.seen]);
  // Only slots still for sale are worth an alert.
  assert.deepEqual(told.map((r) => [r.item, r.room]), [[2040801, 4]]);
});

test('the same snapshot again changes nothing; a later one moves last_seen and takes the new qty and sold state', async () => {
  const e = environment(), b = scan(Date.now() - 600000);
  await post(e, b);
  assert.equal((await post(e, b)).data.listingsChanged, 0);
  const later = scan(Date.now() - 1000);
  later.rows[0].sold = true; later.rows[1].sold = false; later.rows[1].qty = 5;
  assert.equal((await post(e, later)).data.listingsChanged, 2);
  const [scroll, ore] = rows(e);
  assert.deepEqual([scroll.sold, scroll.first_seen, scroll.last_seen], [1, b.seen, later.seen]);
  assert.deepEqual([ore.sold, ore.qty], [0, 5]);
  // An older snapshot arriving late must not undo the newer one.
  await post(e, b);
  assert.equal(rows(e)[0].sold, 1);
  assert.equal(rows(e).length, 2);
});

test('one bad row rejects the whole snapshot', async () => {
  const e = environment();
  const changes = [(b) => (b.rows[0].item = 999), (b) => (b.rows[0].price = 0), (b) => (b.rows[0].qty = 0), (b) => (b.rows[0].sold = 1),
    (b) => (b.rows[0].seller = 'Bad Name?'), (b) => (b.room = 0), (b) => (b.channel = 41), (b) => (b.seen = stamp(Date.now() + 3600000)),
    (b) => (b.seen = stamp(Date.now() - 25 * 3600000)), (b) => (b.seen = '2026-02-30 00:00:00'), (b) => b.rows.push({ ...b.rows[0] }), (b) => (b.rows = [])];
  for (const change of changes) { const b = scan(); change(b); assert.equal((await post(e, b)).status, 400); }
  assert.equal(rows(e).length, 0);
});
