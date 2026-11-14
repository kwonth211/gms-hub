// Read/write diet of the market store: per-item summary table, retention into item_daily, one-pass megaphone stats.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { marketCatalog, refreshItemMarket, archiveListings, dailyHistory, dayRow, reconcileItemMarket } from "../worker/src/market-browser.js";
import { megaphoneStats } from "../worker/src/megaphone.js";

const DAY = 86400000,
  stamp = (n) => new Date(n).toISOString().slice(0, 19).replace("T", " ");

function env() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of ["schema.sql", "migrations/0001_market_batch.sql", "migrations/0014_item_market.sql", "migrations/0015_item_daily_rollup.sql"])
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

test("retention keeps every old price as a daily row before deleting raw listings", async () => {
  const e = env();
  const old = 40 * DAY;
  for (let i = 0; i < 7; i++) add(e, { item: 5, price: 100 + i * 10, seller: "O" + i, age: old });
  add(e, { item: 5, price: 999, sold: 1, seller: "Sold", age: old });
  add(e, { item: 5, price: 1, seller: "Recent", age: DAY });
  const n = await archiveListings(e, Date.now(), 30);
  assert.equal(n, 8);
  assert.equal(e.sqlite.prepare("SELECT COUNT(*) n FROM listings").get().n, 1);
  const d = e.sqlite.prepare("SELECT * FROM item_daily").all();
  assert.equal(d.length, 1);
  assert.deepEqual({ ...d[0] }, { item: 5, day: stamp(Date.now() - old).slice(0, 10), low: 100, p25: 120, median: 130, p75: 150, high: 160, n: 7, sold: 1 });
});

test("retention never overwrites a day row written live", async () => {
  const e = env();
  add(e, { item: 5, price: 100, age: 40 * DAY });
  const day = stamp(Date.now() - 40 * DAY).slice(0, 10);
  e.sqlite.prepare("INSERT INTO item_daily (item,day,low,median,n,sold) VALUES (5,?,90,95,4,0)").run(day);
  await archiveListings(e);
  assert.deepEqual({ ...e.sqlite.prepare("SELECT low,median,n FROM item_daily").get() }, { low: 90, median: 95, n: 4 });
  assert.equal(e.sqlite.prepare("SELECT COUNT(*) n FROM listings").get().n, 0);
});

test("a refresh keeps today's day row current and the item history reads it instead of raw listings", async () => {
  const e = env();
  for (const [p, s] of [[100, "A"], [300, "B"], [200, "C"]]) add(e, { item: 9, price: p, seller: s });
  add(e, { item: 9, price: 50, seller: "D", sold: 1 });
  await refreshItemMarket(e, [9]);
  add(e, { item: 9, price: 400, seller: "E" });
  await refreshItemMarket(e, [9]);
  const today = stamp(Date.now()).slice(0, 10);
  if (stamp(Date.now() - 1000).slice(0, 10) !== today) return; // ran across midnight UTC
  const r = e.sqlite.prepare("SELECT * FROM item_daily WHERE item=9").get();
  assert.deepEqual([r.low, r.median, r.high, r.n, r.sold], [100, 250, 400, 4, 1]);
  assert.equal(e.sqlite.prepare("SELECT records FROM item_market WHERE item=9").get().records, 5);
  e.resetReads();
  const h = await dailyHistory(e, 9);
  assert.deepEqual(h.at(-1), { day: today, median: 250, p25: 200, p75: 300, low: 100, high: 400, n: 4, typical: null });
  assert.ok(e.reads() <= 2);
  // The daily safety net re-summarises everything seen in the last day without changing a correct row.
  assert.equal(await reconcileItemMarket(e), 1);
  assert.equal(e.sqlite.prepare("SELECT n FROM item_daily WHERE item=9").get().n, 4);
});

test("migration 0015 backfills day rows with the same quartiles the live rollup computes", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8"));
  const prices = [5, 1, 9, 3, 7, 11];
  prices.forEach((p, i) => db.prepare("INSERT INTO listings(item,price,sold,seller,channel,room,reporter,last_seen) VALUES(3,?,0,?,1,1,'t','2026-11-01 05:00:00')").run(p, "S" + i));
  db.prepare("INSERT INTO listings(item,price,sold,seller,channel,room,reporter,last_seen) VALUES(3,2,1,'X',1,1,'t','2026-11-01 06:00:00')").run();
  db.exec(fs.readFileSync(new URL("../worker/migrations/0015_item_daily_rollup.sql", import.meta.url), "utf8"));
  const got = { ...db.prepare("SELECT * FROM item_daily").get() };
  const want = dayRow(3, "2026-11-01", [...prices.map((price) => ({ price, sold: 0 })), { price: 2, sold: 1 }]);
  assert.deepEqual(got, want);
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
  // An hour later the day before comes from the stored hourly counts: only the last 24 hours are read again.
  e.resetReads();
  const later = await megaphoneStats(e, Date.now() + 3600000);
  assert.deepEqual(later.items[0], { item: 7, n: 5, sell: 1, buy: 4, before: 1 });
  assert.equal(later.today.n, 6);
  assert.equal(e.reads(), 7, "6 megaphones of the last day + the stored hours");
});

test("megaphone prices: OCR-split decimals and stat numbers", async () => {
  const { parseMegaphone } = await import("../worker/src/megaphone.js");
  for (const [t, p] of [["S> GFA 1 .9m or Best Of", 1900000], ["S> GFA 60% 1 .95m !", 1950000], ["S> C/o 1.7M", 1700000], ["S> 13M DEX glove 2m", 2000000], ["S> 380k ea", 380000]])
    assert.equal(parseMegaphone(t).price, p, t);
});
