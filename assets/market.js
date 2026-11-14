import './collection-status.js';
import { DAY, parseUtc, newMark } from "./market-data.js";
import { KERNING, placeLabel } from "./place.js";
import { makeMarketIndex, catalogRows, matchingIds, refPrice, npcBetter } from "./market-catalog.js";
import { mountMarketCharts } from "./market-charts.js";
import { intentOf, priceOf as megaPrice } from "./mega-text.js";
import { WISHLIST_KEY, RECENT_KEY, SEEN_KEY, WISHLIST_MAX, readList, addRecent, removeRecent, toggleWishlist, snapshot, visitDelta, pruneSeen } from "./market-memory.js";
// Opened from a Discord alert DM (listings are newest first for everyone now, so the alerted one is on top).
let fromAlert = new URLSearchParams(location.search).get("utm_medium") === "alert";
const D = JSON.parse(document.getElementById("mk-data").textContent),
  T = D.t,
  ko = D.lang === "ko";
// On an item page (/items/<id>/) the same detail panel opens for that one item, full width, with no list around it.
const FIXED = Number(D.fixed) || 0;
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
  view = "items",
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
  npc: tr("NPC 판매 이득", "Better sold to NPC"),
};
// API answers are kept for a minute and shared, so an item opened again (or prefetched on hover) shows at once. The
// API answers from the US, so every saved round trip is half a second or more.
const apiCache = new Map();
function get(path, signal) {
  const hit = apiCache.get(path);
  if (hit && Date.now() - hit.t < 60000) return hit.p;
  const p = fetch(D.api + path, { signal }).then((r) => {
    if (!r.ok) throw Error("HTTP " + r.status);
    return r.json();
  });
  apiCache.set(path, { t: Date.now(), p });
  p.catch(() => apiCache.delete(path));
  if (apiCache.size > 200) apiCache.delete(apiCache.keys().next().value);
  return p;
}
// Pointing at an item row starts loading what its panel needs (price history and the cheapest listings), so the click
// opens a panel that is usually already filled.
function prefetchItem(id) {
  if (!Number.isInteger(id) || id === selected) return;
  get(`/market/history?id=${id}`).catch(() => null);
  get("/market/listings?" + new URLSearchParams({ item: id, state: "open", sort: "recent", channel: "", room: "", seller: "", page: 1, limit: 30, days: 7 })).catch(() => null);
}
let hoverTimer = null;
document.addEventListener("pointerover", (e) => {
  const a = e.target.closest?.(".mb-catalog a[href*='item='], .mb-sum[data-item], .mb-results a[href*='item=']");
  if (!a) return;
  clearTimeout(hoverTimer);
  const id = Number(a.dataset.item || new URL(a.href, location.href).searchParams.get("item"));
  hoverTimer = setTimeout(() => prefetchItem(id), 120);
});
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
// Every settled search (not each keystroke) is counted, so the briefing can list what people look up most.
let searchTimer = 0, lastSearch = "";
function searched(term, results) {
  clearTimeout(searchTimer);
  if (!term || term === lastSearch || (/[\uac00-\ud7a3]/.test(term) && /[\u3131-\u318e]$/.test(term))) return;
  searchTimer = setTimeout(() => {
    lastSearch = term;
    track("market_search", { search_term: term.slice(0, 40), results, view, lang: D.lang });
  }, 1500);
}
function noResults(term) {
  clearTimeout(noResultTimer);
  // A Korean word still being typed ends in a bare consonant or vowel ("망ㅌ"); that is not a failed search.
  if (!term || term === lastNoResult || (/[\uac00-\ud7a3]/.test(term) && /[\u3131-\u318e]$/.test(term))) return;
  noResultTimer = setTimeout(() => {
    lastNoResult = term;
    track("market_no_results", { search_term: term.slice(0, 40), view, category, lang: D.lang });
  }, 1200);
}
function pager(data, scope) {
  if (data.pages <= 1) return "";
  return `<button class="btn ghost small-btn" type="button" data-page="${data.page - 1}" data-scope="${scope}" ${data.page <= 1 ? "disabled" : ""}>${tr("이전", "Previous")}</button><span>${data.page} / ${data.pages}</span><button class="btn ghost small-btn" type="button" data-page="${data.page + 1}" data-scope="${scope}" ${data.page >= data.pages ? "disabled" : ""}>${tr("다음", "Next")}</button>`;
}
// Channel and Free Market room as chips. Each channel keeps its own hue (spread round the colour wheel) so the same
// channel is easy to spot down a list.
// 24h move of the reference price as a small badge; nothing when unknown.
const moveBadge = (v) => (v == null ? "" : `<span class="mb-move ${v > 0 ? "up" : v < 0 ? "down" : ""}">${v > 0 ? "+" : ""}${v}%</span>`);
const placeChips = (r) => `<span class="mb-ch" style="--h:${(Number(r.channel) * 47) % 360}">CH ${r.channel}</span><span class="mb-room">${placeLabel(r.room, ko)}</span>`;
// The item panel's "where to buy" list: one card per listing, price first, then how fresh it is, who and where.
// Freshness follows MesoWatch's wording: seen within an hour is probably still up, older ones may have sold.
let lastOffers = null;
function offerCards(rows) {
  lastOffers = rows;
  if (!rows.length)
    return `<p class="market-empty">${tr("조건에 맞는 매물이 없어요. 필터를 바꿔 보세요.", "No listings match. Try other filters.")}</p>`;
  const open = (priceData?.profile || []).map((r) => r.price).filter((p) => p > 0).sort((a, b) => a - b);
  const [r25, r75] = open.length >= 4 ? [quant(open, 0.25), quant(open, 0.75)] : [null, null];
  return `<ul class="mb-offers">${rows.map((r) => {
    const age = Date.now() - parseUtc(r.seen);
    const fresh = r.sold ? "sold" : age < 3600000 ? "fresh" : age < 6 * 3600000 ? "warm" : "old";
    const status = { sold: tr("판매 완료 표시", "Marked sold"), fresh: tr("아직 팔고 있을 가능성 높음", "Likely still up"), warm: tr("몇 시간 전 확인", "Seen a few hours ago"), old: tr("팔렸을 수도 있어요", "May have sold") }[fresh];
    const tag = r25 == null || r.sold ? "" : r.price < r25 ? `<b class="mb-deal cheap">${tr("싼 편", "Cheap")}</b>` : r.price > r75 ? `<b class="mb-deal pricey">${tr("비싼 편", "Pricey")}</b>` : `<b class="mb-deal fair">${tr("보통", "Typical")}</b>`;
    return `<li class="mb-offer ${fresh}"><div class="mb-offer-price"><strong>${money(r.price)}</strong><small>${T.priceUnit}${r.qty > 1 ? ` · ×${money(r.qty)} = ${money(r.price * r.qty)}` : ""}</small>${tag}</div>
<div class="mb-offer-who"><button type="button" class="mb-seller" data-shop="${esc(r.seller)}" data-ch="${r.channel}" data-room="${r.room}" title="${tr("이 상점에서 확인한 매물 보기", "View recorded listings from this shop")}">${esc(r.seller)}</button><span class="mb-fresh"><i aria-hidden="true"></i>${when(r.seen)} · ${status}</span></div>
<div class="mb-offer-where">${placeChips(r)}</div></li>`;
  }).join("")}</ul>`;
}
function listingTable(rows, { showItem = true, shopButtons = true } = {}) {
  if (!rows.length)
    return `<p class="market-empty">${tr("조건에 맞는 매물이 없어요. 검색어나 필터를 바꿔 보세요.", "No listings match. Try changing the search or filters.")}</p>`;
  return `<div class="mb-table-wrap"><table class="mb-table mb-listings-table"><thead><tr>${showItem ? `<th>${tr("아이템", "Item")}</th>` : ""}<th>${tr("가격", "Price")}<small>${T.priceUnit}</small></th><th>${tr("수량", "Qty")}</th><th>${T.table.seller}</th><th>${T.table.where}</th><th>${tr("최근 확인", "Last seen")}</th></tr></thead><tbody>${rows.map((r) => `<tr>${showItem ? `<td class="mb-cell-item">${itemLink(r.item)}</td>` : ""}<td class="num mb-cell-price">${money(r.price)}${r.qty > 1 ? `<small>${T.total} ${money(r.price * r.qty)}</small>` : ""}</td><td class="mb-cell-qty"><span class="mb-mobile-label">${tr("수량", "Qty")} </span>${money(r.qty)}</td><td class="mb-cell-seller">${shopButtons ? `<button type="button" class="mb-seller" data-shop="${esc(r.seller)}" data-ch="${r.channel}" data-room="${r.room}" title="${tr("이 상점에서 확인한 매물 보기", "View recorded listings from this shop")}">${esc(r.seller)} ↗</button>` : esc(r.seller)}</td><td class="mb-cell-location">${placeChips(r)}</td><td class="mb-cell-seen">${newMark(r.seen)}${when(r.seen)}<small class="${r.sold ? "mb-sold" : ""}">${r.sold ? tr("판매 완료 표시", "Marked sold") : Date.now() - parseUtc(r.seen) >= DAY ? tr("24시간 경과", "Over 24h old") : tr("판매 중 관측", "Seen for sale")}</small></td></tr>`).join("")}</tbody></table></div>`;
}
// Every browsing filter lives in the address, so refresh, back and a copied link reopen the same view.
// Defaults are left out to keep plain visits on the canonical URL.
const URL_FIELDS = [
  ["state", "mb-state", "open"], ["sort", "mb-list-sort", "recent"], ["seller", "mb-seller", ""],
  ["ch", "mb-channel", ""], ["room", "mb-room", ""], ["days", "mb-days", "7"],
  ["kind", "mb-report-kind", ""], ["isort", "mb-item-sort", "sales"], ["cls", "mb-class", ""],
];
function syncURL() {
  if (FIXED) return;
  const p = new URLSearchParams(location.search);
  for (const k of ["item", "view", "q", "cat", "page", "fav", ...URL_FIELDS.map((f) => f[0])]) p.delete(k);
  if (selected) p.set("item", selected);
  if (view !== "items" || selected) p.set("view", view);
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
  if (p.get("cat") && ["scroll", "weapon", "equip", "stars", "cash", "other", "npc"].includes(p.get("cat"))) {
    category = p.get("cat");
    document.querySelectorAll("[data-category]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.category === category));
  }
  if (p.get("fav") === "1") $("mb-favorites").checked = true;
  const n = Number(p.get("page"));
  if (Number.isInteger(n) && n > 1 && n < 100000) page = n;
}
function closeItem() {
  if (FIXED) return;
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
    npcSell,
  }).filter(classOk);
  const pages = Math.ceil(rows.length / 40);
  page = Math.max(1, Math.min(page, pages || 1));
  $("mb-count").textContent = tr(
    `아이템 ${nf.format(rows.length)}종 · ${catalog.windowDays}일 기록`,
    `${nf.format(rows.length)} items · ${catalog.windowDays}d records`,
  );
  const start = (page - 1) * 40;
  $("mb-results").innerHTML = rows.length
    ? `<div class="mb-table-wrap"><table class="mb-table mb-catalog"><thead><tr><th><span class="sr-only">${tr("관심", "Wishlist")}</span>☆</th><th>${tr("아이템", "Item")}</th><th class="mb-src">${tr("드롭", "Drops")}</th><th>${tr("판매가 중앙값 / 최저가", "Asking median / lowest")}<small>${T.priceUnit} · 24h</small></th><th>${tr("24시간", "24h")}</th><th>${tr("판매 매물", "Asking")}</th><th>${tr("최근 확인", "Last seen")}</th></tr></thead><tbody>${rows
        .slice(start, start + 40)
        .map(
          (r) =>
            `<tr class="${r.id === selected ? "selected" : ""}"><td>${starButton(r.id)}</td><td>${itemLink(r.id)}<small>${categories[r.category]}${r.reports ? ` · ${tr("가격 제보", "Reports")} ${r.reports}` : ""}${npcBetter(npcSell(r.id), refPrice(r)) ? ` <span class="mb-npc-tag" title="${esc(npcNote(r.id, refPrice(r)))}">${tr("NPC 이득", "NPC pays more")}</span>` : ""}</small></td><td class="mb-src">${dropIcons(r.id)}</td><td class="num">${r.median == null && r.typical ? `${money(r.typical)}<small>${tr("대표 시세", "Typical")}</small>` : `${money(r.median)}<small>${tr("최저", "Low")} ${money(r.low)}</small>`}</td><td class="mb-move-cell">${moveBadge(r.typicalDay)}</td><td><strong>${r.open}</strong><small>${r.sales ? `${tr("거래", "Traded")} ${money(r.sales)}` : `${tr("기록", "Records")} ${r.records || 0}`}</small></td><td>${r.last ? newMark(r.last) : ""}${when(r.last)}</td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : categoryMiss() || `<div class="market-empty"><strong>${tr("표시할 아이템이 없어요.", "No matching items.")}</strong><p>${$("mb-favorites").checked ? tr("별표를 눌러 관심 아이템을 저장해 보세요.", "Use the star to save items to your wishlist.") : T.noMatches}</p>${$("mk-q").value.trim() && document.body.dataset.discordUrl ? `<p><a href="${document.body.dataset.discordUrl}" target="_blank" rel="noopener" data-discord="market-empty">${tr("찾는 아이템 시세를 디스코드에서 물어보기", "Ask for this item's price on Discord")}</a></p>` : ""}${$("mk-q").value.trim() ? `<p><button type="button" class="btn ghost small-btn" data-clear-search>${tr("검색어 지우기", "Clear search")}</button> <button type="button" class="btn ghost small-btn" data-view="listings">${tr("전체 매물에서 찾기", "Search all listings instead")}</button></p>` : ""}</div>`;
  if (!rows.length && !$("mb-favorites").checked) noResults($("mk-q").value.trim());
  if (!$("mb-favorites").checked) searched($("mk-q").value.trim(), rows.length);
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
// Class filter (like MesoWatch's): gear the class can wear, its weapons, scrolls for those weapons and for armour and
// accessories, and throwing stars for assassins. Potions, etc. and cash items drop out. Uses the hover-card data (job
// bits and sub-types from the game client); until it has loaded nothing is filtered.
const SWORD = ["One-Handed Sword", "Two-Handed Sword"], AXE = ["One-Handed Axe", "Two-Handed Axe"], BW = ["One-Handed Blunt Weapon", "Two-Handed Blunt"], SPEAR = ["Spear", "Pole Arm"];
const CLASSES = {
  warrior: [1, [...SWORD, ...AXE, ...BW, ...SPEAR]], fighter: [1, [...SWORD, ...AXE]], page: [1, [...SWORD, ...BW]], spearman: [1, SPEAR],
  magician: [2, ["Wand", "Staff"]], bowman: [4, ["Bow", "Crossbow"]], hunter: [4, ["Bow"]], crossbowman: [4, ["Crossbow"]],
  thief: [8, ["Claw", "Dagger"]], assassin: [8, ["Claw"]], bandit: [8, ["Dagger"]],
};
const WEAPONS = new Set(Object.values(CLASSES).flatMap(([, w]) => w));
// Scroll sub-types name the slot they go on, spelled a little differently from the equipment's own sub-types.
const SCROLL_SLOT = { "One-Handed BW": "One-Handed Blunt Weapon", "Two-Handed BW": "Two-Handed Blunt", Polearm: "Pole Arm" };
function classOk(it) {
  const cls = CLASSES[$("mb-class").value];
  if (!cls || !tips) return true;
  const t = tips.items[it.id];
  if (!t || it.category === "cash") return false;
  const [bit, weapons] = cls;
  const [, , cat, sub, , job, , , , , scroll] = t;
  if (cat === "Equip") return WEAPONS.has(sub) ? weapons.includes(sub) && (!job || job & bit) : !job || !!(job & bit);
  if (scroll) { const slot = SCROLL_SLOT[sub] || sub; return WEAPONS.has(slot) ? weapons.includes(slot) : true; }
  return sub === "Thrown" && weapons.includes("Claw");
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
        (category === "all" || category === it.category || (category === "npc" && npcBetter(npcSell(it.id), refPrice(catalog?.items.find((r) => r.item === it.id))))) &&
        classOk(it),
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
  const filtering = $("mk-q").value.trim() || category !== "all" || $("mb-class").value;
  if (filtering) {
    let ids = filteredIds();
    // The worker takes at most 200 items per query. A class filter alone can match more, so it keeps the 200 with the
    // most open listings (rarely traded gear drops out); a search or category that broad still asks for a narrower name.
    if (ids.length > 200 && $("mb-class").value && !$("mk-q").value.trim()) {
      const open = new Map((catalog?.items || []).map((r) => [r.item, r.open || 0]));
      ids = ids.sort((a, b) => (open.get(b) || 0) - (open.get(a) || 0)).slice(0, 200);
    }
    if (!ids.length) {
      // No open listings, but the item itself usually exists: offer the matching items (with their reference price when
      // known) instead of a dead end; pets, cash items and rarely traded gear land here.
      const typical = new Map((catalog?.items || []).filter((r) => r.typical).map((r) => [r.item, r.typical]));
      const known = (matchingIds(items, $("mk-q").value) || []).slice(0, 8);
      const suggest = known.length
        ? `<p>${tr("지금 올라온 매물은 없지만, 이 아이템들이 있어요:", "No open listings right now, but these items match:")}</p><ul class="mb-suggest">${known.map((id) => `<li>${itemLink(id)}${typical.has(id) ? `<small>${tr("대표 시세", "Typical")} ${money(typical.get(id))}</small>` : `<small>${tr("시세 기록 없음", "No price yet")}</small>`}</li>`).join("")}</ul>`
        : `<p>${tr("한글·영문·초성·약어(장공, 귀힘, 아대)로도 검색돼요.", "Korean, English, initials and common abbreviations all work.")}</p>`;
      $("mb-results").innerHTML = categoryMiss() || `<div class="market-empty"><strong>${T.noMatches}</strong>${suggest}<p><button type="button" class="btn ghost small-btn" data-clear-search>${tr("검색어 지우기", "Clear search")}</button> <button type="button" class="btn ghost small-btn" data-view="items">${tr("아이템 시세 보기", "Browse item prices")}</button></p></div>`;
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
    searched($("mk-q").value.trim(), data.total);
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
// A search answers "what does it cost" before the listings: up to four matching items with their asking median, lowest
// ask and how many are on sale, each opening its seller list.
function renderSummary() {
  const box = $("mb-summary"), q = $("mk-q").value.trim();
  const rows = view === "listings" && q && catalog
    ? catalogRows(items, catalog.items, { query: q, category, sort: "active", favorites: null, npcSell }).filter((r) => (r.median != null || r.typical) && classOk(r)).slice(0, 4)
    : [];
  box.hidden = !rows.length;
  box.innerHTML = rows.map((r) => `<a class="mb-sum" href="?item=${r.id}" data-item="${r.id}" data-source="summary">${icon(r.id, 28)}<span class="mb-sum-name">${esc(itemName(r.id))}</span><strong>${money(r.median ?? r.typical)}</strong><small>${r.median != null ? `${tr("최저", "Low")} ${money(r.low)} · ${tr(`판매 ${r.open}건`, `${r.open} for sale`)}` : tr("대표 시세", "Typical")}</small></a>`).join("");
}
// The folded filter row says how many filters are on, and opens itself when a shared link arrives with some set.
function filterCount() {
  const on = [["mb-seller", ""], ["mb-channel", ""], ["mb-room", ""], ["mb-state", "open"], ["mb-list-sort", "recent"]].filter(([id, d]) => $(id).value !== d).length;
  $("mb-filter-count").textContent = on ? tr(`${on}개 적용 중`, `${on} on`) : tr("판매자 · 채널 · 방 · 상태 · 정렬", "Seller · channel · room · status · sort");
  if (on) $("mb-list-controls").open = true;
}
function renderMain() {
  if (!items.length) return;
  syncURL();
  $("mb-range").hidden = view === "items" || (view === "listings" && $("mb-state").value === "open");
  filterCount();
  renderSummary();
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
            "By default: listings seen for sale in the last 24 hours. Switch Status to “All records” to page through 7 or 30 days.",
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
      // Newest listings first (2026-11-14, user request): what was just put up is what a buyer can still catch.
      // The cheapest stays one choice away in the sort menu.
      sort: (fromAlert = false, "recent"),
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
  // The item's own page (full view: chart, megaphones, listings, drops, quests) sits in the header, beside "copy link".
  const pageLink = !FIXED && D.itemPaths?.[id] ? `<a class="btn ghost small-btn mb-item-page" href="${esc(D.itemPaths[id])}">${esc(D.itemLink)}</a>` : "";
  priceData = null;
  if ($("mb-alert")) $("mb-alert").hidden = true;
  fillItemInfo(id);
  fillMegaphones(id);
  $("mk-detail").innerHTML =
    `<header class="mk-head">${icon(id, 36)}<div><h2>${esc(it.name)}</h2><small>${esc(it.en)}</small></div>${starButton(id, "mb-star-detail")}${D.alerts || document.body.dataset.discordUrl ? `<button type="button" class="btn ghost small-btn" data-alert-open="${id}">🔔 ${tr("가격 알림", "Price alert")}</button>` : ""}${pageLink}<button class="btn ghost small-btn" data-share-item="${id}" title="${tr("이 아이템 링크 복사", "Copy a link to this item")}">${tr("링크 복사", "Copy link")}</button><button class="btn ghost small-btn" data-close-item aria-label="${tr("상세 닫기", "Close details")}">×</button></header><p class="share-status mb-share-status" id="mb-share-status" role="status" aria-live="polite"></p><section class="mb-alert" id="mb-alert" hidden></section><section class="mb-history" id="mb-history" aria-label="${tr("가격 한눈에 보기", "Price at a glance")}"><p class="muted note">${T.loading}</p></section>${stats}<section class="mb-info" id="mb-info" aria-live="polite"></section><section class="mb-megas" id="mb-megas" hidden></section>${changed || reset ? visitNote(id) : ""}
 <div class="mb-tabs" role="tablist" aria-label="${tr("아이템 상세", "Item details")}"><button data-detail-tab="listings" role="tab" aria-selected="${detailTab === "listings"}" aria-controls="mb-detail-listings">${tr("판매 매물", "Shop listings")}</button><button data-detail-tab="charts" role="tab" aria-selected="${detailTab === "charts"}" aria-controls="mb-detail-charts">${tr("가격 추이·매물대", "Trends & depth")}</button><button class="mb-detail-refresh" data-refresh-item>${tr("새로고침", "Refresh")}</button></div>
 <div id="mb-detail-listings" role="tabpanel" aria-label="${tr("판매 매물", "Shop listings")}"><p class="muted note">${T.whereNote}</p><div class="mb-detail-filters"><label>${tr("채널", "Channel")}<select id="md-channel">${selectLocation("channel", detailState.channel)}</select></label><label>${tr("방", "Room")}<select id="md-room">${selectLocation("room", detailState.room)}</select></label><label>${tr("정렬", "Sort")}<select id="md-sort"><option value="price">${T.sortPrice}</option><option value="recent">${T.sortRecent}</option><option value="high">${tr("높은 가격순", "Highest price")}</option></select></label><label>${tr("상태", "Status")}<select id="md-state"><option value="open">${tr("판매 중 · 24h", "Asking · 24h")}</option><option value="all">${tr("전체 기록 · 7일", "All records · 7d")}</option><option value="sold">${tr("판매 완료 표시", "Marked sold")}</option><option value="stale">${tr("24시간 경과", "Over 24h old")}</option></select></label></div><div class="price-band-filter" id="md-price-band" hidden><span></span><button class="btn ghost small-btn" data-clear-band>${tr("가격대 해제", "Clear price band")}</button></div><p id="md-count" class="muted note" role="status"></p><div id="md-rows"></div><div id="md-pages" class="mb-pagination"></div></div>
 <div id="mb-detail-charts" role="tabpanel" aria-label="${tr("가격 추이와 매물대", "Trends and depth")}"><div id="mk-charts"><p>${T.loading}</p></div></div>`;
  $("md-sort").value = detailState.sort;
  $("md-state").value = detailState.state;
  discordResult(id);
  detailPanels();
  if (!FIXED && window.matchMedia("(max-width:1050px)").matches) $("mk-detail").scrollIntoView({behavior:"smooth",block:"start"});
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
    priceData = data;
    renderDaily();
    // Consumables and cash items that no shop scan covers take their asking price from megaphones (/prices basis "mega").
    if (!(data.profile || []).length) get(`/prices?ids=${id}`).then((p) => { if (priceData === data && p?.[id]?.mega) { data.megaAsk = p[id].mega; renderDaily(); } }).catch(() => null);
    // The cheap/typical/pricey tags need the typical range, which can arrive after the listing cards.
    if (lastOffers && $("md-rows")?.querySelector(".mb-offers")) $("md-rows").innerHTML = offerCards(lastOffers);
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
    if (e.name !== "AbortError" && seq === detailSeq) $("mb-history").innerHTML = "";
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
    $("md-rows").innerHTML = offerCards(data.rows);
    $("md-pages").innerHTML = pager(data, "detail");
    // One event per item opened (not per filter change, page or refresh): the detail loaded and showed its listings.
    if (pendingOpen?.id === id) {
      track("market_item", { item_id: id, listings: data.total, result: data.total ? "ok" : "empty", interaction_source: pendingOpen.source, lang: D.lang });
      pendingOpen = null;
    }
  } catch {
    if (seq === detailListSeq && id === selected) {
      $("md-rows").innerHTML =
        `<p>${T.failed}</p><button class="btn small-btn" data-retry-detail>${T.retry}</button>`;
      $("md-count").textContent = "";
      if (pendingOpen?.id === id) {
        track("market_item", { item_id: id, result: "error", interaction_source: pendingOpen.source, lang: D.lang });
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
    `<header class="mk-head"><div><h2 id="mb-shop-title">${esc(seller)}</h2><p>CH ${channel} · ${placeLabel(Number(room), ko)}</p></div><button class="btn ghost small-btn" data-close-shop aria-label="${tr("상점 닫기", "Close shop")}">×</button></header><p class="muted note">${tr("이 위치의 상점에서 확인한 판매 매물이에요.", "Asking listings recorded for this shop and location.")}</p><p id="mb-shop-count"></p><div id="mb-shop-rows">${T.loading}</div><div id="mb-shop-pages" class="mb-pagination"></div>`;
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
// The catalog is the slowest call (the API answers from the US), so the last copy is kept in this browser and drawn at
// once on the next visit while the fresh one loads; the first request also starts before the item names have arrived.
const CATALOG_KEY = "gms-market-catalog";
let catalogFetch = get("/market/catalog").catch(() => null);
function cachedCatalog() {
  try {
    const c = JSON.parse(localStorage.getItem(CATALOG_KEY) || "null");
    return c && Date.now() - Date.parse(c.asOf) < 6 * 3600000 ? c : null;
  } catch { return null; }
}
async function refresh() {
  if (refreshing || document.hidden) return;
  refreshing = true;
  try {
    const pending = catalogFetch || get("/market/catalog");
    catalogFetch = null;
    // First draw from the saved copy while the network answers.
    if (!catalog) {
      const saved = cachedCatalog();
      if (saved) { catalog = saved; if (view === "items") renderDirectory(); }
    }
    const fresh = await pending;
    if (!fresh) throw Error("catalog");
    catalog = fresh;
    try { localStorage.setItem(CATALOG_KEY, JSON.stringify(fresh)); } catch {}
    // The item panel's scroll and comparison prices come from the catalog; redraw them once it is in.
    if (selected && !$("mb-info")?.dataset.priced) fillItemInfo(selected);
    for (const k of ["open", "shops", "items", "records"])
      $("mk-stat-" + k).textContent = money(catalog.stats[k]);
    // The time goes in as a variable so derived locales match their translation key.
    $("mk-status").textContent = ko
      ? `목록 기준 ${clock(Date.parse(catalog.asOf))} · 60초마다 확인`
      : tx("Directory as of {at} · checks every 60s", { at: clock(Date.parse(catalog.asOf)) });
    if (view === "items") renderDirectory();
    else renderSummary();
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
  "mb-class",
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
  // A click anywhere on an item row opens it, not only on the name.
  const el = e.target.closest("button,a") || (!e.target.closest("input,select,label") && e.target.closest(".mb-catalog tbody tr")?.querySelector("a[data-item]"));
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
    const url = shareUrl(FIXED ? location.pathname : `${location.pathname}?item=${id}`, "market-item");
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
// What the item is and where it comes from, under the price: requirements and stats, NPC price, quest rewards and the
// monsters that drop it (the same data file as the hover cards, loaded once).
let tipsData = null, tips = null;
const loadTips = () => (tipsData ||= fetch(document.body.dataset.tips).then((r) => r.json()).then((d) => (tips = d)).catch(() => null));
// What an NPC shop pays for one (game data; 0 when unknown or not loaded yet), and how that compares with the market.
const npcSell = (id) => tips?.items?.[id]?.[9] || 0;
// basis: which market price was compared (today's asking median or the reference "typical" price), named in the text.
function npcNote(id, price, basis = "") {
  const sell = npcSell(id);
  if (!sell || !price) return "";
  const pct = Math.round(((sell - price) / price) * 100);
  const what = basis || tr("시세", "market");
  return sell >= price
    ? tr(`NPC 상점이 시세보다 ${pct}% 더 줘요 (${what} ${nf.format(price)} · NPC ${nf.format(sell)})`, `An NPC shop pays ${pct}% more than the market (${what} ${nf.format(price)} · NPC ${nf.format(sell)})`)
    : tr(`NPC 상점가가 시세의 ${Math.round((sell / price) * 100)}%예요. 올려 두는 수고를 생각하면 NPC가 나아요`, `An NPC shop pays ${Math.round((sell / price) * 100)}% of the market price; selling there saves the listing`);
}
// The NPC price under the price headline: always shown as the floor not to list below, and called out when an NPC
// shop pays about as much as players do (the market price is the catalog's, as in the list).
function npcLine(id, fallback) {
  const sell = npcSell(id);
  if (!sell) return "";
  const c = catalog?.items.find((r) => r.item === id);
  const price = refPrice(c) ?? fallback;
  const basis = c?.median != null ? tr("판매가 중앙값", "asking median") : c?.typical ? tr("대표 시세", "typical price") : tr("판매가", "asking price");
  if (npcBetter(sell, price)) return `<p class="mb-npc good"><b>${tr("NPC에 파는 게 이득", "Better sold to an NPC")}</b> ${esc(npcNote(id, price, basis))}</p>`;
  const pct = price ? (sell / price) * 100 : null;
  // Far below the market (scrolls, gear) the NPC price is a footnote; near it, it is the floor not to list below.
  if (pct == null || pct < 10) return `<p class="mb-npc">${tr("상점 판매가", "NPC buys for")} <b>${nf.format(sell)}</b> ${tr("메소", "mesos")}</p>`;
  return `<p class="mb-npc">${tr("상점 판매가", "NPC buys for")} <b>${nf.format(sell)}</b> ${tr("메소", "mesos")} · ${tr(`시세의 ${Math.round(pct)}%`, `${Math.round(pct)}% of market`)}<small>${tr("이보다 싸게 올리면 NPC에 파는 게 나아요", "Listing below this earns less than an NPC")}</small></p>`;
}
// Up to three monster sprites that drop an item, for the catalog's source column (like the hover cards' drop list).
const dropIcons = (id) => {
  const t = tips?.items?.[id];
  const ids = (t?.[11] || []).filter((m) => tips.mobs[m]);
  if (!ids.length) return "";
  const more = t[12] - Math.min(3, ids.length);
  return `<span class="mb-src-mobs">${ids.slice(0, 3).map((m) => `<img src="${document.body.dataset.sprites}${m}.gif" width="26" height="26" alt="${esc(ko ? tips.mobs[m][0] : tips.mobs[m][1])}" title="${esc(ko ? tips.mobs[m][0] : tips.mobs[m][1])} Lv. ${tips.mobs[m][2]}" loading="lazy">`).join("")}${more > 0 ? `<small>+${more}</small>` : ""}</span>`;
};
const TIP_INC = { PAD: () => tr("공격력", "Weapon attack"), MAD: () => tr("마력", "Magic attack"), STR: () => "STR", DEX: () => "DEX", INT: () => "INT", LUK: () => "LUK",
  MHP: () => "HP", MMP: () => "MP", PDD: () => tr("물리 방어력", "Weapon defense"), MDD: () => tr("마법 방어력", "Magic defense"), ACC: () => tr("명중률", "Accuracy"),
  EVA: () => tr("회피율", "Avoidability"), Speed: () => tr("이동속도", "Speed"), Jump: () => tr("점프력", "Jump") };
const TIP_JOBS = [[1, () => tr("전사", "Warrior")], [2, () => tr("마법사", "Magician")], [4, () => tr("궁수", "Bowman")], [8, () => tr("도적", "Thief")]];
// For equipment: the scrolls that go on it (success rates and current price, by stat) and nearby items of the same type
// to compare (level, main stats, price), like NiaDB's item page. All from the hover-card data and the catalog.
const EQUIP_SCROLL_SLOT = { Hat: "Helmet", Top: "Topwear", Bottom: "Bottomwear", Glove: "Gloves", "One-Handed Blunt Weapon": "One-Handed BW", "Two-Handed Blunt": "Two-Handed BW", "Pole Arm": "Polearm" };
const TIERS = [["Lesser", () => tr("하급", "Lesser")], ["Intermediate", () => tr("중급", "Intermediate")], ["Greater", () => tr("상급", "Greater")], ["Chaos", () => tr("혼돈", "Chaos")]];
function equipExtras(id, data) {
  const me = data.items[id];
  const [, , , sub, lv] = me;
  const priceOfItem = (x) => { const c = catalog?.items.find((r) => r.item === x); return c ? c.median ?? c.typical : null; };
  const slot = EQUIP_SCROLL_SLOT[sub] || sub;
  const groups = new Map();
  for (const [sid, t] of Object.entries(data.items)) {
    if (t[2] !== "Use" || !t[10] || t[3] !== slot) continue;
    const m = /^(.*) Scroll: (\w+)$/.exec(t[1]);
    if (!m) continue;
    const stat = m[1].split(" ").slice(slot.split(" ").length).join(" ") || m[1];
    (groups.get(stat) || groups.set(stat, []).get(stat)).push({ id: Number(sid), tier: m[2], t });
  }
  const scrolls = [...groups].map(([stat, list]) => `<li><strong>${esc(stat)}</strong>${TIERS.map(([k, label]) => list.find((x) => x.tier === k)).filter(Boolean).map((x) => { const p = priceOfItem(x.id); const tier = TIERS.find(([k]) => k === x.tier)[1](); return `<a href="?item=${x.id}" data-item="${x.id}">${tier} +${x.t[10][0]} · ${x.t[10][1]}%${p ? ` <b>${kmoney(p)}</b>` : ""}</a>`; }).join("")}</li>`).join("");
  const near = Object.entries(data.items).filter(([sid, t]) => t[2] === "Equip" && t[3] === sub && Number(sid) !== id && Math.abs((t[4] || 0) - (lv || 0)) <= 10)
    .sort((a, b) => Math.abs(a[1][4] - lv) - Math.abs(b[1][4] - lv) || a[1][4] - b[1][4]).slice(0, 6);
  const statLine = (t) => Object.entries(t[7] || {}).slice(0, 3).map(([k, v]) => `${TIP_INC[k] ? TIP_INC[k]() : esc(k)} +${v}`).join(" · ");
  const compare = near.length ? `<h3>${tr("비슷한 장비 비교", "Compare similar gear")}</h3><ul class="mb-near">${[[String(id), me], ...near].sort((a, b) => a[1][4] - b[1][4]).map(([sid, t]) => { const p = priceOfItem(Number(sid)); return `<li${Number(sid) === id ? ' class="me"' : ""}><a href="?item=${sid}" data-item="${sid}"><img src="https://maplestory.io/api/MCW/1/item/${sid}/icon" width="26" height="26" alt="" loading="lazy"><span>${esc(ko && t[0] ? t[0] : t[1])}<small>Lv. ${t[4] || 0} · ${statLine(t) || "—"}</small></span><b>${p ? kmoney(p) : "—"}</b></a></li>`; }).join("")}</ul>` : "";
  return `${scrolls ? `<h3>${tr("이 장비에 쓰는 주문서", "Scrolls for this item")}${me[8] ? ` <small>${tr(`업그레이드 ${me[8]}번`, `${me[8]} slots`)}</small>` : ""}</h3><ul class="mb-scrolls">${scrolls}</ul>` : ""}${compare}`;
}
async function fillItemInfo(id) {
  const data = await loadTips();
  const box = $("mb-info");
  const t = data?.items?.[id];
  if (!box || !t || selected !== id) return;
  const [, , cat, , lv, job, req, inc, slots, sell, scroll, drops, dropN, questN] = t;
  const facts = [];
  if (scroll) facts.push(`${tr("성공률", "Success")} ${scroll[1]}%${scroll[2] ? ` · ${tr("실패 시 파괴", "Boom on fail")} ${scroll[2]}%` : ""}`);
  if (cat === "Equip") {
    const jobs = TIP_JOBS.filter(([b]) => job & b).map(([, n]) => n()).join(", ") || tr("모든 직업", "All classes");
    facts.push(`${lv ? `Lv. ${lv} · ` : ""}${esc(jobs)}`);
    const reqs = Object.entries(req || {}).map(([k, v]) => `${k.toUpperCase()} ${v}`).join(" · ");
    if (reqs) facts.push(reqs);
    if (slots) facts.push(`${tr("업그레이드 가능 횟수", "Upgrade slots")} ${slots}`);
  }
  // Stats apply to throwing stars and bullets too, not just equipment.
  const st = Object.entries(inc || {}).map(([k, v]) => `${TIP_INC[k] ? TIP_INC[k]() : esc(k)} +${v}`).join(" · ");
  if (st) facts.push(st);
  // The NPC price sits under the price headline (npcLine); draw it there now if prices arrived before this data.
  if (sell && priceData && !$("mb-history")?.querySelector(".mb-npc")) renderDaily();
  const mobs = (drops || []).filter((m) => data.mobs[m]);
  const mobLink = (m) => `/${D.lang}/monsters/${m}/`;
  const sprites = document.body.dataset.sprites;
  if (catalog) box.dataset.priced = "1";
  box.innerHTML = `${facts.length ? `<p class="mb-info-facts">${facts.map((f) => `<span>${f}</span>`).join("")}</p>` : ""}
<h3>${tr("드롭하는 몬스터", "Dropped by")} <small>${dropN ? tr(`${dropN}마리`, `${dropN}`) : ""}</small></h3>
${mobs.length ? `<ul class="mb-drops">${mobs.map((m) => { const x = data.mobs[m]; return `<li><a href="${mobLink(m)}"><img src="${sprites}${m}.gif" width="36" height="36" alt="" loading="lazy"><span>${esc(ko ? x[0] : x[1])}</span><small>Lv. ${x[2]}${x[7] ? ` <b class="mb-boss">${tr("보스", "BOSS")}</b>` : ""}</small></a></li>`; }).join("")}</ul>${dropN > mobs.length ? `<p class="muted note">${tr(`외 ${dropN - mobs.length}마리는 아이템 페이지에서 볼 수 있어요.`, `${dropN - mobs.length} more on the item page.`)}</p>` : ""}` : `<p class="muted note">${tr("지금 열린 맵의 몬스터는 이 아이템을 드롭하지 않아요.", "No monster on an open map drops this item.")}</p>`}
${cat === "Equip" ? equipExtras(id, data) : ""}
${data.quests?.[id]?.length ? `<h3>${tr("퀘스트 보상", "Quest reward")} <small>${tr(`${questN}개`, `${questN}`)}</small></h3><ul class="mb-quests">${data.quests[id].map(([p, name, lv]) => `<li><a href="/${D.lang}${p}">${esc(name)}</a>${lv ? `<small>Lv. ${lv}+</small>` : ""}</li>`).join("")}</ul>` : ""}`;
}

// Price at a glance, always on view under the item name (modelled on MesoWatch): the typical range (25th to 75th
// percentile of today's open asks) set large, how many current listings sit below, inside and above it, and a chart of
// every listing seen (dots) over the daily typical-range band and median line. One axis, mesos; 7 days, 30 days or all.
const kmoney = (n) => (n == null ? "—" : ko ? (n >= 1e8 ? `${+(n / 1e8).toFixed(2)}억` : n >= 1e4 ? `${+(n / 1e4).toFixed(n >= 1e6 ? 0 : 1)}만` : nf.format(n)) : n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : nf.format(n));
const quant = (sorted, f) => sorted[Math.min(sorted.length - 1, Math.floor(f * (sorted.length - 1) + 0.5))];
let priceData = null, histRange = 7;
function renderDaily() {
  const box = $("mb-history");
  if (!box || !priceData) return;
  const { daily = [], rows = [], profile = [] } = priceData;
  const now = Date.parse(priceData.asOf) || Date.now();
  const open = profile.map((r) => r.price).filter((p) => p > 0).sort((a, b) => a - b);
  const lastDay = daily.filter((d) => d.p25 != null).at(-1);
  const megaAsk = priceData.megaAsk || null;
  const [r25, r75] = open.length >= 4 ? [quant(open, 0.25), quant(open, 0.75)] : lastDay ? [lastDay.p25, lastDay.p75] : [null, null];
  const below = open.filter((p) => p < r25).length, above = open.filter((p) => p > r75).length, inside = open.length - below - above;
  const head = r25 != null
    ? `<div class="mb-range"><span class="mb-range-label">${tr("보통 가격대", "Typical range")}</span><b>${kmoney(r25)}${r75 !== r25 ? ` – ${kmoney(r75)}` : ""}</b><small>${open.length >= 4 ? tr(`지금 판매 중 ${open.length}건 기준`, `from ${open.length} listings now`) : tr(`${lastDay.day.slice(5).replace("-", "/")} 기록 기준`, `from ${lastDay.day.slice(5).replace("-", "/")} records`)}</small></div>`
    : megaAsk
      ? `<div class="mb-range"><span class="mb-range-label">${tr("고확 호가", "Megaphone asking price")}</span><b>${kmoney(megaAsk.p25)}${megaAsk.p75 !== megaAsk.p25 ? ` – ${kmoney(megaAsk.p75)}` : ""}</b><small>${tr(`최근 7일 고확 ${megaAsk.n}건 기준 · 상점 매물은 아직 없어요`, `from ${megaAsk.n} megaphones in 7 days; no shop listings yet`)}</small></div>`
      : `<div class="mb-range"><span class="mb-range-label">${tr("보통 가격대", "Typical range")}</span><b>—</b><small>${tr("아직 기록이 부족해요", "Not enough records yet")}</small></div>`;
  // Where today's listings sit: a dot per listing on a price line with the typical range shaded.
  let dist = "";
  if (open.length >= 2) {
    const W = 600, H = 46, P = 10;
    const lo = quant(open, 0.03), hi = quant(open, 0.97) > lo ? quant(open, 0.97) : lo * 1.1 + 1;
    const x = (v) => P + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (W - 2 * P);
    const stack = new Map();
    const dots = open.map((p) => { const cx = Math.round(x(p) / 6) * 6, k = stack.get(cx) || 0; stack.set(cx, k + 1); return `<circle cx="${cx}" cy="${30 - k * 6}" r="2.6" class="${p < r25 ? "lo" : p > r75 ? "hi" : "in"}"/>`; }).join("");
    dist = `<div class="mb-dist"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${tr("지금 매물 가격 분포", "Where current listings sit")}"><rect class="band" x="${x(r25)}" y="2" width="${Math.max(3, x(r75) - x(r25))}" height="34" rx="4"/>${dots}<line class="base" x1="${P}" x2="${W - P}" y1="36" y2="36"/><text x="${P}" y="${H - 1}">${kmoney(lo)}</text><text x="${W - P}" y="${H - 1}" text-anchor="end">${kmoney(hi)}</text></svg>
<p class="mb-dist-counts"><span class="lo">${tr(`싸게 ${below}건`, `${below} below`)}</span><span class="in">${tr(`보통 ${inside}건`, `${inside} in range`)}</span><span class="hi">${tr(`비싸게 ${above}건`, `${above} above`)}</span><small>${tr(`최저 ${kmoney(open[0])}`, `lowest ${kmoney(open[0])}`)}</small></p></div>`;
  }
  // History chart.
  const DAYMS = 86400000;
  const firstDay = daily.length ? Date.parse(`${daily[0].day}T00:00:00Z`) : now - 7 * DAYMS;
  const start = histRange === "all" ? firstDay : Math.max(firstDay, now - histRange * DAYMS);
  const W = 600, H = 190, L = 58, R = 10, Tp = 12, B = 22;
  const days = daily.filter((d) => Date.parse(`${d.day}T12:00:00Z`) >= start - DAYMS / 2 && d.median != null);
  const pts = rows.filter((r) => r.price > 0).map((r) => ({ t: Date.parse(`${String(r.seen).replace(" ", "T")}Z`), p: r.price, sold: !!r.sold })).filter((r) => r.t >= start);
  const all = [...days.flatMap((d) => [d.p25, d.p75, d.median]), ...pts.map((r) => r.p)].filter((v) => v != null).sort((a, b) => a - b);
  let chart = "";
  if (all.length >= 2 && (days.length >= 1 || pts.length >= 2)) {
    let lo = quant(all, 0.04), hi = quant(all, 0.96);
    if (hi <= lo) { hi = lo * 1.1 + 1; lo = lo * 0.9; }
    const pad = (hi - lo) * 0.08; lo = Math.max(0, lo - pad); hi += pad;
    const x = (t) => L + ((t - start) / Math.max(1, now - start)) * (W - L - R);
    const y = (v) => Tp + (1 - (v - lo) / (hi - lo)) * (H - Tp - B);
    const noon = (d) => Date.parse(`${d.day}T12:00:00Z`);
    // Band and line run only across consecutive days; a gap in collection breaks them.
    const runs = [];
    for (const d of days) (runs.length && noon(d) - noon(runs.at(-1).at(-1)) <= 2 * DAYMS ? runs.at(-1) : runs[runs.push([]) - 1]).push(d);
    const band = runs.map((r) => r.length > 1 ? `<path class="band" d="M${r.map((d) => `${x(noon(d)).toFixed(1)},${y(Math.min(hi, d.p75)).toFixed(1)}`).join("L")}L${[...r].reverse().map((d) => `${x(noon(d)).toFixed(1)},${y(Math.max(lo, d.p25)).toFixed(1)}`).join("L")}Z"/>` : `<rect class="band" x="${x(noon(r[0])) - 5}" y="${y(Math.min(hi, r[0].p75))}" width="10" height="${Math.max(2, y(Math.max(lo, r[0].p25)) - y(Math.min(hi, r[0].p75)))}"/>`).join("");
    const line = runs.map((r) => `<path class="med" d="M${r.map((d) => `${x(noon(d)).toFixed(1)},${y(Math.min(hi, Math.max(lo, d.median))).toFixed(1)}`).join("L")}"/>`).join("");
    const dots = pts.map((r) => r.p > hi ? `<path class="out" d="M${x(r.t).toFixed(1)},${Tp - 2}l-3,5h6z"/>` : r.p < lo ? `<path class="out" d="M${x(r.t).toFixed(1)},${H - B + 2}l-3,-5h6z"/>` : `<circle class="${r.sold ? "sale" : "ask"}" cx="${x(r.t).toFixed(1)}" cy="${y(r.p).toFixed(1)}" r="2.4"/>`).join("");
    const ticks = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1];
    const dayTicks = [start, (start + now) / 2, now].map((t) => new Date(t).toLocaleDateString(D.lang, { month: "numeric", day: "numeric", ...TZ }));
    chart = `<svg class="mb-hist" viewBox="0 0 ${W} ${H}" role="img" aria-label="${tr("가격 추이", "Price history")}">${ticks.map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${kmoney(Math.round(v))}</text>`).join("")}
${band}${dots}${line}${days.map((d) => `<circle class="dm" cx="${x(noon(d)).toFixed(1)}" cy="${y(Math.min(hi, Math.max(lo, d.median))).toFixed(1)}" r="3.5"><title>${d.day.slice(5).replace("-", "/")} · ${tr("중앙값", "median")} ${money(d.median)} · ${tr("보통", "typical")} ${money(d.p25)}–${money(d.p75)} · ${tr(`매물 ${d.n}건`, `${d.n} listings`)}</title></circle>`).join("")}
${dayTicks.map((s, i) => `<text class="ax" x="${[L, (L + W - R) / 2, W - R][i]}" y="${H - 5}" text-anchor="${["start", "middle", "end"][i]}">${s}</text>`).join("")}</svg>
<p class="mb-hist-legend"><span class="k ask"></span>${tr("매물", "Listing")} <span class="k band"></span>${tr("보통 가격대", "Typical range")} <span class="k med"></span>${tr("하루 중앙값", "Daily median")}${pts.some((r) => r.p > hi || r.p < lo) ? ` <span>▲▼ ${tr("범위 밖 가격", "off the scale")}</span>` : ""}</p>`;
  } else chart = `<p class="muted note">${tr("아직 기록이 적어서 추이를 그리기 어려워요. 매일 쌓이면 여기에 그려져요.", "Too few records for a trend yet; it fills in as days add up.")}</p>`;
  const ranges = [[7, tr("7일", "7d")], [30, tr("30일", "30d")], ["all", tr("전체", "All")]];
  box.innerHTML = `${head}${npcLine(selected, open.length ? quant(open, 0.5) : lastDay?.median ?? megaAsk?.median ?? null)}${dist}<div class="mb-hist-head"><h3>${tr("가격 추이", "Price history")}</h3><div class="mb-hist-range" role="group">${ranges.map(([v, l]) => `<button type="button" data-hist-range="${v}" aria-pressed="${histRange === v}">${l}</button>`).join("")}</div></div>${chart}`;
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-hist-range]");
  if (!b) return;
  histRange = b.dataset.histRange === "all" ? "all" : Number(b.dataset.histRange);
  renderDaily();
});
// Price alerts (Web Push): "tell me when this item is listed at or under X". The browser subscribes once with the site's
// VAPID key; the worker's schedule checks new listings every 15 minutes and pushes; assets/sw.js shows the notification.
// Shown only when site.config enables alerts.
const b64key = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
async function pushSubscription(create) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const reg = await navigator.serviceWorker.register(D.alerts.sw);
  await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) || (create ? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64key(D.alerts.key) }) : null);
}
async function openAlert(id) {
  const box = $("mb-alert");
  if (!box) return;
  box.hidden = false;
  const open = (priceData?.profile || []).map((r) => r.price).filter((p) => p > 0).sort((a, b) => a - b);
  const suggest = open.length >= 4 ? quant(open, 0.25) : open[0] || "";
  // Discord DM alerts: "Log in with Discord" on the worker saves the alert, joins the GMS Hub server and DMs a confirmation,
  // then comes back here with ?dalert= (see discordResult). Works on every phone, no browser permission.
  const invite = document.body.dataset.discordUrl;
  const viaDiscord = invite ? `<form class="mb-alert-form" data-discord-alert="${id}"><label>${tr("이 가격 이하로 올라오면 <b>디스코드 DM</b>으로 알려 주기", "<b>DM me on Discord</b> when it is listed at or under")} <input name="price" value="${suggest ? kmoney(suggest) : ""}" placeholder="${tr("예: 300만", "e.g. 3m")}" required></label><button class="btn small-btn" type="submit">${tr("디스코드로 알림 받기", "Get it on Discord")}</button><small class="muted">${tr("디스코드 승인을 한 번 누르면 끝나요. 상점 매물과 확성기를 보고, 더 싼 매물이 나오면 다시 알려 드려요.", "One tap to approve on Discord. Shop listings and megaphones are watched; a cheaper one alerts you again.")}</small><span class="share-status" role="status"></span></form>` : "";
  const supported = D.alerts && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) {
    box.innerHTML = viaDiscord || `<p class="muted note">${tr("이 브라우저는 알림을 지원하지 않아요. 아이폰은 사이트를 홈 화면에 추가한 뒤 그 앱에서 켤 수 있어요.", "This browser cannot show alerts. On iPhone, add the site to your home screen and turn alerts on from there.")}</p>`;
    return;
  }
  let current = null;
  try {
    const sub = await pushSubscription(false);
    if (sub) current = ((await (await fetch(`${D.api}/alerts?endpoint=${encodeURIComponent(sub.endpoint)}`)).json()).alerts || []).find((a) => a.item === id) || null;
  } catch {}
  box.innerHTML = `<form class="mb-alert-form" data-alert-item="${id}"><label>${tr("이 가격 이하로 올라오면 알려 주기", "Tell me when it is listed at or under")} <input name="price" inputmode="numeric" value="${current?.price || suggest}" required></label><button class="btn small-btn" type="submit">${current ? tr("알림 가격 바꾸기", "Update alert") : tr("알림 켜기", "Turn on alert")}</button>${current ? `<button type="button" class="btn ghost small-btn" data-alert-off="${id}">${tr("알림 끄기", "Turn off")}</button>` : ""}<small class="muted">${tr("새 매물은 15분마다 확인해요. 한 번 울리면 6시간 동안은 다시 울리지 않아요.", "New listings are checked every 15 minutes; after an alert it rests for 6 hours.")}</small><span class="share-status" role="status"></span></form>${viaDiscord}`;
}
document.addEventListener("click", async (e) => {
  const openBtn = e.target.closest("[data-alert-open]");
  if (openBtn) { openAlert(Number(openBtn.dataset.alertOpen)); window.track?.("alert_open"); return; }
  const off = e.target.closest("[data-alert-off]");
  if (off) {
    const sub = await pushSubscription(false).catch(() => null);
    if (sub) await fetch(`${D.api}/alerts?endpoint=${encodeURIComponent(sub.endpoint)}&item=${off.dataset.alertOff}`, { method: "DELETE" }).catch(() => null);
    $("mb-alert").innerHTML = `<p class="muted note">${tr("알림을 껐어요.", "Alert turned off.")}</p>`;
  }
});
// "300만", "3m", "500k", "1,200,000" → mesos.
const amount = (t) => {
  const m = String(t).toLowerCase().replace(/[,\s]|메소/g, "").match(/^(\d+(?:\.\d+)?)(억|만|천|k|m|b)?$/);
  return m ? Math.round(+m[1] * ({ 억: 1e8, 만: 1e4, 천: 1e3, k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1)) : NaN;
};
document.addEventListener("submit", (e) => {
  const form = e.target.closest("[data-discord-alert]");
  if (!form) return;
  e.preventDefault();
  const price = amount(form.price.value), id = Number(form.dataset.discordAlert);
  if (!(price > 0)) { form.querySelector(".share-status").textContent = tr("가격을 300만, 3m, 1200000 처럼 적어 주세요.", "Write the price like 3m, 500k or 1200000."); return; }
  const back = new URL(location.href);
  back.searchParams.set("item", id);
  back.searchParams.delete("dalert");
  window.track?.("discord_click", { place: "price-alert", item_id: id });
  location.href = `${D.api}/discord/oauth/start?${new URLSearchParams({ item: id, price, intent: "sell", lang: D.lang === "ko" ? "ko" : "en", ret: back.pathname + back.search })}`;
});
// Back from Discord: ?dalert=ok|nodm|full|cancel|off|fail and the item, shown once in the item's alert box.
let discordReturn = (() => {
  const p = new URLSearchParams(location.search), v = p.get("dalert");
  if (!v) return null;
  p.delete("dalert");
  history.replaceState(null, "", location.pathname + (p.toString() ? `?${p}` : "") + location.hash);
  return { v, item: Number(p.get("item")) };
})();
function discordResult(id) {
  if (!discordReturn || discordReturn.item !== id || !$("mb-alert")) return;
  const v = discordReturn.v, invite = document.body.dataset.discordUrl || "";
  discordReturn = null;
  const msg = {
    ok: tr("✅ 알림을 켰어요. 디스코드 DM을 확인해 보세요. GMS Hub 디스코드에도 들어와 있어요.", "✅ Alert on. Check your Discord DMs; you are also in the GMS Hub Discord now."),
    nodm: tr("알림은 저장했지만 DM을 보내지 못했어요. 디스코드 설정 > 개인정보 보호에서 서버 멤버의 DM을 허용하면 그때부터 받아요.", "Saved, but the DM did not go through. Allow direct messages from server members in Discord's privacy settings to receive alerts."),
    full: tr("디스코드 알림은 10개까지예요. 디스코드에서 /알림 삭제로 하나를 지워 주세요.", "You can have up to 10 Discord alerts. Remove one with /alert remove in Discord."),
    cancel: tr("디스코드 승인을 취소했어요.", "You cancelled on Discord."),
    off: tr("디스코드 로그인 알림을 준비하고 있어요. 지금은 디스코드에서 <code>/알림 추가</code>로 받을 수 있어요.", "Discord login alerts are almost ready. For now use <code>/alert add</code> in Discord."),
  }[v] || tr("알림을 켜지 못했어요. 잠시 뒤 다시 시도해 주세요.", "Could not turn the alert on. Please try again.");
  const box = $("mb-alert");
  box.hidden = false;
  box.innerHTML = `<p class="note">${msg}${v === "off" && invite ? ` <a href="${esc(invite)}" target="_blank" rel="noopener" data-discord="price-alert">${tr("디스코드 열기", "Open Discord")}</a>` : ""}</p>`;
}
document.addEventListener("submit", async (e) => {
  const form = e.target.closest(".mb-alert-form:not([data-discord-alert])");
  if (!form) return;
  e.preventDefault();
  const status = form.querySelector(".share-status");
  const price = Number(String(form.price.value).replace(/[^\d]/g, ""));
  if (!(price > 0)) { status.textContent = tr("가격을 숫자로 적어 주세요.", "Enter a price in mesos."); return; }
  try {
    if ((await Notification.requestPermission()) !== "granted") { status.textContent = tr("브라우저 알림을 허용해야 받을 수 있어요.", "Allow notifications in the browser to get alerts."); return; }
    const sub = (await pushSubscription(true)).toJSON();
    const id = Number(form.dataset.alertItem);
    const r = await fetch(`${D.api}/alerts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.keys, item: id, price, name: itemName(id), lang: D.lang }) });
    if (!r.ok) throw Error(String(r.status));
    status.textContent = tr(`${money(price)} 메소 이하로 올라오면 알려 드릴게요.`, `You will be alerted at ${money(price)} mesos or less.`);
    window.track?.("alert_on", { item_id: id });
  } catch { status.textContent = tr("알림을 켜지 못했어요. 잠시 뒤 다시 시도해 주세요.", "Could not turn the alert on. Please try again."); }
});

