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
    "migrations/0004_trim_writes.sql",
    "migrations/0005_stop_history_copies.sql",
    "migrations/0019_item_options.sql",
    "migrations/0021_listing_gone.sql",
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
test('option history, daily prices, summary and listings use the same observed options', async () => {
  const e=env(), item=1050010, opts={stats:{LUK:18},slots:0,ups:8};
  for (const [price, observed] of [[100,opts],[300,opts],[2,{...opts,stats:{LUK:1}}],[5,{...opts,slots:1}],[7,null]]) {
    const id=add(e,{item,price,seller:'Seller'+price});
    e.sqlite.prepare('UPDATE listings SET opts=? WHERE id=?').run(observed?JSON.stringify(observed):null,id);
  }
  const q={opts:JSON.stringify(opts)};
  const h=await marketHistory(e,p({id:item,...q}));
  const list=await browseListings(e,p({item,...q}));
  assert.equal(h.filtered,true);
  assert.deepEqual(h.profile.map(x=>x.price),[100,300]);
  assert.deepEqual(list.rows.map(x=>x.price).sort((a,b)=>a-b),[100,300]);
  assert.equal(h.summary.median,200); assert.equal(h.summary.low,100); assert.equal(h.summary.open,2);
  assert.ok(h.rows.every(r=>r.price===100||r.price===300));
  assert.equal(h.daily.at(-1).median,200); assert.equal(h.daily.at(-1).n,2);
  const missing=await marketHistory(e,p({id:item,opts:JSON.stringify({stats:{LUK:99}})}));
  assert.deepEqual(missing.rows,[]);assert.deepEqual(missing.profile,[]);assert.deepEqual(missing.daily,[]);
  assert.equal(missing.summary.median,null);assert.equal(missing.summary.open,0);
  const single=await marketHistory(e,p({id:item,stat:'LUK',val:18}));
  assert.deepEqual(single.profile.map(r=>r.price),[5,100,300]);
  for(const bad of ['{}','{','{"stats":{"LUK":"18"}}']) await assert.rejects(marketHistory(e,p({id:item,opts:bad})),/bad opts/);
  await assert.rejects(marketHistory(e,p({id:item,stat:'unknown',val:18})),/bad stat/);
});
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
test("a listing seen again the same day is one point, corrections show the corrected key, depth counts one listing", async () => {
  const e = env(),
    id = add(e, { age: 3600000 }),
    after = stamp(Date.now() - 1000);
  e.sqlite.prepare("UPDATE listings SET last_seen=? WHERE id=?").run(after, id);
  e.sqlite.prepare("UPDATE listings SET last_seen=? WHERE id=?").run(after, id);
  let h = await marketHistory(e, p({ id: 2040801 }));
  assert.equal(h.rows.length, 1);
  assert.equal(h.rows[0].seen, after);
  assert.equal(h.profile.length, 1);
  const normalize = (rs) =>
    rs.map((r) => ({ ...r, t: Date.parse(r.seen.replace(" ", "T") + "Z") }));
  const a = analyzeMarket(normalize(h.rows), {
    profileRows: normalize(h.profile),
  });
  assert.equal(a.profile.total, 1);
  e.sqlite.exec("UPDATE listings SET room=4");
  h = await marketHistory(e, p({ id: 2040801 }));
  assert.equal(h.rows.length, 1);
  assert.equal(h.rows[0].room, 4);
  assert.equal(
    e.sqlite.prepare("SELECT COUNT(*) n FROM listing_history").get().n,
    0,
    "no copies are written any more",
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
  assert.equal(catalogRows(items, [], { favorites: new Set([2070002]) })[0].open, 0);
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
const SITE = { headers: { Origin: "https://gms-hub.com" } };
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
      (await worker.fetch(new Request("https://test" + path, SITE), e)).status,
      200,
    );
  // The listing feed answers pages on the site only: no Origin, a copied Referer or another site's Origin is refused.
  for (const headers of [{}, { Referer: "https://gms-hub.com/" }, { Origin: "https://example.com" }, { Origin: "https://gms-hub.com", "Sec-Fetch-Site": "same-origin" }])
    assert.equal(
      (await worker.fetch(new Request("https://test/market/listings", { headers }), e)).status,
      403,
    );
  // Every other public read is watched (owner, 2026-11-25): a call that does not come from a page of the site is
  // answered and counted as 'watch' for the dashboard; with API_GATE "on" it is refused. Pages of the site, verified
  // crawlers, the site build's key and the in-game shop collector's /prices lookups are neither counted nor refused.
  const seen = [], watch = { ...e, BLOCKS: { writeDataPoint: (p) => seen.push(`${p.blobs[0]} ${p.blobs[1]}`) } }, gate = { ...watch, API_GATE: "on" };
  const paths = ["/market/catalog", "/market/history?id=2040801", "/prices?ids=2040801", "/megaphones", "/market/item?id=2040801", "/listings/recent"];
  for (const path of paths)
    for (const headers of [{}, { Referer: "https://gms-hub.com/" }, { Origin: "https://example.com" }, { "X-Gms-Key": "wrong" }]) {
      assert.notEqual((await worker.fetch(new Request("https://test" + path, { headers }), watch)).status, 403, path);
      assert.equal((await worker.fetch(new Request("https://test" + path, { headers }), gate)).status, 403, path);
    }
  assert.equal(seen.filter((x) => x.startsWith("watch ")).length, paths.length * 4);
  assert.equal(seen.filter((x) => x.startsWith("outside ")).length, paths.length * 4);
  assert.ok(seen.includes("watch /market/catalog"));
  seen.length = 0;
  const crawler = new Request("https://test/market/catalog");
  Object.defineProperty(crawler, "cf", { value: { verifiedBotCategory: "Search Engine Crawler" } });
  for (const req of [new Request("https://test/market/catalog", SITE), new Request("https://test/market/catalog", { headers: { "X-Gms-Key": "build-key" } }), crawler, new Request("https://test/prices?ids=2040801", { headers: { "User-Agent": "shop-collector" } })])
    assert.equal((await worker.fetch(req, { ...gate, READ_KEY: "build-key" })).status, 200);
  assert.deepEqual(seen, []);
  assert.equal((await worker.fetch(new Request("https://test/market/catalog", { headers: { "User-Agent": "shop-collector" } }), gate)).status, 403);
  // Links opened directly and paths with their own credential are not behind the rule.
  assert.notEqual((await worker.fetch(new Request("https://test/internal/shop-scan", { method: "POST", body: "{}" }), e)).status, 403);
  assert.equal(
    (
      await worker.fetch(
        new Request("https://test/market/listings?channel=500", SITE),
        e,
      )
    ).status,
    400,
  );
  assert.equal(
    (await worker.fetch(new Request("https://test/market/history?id=no", SITE), e))
      .status,
    400,
  );
});

