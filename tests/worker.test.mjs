import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import worker from '../worker/src/index.js';

// Real SQLite executes the production SQL through a minimal D1 adapter.
function environment() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(new URL('../worker/schema.sql', import.meta.url), 'utf8'));
  const DB = { failUpdates: false, prepare(sql, args = []) {
    return { bind(...values) { return DB.prepare(sql, values); }, async first() { return sqlite.prepare(sql).get(...args) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() {
        if (DB.failUpdates && sql.startsWith('UPDATE listings')) throw new Error('unavailable');
        const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } };
      } };
  }, async batch(statements) {
    sqlite.exec('BEGIN');
    try { const r = await Promise.all(statements.map((s) => s.run())); sqlite.exec('COMMIT'); return r; }
    catch (e) { sqlite.exec('ROLLBACK'); throw e; }
  } };
  return { DB, VOTE_SALT: 'local-test-only', sqlite };
}
const row = { item: 4000000, price: 100, qty: 1, sold: false, seller: 'Seller', channel: 20, room: 3 };
async function send(env, path, body, ip = 'test-a') {
  const req = new Request('https://test.invalid' + path, { method: 'POST', headers: { Origin: 'https://gms-hub.com', 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(body) });
  const r = await worker.fetch(req, env); return { status: r.status, data: await r.json() };
}
// The only upstream request is the public item index, replaced with a fixed local index.
globalThis.fetch = async () => Response.json([[4000000, '', 'Test item']]);

test('listing batches are all-or-nothing and reject truncation or invalid fields', async () => {
  const env = environment();
  assert.equal((await send(env, '/listings', { items: Array.from({ length: 101 }, () => row) })).status, 400);
  assert.equal((await send(env, '/listings', { items: [row, { ...row, channel: 0 }] })).status, 400);
  assert.equal((await send(env, '/listings', { items: [{ ...row, sold: 'false' }] })).status, 400);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM listings').get().n, 0);
  assert.deepEqual((await send(env, '/listings', { items: [row] })).data, { stored: 1 });
  await send(env, '/listings', { items: [{ ...row, qty: 5, sold: true }] });
  const result = env.sqlite.prepare('SELECT qty, sold FROM listings').get();
  assert.equal(result.qty, 5); assert.equal(result.sold, 1);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM listings').get().n, 1);
});

test('correction changes location, retries idempotently, and is limited to the original reporter', async () => {
  const env = environment();
  await send(env, '/listings', { items: [row] });
  const to = { ...row, price: 120, channel: 21, room: 4 };
  assert.equal((await send(env, '/listings/fix', { from: row, to }, 'someone-else')).status, 404);
  assert.deepEqual((await send(env, '/listings/fix', { from: row, to })).data, { fixed: 1 });
  assert.deepEqual((await send(env, '/listings/fix', { from: row, to })).data, { fixed: 1 });
  const result = env.sqlite.prepare('SELECT price, channel, room FROM listings').get();
  assert.equal(result.price, 120); assert.equal(result.channel, 21); assert.equal(result.room, 4);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM listings').get().n, 1);
});

test('a correction conflict or database failure never deletes the original listing', async () => {
  const env = environment();
  await send(env, '/listings', { items: [row, { ...row, price: 200 }] });
  assert.equal((await send(env, '/listings/fix', { from: row, to: { ...row, price: 200 } })).status, 409);
  env.DB.failUpdates = true;
  assert.equal((await send(env, '/listings/fix', { from: row, to: { ...row, price: 300 } })).status, 503);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM listings').get().n, 2);
  assert.equal(env.sqlite.prepare('SELECT price FROM listings ORDER BY price').get().price, 100);
});

test('price summaries do not discard sold prices merely because asking prices are higher', async () => {
  const env = environment();
  for (const [price, kind] of [[10, 'sold'], [12, 'sold'], [14, 'sold'], [1000, 'selling'], [1100, 'selling'], [1200, 'selling']])
    env.sqlite.prepare("INSERT INTO prices (item, price, kind, reporter) VALUES (4000000, ?, ?, 'test')").run(price, kind);
  const r = await worker.fetch(new Request('https://test.invalid/prices?ids=4000000'), env);
  const summary = (await r.json())['4000000'];
  assert.equal(summary.sold.median, 12); assert.equal(summary.selling.median, 1100);
  assert.equal(summary.basis, 'sold'); assert.equal(summary.median, 12);
});

test('rankings publish a median with an explicit sold/asking basis and matching history', async () => {
  const env = environment();
  await send(env, '/listings', { items: [row, { ...row, price: 10, sold: true }, { ...row, price: 14, sold: true }] });
  const res = await worker.fetch(new Request('https://test.invalid/market/top'), env);
  const data = await res.json();
  assert.equal(data.items[0].median, 12);
  assert.equal(data.items[0].basis, 'sold');
  assert.equal(data.items[0].spark.at(-1), 12);
  assert.equal(data.stats.listings, 3);
});

test('item details disclose truncation and return the latest 400 observations deterministically', async () => {
  const env = environment();
  const insert = env.sqlite.prepare("INSERT INTO listings (item, price, seller, channel, room, reporter) VALUES (4000000, ?, 'Test', 1, 1, 'test')");
  for (let i = 1; i <= 401; i++) insert.run(i);
  const get = async () => (await worker.fetch(new Request('https://test.invalid/market/item?id=4000000'), env)).json();
  const data = await get();
  assert.equal(data.limit, 400);
  assert.equal(data.truncated, true);
  assert.equal(data.listings.length, 400);
  assert.equal(data.listings[0].price, 401);
  assert.equal(data.listings.at(-1).price, 2);
  assert.ok(Number.isFinite(Date.parse(data.asOf)));
  env.sqlite.prepare('DELETE FROM listings WHERE price = 401').run();
  assert.equal((await get()).truncated, false);
});

test('identical scanner frames within 15 minutes cause no writes; stock and sold changes still persist',async()=>{
 const e=environment();await send(e,'/listings',{items:[row]});
 const before=e.sqlite.prepare('SELECT total_changes() AS n').get().n;
 const sequence=e.sqlite.prepare("SELECT seq FROM sqlite_sequence WHERE name='listings'").get().seq;
 await send(e,'/listings',{items:[row]});await send(e,'/listings',{items:[row]});
 assert.equal(e.sqlite.prepare('SELECT total_changes() AS n').get().n,before);
 assert.equal(e.sqlite.prepare("SELECT seq FROM sqlite_sequence WHERE name='listings'").get().seq,sequence);
 await send(e,'/listings',{items:[{...row,qty:2,sold:true}]});
 assert.deepEqual({...e.sqlite.prepare('SELECT qty,sold FROM listings').get()},{qty:2,sold:1});
 e.sqlite.exec("UPDATE listings SET last_seen=datetime('now','-16 minutes')");
 await send(e,'/listings',{items:[{...row,qty:2,sold:true}]});
 assert.ok(Date.now()-Date.parse(e.sqlite.prepare('SELECT last_seen FROM listings').get().last_seen.replace(' ','T')+'Z')<5000);
});
