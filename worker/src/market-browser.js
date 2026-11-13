// Browsable market data. Asking listings, retained observations and anonymous price reports are distinct datasets.
const DAY = 86400000;
const stamp = (n) => new Date(n).toISOString().slice(0, 19).replace("T", " ");
const median = (xs) => {
  if (!xs.length) return null;
  const a = [...xs].sort((a, b) => a - b),
    m = a.length >> 1;
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
};
const all = (env, sql, args = []) =>
  env.DB.prepare(sql)
    .bind(...args)
    .all()
    .then((r) => r.results);
// Summary of one item's listings: open = asking within the last day, records = everything in the 7-day window.
export function summarizeItem(item, rs, current) {
  const open = rs.filter((r) => !r.sold && r.seen >= current),
    sold = rs.filter((r) => r.sold && r.seen >= current);
  return {
    item,
    open: open.length,
    records: rs.length,
    median: median(open.map((r) => r.price)),
    low: open.length ? Math.min(...open.map((r) => r.price)) : null,
    soldMedian: median(sold.map((r) => r.price)),
    sold: sold.length,
    shops: new Set(open.map((r) => JSON.stringify([r.seller, r.channel, r.room]))).size,
    last: rs.reduce((a, r) => (r.seen > a ? r.seen : a), "") || null,
  };
}

// D1 runs a batch as one transaction; the test double may not have batch(), so fall back to running in order.
const runAll = async (env, stmts) => {
  if (!stmts.length) return [];
  if (typeof env.DB.batch === "function") return env.DB.batch(stmts);
  const out = [];
  for (const st of stmts) out.push(await st.run());
  return out;
};

// records = observations over the last 7 days, summed from item_daily (at most 7 small rows) instead of re-reading a
// week of raw listings on every collector run. last keeps its old value when the item has nothing in the last day.
// Unchanged rows are not rewritten (an unchanged upsert would still cost a write).
const marketUpsert = (env, m, since) =>
  env.DB.prepare(`INSERT INTO item_market (item,open,records,median,low,sold_median,sold,shops,last,at)
    VALUES (?1,?2,COALESCE((SELECT SUM(n+sold) FROM item_daily WHERE item=?1 AND day>=?10),?3),?4,?5,?6,?7,?8,?9,datetime('now'))
    ON CONFLICT (item) DO UPDATE SET open=excluded.open, records=excluded.records,
    median=excluded.median, low=excluded.low, sold_median=excluded.sold_median, sold=excluded.sold, shops=excluded.shops,
    last=COALESCE(excluded.last, item_market.last), at=excluded.at
    WHERE excluded.open IS NOT item_market.open OR excluded.records IS NOT item_market.records OR excluded.median IS NOT item_market.median
      OR excluded.low IS NOT item_market.low OR excluded.sold_median IS NOT item_market.sold_median OR excluded.sold IS NOT item_market.sold
      OR excluded.shops IS NOT item_market.shops OR COALESCE(excluded.last, item_market.last) IS NOT item_market.last`)
    .bind(m.item, m.open, m.records, m.median, m.low, m.soldMedian, m.sold, m.shops, m.last, since);

// One item's day in item_daily: quartiles of the asking prices seen that day (same picks as the charts always used).
export function dayRow(item, day, rs) {
  const ps = rs.filter((r) => !r.sold).map((r) => r.price).sort((a, b) => a - b);
  const q = (f) => (ps.length ? ps[Math.min(ps.length - 1, Math.floor(f * (ps.length - 1) + 0.5))] : null);
  return { item, day, low: ps[0] ?? null, p25: q(0.25), median: median(ps), p75: q(0.75), high: ps.at(-1) ?? null, n: ps.length, sold: rs.length - ps.length };
}
// replace=true: today's row is recomputed from all of today's sightings. replace=false (retention, gap filling) never
// touches a day that already has a row, so frozen past days are never overwritten with a partial view.
const dailyUpsert = (env, d, replace) =>
  env.DB.prepare(`INSERT INTO item_daily (item,day,low,p25,median,p75,high,n,sold) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT (item,day) DO ${replace ? `UPDATE SET low=excluded.low, p25=excluded.p25, median=excluded.median, p75=excluded.p75,
      high=excluded.high, n=excluded.n, sold=excluded.sold
      WHERE excluded.n IS NOT item_daily.n OR excluded.sold IS NOT item_daily.sold OR excluded.low IS NOT item_daily.low
        OR excluded.p25 IS NOT item_daily.p25 OR excluded.median IS NOT item_daily.median OR excluded.p75 IS NOT item_daily.p75
        OR excluded.high IS NOT item_daily.high` : "NOTHING"}`)
    .bind(d.item, d.day, d.low, d.p25, d.median, d.p75, d.high, d.n, d.sold);