// Recent megaphones naming this item (last 3 days): who is selling or buying it, for how much, on which channel. Each
// opens the megaphone page focused on it. The asking price is compared with the typical range when it is known.
async function fillMegaphones(id) {
  const it = byId.get(id);
  if (!it?.en) return;
  let rows = [];
  try { rows = (await get(`/megaphones?item=${id}&limit=8`)).rows || []; } catch { return; }
  if (selected !== id) return;
  megaRows = { id, rows };
  drawMegaphones(id);
}
// The item's megaphone list, redrawn when a new one naming the item is pushed over the presence socket (common.js).
let megaRows = { id: 0, rows: [] };
addEventListener("gms-megaphones", (e) => {
  if (!selected || megaRows.id !== selected) return;
  const fresh = e.detail.filter((r) => r.item === selected && !megaRows.rows.some((x) => x.id === r.id));
  if (!fresh.length) return;
  megaRows.rows = fresh.sort((a, b) => b.id - a.id).concat(megaRows.rows).slice(0, 8);
  apiCache.delete(`/megaphones?item=${selected}&limit=8`);
  drawMegaphones(selected);
});
function drawMegaphones(id) {
  const rows = megaRows.rows;
  // The panel is drawn after the fetch starts, so the box is looked up once the answer is in.
  const box = $("mb-megas");
  if (selected !== id || !box) return;
  if (!rows.length) { box.hidden = true; return; }
  const megaPage = `/${D.lang}/megaphone/`;
  box.innerHTML = `<h3>${tr("최근 고확에 나온 이 아이템", "In recent megaphones")} <small>${tr("최근 3일", "last 3 days")}</small></h3><ul class="mb-mega-list">${rows.map((r) => {
    const intent = intentOf(r.text), p = megaPrice(r.text);
    return `<li><a href="${megaPage}?m=${r.id}"><span class="mb-mega-kind ${intent}">${intent === "sell" ? tr("팝니다", "Selling") : intent === "buy" ? tr("삽니다", "Buying") : tr("고확", "Mega")}</span><span class="mb-mega-text">${esc(r.text.replace(/^\s*\[[^\]]*\]\s*/, ""))}</span><span class="mb-mega-meta">${p ? `<b>${kmoney(p)}</b>` : ""}${r.channel ? `<span class="mb-ch" style="--h:${(Number(r.channel) * 47) % 360}">CH ${r.channel}</span>` : ""}<small>${esc(r.nick)} · ${ago(r.seen)}</small></span></a></li>`;
  }).join("")}</ul>`;
  box.hidden = false;
}

async function initialize() {
  // Drop sources fill the catalog's source column once the hover-card data arrives.
  loadTips().then(() => { if (view === "items" || $("mb-class").value) renderMain(); });
  try {
    const r = await fetch(D.itemsUrl);
    if (!r.ok) throw Error("items");
    items = makeMarketIndex(await r.json(), D.lang);
    byId = new Map(items.map((it) => [it.id, it]));
    const p = new URLSearchParams(location.search),
      id = FIXED || Number(p.get("item"));
    if (p.get("q")) $("mk-q").value = p.get("q");
    // Items (one row per item, like MesoWatch) is the default view; "all listings" is for finding a seller, channel or
    // room. The anonymous price-report tab was removed (no one used it); old ?view=reports links open the items.
    const initialView = ["items", "listings"].includes(p.get("view"))
      ? p.get("view")
      : "items";
    // How the page was reached with an item preselected: a shared link, the home "pick up" strip, or any other link.
    const source = FIXED ? "item-page" : p.get("utm_source") === "share" ? "share" : p.get("src") === "home" ? "home" : "url";
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
