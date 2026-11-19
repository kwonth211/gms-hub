import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { handleShopScan } from '../worker/src/shop-scan.js';
const stamp = (t) => new Date(t).toISOString().slice(0, 19).replace('T', ' ');
function environment() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['schema.sql', 'migrations/0001_market_batch.sql', 'migrations/0002_listing_history.sql', 'migrations/0019_item_options.sql']) sqlite.exec(fs.readFileSync(new URL('../worker/' + file, import.meta.url), 'utf8'));
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

test('equipment options ride along: cleaned by the shared gate, a bad one never drops the row, a later snapshot without them keeps them', async () => {
  const e = environment(), b = scan(Date.now() - 600000);
  b.rows[0].opts = { stats: { PAD: 49, Speed: 15, BOGUS: 3 }, slots: 7, used: 0, clean: true };
  b.rows[1].opts = 'not an object';
  assert.equal((await post(e, b)).data.listingsChanged, 2);
  const read = () => e.sqlite.prepare('SELECT opts FROM listings ORDER BY item').all().map((r) => r.opts && JSON.parse(r.opts));
  assert.deepEqual(read(), [{ stats: { PAD: 49, Speed: 15 }, slots: 7, used: 0, clean: true }, null]);
  const later = scan(Date.now() - 1000);
  assert.equal((await post(e, later)).data.listingsChanged, 2);
  assert.deepEqual(read()[0].stats, { PAD: 49, Speed: 15 });
});

test('DEF and DEX scrolls stay a choice: the tier tint never picks between two different stats', async () => {
  const { matchItem, ambiguousName, narrowByTier } = await import('../assets/shop-reader.js');
  const items = ['Overall Armor DEF Scroll: Intermediate', 'Overall Armor DEX Scroll: Intermediate', 'Overall Armor DEF Scroll: Greater', 'Overall Armor DEX Scroll: Greater', 'Gloves Attack Scroll: Intermediate', 'Gloves Attack Scroll: Greater']
    .map((en, i) => ({ id: i + 1, en }));
  const m = matchItem('Overall Armor DE? Scroll: Intermediate', items);
  assert.equal(ambiguousName(m), true);
  const n = narrowByTier(m, 'Intermediate');
  assert.equal(n.alternatives.length, 2); // still DEF or DEX, never a silent DEF
  const cut = matchItem('Gloves Attack Scr...', items);
  assert.equal(ambiguousName(cut), false); // only tiers differ
  assert.equal(narrowByTier(cut, 'Greater').item.en, 'Gloves Attack Scroll: Greater');
  assert.equal(matchItem('Overall Armor DEX Scroll: Intermediate', items).item.en, 'Overall Armor DEX Scroll: Intermediate');
});

test('scroll tier tint: Chaos is found even when the screen lifts its blue above its green', async () => {
  const { scrollTier } = await import('../assets/shop-reader.js');
  const icon = ([r, g, b]) => {
    const width = 40, height = 40, data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) data.set([r, g, b, 255], i * 4);
    return { width, height, data };
  };
  const row = { top: 0, x0: 0, sold: false };
  assert.equal(scrollTier(icon([128, 153, 151]), row), 'Lesser');
  assert.equal(scrollTier(icon([191, 114, 72]), row), 'Intermediate');
  assert.equal(scrollTier(icon([208, 161, 66]), row), 'Greater');
  assert.equal(scrollTier(icon([134, 120, 116]), row), 'Chaos');
  assert.equal(scrollTier(icon([132, 118, 124]), row), 'Chaos'); // blue lifted over green
  assert.equal(scrollTier(icon([130, 121, 126]), row), 'Chaos');
});