// Called after every write of listings (collector run, player upload): only those items are re-read, and only their
// last day of listings (through the (item,last_seen) index). One transaction updates today's daily row first, then the
// summary row that sums the week from it. Ids go in as one JSON parameter (D1 allows 100 bound parameters a query).
export async function refreshItemMarket(env, ids, now = Date.now()) {
  const list = [...new Set(ids)].filter(Number.isInteger);
  if (!list.length) return 0;
  const current = stamp(now - DAY), today = stamp(now).slice(0, 10), week = stamp(now - 6 * DAY).slice(0, 10);
  const rows = await all(env,
    "SELECT item,price,sold,seller,channel,room,last_seen AS seen FROM listings WHERE item IN (SELECT value FROM json_each(?)) AND last_seen >= ? AND last_seen <= ?",
    [JSON.stringify(list), current, stamp(now)]);
  const by = new Map(list.map((id) => [id, []]));
  for (const r of rows) by.get(r.item)?.push(r);
  const stmts = [];
  for (const [item, rs] of by) {
    const todays = rs.filter((r) => r.seen >= today);
    if (todays.length) stmts.push(dailyUpsert(env, dayRow(item, today, todays), true));
  }
  for (const [item, rs] of by) stmts.push(marketUpsert(env, summarizeItem(item, rs, current), week));
  for (let i = 0; i < stmts.length; i += 100) await runAll(env, stmts.slice(i, i + 100));
  return list.length;
}

// Safety net, once a day: every item seen in the last day is re-summarised, in case a refresh after a write failed.
export async function reconcileItemMarket(env, now = Date.now()) {
  const ids = await all(env, "SELECT DISTINCT item FROM listings WHERE last_seen >= ? AND last_seen <= ?", [stamp(now - DAY), stamp(now)]);
  for (let i = 0; i < ids.length; i += 60) await refreshItemMarket(env, ids.slice(i, i + 60).map((r) => r.item), now);
  return ids.length;
}

// Distinct open shops across all items: one scan of the last day, kept 2 hours.
export async function openShops(env, current) {
  const kept = await env.DB.prepare("SELECT json, at FROM snapshots WHERE key = 'market-shops'").first().catch(() => null);
  if (kept && Date.now() - Date.parse(`${kept.at.replace(" ", "T")}Z`) < 120 * 60000) return JSON.parse(kept.json);
  const r = await env.DB.prepare("SELECT COUNT(DISTINCT seller || '|' || channel || '|' || room) AS n FROM listings WHERE last_seen >= ? AND last_seen <= ? AND sold = 0").bind(current, stamp(Date.now())).first();
  await env.DB.prepare("INSERT OR REPLACE INTO snapshots (key,json,at) VALUES ('market-shops',?,datetime('now'))").bind(JSON.stringify(r.n)).run();
  return r.n;
}

