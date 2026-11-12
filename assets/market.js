import './collection-status.js';
import { DAY, parseUtc, newMark } from "./market-data.js";
import { KERNING, placeLabel } from "./place.js";
import { makeMarketIndex, catalogRows, matchingIds } from "./market-catalog.js";
import { mountMarketCharts } from "./market-charts.js";
import { WISHLIST_KEY, RECENT_KEY, SEEN_KEY, WISHLIST_MAX, readList, addRecent, removeRecent, toggleWishlist, snapshot, visitDelta, pruneSeen } from "./market-memory.js";
const D = JSON.parse(document.getElementById("mk-data").textContent),
  T = D.t,
  ko = D.lang === "ko";
const $ = (id) => document.getElementById(id),
  tr = (a, b) => (ko ? a : tx(b)),
  nf = new Intl.NumberFormat(D.lang);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) => (n == null ? "—" : nf.format(n)),
  icon = (id, size = 28) =>
    `<img src="https://maplestory.io/api/MCW/1/item/${id}/icon" alt="" width="${size}" height="${size}" loading="lazy">`;
// Korean pages show absolute times in Korea Standard Time whatever the device clock says; other languages use the viewer's zone.
const TZ = ko ? { timeZone: "Asia/Seoul" } : {};
const date = (s) => new Date(parseUtc(s)).toLocaleString(D.lang, TZ) + (ko ? " KST" : "");
const clock = (ms) => new Date(ms).toLocaleTimeString(D.lang, TZ) + (ko ? " KST" : "");
const ago = (s) => {
  if (!s) return "—";
  const m = Math.max(0, Math.floor((Date.now() - parseUtc(s)) / 60000));
  return m < 1
    ? tr("방금", "now")
    : m < 60
      ? tr(`${m}분 전`, `${m}m ago`)
      : m < 1440
        ? tr(`${Math.floor(m / 60)}시간 전`, `${Math.floor(m / 60)}h ago`)
        : tr(`${Math.floor(m / 1440)}일 전`, `${Math.floor(m / 1440)}d ago`);
};
const when = (s) =>
  s
    ? `<time datetime="${esc(s.replace(" ", "T") + "Z")}" title="${esc(date(s))}">${ago(s)}</time>`
    : "—";
let items = [],
  byId = new Map(),
  catalog = null,
  view = "listings",
  category = "all",
  page = 1,
  selected = null,
  chart = null,
  detailState = {
    state: "open",
    sort: "price",
    channel: "",
    room: "",
    seller: "",
    page: 1,
  },
  detailTab = "listings",
  priceBand = null;
let listSeq = 0,
  detailSeq = 0,
  shopSeq = 0,
  listAbort,
  detailAbort,
  refreshing = false,
  debounce,
  shopContext;
