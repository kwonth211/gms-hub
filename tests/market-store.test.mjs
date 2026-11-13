// Read/write diet of the market store: per-item summary table, retention into item_daily, one-pass megaphone stats.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { marketCatalog, refreshItemMarket, archiveListings } from "../worker/src/market-browser.js";
import { megaphoneStats } from "../worker/src/megaphone.js";

const DAY = 86400000,
  stamp = (n) => new Date(n).toISOString().slice(0, 19).replace("T", " ");

function env() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of ["schema.sql", "migrations/0001_market_batch.sql", "migrations/0014_item_market.sql"])
    sqlite.exec(fs.readFileSync(new URL("../worker/" + file, import.meta.url), "utf8"));
  let reads = 0;
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    async first() { const r = sqlite.prepare(sql).get(...args) || null; reads += r ? 1 : 0; return r; },
    async all() { const r = sqlite.prepare(sql).all(...args); reads += r.length; return { results: r }; },
    async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; },
  });
  const DB = {
    prepare: (sql) => stmt(sql),
    // Real D1 batches are one transaction: emulate that so a failing statement rolls the whole chunk back.
    async batch(list) {
      sqlite.exec("BEGIN");
      try { const out = []; for (const s of list) out.push(await s.run()); sqlite.exec("COMMIT"); return out; }
      catch (e) { sqlite.exec("ROLLBACK"); throw e; }
    },
  };
  return { DB, sqlite, reads: () => reads, resetReads: () => (reads = 0) };
}
const add = (e, { item = 2040801, price = 100, sold = 0, seller = "S", channel = 1, room = 1, age = 1000 } = {}) =>
  e.sqlite.prepare("INSERT INTO listings(item,price,qty,sold,seller,channel,room,reporter,first_seen,last_seen) VALUES(?,?,1,?,?,?,?,'batch:market',?,?)")
    .run(item, price, sold, seller, channel, room, stamp(Date.now() - age), stamp(Date.now() - age));

test("after the first build the catalogue reads the summary table, not the listings window", async () => {
  const e = env();
  for (let i = 0; i < 300; i++) add(e, { item: 2040000 + (i % 30), price: 100 + i, seller: "S" + i });
  const first = await marketCatalog(e);
  assert.equal(first.stats.open, 300);
  assert.equal(e.sqlite.prepare("SELECT COUNT(*) n FROM item_market").get().n, 30);
  e.resetReads();
  const again = await marketCatalog(e);
  assert.deepEqual(again.items.map((r) => [r.item, r.open, r.low, r.median]), first.items.map((r) => [r.item, r.open, r.low, r.median]));
  assert.ok(e.reads() < 120, `catalog read ${e.reads()} rows`);
});

test("a collector run refreshes only its items, and a summary older than a day shows nothing open", async () => {
  const e = env();
  add(e, { item: 1, price: 50 });
  add(e, { item: 2, price: 70 });
  await marketCatalog(e);
  add(e, { item: 1, price: 40, seller: "New" });
  await refreshItemMarket(e, [1]);
  const c = await marketCatalog(e);
  assert.equal(c.items.find((r) => r.item === 1).low, 40);
  assert.equal(c.items.find((r) => r.item === 2).low, 70);
  e.sqlite.exec(`UPDATE item_market SET last='${stamp(Date.now() - 2 * DAY)}' WHERE item=2`);
  const later = await marketCatalog(e);
  assert.equal(later.items.find((r) => r.item === 2).open, 0);
  assert.equal(later.items.find((r) => r.item === 2).low, null);
});

test("retention keeps every old price as a daily row before deleting raw listings, in chunks that merge", async () => {
  const e = env();
  const old = 40 * DAY;
  for (let i = 0; i < 7; i++) add(e, { item: 5, price: 100 + i * 10, seller: "O" + i, age: old });
  add(e, { item: 5, price: 999, sold: 1, seller: "Sold", age: old });
  add(e, { item: 5, price: 1, seller: "Recent", age: DAY });
  const n = await archiveListings(e, Date.now(), 30, 3);
  assert.equal(n, 8);
  assert.equal(e.sqlite.prepare("SELECT COUNT(*) n FROM listings").get().n, 1);
  const d = e.sqlite.prepare("SELECT * FROM item_daily").all();
  assert.equal(d.length, 1);
  assert.equal(d[0].n, 8);
  assert.equal(d[0].sold, 1);
  assert.equal(d[0].low, 100);
});

test("a failed archive chunk deletes nothing", async () => {
  const e = env();
  add(e, { item: 6, age: 40 * DAY });
  e.sqlite.exec("DROP TABLE item_daily");
  await assert.rejects(() => archiveListings(e));
  assert.equal(e.sqlite.prepare("SELECT COUNT(*) n FROM listings").get().n, 1);
});

test("megaphone stats come from one pass with the same shape as before", async () => {
  const e = env();
  e.sqlite.exec("DROP TABLE IF EXISTS megaphones; CREATE TABLE megaphones (id INTEGER PRIMARY KEY AUTOINCREMENT, seen_at TEXT NOT NULL, kind TEXT, color TEXT, channel INTEGER, nick TEXT NOT NULL, text TEXT NOT NULL, hash TEXT NOT NULL UNIQUE, item INTEGER, intent TEXT, price INTEGER)");
  const put = (age, nick, item, intent) => e.sqlite.prepare("INSERT INTO megaphones(seen_at,kind,nick,text,hash,item,intent) VALUES(datetime('now', ?),'m',?,'x',?,?,?)")
    .run(`-${age} seconds`, nick, Math.random().toString(36), item, intent);
  for (let i = 0; i < 4; i++) put(60 + i, "A", 7, "buy");
  put(70, "B", 7, "sell");
  put(80, "B", null, null);
  put(30 * 3600, "C", 7, "sell");
  const s = await megaphoneStats(e);
  assert.deepEqual(s.today, { n: 6, nicks: 2, withItem: 5 });
  assert.deepEqual(s.items[0], { item: 7, n: 5, sell: 1, buy: 4, before: 1 });
  assert.equal(s.wanted[0].item, 7);
  assert.deepEqual(s.callers[0], { nick: "A", n: 4, items: 1 });
  assert.equal(s.hourly.reduce((n, h) => n + h.n, 0), 6);
});