export async function marketCatalog(env) {
  const now = Date.now(),
    since = stamp(now - 7 * DAY),
    current = stamp(now - DAY),
    end = stamp(now);
  let sums = await all(env, "SELECT item,open,records,median,low,sold_median AS soldMedian,sold,shops,last FROM item_market WHERE last >= ? AND last <= ?", [since, end]).catch(() => null);
  let rows = null;
  if (!sums || !sums.length) {
    // First run (empty table): one full scan fills item_market; after that the collector keeps it current.
    rows = await all(env, "SELECT item,price,sold,seller,channel,room,last_seen AS seen FROM listings WHERE last_seen >= ? AND last_seen <= ?", [since, end]);
    const g = new Map();
    for (const r of rows) (g.get(r.item) || g.set(r.item, []).get(r.item)).push(r);
    sums = [...g].map(([item, rs]) => summarizeItem(item, rs, current));
    for (let i = 0; i < sums.length; i += 50) await runAll(env, sums.slice(i, i + 50).map((m) => marketUpsert(env, m, stamp(now - 6 * DAY).slice(0, 10)))).catch(() => null);
  }
  // A row last refreshed more than a day ago has no open listings left, whatever it said when it was written.
  for (const m of sums) if (!m.last || m.last < current) Object.assign(m, { open: 0, median: null, low: null, soldMedian: null, sold: 0, shops: 0 });
  const reports = await all(
    env,
    "SELECT item,COUNT(*) AS reports FROM prices WHERE created_at >= ? AND created_at <= ? GROUP BY item",
    [since, end],
  );
  const groups = new Map(sums.map((m) => [m.item, m]));
  for (const r of reports) if (!groups.has(r.item)) groups.set(r.item, null);
  const reportCounts = new Map(reports.map((r) => [r.item, r.reports]));
  // Reference prices cover items with no scans of our own, so the catalogue lists (nearly) every traded item.
  const refs = await all(env, "SELECT item, typical, day, week, sales FROM item_summary", []).catch(() => []);
  const refBy = new Map(refs.map((r) => [r.item, r]));
  for (const r of refs) if (!groups.has(r.item)) groups.set(r.item, null);
  const items = [...groups]
    .map(([item, m]) => ({
      ...(m || { item, open: 0, records: 0, median: null, low: null, soldMedian: null, sold: 0, shops: 0, last: null }),
      reports: reportCounts.get(item) || 0,
      typical: refBy.get(item)?.typical ?? null,
      typicalDay: refBy.get(item)?.day ?? null,
      sales: refBy.get(item)?.sales ?? null,
    }))
    .sort((a, b) => b.open - a.open || a.item - b.item);
  // The 30-day "ever recorded" id list only grows and scans the whole window, so it is kept six hours in snapshots
  // instead of being recomputed with every catalog refresh.
  const kept = await env.DB.prepare("SELECT json, at FROM snapshots WHERE key = 'market-recorded'").first();
  let recorded = kept && Date.now() - Date.parse(`${kept.at.replace(" ", "T")}Z`) < 6 * 3600000 ? JSON.parse(kept.json) : null;
  if (!recorded) {
    recorded = await all(
      env,
      "SELECT DISTINCT item FROM listings WHERE last_seen>=? UNION SELECT DISTINCT item FROM prices WHERE created_at>=?",
      [stamp(now - 30 * DAY), stamp(now - 30 * DAY)],
    );
    await env.DB.prepare("INSERT OR REPLACE INTO snapshots (key,json,at) VALUES ('market-recorded',?,datetime('now'))").bind(JSON.stringify(recorded)).run();
  }
  const fresh = new Set(sums.map((m) => m.item));
  for (const r of recorded) fresh.delete(r.item);
  for (const item of fresh) recorded.push({ item });
  return {
    asOf: new Date(now).toISOString(),
    windowDays: 7,
    items,
    recordedIds: recorded.map((r) => r.item),
    stats: {
      open: sums.reduce((n, m) => n + m.open, 0),
      shops: await openShops(env, current),
      items: items.length,
      records: sums.reduce((n, m) => n + m.records, 0),
    },
  };
}
function integer(p, key, min, max, fallback) {
  if (!p.has(key) || p.get(key) === "") return fallback;
  const n = Number(p.get(key));
  if (!Number.isInteger(n) || n < min || n > max) throw new Error("bad " + key);
  return n;
}
export async function browseListings(env, p) {
  const now = Date.now(),
    days = integer(p, "days", 1, 30, 7),
    limit = integer(p, "limit", 1, 100, 50),
    page = integer(p, "page", 1, 100000, 1);
  const state = p.get("state") || "open",
    sort = p.get("sort") || "recent";
  if (
    !["open", "sold", "stale", "all"].includes(state) ||
    !["recent", "price", "high"].includes(sort)
  )
    throw Error("bad filter");
  const args = [stamp(now - days * DAY), stamp(now)],
    where = ["last_seen >= ?", "last_seen <= ?"];
  if (p.has("since")) {
    const since = Date.parse(p.get("since"));
    if (
      !Number.isFinite(since) ||
      since > now ||
      since < now - days * DAY - 60000
    )
      throw Error("bad since");
    where.push("last_seen >= ?");
    args.push(stamp(since));
  }
  // One lower bound, the tightest: with two, SQLite could range-scan the whole 7-day window to answer a 1-day question.
  if (state === "open") {
    where.push("sold=0");
    if (args[0] < stamp(now - DAY)) args[0] = stamp(now - DAY);
  }
  if (state === "sold") where.push("sold=1");
  if (state === "stale") {
    where.push("sold=0", "last_seen < ?");
    args.push(stamp(now - DAY));
  }
  for (const [key, max] of [
    ["channel", 40],
    ["room", 101],
    ["item", 9999999],
  ]) {
    const n = integer(p, key, key === "item" ? 1000000 : 1, max, null);
    if (n !== null) {
      where.push(key + " = ?");
      args.push(n);
    }
  }
  if (p.has("ids")) {
    const ids = p.get("ids").split(",").map(Number);
    if (
      ids.length > 200 ||
      ids.some((n) => !Number.isInteger(n) || n < 1000000 || n > 9999999)
    )
      throw Error("bad ids");
    where.push("item IN (SELECT value FROM json_each(?))");
    args.push(JSON.stringify(ids));
  }
  const seller = p.get("seller") || "";
  if (seller) {
    if (!/^[A-Za-z0-9]{1,13}$/.test(seller)) throw Error("bad seller");
    where.push(
      p.get("exact") === "1"
        ? "seller = ? COLLATE NOCASE"
        : "seller LIKE ? ESCAPE '\\'",
    );
    args.push(p.get("exact") === "1" ? seller : "%" + seller + "%");
  }
  for (const [key, op] of [
    ["min", ">="],
    ["max", "<="],
  ]) {
    const n = integer(p, key, 1, 1e10, null);
    if (n !== null) {
      where.push("price " + op + " ?");
      args.push(n);
    }
  }
  const sqlWhere = where.join(" AND "),
    order =
      sort === "price"
        ? "price ASC, last_seen DESC, id DESC"
        : sort === "high"
          ? "price DESC, last_seen DESC, id DESC"
          : "last_seen DESC, id DESC";
  // The total is only for the pager, and counting scans the whole window (5-15k index rows a call: the biggest read on
  // the account once the market page got busy). Counts for plain views (no seller, price or since filter) are kept
  // for ten minutes in the snapshots table; filtered views count live, their windows are small.
  const plain = !p.has("since") && !p.get("seller") && !p.has("min") && !p.has("max") && !p.has("item");
  const countKey = `listings-count:${state}:${days}`;
  let count = null;
  if (plain) {
    const row = await env.DB.prepare("SELECT json, at FROM snapshots WHERE key = ?").bind(countKey).first().catch(() => null);
    if (row && now - Date.parse(row.at.replace(" ", "T") + "Z") < 10 * 60000) count = JSON.parse(row.json);
  }
  if (!count) {
    count = await env.DB.prepare("SELECT COUNT(*) AS n FROM listings WHERE " + sqlWhere).bind(...args).first();
    if (plain) await env.DB.prepare("INSERT OR REPLACE INTO snapshots (key,json,at) VALUES (?,?,datetime('now'))").bind(countKey, JSON.stringify({ n: count.n })).run().catch(() => {});
  }
  const rows = await all(
    env,
    "SELECT id,item,price,qty,sold,seller,channel,room,first_seen AS firstSeen,last_seen AS seen FROM listings WHERE " +
      sqlWhere +
      " ORDER BY " +
      order +
      " LIMIT ? OFFSET ?",
    [...args, limit, (page - 1) * limit],
  );
  return {
    asOf: new Date(now).toISOString(),
    rows,
    total: count.n,
    page,
    limit,
    pages: Math.ceil(count.n / limit),
    state,
    days,
  };
}
export async function browseReports(env, p) {
  const limit = integer(p, "limit", 1, 100, 50),
    page = integer(p, "page", 1, 100000, 1),
    days = integer(p, "days", 1, 30, 7),
    item = integer(p, "item", 1000000, 9999999, null);
  const args = [stamp(Date.now() - days * DAY), stamp(Date.now())],
    where = ["created_at >= ?", "created_at <= ?"];
  if (item) {
    where.push("item=?");
    args.push(item);
  }
  const kind = p.get("kind");
  if (kind) {
    if (!["selling", "sold", "buying"].includes(kind)) throw Error("bad kind");
    where.push("kind=?");
    args.push(kind);
  }
  if (p.has("ids")) {
    const ids = p.get("ids").split(",").map(Number);
    if (
      ids.length > 200 ||
      ids.some((n) => !Number.isInteger(n) || n < 1000000 || n > 9999999)
    )
      throw Error("bad ids");
    where.push("item IN (SELECT value FROM json_each(?))");
    args.push(JSON.stringify(ids));
  }
  const sqlWhere = where.join(" AND ");
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM prices WHERE " + sqlWhere,
  )
    .bind(...args)
    .first();
  const rows = await all(
    env,
    "SELECT id,item,price,kind,created_at AS seen FROM prices WHERE " +
      sqlWhere +
      " ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",
    [...args, limit, (page - 1) * limit],
  );
  return {
    rows,
    total: count.n,
    page,
    limit,
    pages: Math.ceil(count.n / limit),
    days,
    asOf: new Date().toISOString(),
  };
}
// A listing keeps one price for its whole life (a new price is a new listing), so first_seen..last_seen says it was on
// sale every day in between. Charts get one point per listing per day from that span instead of a stored copy of every
// rescan, which cost about half of all database writes. A sold listing is "sold" only on its last day.
// One point per listing per period (a day by default; the home sparkline also asks for hours) it was on sale.
export function dailyPoints(rows, now, days, span = DAY) {
  const out = [];
  for (const r of rows) {
    const first = Date.parse(`${(r.first_seen || r.seen).replace(" ", "T")}Z`),
      last = Date.parse(`${r.seen.replace(" ", "T")}Z`);
    for (let d = 0; d < days; d++) {
      const to = now - d * span,
        from = to - span;
      if (first > to || last <= from) continue;
      const t = Math.min(last, to);
      out.push({ ...r, sold: r.sold && last <= to && last > from ? 1 : 0, seen: stamp(t) });
    }
  }
  return out;
}
export async function marketHistory(env, p) {
  const item = integer(p, "id", 1000000, 9999999, null);
  if (!item) throw Error("bad item");
  const since = stamp(Date.now() - 7 * DAY),
    end = stamp(Date.now()),
    limit = 5000;
  const now = Date.now();
  const listed = await all(
    env,
    "SELECT price,qty,sold,seller,channel,room,first_seen,last_seen AS seen FROM listings WHERE item=? AND last_seen>=? AND first_seen<=?",
    [item, since, end],
  );
  const rows = dailyPoints(listed, now, 7)
    .map(({ first_seen, ...r }) => r)
    .sort((a, b) => (a.seen < b.seen ? 1 : a.seen > b.seen ? -1 : a.seller < b.seller ? -1 : a.seller > b.seller ? 1 : a.price - b.price));
  const current = await all(
    env,
    "SELECT price,qty,sold,seller,channel,room,last_seen AS seen FROM listings WHERE item=? AND sold=0 AND last_seen>=? AND last_seen<=? ORDER BY price ASC,id ASC LIMIT 10001",
    [item, stamp(Date.now() - DAY), end],
  );
  return {
    item,
    rows: rows.slice(0, limit),
    daily: await dailyHistory(env, item),
    profile: current.slice(0, 10000),
    truncated: rows.length > limit,
    profileTruncated: current.length > 10000,
    limit,
    asOf: new Date().toISOString(),
  };
}