// Browser memory: wishlist, recently opened items and the price snapshot from the last visit. Storage may be missing
// or full (private mode, quota); every write reports whether it stuck so the UI can say so instead of pretending.
const stored = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const persist = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};
let favorites = new Set(readList(stored(WISHLIST_KEY)));
let recent = readList(stored(RECENT_KEY));
let seen = {};
try {
  const v = JSON.parse(stored(SEEN_KEY) || "{}");
  if (v && typeof v === "object" && !Array.isArray(v)) seen = v;
} catch {}
// The item whose first detail load should be reported, and where the visitor found it (search, wishlist, recent, link…).
let pendingOpen = null;
let noResultTimer, lastNoResult = "";
const categories = {
  scroll: tr("주문서", "Scrolls"),
  weapon: tr("무기", "Weapons"),
  equip: tr("장비", "Equips"),
  stars: tr("표창", "Stars"),
  cash: tr("캐시", "Cash"),
  other: tr("소비·기타", "Use & other"),
};
async function get(path, signal) {
  const r = await fetch(D.api + path, { signal });
  if (!r.ok) throw Error("HTTP " + r.status);
  return r.json();
}
function itemName(id) {
  return byId.get(id)?.name || `#${id}`;
}
function itemLink(id) {
  return `<a class="mb-item-link" href="?item=${id}" data-item="${id}">${icon(id)}<span>${esc(itemName(id))}</span></a>`;
}
function starButton(id, extra = "") {
  return `<button class="mb-star ${extra}" type="button" data-favorite="${id}" aria-pressed="${favorites.has(id)}" aria-label="${esc(itemName(id))} ${tr("관심 아이템", "wishlist")}" title="${favorites.has(id) ? tr("관심 아이템에서 빼기", "Remove from wishlist") : tr("관심 아이템에 넣기", "Add to wishlist")}">${favorites.has(id) ? "★" : "☆"}</button>`;
}
// Wishlist shortcut and recently opened items, shown under the search box so a returning visitor is one tap from the
// item they were watching. Both lists live only in this browser.
function renderMine() {
  const box = $("mb-mine");
  recent = recent.filter((id) => byId.has(id));
  const wish = [...favorites].filter((id) => byId.has(id));
  box.hidden = !wish.length && !recent.length;
  if (box.hidden) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = `${wish.length ? `<button type="button" class="chip mb-mine-wish" data-show-wishlist aria-pressed="${view === "items" && $("mb-favorites").checked}">★ ${tr(`관심 아이템 ${wish.length}`, `Wishlist · ${wish.length}`)}</button>` : ""}${recent.length ? `<span class="mb-mine-label">${tr("최근 본", "Recent")}</span>${recent.map((id) => `<span class="chip mb-recent-chip ${id === selected ? "selected" : ""}"><a href="?item=${id}" data-item="${id}" data-source="recent">${icon(id, 18)}${esc(itemName(id))}</a><button type="button" data-forget="${id}" aria-label="${esc(itemName(id))} ${tr("최근 목록에서 삭제", "remove from recent")}">×</button></span>`).join("")}<button type="button" class="mb-mine-clear" data-forget="all">${tr("최근 목록 지우기", "Clear recent")}</button>` : ""}`;
}
function rememberOpen(id) {
  recent = addRecent(recent, id);
  persist(RECENT_KEY, recent);
  renderMine();
}
// Honest "since your last visit": only when a comparable snapshot exists (see market-memory.js), then store today's.
function visitNote(id) {
  const cur = snapshot(catalog?.items.find((x) => x.item === id), catalog ? Date.parse(catalog.asOf) : Date.now());
  const d = visitDelta(seen[id], cur);
  seen = pruneSeen({ ...seen, [id]: cur }, [...favorites, ...recent, id]);
  persist(SEEN_KEY, seen);
  if (!d) return "";
  const pct = d.pct > 0 ? `+${d.pct}%` : `${d.pct}%`, since = ago(new Date(d.since).toISOString());
  return `<p class="mb-visit-note muted note">${ko
    ? `지난 확인(${since}) 이후 판매가 중앙값 ${money(d.from)} → ${money(d.to)} (${pct}) · 24시간 판매 중 매물 기준`
    : `${tx("Since your last look")} (${since}): ${tx("asking median {from} → {to} ({pct}) · 24h open listings", { from: money(d.from), to: money(d.to), pct })}`}</p>`;
}
function noResults(term) {
  clearTimeout(noResultTimer);
  if (!term || term === lastNoResult) return;
  noResultTimer = setTimeout(() => {
    lastNoResult = term;
    track("market_no_results", { search_term: term.slice(0, 40), view, category, lang: D.lang });
  }, 1200);
}
function pager(data, scope) {
  if (data.pages <= 1) return "";
  return `<button class="btn ghost small-btn" type="button" data-page="${data.page - 1}" data-scope="${scope}" ${data.page <= 1 ? "disabled" : ""}>${tr("이전", "Previous")}</button><span>${data.page} / ${data.pages}</span><button class="btn ghost small-btn" type="button" data-page="${data.page + 1}" data-scope="${scope}" ${data.page >= data.pages ? "disabled" : ""}>${tr("다음", "Next")}</button>`;
}
function listingTable(rows, { showItem = true, shopButtons = true } = {}) {
  if (!rows.length)
    return `<p class="market-empty">${tr("조건에 맞는 매물이 없어요. 검색어나 필터를 바꿔 보세요.", "No listings match. Try changing the search or filters.")}</p>`;
  return `<div class="mb-table-wrap"><table class="mb-table mb-listings-table"><thead><tr>${showItem ? `<th>${tr("아이템", "Item")}</th>` : ""}<th>${tr("가격", "Price")}<small>${T.priceUnit}</small></th><th>${tr("수량", "Qty")}</th><th>${T.table.seller}</th><th>${T.table.where}</th><th>${tr("최근 확인", "Last seen")}</th></tr></thead><tbody>${rows.map((r) => `<tr>${showItem ? `<td class="mb-cell-item">${itemLink(r.item)}</td>` : ""}<td class="num mb-cell-price">${money(r.price)}${r.qty > 1 ? `<small>${T.total} ${money(r.price * r.qty)}</small>` : ""}</td><td class="mb-cell-qty"><span class="mb-mobile-label">${tr("수량", "Qty")} </span>${money(r.qty)}</td><td class="mb-cell-seller">${shopButtons ? `<button type="button" class="mb-seller" data-shop="${esc(r.seller)}" data-ch="${r.channel}" data-room="${r.room}" title="${tr("이 상점에서 확인한 매물 보기", "View recorded listings from this shop")}">${esc(r.seller)} ↗</button>` : esc(r.seller)}</td><td class="mb-cell-location"><span class="where">CH ${r.channel}</span> <span class="where">${placeLabel(r.room, ko)}</span></td><td class="mb-cell-seen">${newMark(r.seen)}${when(r.seen)}<small class="${r.sold ? "mb-sold" : ""}">${r.sold ? tr("판매 완료 표시", "Marked sold") : Date.now() - parseUtc(r.seen) >= DAY ? tr("24시간 경과", "Over 24h old") : tr("판매 중 관측", "Seen for sale")}</small></td></tr>`).join("")}</tbody></table></div>`;
}
// Every browsing filter lives in the address, so refresh, back and a copied link reopen the same view.
// Defaults are left out to keep plain visits on the canonical URL.
const URL_FIELDS = [
  ["state", "mb-state", "open"], ["sort", "mb-list-sort", "recent"], ["seller", "mb-seller", ""],
  ["ch", "mb-channel", ""], ["room", "mb-room", ""], ["days", "mb-days", "7"],
  ["kind", "mb-report-kind", ""], ["isort", "mb-item-sort", "active"],
];
function syncURL() {
  const p = new URLSearchParams(location.search);
  for (const k of ["item", "view", "q", "cat", "page", "fav", ...URL_FIELDS.map((f) => f[0])]) p.delete(k);
  if (selected) p.set("item", selected);
  if (view !== "listings" || selected) p.set("view", view);
  const q = $("mk-q").value.trim();
  if (q) p.set("q", q);
  if (category !== "all") p.set("cat", category);
  if (page > 1) p.set("page", page);
  if ($("mb-favorites").checked) p.set("fav", "1");
  for (const [key, id, def] of URL_FIELDS) if ($(id).value && $(id).value !== def) p.set(key, $(id).value);
  history.replaceState(null, "", location.pathname + (p.size ? "?" + p : ""));
}
function restoreFilters(p) {
  for (const [key, id] of URL_FIELDS) {
    const v = p.get(key);
    if (v == null) continue;
    const el = $(id);
    if (el.tagName === "SELECT" ? [...el.options].some((o) => o.value === v) : /^[A-Za-z0-9]{0,13}$/.test(v)) el.value = v;
  }
  if (p.get("cat") && ["scroll", "weapon", "equip", "stars", "cash", "other"].includes(p.get("cat"))) {
    category = p.get("cat");
    document.querySelectorAll("[data-category]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.category === category));
  }
  if (p.get("fav") === "1") $("mb-favorites").checked = true;
  const n = Number(p.get("page"));
  if (Number.isInteger(n) && n > 1 && n < 100000) page = n;
}
function closeItem() {
  detailSeq++;
  detailAbort?.abort();
  selected = null;
  chart?.destroy();
  chart = null;
  $("mk-detail").hidden = true;
  $("mb-workspace").classList.remove("has-selection");
  syncURL();
  renderDirectory();
}
function renderDirectory() {
  if (view !== "items" || !catalog) return;
  const rows = catalogRows(items, catalog.items, {
    query: $("mk-q").value,
    category,
    sort: $("mb-item-sort").value,
    favorites: $("mb-favorites").checked ? favorites : null,
  });
  const pages = Math.ceil(rows.length / 40);
  page = Math.max(1, Math.min(page, pages || 1));
  $("mb-count").textContent = tr(
    `아이템 ${nf.format(rows.length)}종 · ${catalog.windowDays}일 기록`,
    `${nf.format(rows.length)} items · ${catalog.windowDays}d records`,
  );
  const start = (page - 1) * 40;
  $("mb-results").innerHTML = rows.length
    ? `<div class="mb-table-wrap"><table class="mb-table mb-catalog"><thead><tr><th><span class="sr-only">${tr("관심", "Wishlist")}</span>☆</th><th>${tr("아이템", "Item")}</th><th>${tr("판매가 중앙값 / 최저가", "Asking median / lowest")}<small>${T.priceUnit} · 24h</small></th><th>${tr("판매 매물", "Asking")}</th><th>${tr("최근 확인", "Last seen")}</th></tr></thead><tbody>${rows
        .slice(start, start + 40)
        .map(
          (r) =>
            `<tr class="${r.id === selected ? "selected" : ""}"><td>${starButton(r.id)}</td><td>${itemLink(r.id)}<small>${categories[r.category]}${r.reports ? ` · ${tr("가격 제보", "Reports")} ${r.reports}` : ""}</small></td><td class="num">${r.median == null && r.typical ? `${money(r.typical)}<small>${tr("대표 시세", "Typical")}</small>` : `${money(r.median)}<small>${tr("최저", "Low")} ${money(r.low)}</small>`}</td><td><strong>${r.open}</strong><small>${r.records ? `${tr("기록", "Records")} ${r.records}` : r.sales ? `${tr("판매", "Sales")} ${money(r.sales)}` : `${tr("기록", "Records")} 0`}</small></td><td>${r.last ? newMark(r.last) : ""}${when(r.last)}</td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : categoryMiss() || `<div class="market-empty"><strong>${tr("표시할 아이템이 없어요.", "No matching items.")}</strong><p>${$("mb-favorites").checked ? tr("별표를 눌러 관심 아이템을 저장해 보세요.", "Use the star to save items to your wishlist.") : T.noMatches}</p>${$("mk-q").value.trim() ? `<p><button type="button" class="btn ghost small-btn" data-clear-search>${tr("검색어 지우기", "Clear search")}</button> <button type="button" class="btn ghost small-btn" data-view="listings">${tr("매물 목록에서 찾기", "Search listings instead")}</button></p>` : ""}</div>`;
  if (!rows.length && !$("mb-favorites").checked) noResults($("mk-q").value.trim());
  $("mb-pagination").innerHTML = pager({ page, pages }, "main");
  $("mb-results").setAttribute("aria-busy", "false");
  renderMine();
}
// What the count line is counting, so "listings" never reads as "every record" when a status filter is on.
function scopeLabel() {
  const state = view === "listings" ? $("mb-state").value : "all", days = $("mb-days").value;
  if (view === "reports") return tr(`가격 제보 · 최근 ${days}일`, `Price reports · last ${days}d`);
  return {
    open: tr("판매 중 매물 · 최근 24시간", "Asking listings · last 24h"),
    all: tr(`전체 기록 · 최근 ${days}일`, `All records · last ${days}d`),
    sold: tr(`판매 완료 표시 · 최근 ${days}일`, `Marked sold · last ${days}d`),
    stale: tr(`24시간 경과 매물 · 최근 ${days}일`, `Over 24h old · last ${days}d`),
  }[state];
}
// When a category hides every match of the search, say so and offer the other categories instead of "no such item".
function categoryMiss() {
  if (category === "all" || !$("mk-q").value.trim()) return "";
  const matches = matchingIds(items, $("mk-q").value) || [];
  const counts = {};
  for (const id of matches) { const c = byId.get(id)?.category; if (c) counts[c] = (counts[c] || 0) + 1; }
  const others = Object.entries(counts).filter(([c]) => c !== category).sort((a, b) => b[1] - a[1]);
  if (!others.length) return "";
  return `<div class="market-empty"><strong>${(ko ? `'${categories[category]}' 분류에는 이 검색어와 맞는 아이템이 없어요.` : tx("No '{cat}' items match this search.", { cat: categories[category] }))}</strong><p>${tr("다른 분류에서 찾았어요:", "Found in other categories:")} ${others.map(([c, n]) => `<button type="button" class="btn ghost small-btn" data-category="${c}">${categories[c]} ${n}</button>`).join(" ")} <button type="button" class="btn ghost small-btn" data-category="all">${tr("전체 분류", "All categories")}</button></p></div>`;
}
function filteredIds() {
  const matches = matchingIds(items, $("mk-q").value);
  const recorded = new Set(
    catalog?.recordedIds || catalog?.items.map((r) => r.item) || [],
  );
  return items
    .filter(
      (it) =>
        recorded.has(it.id) &&
        (!matches || matches.includes(it.id)) &&
        (category === "all" || category === it.category),
    )
    .map((it) => it.id);
}
async function renderRecords() {
  const seq = ++listSeq;
  listAbort?.abort();
  listAbort = new AbortController();
  $("mb-results").setAttribute("aria-busy", "true");
  $("mb-count").textContent = T.loading;
  if (
    view === "listings" &&
    $("mb-seller").value &&
    !/^[A-Za-z0-9]{1,13}$/.test($("mb-seller").value)
  ) {
    $("mb-results").innerHTML =
      `<p role="alert">${tr("판매자 닉네임은 영문과 숫자로 검색해 주세요.", "Search seller nicknames with letters and numbers.")}</p>`;
    $("mb-count").textContent = "";
    $("mb-pagination").innerHTML = "";
    $("mb-results").setAttribute("aria-busy", "false");
    return;
  }
  const p = new URLSearchParams({ page, limit: 50, days: $("mb-days").value });
  const filtering = $("mk-q").value.trim() || category !== "all";
  if (filtering) {
    const ids = filteredIds();
    if (!ids.length) {
      $("mb-results").innerHTML = categoryMiss() || `<div class="market-empty"><strong>${T.noMatches}</strong><p>${tr("최근 30일에 기록된 아이템만 찾을 수 있어요. 한글·영문·초성·약어(장공, 귀힘)로도 검색돼요.", "Only items recorded in the last 30 days can be found. Korean, English, initials and common abbreviations all work.")}</p><p><button type="button" class="btn ghost small-btn" data-clear-search>${tr("검색어 지우기", "Clear search")}</button> <button type="button" class="btn ghost small-btn" data-view="items">${tr("아이템 목록 보기", "Browse items")}</button></p></div>`;
      noResults($("mk-q").value.trim());
      $("mb-count").textContent = "0";
      $("mb-pagination").innerHTML = "";
      $("mb-results").setAttribute("aria-busy", "false");
      return;
    }
    if (ids.length > 200) {
      $("mb-results").innerHTML =
        `<p class="market-empty">${tr("아이템 이름을 조금 더 입력해 주세요.", "Narrow the item name to refine this search.")}</p>`;
      $("mb-count").textContent = "";
      $("mb-results").setAttribute("aria-busy", "false");
      $("mb-pagination").innerHTML = "";
      return;
    }
    p.set("ids", ids.join(","));
  }
  if (view === "reports") {
    if ($("mb-report-kind").value) p.set("kind", $("mb-report-kind").value);
  } else {
    for (const [key, id] of [
      ["state", "mb-state"],
      ["sort", "mb-list-sort"],
      ["seller", "mb-seller"],
      ["channel", "mb-channel"],
      ["room", "mb-room"],
    ])
      if ($(id).value) p.set(key, $(id).value);
  }
  const target = view;
  try {
    const data = await get(
      `/market/${target === "reports" ? "reports" : "listings"}?${p}`,
      listAbort.signal,
    );
    if (seq !== listSeq) return;
    if (page > 1 && page > data.pages) {
      page = Math.max(1, data.pages);
      return renderRecords();
    }
    // Built from separately translated pieces so derived locales can translate each part.
    const first = data.total ? (page - 1) * data.limit + 1 : 0, last = Math.min(page * data.limit, data.total);
    $("mb-count").textContent = [
      scopeLabel(),
      tr(`${nf.format(data.total)}건`, `${nf.format(data.total)} records`),
      data.total ? tr(`${first}–${last}건 표시`, `showing ${first}–${last}`) : "",
      ko ? `${ago(data.asOf)} 기준` : `${tx("as of")} ${ago(data.asOf)}`,
    ].filter(Boolean).join(" · ");
    if (!data.total && $("mk-q").value.trim()) noResults($("mk-q").value.trim());
    $("mb-results").innerHTML =
      target === "reports"
        ? data.rows.length
          ? `<div class="mb-table-wrap"><table class="mb-table"><thead><tr><th>${tr("아이템", "Item")}</th><th>${T.table.price}</th><th>${tr("제보 종류", "Report type")}</th><th>${tr("제보 시각", "Reported")}</th></tr></thead><tbody>${data.rows.map((r) => `<tr><td>${itemLink(r.item)}</td><td class="num">${money(r.price)}</td><td>${{ selling: tr("판매가", "Asking"), sold: tr("판매 완료", "Sold"), buying: tr("구매 희망", "Buying") }[r.kind]}</td><td>${when(r.seen)}</td></tr>`).join("")}</tbody></table></div>`
          : `<div class="market-empty"><strong>${tr("이 조건의 가격 제보가 없어요.", "No price reports match.")}</strong><p>${tr("가격 제보는 아이템 시세 페이지에서 직접 남긴 기록이에요. 상점에서 확인된 매물은 매물 목록 탭에 있어요.", "Price reports are prices players entered on item pages. Listings seen in shops are in the Listings tab.")} <button type="button" class="btn ghost small-btn" data-view="listings">${tr("매물 목록 보기", "Open listings")}</button></p></div>`
        : listingTable(data.rows);
    $("mb-pagination").innerHTML = pager(data, "main");
  } catch (e) {
    if (e.name !== "AbortError" && seq === listSeq) {
      $("mb-results").innerHTML =
        `<p role="alert">${T.failed}</p><button class="btn small-btn" data-retry-list>${T.retry}</button>`;
      $("mb-count").textContent = "";
      $("mb-pagination").innerHTML = "";
    }
  } finally {
    if (seq === listSeq) $("mb-results").setAttribute("aria-busy", "false");
  }
}
function renderMain() {
  if (!items.length) return;
  syncURL();
  $("mb-range").hidden = view === "items" || (view === "listings" && $("mb-state").value === "open");
  view === "items" ? renderDirectory() : renderRecords();
}
function setView(next, keepPage = false) {
  view = next;
  if (!keepPage) page = 1;
  listSeq++;
  listAbort?.abort();
  document.querySelectorAll("[data-view]").forEach((b) => {
    const on = b.dataset.view === view;
    b.setAttribute("aria-selected", on);
    b.tabIndex = on ? 0 : -1;
  });
  $("mb-browser").setAttribute("aria-labelledby", "mb-tab-" + view);
  $("mb-item-controls").hidden = view !== "items";
  $("mb-list-controls").hidden = view !== "listings";
  $("mb-report-controls").hidden = view !== "reports";
  $("mb-range").hidden = view === "items";
  $("mb-list-note").textContent =
    view === "reports"
      ? tr(
          "판매자·위치가 없는 가격 제보예요. 방문 가능한 상점 매물과 구분해서 보여 줍니다.",
          "Price reports without seller/location details are separate from visitable shop listings.",
        )
      : view === "items"
        ? tr(
            "최근 7일에 모인 아이템 목록이에요. 아이템을 누르면 판매자별 매물이 열립니다.",
            "Items recorded in the last 7 days. Select one to see sellers and shop listings.",
          )
        : tr(
            "기본은 최근 24시간에 판매 중으로 확인된 매물이에요. 상태를 ‘전체 기록’으로 바꾸면 7·30일 기록을 모두 페이지별로 볼 수 있어요. 표시 가격은 판매자가 부른 가격이며 실제 거래가가 아니에요.",
            "By default: listings seen for sale in the last 24 hours. Switch Status to “All records” to page through 7 or 30 days. Prices are what sellers ask, not confirmed trades.",
          );
  syncURL();
  renderMine();
  renderMain();
}
const selectLocation = (type, value) =>
  `<option value="">${type === "channel" ? T.filterChannel : T.filterRoom}</option>${Array.from({ length: 40 }, (_, i) => `<option value="${i + 1}" ${String(i + 1) === String(value) ? "selected" : ""}>${type === "channel" ? "CH" : "FM"} ${i + 1}</option>`).join("")}${type === "channel" ? "" : `<option value="${KERNING}" ${String(KERNING) === String(value) ? "selected" : ""}>${placeLabel(KERNING, ko)}</option>`}`;
function detailPanels() {
  for (const key of ["listings", "charts"]) {
    $("mb-detail-" + key).hidden = detailTab !== key;
    const button = document.querySelector(`[data-detail-tab="${key}"]`);
    button?.setAttribute("aria-selected", detailTab === key);
    if (button) button.tabIndex = detailTab === key ? 0 : -1;
  }
}
async function loadItem(id, { reset = true, source = "list" } = {}) {
  const it = byId.get(id);
  if (!it) return;
  const changed = selected !== id;
  selected = id;
  if (changed) {
    pendingOpen = { id, source };
    rememberOpen(id);
  }
  const seq = ++detailSeq;
  detailAbort?.abort();
  detailAbort = new AbortController();
  chart?.destroy();
  chart = null;
  priceBand = null;
  if (reset || changed) {
    detailState = {
      state: "open",
      sort: "price",
      channel: "",
      room: "",
      seller: "",
      page: 1,
    };
    detailTab = "listings";
  }
  syncURL();
  $("mk-detail").hidden = false;
  $("mb-workspace").classList.add("has-selection");
  renderDirectory();
  const s = catalog?.items.find((x) => x.item === id),
    stats = s
      ? `<dl class="mb-detail-stats"><div><dt>${tr("판매가 중앙값", "Asking median")}</dt><dd>${money(s.median)} <small>${T.priceUnit}</small></dd></div><div><dt>${tr("최저 판매가", "Lowest ask")}</dt><dd>${money(s.low)}</dd></div><div><dt>${tr("판매 매물 · 24h", "Asking · 24h")}</dt><dd>${s.open}</dd></div></dl>`
      : "";
  const pageLink = D.itemPaths?.[id] ? `<a class="mb-item-page" href="${esc(D.itemPaths[id])}">${esc(D.itemLink)}</a>` : "";
  $("mk-detail").innerHTML =
    `<header class="mk-head">${icon(id, 36)}<div><h2>${esc(it.name)}</h2><small>${esc(it.en)}</small></div>${starButton(id, "mb-star-detail")}<button class="btn ghost small-btn" data-share-item="${id}" title="${tr("이 아이템 링크 복사", "Copy a link to this item")}">${tr("링크 복사", "Copy link")}</button><button class="btn ghost small-btn" data-close-item aria-label="${tr("상세 닫기", "Close details")}">×</button></header><p class="share-status mb-share-status" id="mb-share-status" role="status" aria-live="polite"></p>${stats}${changed || reset ? visitNote(id) : ""}${pageLink}
 <div class="mb-tabs" role="tablist" aria-label="${tr("아이템 상세", "Item details")}"><button data-detail-tab="listings" role="tab" aria-selected="${detailTab === "listings"}" aria-controls="mb-detail-listings">${tr("판매 매물", "Shop listings")}</button><button data-detail-tab="charts" role="tab" aria-selected="${detailTab === "charts"}" aria-controls="mb-detail-charts">${tr("가격 추이·매물대", "Trends & depth")}</button><button class="mb-detail-refresh" data-refresh-item>${tr("새로고침", "Refresh")}</button></div>
 <div id="mb-detail-listings" role="tabpanel" aria-label="${tr("판매 매물", "Shop listings")}"><p class="muted note">${T.whereNote}</p><div class="mb-detail-filters"><label>${tr("채널", "Channel")}<select id="md-channel">${selectLocation("channel", detailState.channel)}</select></label><label>${tr("방", "Room")}<select id="md-room">${selectLocation("room", detailState.room)}</select></label><label>${tr("정렬", "Sort")}<select id="md-sort"><option value="price">${T.sortPrice}</option><option value="recent">${T.sortRecent}</option><option value="high">${tr("높은 가격순", "Highest price")}</option></select></label><label>${tr("상태", "Status")}<select id="md-state"><option value="open">${tr("판매 중 · 24h", "Asking · 24h")}</option><option value="all">${tr("전체 기록 · 7일", "All records · 7d")}</option><option value="sold">${tr("판매 완료 표시", "Marked sold")}</option><option value="stale">${tr("24시간 경과", "Over 24h old")}</option></select></label></div><div class="price-band-filter" id="md-price-band" hidden><span></span><button class="btn ghost small-btn" data-clear-band>${tr("가격대 해제", "Clear price band")}</button></div><p id="md-count" class="muted note" role="status"></p><div id="md-rows"></div><div id="md-pages" class="mb-pagination"></div></div>
 <div id="mb-detail-charts" role="tabpanel" aria-label="${tr("가격 추이와 매물대", "Trends and depth")}"><div id="mk-charts"><p>${T.loading}</p></div></div>`;
  $("md-sort").value = detailState.sort;
  $("md-state").value = detailState.state;
  detailPanels();
  if (window.matchMedia("(max-width:1050px)").matches) $("mk-detail").scrollIntoView({behavior:"smooth",block:"start"});
  loadDetailRows();
  for (const key of ["channel", "room", "sort", "state"])
    $("md-" + key).addEventListener("change", () => {
      detailState[key] = $("md-" + key).value;
      detailState.page = 1;
      if (key === "state") {
        priceBand = null;
        chart?.clearBand();
      }
      loadDetailRows();
    });
  try {
    const data = await get(`/market/history?id=${id}`, detailAbort.signal);
    if (seq !== detailSeq) return;
    const normalize = (rs) =>
      rs.map((r) => ({ ...r, sold: !!r.sold, t: parseUtc(r.seen) }));
    chart = mountMarketCharts($("mk-charts"), normalize(data.rows), {
      lang: D.lang,
      now: Date.parse(data.asOf),
      persistent: true,
      profileRows: normalize(data.profile),
      truncated: data.truncated,
      profileTruncated: data.profileTruncated,
      limit: data.limit,
      onBand(band) {
        priceBand = band;
        if (band) {
          detailState.state = "open";
          detailState.channel = "";
          detailState.room = "";
          $("md-channel").value = "";
          $("md-room").value = "";
          $("md-state").value = "open";
          detailTab = "listings";
          detailPanels();
        }
        detailState.page = 1;
        loadDetailRows();
      },
    });
  } catch (e) {
    if (e.name !== "AbortError" && seq === detailSeq)
      $("mk-charts").innerHTML =
        `<p>${T.failed}</p><button class="btn small-btn" data-refresh-item>${T.retry}</button>`;
  }
}
let detailListSeq = 0;
async function loadDetailRows() {
  if (!selected) return;
  const id = selected,
    seq = ++detailListSeq,
    p = new URLSearchParams({ item: id, ...detailState, limit: 30, days: 7 });
  if (priceBand) {
    p.set("min", priceBand.from);
    p.set("max", priceBand.to);
    p.set("since", new Date(priceBand.fromTime).toISOString());
  }
  $("md-rows").setAttribute("aria-busy", "true");
  $("md-count").textContent = T.loading;
  $("md-price-band").hidden = !priceBand;
  $("md-price-band").querySelector("span").textContent = priceBand?.label || "";
  try {
    const data = await get("/market/listings?" + p);
    if (seq !== detailListSeq || id !== selected) return;
    if (detailState.page > 1 && detailState.page > data.pages) {
      detailState.page = Math.max(1, data.pages);
      return loadDetailRows();
    }
    $("md-count").textContent = tr(
      `조건에 맞는 매물 ${data.total}건 · ${ago(data.asOf)}`,
      `${data.total} matching listings · ${ago(data.asOf)}`,
    );
    $("md-rows").innerHTML = listingTable(data.rows, { showItem: false });
    $("md-pages").innerHTML = pager(data, "detail");
    // One event per item opened (not per filter change, page or refresh): the detail loaded and showed its listings.
    if (pendingOpen?.id === id) {
      track("market_item", { item_id: id, listings: data.total, result: data.total ? "ok" : "empty", source: pendingOpen.source, lang: D.lang });
      pendingOpen = null;
    }
  } catch {
    if (seq === detailListSeq && id === selected) {
      $("md-rows").innerHTML =
        `<p>${T.failed}</p><button class="btn small-btn" data-retry-detail>${T.retry}</button>`;
      $("md-count").textContent = "";
      if (pendingOpen?.id === id) {
        track("market_item", { item_id: id, result: "error", source: pendingOpen.source, lang: D.lang });
        pendingOpen = null;
      }
    }
  } finally {
    if (seq === detailListSeq && id === selected)
      $("md-rows").setAttribute("aria-busy", "false");
  }
}
async function showShop(seller, channel, room, shopPage = 1) {
  const seq = ++shopSeq;
  shopContext = { seller, channel, room, page: shopPage };
  const dialog = $("mb-shop");
  $("mb-shop-body").innerHTML =
    `<header class="mk-head"><div><h2 id="mb-shop-title">${esc(seller)}</h2><p>CH ${channel} · ${placeLabel(Number(room), ko)}</p></div><button class="btn ghost small-btn" data-close-shop aria-label="${tr("상점 닫기", "Close shop")}">×</button></header><p class="muted note">${tr("이 위치의 상점에서 우리 DB에 확인된 판매 매물이에요. 전체 재고를 뜻하지는 않아요.", "Asking listings recorded in our database for this shop and location, not guaranteed complete inventory.")}</p><p id="mb-shop-count"></p><div id="mb-shop-rows">${T.loading}</div><div id="mb-shop-pages" class="mb-pagination"></div>`;
  dialog.setAttribute("aria-labelledby", "mb-shop-title");
  if (!dialog.open) dialog.showModal();
  try {
    const data = await get(
      "/market/listings?" +
        new URLSearchParams({
          seller,
          channel,
          room,
          exact: 1,
          state: "open",
          sort: "price",
          limit: 50,
          page: shopPage,
        }),
    );
    if (seq !== shopSeq || !dialog.open) return;
    $("mb-shop-count").textContent = tr(
      `판매 매물 ${data.total}건`,
      `${data.total} asking listings`,
    );
    $("mb-shop-rows").innerHTML = listingTable(data.rows, {
      shopButtons: false,
    });
    $("mb-shop-pages").innerHTML = pager(data, "shop");
  } catch {
    if (seq === shopSeq && dialog.open)
      $("mb-shop-rows").innerHTML =
        `<p>${T.failed}</p><button class="btn small-btn" data-retry-shop>${T.retry}</button>`;
  }
}
async function refresh() {
  if (refreshing || document.hidden) return;
  refreshing = true;
  try {
    catalog = await get("/market/catalog");
    for (const k of ["open", "shops", "items", "records"])
      $("mk-stat-" + k).textContent = money(catalog.stats[k]);
    // The time goes in as a variable so derived locales match their translation key.
    $("mk-status").textContent = ko
      ? `목록 기준 ${clock(Date.parse(catalog.asOf))} · 60초마다 확인`
      : tx("Directory as of {at} · checks every 60s", { at: clock(Date.parse(catalog.asOf)) });
    if (view === "items") renderDirectory();
  } catch {
    $("mk-status").textContent = catalog ? T.staleData : T.failed;
    if (!catalog) {
      $("mb-results").innerHTML = `<p>${T.failed}</p>`;
      $("mb-results").setAttribute("aria-busy", "false");
    }
  } finally {
    refreshing = false;
  }
}
function changedSearch() {
  page = 1;
  clearTimeout(debounce);
  if (view === "items") renderMain();
  else debounce = setTimeout(renderMain, 250);
}
$("mk-q").addEventListener("input", changedSearch);
$("mk-q").addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    $("mk-q").value = "";
    changedSearch();
  }
});
$("mb-clear-search").addEventListener("click", () => {
  $("mk-q").value = "";
  changedSearch();
  $("mk-q").focus();
});
for (const id of [
  "mb-item-sort",
  "mb-favorites",
  "mb-channel",
  "mb-room",
  "mb-state",
  "mb-list-sort",
  "mb-days",
  "mb-report-kind",
])
  $(id).addEventListener("change", () => {
    page = 1;
    renderMain();
  });
