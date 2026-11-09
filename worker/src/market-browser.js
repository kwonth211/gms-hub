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
  if (state === "open") {
    where.push("sold=0", "last_seen >= ?");
    args.push(stamp(now - DAY));
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
export async function marketHistory(env, p) {
  const item = integer(p, "id", 1000000, 9999999, null);
  if (!item) throw Error("bad item");
  const since = stamp(Date.now() - 7 * DAY),
    end = stamp(Date.now()),
    limit = 5000;
  // UNION removes the overlap between the old batch archive and the universal listing-history triggers.
  // Corrected keys no longer join their old observations, so an OCR correction cannot pollute the chart.
  const rows = await all(
    env,
    `SELECT price,qty,sold,seller,channel,room,seen FROM (
    SELECT h.price,h.qty,h.sold,h.seller,h.channel,h.room,h.seen FROM listing_history h
    JOIN listings l ON l.id=h.listing_id AND l.item=h.item AND l.price=h.price AND l.seller=h.seller AND l.channel=h.channel AND l.room=h.room
    WHERE h.item=? AND h.seen>=? AND h.seen<=?
    UNION
    SELECT o.price,1,0,o.seller,o.channel,o.room,o.seen FROM market_observations o
    JOIN listings l ON l.item=o.item AND l.price=o.price AND l.seller=o.seller AND l.channel=o.channel AND l.room=o.room
    WHERE o.item=? AND o.seen>=? AND o.seen<=?
  ) ORDER BY seen DESC, seller, price, channel, room LIMIT ?`,
    [item, since, end, item, since, end, limit + 1],
  );
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