// Price history per day for the item panel, over everything kept (at most 120 days): the asking median, quartiles,
// low and high of each day from item_daily (one small row per day, kept current by every collector run) and the
// reference "typical" price saved once a day in item_summary_daily. Days without either are left out, so gaps in
// collection stay visible as gaps.
export async function dailyHistory(env, item) {
  const since = stamp(Date.now() - 120 * DAY).slice(0, 10);
  const [listed, typical] = await Promise.all([
    all(env, "SELECT day, low, p25, median, p75, high, n FROM item_daily WHERE item=? AND day>=? AND n>0", [item, since]),
    all(env, "SELECT day, typical FROM item_summary_daily WHERE item=? AND day>=?", [item, since]),
  ]);
  const byDay = new Map(listed.map((r) => [r.day, r]));
  const typ = new Map(typical.map((r) => [r.day, r.typical]));
  const days = new Set([...byDay.keys(), ...typ.keys()]);
  return [...days].sort().map((day) => {
    const r = byDay.get(day);
    // p25-p75 is the day's "typical range" band, as on MesoWatch.
    return { day, median: r?.median ?? null, p25: r?.p25 ?? null, p75: r?.p75 ?? null, low: r?.low ?? null, high: r?.high ?? null, n: r?.n ?? 0, typical: typ.get(day) ?? null };
  });
}

