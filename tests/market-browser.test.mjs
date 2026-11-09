import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../worker/src/index.js";
import {
  marketCatalog,
  browseListings,
  marketHistory,
  browseReports,
} from "../worker/src/market-browser.js";
import { makeMarketIndex, catalogRows } from "../assets/market-catalog.js";
import { analyzeMarket } from "../assets/market-analytics.js";
const DAY = 86400000,
  stamp = (n) => new Date(n).toISOString().slice(0, 19).replace("T", " ");
function env() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of [
    "schema.sql",
    "migrations/0001_market_batch.sql",
    "migrations/0002_listing_history.sql",
  ])
    sqlite.exec(
      fs.readFileSync(new URL("../worker/" + file, import.meta.url), "utf8"),
    );
  const DB = {
    prepare(sql, args = []) {
      return {
        bind(...a) {
          return DB.prepare(sql, a);
        },
        async first() {
          return sqlite.prepare(sql).get(...args) || null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...args) };
        },
        async run() {
          return {
            meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) },
          };
        },
      };
    },
  };
  return { DB, sqlite };
}
function add(
  e,
  {
    item = 2040801,
    price = 100,
    qty = 1,
    sold = 0,
    seller = "Seller",
    channel = 1,
    room = 1,
    age = 1000,
  } = {},
) {
  return Number(
    e.sqlite
      .prepare(
        "INSERT INTO listings(item,price,qty,sold,seller,channel,room,reporter,last_seen) VALUES (?,?,?,?,?,?,?,'test',?)",
      )
      .run(
        item,
        price,
        qty,
        sold,
        seller,
        channel,
        room,
        stamp(Date.now() - age),
      ).lastInsertRowid,
  );
}
const p = (o) => new URLSearchParams(o);
test("catalog includes every recorded item and reports, while shop counters count actual recent listings only", async () => {
  const e = env();
  for (let i = 0; i < 125; i++)
    add(e, { item: 2040000 + i, seller: "Seller" + i });
  add(e, { item: 2070002, age: 2 * DAY });
  add(e, { item: 2070003, age: 31 * DAY });
  add(e, { item: 2070004, age: -DAY });
  e.sqlite.exec(
    "INSERT INTO prices(item,price,kind,reporter) VALUES(4000000,500,'buying','private-hash')",
  );
  const c = await marketCatalog(e);
  assert.equal(c.items.length, 127);
  assert.equal(c.stats.open, 125);
  assert.equal(c.stats.shops, 125);
  assert.equal(c.stats.records, 126);
  assert.equal(c.items.find((r) => r.item === 4000000).reports, 1);
  assert.ok(!JSON.stringify(c).includes("private-hash"));
});
test("pagination reaches all listings beyond the old 60/400 caps; extremes remain visible and sorting is global", async () => {
  const e = env();
  for (let i = 0; i < 421; i++) add(e, { price: 100 + i, seller: "S" + i });
  add(e, { price: 1, seller: "Cheapest", age: 6 * 3600000 });
  add(e, { price: 1e9, seller: "Expensive" });
  let ids = [];
  for (let page = 1; page <= 9; page++) {
    const r = await browseListings(e, p({ page, limit: 50, sort: "price" }));
    assert.equal(r.total, 423);
    ids.push(...r.rows.map((r) => r.id));
    if (page === 1) assert.equal(r.rows[0].seller, "Cheapest");
    if (page === 9) assert.equal(r.rows.at(-1).seller, "Expensive");
  }
  assert.equal(new Set(ids).size, 423);
});
test("seller, location, status and price-band time filters apply before pagination", async () => {
  const e = env();
  add(e);
  add(e, { seller: "Seller2", channel: 2 });
  add(e, { price: 110, room: 2 });
  add(e, { price: 120, age: 2 * DAY });
  add(e, { price: 130, sold: 1 });
  add(e, { price: 140, age: 2 * 3600000 });
  assert.equal(
    (
      await browseListings(
        e,
        p({ seller: "Seller", exact: 1, channel: 1, room: 1, state: "open" }),
      )
    ).total,
    2,
  );
  assert.equal((await browseListings(e, p({ state: "all" }))).total, 6);
  assert.equal((await browseListings(e, p({ state: "stale" }))).total, 1);
  assert.equal((await browseListings(e, p({ state: "sold" }))).total, 1);
  assert.equal(
    (
      await browseListings(
        e,
        p({
          state: "open",
          min: 100,
          max: 150,
          since: new Date(Date.now() - 3600000).toISOString(),
        }),
      )
    ).total,
    3,
  );
  assert.equal(
    (
      await browseListings(
        e,
        p({
          ids: Array.from({ length: 200 }, (_, i) => 2040801 + i).join(","),
        }),
      )
    ).total,
    4,
  );
  for (const q of [
    { seller: "' OR 1=1--" },
    { page: 0 },
    { channel: 41 },
    { sort: "price;DELETE" },
    { since: "no" },
  ])
    await assert.rejects(() => browseListings(e, p(q)), /bad /);
});
test("retained observations survive re-scans, overlaps deduplicate, corrections exclude wrong keys, depth counts one listing", async () => {
  const e = env(),
    id = add(e, { age: 3600000 }),
    before = stamp(Date.now() - 3600000),
    after = stamp(Date.now() - 1000);
  e.sqlite.prepare("UPDATE listings SET last_seen=? WHERE id=?").run(after, id);
  e.sqlite.prepare("UPDATE listings SET last_seen=? WHERE id=?").run(after, id);
  e.sqlite
    .prepare(
      "INSERT INTO market_observations VALUES(2040801,100,'Seller',1,1,?,'batch')",
    )
    .run(before);
  let h = await marketHistory(e, p({ id: 2040801 }));
  assert.equal(h.rows.length, 2);
  assert.equal(h.profile.length, 1);
  const normalize = (rs) =>
    rs.map((r) => ({ ...r, t: Date.parse(r.seen.replace(" ", "T") + "Z") }));
  const a = analyzeMarket(normalize(h.rows), {
    profileRows: normalize(h.profile),
  });
  assert.equal(a.profile.total, 1);
  assert.equal(a.rows.length, 2);
  e.sqlite.exec("UPDATE listings SET room=4");
  h = await marketHistory(e, p({ id: 2040801 }));
  assert.equal(h.rows.length, 1);
  assert.equal(h.rows[0].room, 4);
  assert.equal(
    e.sqlite.prepare("SELECT COUNT(*) n FROM listing_history").get().n,
    3,
  );
});
test("anonymous price reports expose no identity and never masquerade as shops", async () => {
  const e = env();
  e.sqlite.exec(
    "INSERT INTO prices(item,price,kind,reporter) VALUES(2040801,50,'sold','secret-hash'),(2040801,60,'buying','secret-hash')",
  );
  const r = await browseReports(e, p({ kind: "sold" }));
  assert.equal(r.total, 1);
  assert.equal(r.rows[0].kind, "sold");
  assert.ok(!JSON.stringify(r).includes("secret-hash"));
  assert.equal((await browseListings(e, p({}))).total, 0);
});
test("catalog searching, categories, favorites and price sort retain all known matching items", () => {
  const items = makeMarketIndex(
    [
      [
        2040801,
        "장갑 공격력 주문서",
        "Gloves Attack Scroll: Intermediate",
        "Use",
      ],
      [2070002, "목비 표창", "Mokbi Throwing Stars", "Use"],
      [1372000, "페어리 완드", "Fairy Wand", "Equip"],
      [5051001, "", "SP Reset Scroll", "Cash"],
    ],
    "ko",
  );
  const summaries = items.map((it, i) => ({
    item: it.id,
    open: i,
    records: 1,
    median: i ? 100 * i : null,
    low: i ? 90 * i : null,
  }));
  assert.equal(catalogRows(items, summaries).length, 4);
  assert.equal(catalogRows(items, summaries, { query: "장공" })[0].id, 2040801);
  assert.equal(
    catalogRows(items, summaries, { category: "stars" })[0].id,
    2070002,
  );
  assert.equal(
    catalogRows(items, summaries, { favorites: new Set([5051001]) })[0].id,
    5051001,
  );
  assert.equal(
    catalogRows(items, summaries, { sort: "price" }).at(-1).id,
    2040801,
  );
});
test("public routes return validation errors and page metadata instead of silently falling back to newest rows", async () => {
  const e = env();
  add(e);
  for (const path of [
    "/market/catalog",
    "/market/listings",
    "/market/reports",
    "/market/history?id=2040801",
  ])
    assert.equal(
      (await worker.fetch(new Request("https://test" + path), e)).status,
      200,
    );
  assert.equal(
    (
      await worker.fetch(
        new Request("https://test/market/listings?channel=500"),
        e,
      )
    ).status,
    400,
  );
  assert.equal(
    (await worker.fetch(new Request("https://test/market/history?id=no"), e))
      .status,
    400,
  );
});