$("mb-seller").addEventListener("input", changedSearch);
$("mk-retry").addEventListener("click", async () => {
  if (!items.length) return initialize();
  await refresh();
  if (view !== "items") renderMain();
  if (selected) loadItem(selected, { reset: false });
});
document.querySelector(".market-browser").addEventListener("click", (e) => {
  const el = e.target.closest("button,a");
  if (!el) return;
  if (el.dataset.item) {
    if (e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    $("mb-shop").close();
    // Where the visitor found the item: a saved list, a search result, or plain browsing.
    const source = el.dataset.source || (view === "items" && $("mb-favorites").checked ? "wishlist" : $("mk-q").value.trim() ? "search" : el.closest("#mk-detail") ? "detail" : "list");
    loadItem(Number(el.dataset.item), { source });
    return;
  }
  if (el.dataset.favorite) {
    const id = Number(el.dataset.favorite);
    const res = toggleWishlist(favorites, id);
    const status = $("mb-share-status") || $("mb-count");
    if (!res.ok) {
      if (status && res.reason === "full") status.textContent = tr(`관심 아이템은 ${WISHLIST_MAX}개까지 저장할 수 있어요. 다른 아이템을 먼저 빼 주세요.`, `The wishlist holds up to ${WISHLIST_MAX} items. Remove one first.`);
      return;
    }
    const saved = persist(WISHLIST_KEY, [...favorites]);
    if (status) status.textContent = saved ? "" : tr("이 브라우저에 저장할 수 없어서 새로고침하면 사라져요.", "This browser cannot store the list; it will be lost on reload.");
    track(res.added ? "wishlist_add" : "wishlist_remove", { item_id: id, page_type: "market", storage: saved ? "ok" : "unavailable" });
    if (view === "items") renderDirectory();
    document.querySelectorAll(`[data-favorite="${id}"]`).forEach((b) => {
      b.setAttribute("aria-pressed", favorites.has(id));
      b.textContent = favorites.has(id) ? "★" : "☆";
    });
    renderMine();
    return;
  }
  if (el.hasAttribute("data-show-wishlist")) {
    $("mb-favorites").checked = true;
    page = 1;
    view === "items" ? renderMain() : setView("items");
    track("wishlist_open", { count: favorites.size, page_type: "market" });
    return;
  }
  if (el.dataset.forget) {
    const removed = el.dataset.forget === "all" ? recent.length : 1;
    recent = el.dataset.forget === "all" ? [] : removeRecent(recent, Number(el.dataset.forget));
    persist(RECENT_KEY, recent);
    track("recent_remove", { count: removed, page_type: "market" });
    renderMine();
    return;
  }
  if (el.dataset.shareItem) {
    const id = Number(el.dataset.shareItem);
    const url = shareUrl(`${location.pathname}?item=${id}`, "market-item");
    copyText(url).then((ok) => {
      const status = $("mb-share-status");
      if (status) status.textContent = ok ? tr("링크를 복사했어요. 새 탭이나 다른 기기에서 같은 아이템이 열려요.", "Link copied. It opens the same item on any device.") : `${tr("복사하지 못했어요. 이 주소를 직접 복사해 주세요:", "Could not copy. Copy this address:")} ${url}`;
      track("share_copy", { page_type: "market", item_id: id, result: ok ? "ok" : "fail" });
    });
    return;
  }
  if (el.hasAttribute("data-clear-search")) {
    $("mk-q").value = "";
    changedSearch();
    $("mk-q").focus();
    return;
  }
  if (el.dataset.view) {
    setView(el.dataset.view);
    return;
  }
  if (el.dataset.category) {
    category = el.dataset.category;
    page = 1;
    document
      .querySelectorAll("[data-category]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", b.dataset.category === category),
      );
    renderMain();
    return;
  }
  if (el.hasAttribute("data-close-item")) return closeItem();
  if (el.dataset.detailTab) {
    detailTab = el.dataset.detailTab;
    detailPanels();
    return;
  }
  if (el.hasAttribute("data-refresh-item"))
    return loadItem(selected, { reset: false });
  if (el.dataset.shop)
    return showShop(el.dataset.shop, el.dataset.ch, el.dataset.room);
  if (el.hasAttribute("data-close-shop")) return $("mb-shop").close();
  if (el.hasAttribute("data-retry-shop"))
    return showShop(
      shopContext.seller,
      shopContext.channel,
      shopContext.room,
      shopContext.page,
    );
  if (el.hasAttribute("data-retry-list")) return renderRecords();
  if (el.hasAttribute("data-retry-detail")) return loadDetailRows();
  if (el.hasAttribute("data-clear-band")) {
    priceBand = null;
    chart?.clearBand();
    return loadDetailRows();
  }
  if (el.dataset.page) {
    const n = Number(el.dataset.page);
    if (el.dataset.scope === "detail") {
      detailState.page = n;
      loadDetailRows();
      $("md-rows").scrollIntoView({ block: "start" });
    } else if (el.dataset.scope === "shop")
      showShop(shopContext.seller, shopContext.channel, shopContext.room, n);
    else {
      page = n;
      renderMain();
      $("mb-results").scrollIntoView({ block: "start" });
    }
  }
});
document.querySelector(".market-browser").addEventListener("keydown", (e) => {
  const list = e.target.closest('[role="tablist"]');
  if (!list) return;
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  const tabs = [...list.querySelectorAll('[role="tab"]')],
    index = tabs.indexOf(document.activeElement);
  if (index < 0) return;
  e.preventDefault();
  const next =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? tabs.length - 1
        : (index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) %
          tabs.length;
  tabs[next].click();
  tabs[next].focus();
});
$("mb-shop").addEventListener("click", (e) => {
  if (e.target === $("mb-shop")) $("mb-shop").close();
});
async function initialize() {
  try {
    const r = await fetch(D.itemsUrl);
    if (!r.ok) throw Error("items");
    items = makeMarketIndex(await r.json(), D.lang);
    byId = new Map(items.map((it) => [it.id, it]));
    const p = new URLSearchParams(location.search),
      id = Number(p.get("item"));
    if (p.get("q")) $("mk-q").value = p.get("q");
    const initialView = ["items", "listings", "reports"].includes(p.get("view"))
      ? p.get("view")
      : byId.has(id) ? "items" : "listings";
    // How the page was reached with an item preselected: a shared link, the home "pick up" strip, or any other link.
    const source = p.get("utm_source") === "share" ? "share" : p.get("src") === "home" ? "home" : "url";
    if (p.has("src")) {
      p.delete("src");
      history.replaceState(null, "", location.pathname + (p.size ? "?" + p : ""));
    }
    restoreFilters(p);
    await refresh();
    setView(initialView, true);
    if (byId.has(id)) loadItem(id, { source });
    renderMine();
  } catch {
    $("mk-status").textContent = T.failed;
    $("mb-results").innerHTML = `<p>${T.failed}</p>`;
  }
}
setInterval(refresh, 60000);
document.addEventListener("visibilitychange", refresh);
initialize();