// Retention: listings not seen for 30 days are deleted one UTC day at a time. Their day rows normally exist already
// (written live); any missing one is filled from the raw rows first (never overwriting), and the delete runs only after
// every fill succeeded, so no price history is lost. Day ranges, not id lists, keep each query far below D1's
// 100-parameter limit. Runs once a day; a backlog drains a few days per run.
export async function archiveListings(env, now = Date.now(), keepDays = 30, maxDays = 5) {
  const cutoff = stamp(now - keepDays * DAY);
  let archived = 0;
  for (let round = 0; round < maxDays; round++) {
    const first = await env.DB.prepare("SELECT last_seen AS seen FROM listings WHERE last_seen < ? ORDER BY last_seen LIMIT 1").bind(cutoff).first();
    if (!first) break;
    const day = first.seen.slice(0, 10), from = `${day} 00:00:00`;
    const next = stamp(Date.parse(`${day}T00:00:00Z`) + DAY);
    const to = next < cutoff ? next : cutoff;
    const rows = await all(env, "SELECT item,price,sold FROM listings WHERE last_seen >= ? AND last_seen < ?", [from, to]);
    const g = new Map();
    for (const r of rows) (g.get(r.item) || g.set(r.item, []).get(r.item)).push(r);
    const fills = [...g].map(([item, rs]) => dailyUpsert(env, dayRow(item, day, rs), false));
    for (let i = 0; i < fills.length; i += 100) await runAll(env, fills.slice(i, i + 100));
    const del = await env.DB.prepare("DELETE FROM listings WHERE last_seen >= ? AND last_seen < ?").bind(from, to).run();
    archived += del?.meta?.changes ?? rows.length;
  }
  // Collector run receipts only matter for today's budget and a short audit trail.
  await env.DB.prepare("DELETE FROM market_batch_runs WHERE received_at < datetime('now','-30 days')").run().catch(() => null);
  return archived;
}
