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
export async function marketCatalog(env) {
  const now = Date.now(),
    since = stamp(now - 7 * DAY),
    current = stamp(now - DAY),
    end = stamp(now);
  const rows = await all(
    env,
    "SELECT item,price,sold,seller,channel,room,last_seen AS seen FROM listings WHERE last_seen >= ? AND last_seen <= ?",
    [since, end],
  );
  const reports = await all(
    env,
    "SELECT item,COUNT(*) AS reports FROM prices WHERE created_at >= ? AND created_at <= ? GROUP BY item",
    [since, end],
  );
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.item)) groups.set(r.item, []);
    groups.get(r.item).push(r);
  }
  for (const r of reports) if (!groups.has(r.item)) groups.set(r.item, []);
  const reportCounts = new Map(reports.map((r) => [r.item, r.reports]));
  // Reference prices cover items with no scans of our own, so the catalogue lists (nearly) every traded item.
  const refs = await all(env, "SELECT item, typical, day, week, sales FROM item_summary", []).catch(() => []);
  const refBy = new Map(refs.map((r) => [r.item, r]));
  for (const r of refs) if (!groups.has(r.item)) groups.set(r.item, []);
  const items = [...groups]
    .map(([item, rs]) => {
      const open = rs.filter((r) => !r.sold && r.seen >= current),
        sold = rs.filter((r) => r.sold && r.seen >= current);
      return {
        item,
        open: open.length,
        records: rs.length,
        reports: reportCounts.get(item) || 0,
        median: median(open.map((r) => r.price)),
        low: open.length ? Math.min(...open.map((r) => r.price)) : null,
        soldMedian: median(sold.map((r) => r.price)),
        sold: sold.length,
        shops: new Set(
          open.map((r) => JSON.stringify([r.seller, r.channel, r.room])),
        ).size,
        last: rs.reduce((a, r) => (r.seen > a ? r.seen : a), "") || null,
        typical: refBy.get(item)?.typical ?? null,
        typicalDay: refBy.get(item)?.day ?? null,
        sales: refBy.get(item)?.sales ?? null,
      };
    })
    .sort((a, b) => b.open - a.open || a.item - b.item);
  const open = rows.filter((r) => !r.sold && r.seen >= current);
  const recorded = await all(
    env,
    "SELECT DISTINCT item FROM listings WHERE last_seen>=? UNION SELECT DISTINCT item FROM prices WHERE created_at>=?",
    [stamp(now - 30 * DAY), stamp(now - 30 * DAY)],
  );
  return {
    asOf: new Date(now).toISOString(),
    windowDays: 7,
    items,
    recordedIds: recorded.map((r) => r.item),
    stats: {
      open: open.length,
      shops: new Set(
        open.map((r) => JSON.stringify([r.seller, r.channel, r.room])),
      ).size,
      items: items.length,
      records: rows.length,
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
    ["room", 40],
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
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM listings WHERE " + sqlWhere,
  )
    .bind(...args)
    .first();
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
    profile: current.slice(0, 10000),
    truncated: rows.length > limit,
    profileTruncated: current.length > 10000,
    limit,
    asOf: new Date().toISOString(),
  };
}
