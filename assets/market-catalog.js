import { indexEntry, searchEntries } from "./search-index.js";
export function categoryOf(it) {
  if (it.cat === "Cash") return "cash";
  if (Math.floor(it.id / 10000) === 204) return "scroll";
  if (Math.floor(it.id / 10000) === 207) return "stars";
  if (it.cat === "Equip")
    return it.id >= 1300000 && it.id < 1800000 ? "weapon" : "equip";
  return "other";
}
export function makeMarketIndex(rows, lang) {
  return rows.map(([id, ko, en, cat, sub, lv]) => {
    const it = {
      id,
      ko,
      en,
      cat,
      sub,
      lv,
      name: lang === "ko" ? ko || en : en,
    };
    it.category = categoryOf(it);
    it.entry = indexEntry({
      type: "item",
      id,
      title: it.name,
      names: [ko, en, String(id)],
      it,
    });
    return it;
  });
}
export function matchingIds(items, q) {
  return q.trim()
    ? searchEntries(
        items.map((it) => it.entry),
        q,
      ).map((r) => r.id)
    : null;
}
export function catalogRows(
  items,
  summaries,
  { query = "", category = "all", sort = "active", favorites = null } = {},
) {
  const byId = new Map(summaries.map((r) => [r.item, r])),
    matches = matchingIds(items, query),
    ids = matches ? new Set(matches) : null;
  const rows = items
    .filter(
      (it) =>
        (ids ? ids.has(it.id) : favorites ? favorites.has(it.id) : byId.has(it.id)) &&
        (category === "all" || it.category === category) &&
        (!favorites || favorites.has(it.id)),
    )
    .map((it) => ({
      ...it,
      ...(byId.get(it.id) || {
        item: it.id,
        open: 0,
        records: 0,
        reports: 0,
        median: null,
        low: null,
        last: null,
      }),
    }));
  const compare =
    {
      active: (a, b) => b.open - a.open || b.records - a.records,
      price: (a, b) => (a.median ?? Infinity) - (b.median ?? Infinity),
      low: (a, b) => (a.low ?? Infinity) - (b.low ?? Infinity),
      recent: (a, b) => (b.last || "").localeCompare(a.last || ""),
      name: (a, b) => a.name.localeCompare(b.name),
    }[sort] || ((a, b) => b.open - a.open);
  return rows.sort((a, b) => compare(a, b) || a.id - b.id);
}