test("the NPC filter keeps items an NPC shop buys for at least 90% of the market price, best deal first", () => {
  const items = makeMarketIndex([[4000001, "부적", "Charm", "Etc", "", 0], [4000002, "석판", "Slate", "Etc", "", 0], [4000003, "원석", "Ore", "Etc", "", 0], [4000004, "뿔", "Horn", "Etc", "", 0]], "ko");
  const summaries = [
    { item: 4000001, open: 3, median: 20, low: 18 },
    { item: 4000002, open: 0, median: null, typical: 100 },
    { item: 4000003, open: 9, median: 1000, low: 900 },
    { item: 4000004, open: 1, median: 50, low: 50 },
  ];
  const sell = { 4000001: 24, 4000002: 92, 4000003: 10 };
  const rows = catalogRows(items, summaries, { category: "npc", npcSell: (id) => sell[id] || 0 });
  assert.deepEqual(rows.map((r) => r.id), [4000001, 4000002]);
  assert.equal(catalogRows(items, summaries, { category: "npc" }).length, 0, "no NPC prices, nothing claimed");
  assert.equal(catalogRows(items, summaries).length, 4, "other views unchanged");
});

test('"팔렸어요" reports show on a listing until a later sighting replaces them', async () => {
  const e = env();
  const id = add(e, { age: 30 * 60000 });
  e.sqlite.prepare('UPDATE listings SET gone_n = 2, gone_at = ? WHERE id = ?').run(stamp(Date.now() - 60000), id);
  let row = (await browseListings(e, p({ item: 2040801 }))).rows.find((r) => r.id === id);
  assert.equal(row.goneN, 2);
  e.sqlite.prepare('UPDATE listings SET last_seen = ? WHERE id = ?').run(stamp(Date.now() - 1000), id);
  row = (await browseListings(e, p({ item: 2040801 }))).rows.find((r) => r.id === id);
  assert.equal(row.goneN, undefined);
});

test('observed equipment values filter matching listings and totals before pagination; missing values do not equal zero', async () => {
  const e = env(), item = 1050006;
  const wanted = { stats: { INT: 21, PDD: 57 }, slots: 0, ups: 6 };
  let seller = 0;
  const insert = (opts, extra = {}) => {
    const id = add(e, { item, seller: `OptionSeller${++seller}`, ...extra });
    e.sqlite.prepare('UPDATE listings SET opts=? WHERE id=?').run(opts ? JSON.stringify(opts) : null, id);
    return id;
  };
  const first = insert(wanted, { price: 100 });
  const second = insert({ ...wanted, stats: { ...wanted.stats, MMP: 20 } }, { price: 200 });
  insert({ ...wanted, stats: { INT: 20, PDD: 57 } });
  insert({ ...wanted, stats: { INT: 21, PDD: 58 } });
  insert({ ...wanted, slots: 1 });
  insert({ stats: wanted.stats, ups: 6 });
  insert({ ...wanted, ups: 5 });
  insert(null);
  insert(wanted, { item: 1050007 });
  for (const [page, id] of [[1, first], [2, second]]) {
    const r = await browseListings(e, p({ item, opts: JSON.stringify(wanted), limit: 1, page, sort: 'price' }));
    assert.equal(r.total, 2);
    assert.equal(r.pages, 2);
    assert.deepEqual(r.rows.map((r) => r.id), [id]);
  }
  assert.equal((await browseListings(e, p({ item, opts: '{"stats":{"INT":22}}' }))).total, 0);
  for (const query of [{ item, opts: '{' }, { item, opts: '{}' }, { item, opts: '{"stats":{"FAKE":1}}' }, { opts: JSON.stringify(wanted) }, { item: 0, opts: JSON.stringify(wanted) }]) {
    await assert.rejects(() => browseListings(e, p(query)), /bad/);
  }
});
