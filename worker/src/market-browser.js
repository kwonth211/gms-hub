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

const marketUpsert = (env, m) =>
  env.DB.prepare(`INSERT INTO item_market (item,open,records,median,low,sold_median,sold,shops,last,at)
    VALUES (?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT (item) DO UPDATE SET open=excluded.open, records=excluded.records,
    median=excluded.median, low=excluded.low, sold_median=excluded.sold_median, sold=excluded.sold, shops=excluded.shops,
    last=excluded.last, at=excluded.at`).bind(m.item, m.open, m.records, m.median, m.low, m.soldMedian, m.sold, m.shops, m.last);

// Called after a collector run: only the items in that run are re-read (through the (item,last_seen) index) and rewritten.
export async function refreshItemMarket(env, ids, now = Date.now()) {
  const list = [...new Set(ids)].filter(Number.isInteger);
  if (!list.length) return 0;
  const since = stamp(now - 7 * DAY), current = stamp(now - DAY);
  const rows = await all(env,
    `SELECT item,price,sold,seller,channel,room,last_seen AS seen FROM listings WHERE item IN (${list.map(() => "?").join(",")}) AND last_seen >= ? AND last_seen <= ?`,
    [...list, since, stamp(now)]);
  const by = new Map(list.map((id) => [id, []]));
  for (const r of rows) by.get(r.item)?.push(r);
  await runAll(env, [...by].map(([item, rs]) => marketUpsert(env, summarizeItem(item, rs, current))));
  return list.length;
}

// Distinct open shops across all items: one scan of the last day, kept 30 minutes.
export async function openShops(env, current) {
  const kept = await env.DB.prepare("SELECT json, at FROM snapshots WHERE key = 'market-shops'").first().catch(() => null);
  if (kept && Date.now() - Date.parse(`${kept.at.replace(" ", "T")}Z`) < 30 * 60000) return JSON.parse(kept.json);
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
    for (let i = 0; i < sums.length; i += 50) await runAll(env, sums.slice(i, i + 50).map((m) => marketUpsert(env, m))).catch(() => null);
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

// Price history per day for the item panel, over everything kept (at most 120 days): the asking median, low and high of
// the listings seen that day (a listing counts on the day it was last seen) and the reference "typical" price saved once
// a day in item_summary_daily. Days without either are left out, so gaps in collection stay visible as gaps.
export async function dailyHistory(env, item) {
  const since = stamp(Date.now() - 120 * DAY);
  const [listed, typical] = await Promise.all([
    all(env, "SELECT substr(last_seen,1,10) AS day, price FROM listings WHERE item=? AND sold=0 AND last_seen>=?", [item, since]),
    all(env, "SELECT day, typical FROM item_summary_daily WHERE item=? AND day>=?", [item, since.slice(0, 10)]),
  ]);
  const byDay = new Map();
  for (const r of listed) (byDay.get(r.day) || byDay.set(r.day, []).get(r.day)).push(r.price);
  const days = new Set([...byDay.keys(), ...typical.map((r) => r.day)]);
  const typ = new Map(typical.map((r) => [r.day, r.typical]));
  return [...days].sort().map((day) => {
    const ps = (byDay.get(day) || []).sort((a, b) => a - b);
    const q = (f) => (ps.length ? ps[Math.min(ps.length - 1, Math.floor(f * (ps.length - 1) + 0.5))] : null);
    const mid = ps.length ? (ps.length % 2 ? ps[ps.length >> 1] : Math.round((ps[ps.length / 2 - 1] + ps[ps.length / 2]) / 2)) : null;
    // p25-p75 is the day's "typical range" band, as on MesoWatch.
    return { day, median: mid, p25: q(0.25), p75: q(0.75), low: ps[0] ?? null, high: ps.at(-1) ?? null, n: ps.length, typical: typ.get(day) ?? null };
  });
}

// Retention: listings not seen for 30 days are folded into item_daily (one row per item and day) and then deleted, in
// one transaction per chunk, so no price history is lost and the hot table stays small. Runs once a day.
export async function archiveListings(env, now = Date.now(), keepDays = 30, chunk = 500) {
  const cutoff = stamp(now - keepDays * DAY);
  let archived = 0;
  for (let round = 0; round < 20; round++) {
    const rows = await all(env, "SELECT id,item,price,sold,last_seen AS seen FROM listings WHERE last_seen < ? ORDER BY last_seen LIMIT ?", [cutoff, chunk]);
    if (!rows.length) break;
    const g = new Map();
    for (const r of rows) {
      const k = `${r.item}|${r.seen.slice(0, 10)}`;
      (g.get(k) || g.set(k, []).get(k)).push(r);
    }
    const stmts = [...g.values()].map((rs) => {
      const asks = rs.filter((r) => !r.sold).map((r) => r.price);
      // Merge with a row an earlier chunk may already have written for the same item/day (count adds up; low keeps the minimum).
      return env.DB.prepare(`INSERT INTO item_daily (item,day,low,median,n,sold) VALUES (?,?,?,?,?,?)
        ON CONFLICT (item,day) DO UPDATE SET low=MIN(COALESCE(item_daily.low,excluded.low),COALESCE(excluded.low,item_daily.low)),
        median=COALESCE(item_daily.median,excluded.median), n=item_daily.n+excluded.n, sold=item_daily.sold+excluded.sold`)
        .bind(rs[0].item, rs[0].seen.slice(0, 10), asks.length ? Math.min(...asks) : null, median(asks), rs.length, rs.length - asks.length);
    });
    const ids = rows.map((r) => r.id);
    stmts.push(env.DB.prepare(`DELETE FROM listings WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids));
    await runAll(env, stmts);
    archived += rows.length;
    if (rows.length < chunk) break;
  }
  // Collector run receipts only matter for today's budget and a short audit trail.
  await env.DB.prepare("DELETE FROM market_batch_runs WHERE received_at < datetime('now','-30 days')").run().catch(() => null);
  return archived;
}
