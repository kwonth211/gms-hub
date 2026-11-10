import './collection-status.js';
import { indexEntry, searchEntries } from './search-index.js';

const input = document.getElementById('site-search');
const main = document.querySelector('.dir-main');
const favSection = document.getElementById('favorites');
const favCards = document.getElementById('fav-cards');
const favToc = document.getElementById('fav-toc');
const originals = [...document.querySelectorAll('[data-cat] .site-card')];
const FAV_KEY = 'gmshub_favs';
const filterBar = document.getElementById('filter-bar');
let activeCat = null;

// Favorites live only in this browser; storage can be unavailable (private mode), so fail soft.
function loadFavs() {
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}
function saveFavs(list) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(list));
  } catch (e) {}
}
let favs = loadFavs();

function syncButtons() {
  document.querySelectorAll('.fav').forEach((btn) => {
    const on = favs.includes(btn.dataset.url);
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? '★' : '☆';
    btn.title = on ? main.dataset.favRemove : main.dataset.favAdd;
  });
}

function renderFavs() {
  favCards.innerHTML = '';
  // Keep the order the user starred them in.
  favs.forEach((url) => {
    const card = originals.find((c) => c.dataset.url === url);
    if (card) favCards.appendChild(card.cloneNode(true));
  });
  const n = favCards.children.length;
  favSection.hidden = n === 0;
  favToc.hidden = n === 0;
  document.getElementById('fav-count').textContent = n;
  document.getElementById('fav-count-2').textContent = n;
  syncButtons();
  filter();
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.fav');
  if (!btn) return;
  const url = btn.dataset.url;
  const adding = !favs.includes(url);
  favs = adding ? [...favs, url] : favs.filter((u) => u !== url);
  track(adding ? 'favorite_add' : 'favorite_remove', { site_id: btn.closest('.site-card')?.dataset.id });
  saveFavs(favs);
  renderFavs();
});

// Category browsing is independent of the global search.
function filter() {
  document.querySelectorAll('[data-cat]').forEach((cat) => {
    cat.hidden = !!activeCat && cat.id !== activeCat;
  });
  favSection.hidden = !!activeCat || !favCards.children.length;
}

const korean = document.documentElement.lang === 'ko';
const searchPanel = document.getElementById('search-results');
const searchShell = document.querySelector('.home-search-shell');
const searchSubmit = document.querySelector('.search-submit');
let searchOpen = false;
const searchGroups = document.getElementById('search-groups');
const searchStatus = document.getElementById('search-status');
const searchEmpty = document.getElementById('search-empty');
const itemState = document.getElementById('search-item-state');
const retryItems = document.getElementById('search-retry');
const clearSearch = document.getElementById('search-clear');
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const labels = korean
  ? { item: '아이템', mob: '몬스터', site: '사이트', tool: '도구·가이드', market: '시세 보기', mobAction: '상세 정보', mobStatus: { upcoming: '11/18 열리는 포가튼 할로우 몬스터', unavailable: '미개방 지역', unplaced: '아직 맵에 없음' }, mobInfo: (lv, hp) => `${lv}레벨 · HP ${hp.toLocaleString('ko')} · 드롭 아이템·출현 위치·능력치`, loading: '아이템을 불러오는 중…', error: '아이템을 불러오지 못했어요. 사이트와 도구는 계속 검색할 수 있어요.', partial: ' · 아이템 불러오는 중', failed: ' · 아이템 검색 일시 불가', external: '새 탭에서 열기' }
  : { item: tx('Items'), mob: tx('Monsters'), site: tx('Sites'), tool: tx('Tools & guides'), market: tx('View prices'), mobAction: tx('View details'), mobStatus: { upcoming: tx('Forgotten Hollow, opens Nov 18'), unavailable: tx('Unreleased area'), unplaced: tx('Not on any map yet') }, mobInfo: (lv, hp) => tx('Level {lv} · {hp} HP · drops, locations and combat stats', { lv, hp: hp.toLocaleString('en') }), loading: tx('Loading items…'), error: tx('Items could not be loaded. Sites and tools are still searchable.'), partial: tx(' · loading items'), failed: tx(' · items unavailable'), external: tx('Opens in a new tab') };
const siteAliases = { 'meso.watch': '메소워치 메소 와치', 'maplemarket.fyi': '메이플마켓', 'meowdb.com': '니아먀오 니아메오', 'henesys.gg': '헤네시스', 'discord.com': '디스코드 디코', 'discord.gg': '디스코드 디코', 'reddit.com': '레딧', 'metaroad.gg': '메타로드', 'dcinside.com': '디시 디씨 갤러리 갤' };
const toolKeywords = {
  training: '사냥터 레벨업 경험치 사냥 맵 training level exp map grind',
  scroll: '주문서 강화 작 공격력 업그레이드 슬롯 계산기 scroll upgrade slot calculator',
  'drop-rate': '확률 드롭 상자 박스 뽑기 계산기 drop rate box gacha chance calculator',
  market: '시세 가격 메소 아이템 거래 매물 경매장 경매 가격변동 그래프 차트 price market auction item mesos',
  price: '시세 가격 메소 아이템 거래 price market item mesos',
  scan: '상점 스캔 이미지 인식 화면 공유 shop scan scanner ocr',
  monsters: '몬스터 도감 드롭 아이템 체력 경험치 출현 위치 monster bestiary drops hp exp locations',
  damage: '몇방 몇 방 컷 데미지 대미지 딜 명중률 몬스터 계산기 damage hits kill accuracy calculator',
};
const staticEntries = [
  ...originals.map((card) => {
    const a = card.querySelector('h4 a');
    const host = new URL(a.href).hostname.replace(/^www\./, '');
    const category = card.closest('[data-cat]').dataset.name;
    const aliases = Object.entries(siteAliases).filter(([domain]) => host === domain || host.endsWith(`.${domain}`)).map(([, words]) => words).join(' ');
    return indexEntry({ type: 'site', id: card.dataset.id, title: a.textContent.trim(), href: a.getAttribute('href'), description: `${category} · ${host}`, names: [a.textContent.trim(), host, aliases], keywords: `${card.dataset.search} ${category}` });
  }),
  ...[...document.querySelectorAll('.tool-card')].map((a) => indexEntry({
    type: 'tool', id: a.getAttribute('href'), title: a.querySelector('strong').textContent.trim(), href: a.getAttribute('href'),
    description: a.querySelector('p').textContent.trim(),
    keywords: `${a.textContent} ${toolKeywords[new URL(a.href).pathname.split('/').filter(Boolean).at(-1)] || ''}`,
  })),
];
let items = null;
let itemEntries = [];
// Clicking a monster opens its static detail page; typing/Enter keeps the search panel open.
let mobEntries = [];
fetch(searchPanel.dataset.mobs)
  .then((r) => (r.ok ? r.json() : []))
  .then((rows) => {
    mobEntries = rows.map(([id, ko, en, lv, hp, , , , , , , , aliases, status]) => indexEntry({
      type: 'mob', id: `mob-${id}`, title: korean ? ko || en : en, names: [ko, en, ...String(aliases || '').split(' ')],
      description: labels.mobInfo(lv, hp) + (status ? ` · ${labels.mobStatus[status]}` : ''), href: `${searchPanel.dataset.monsters}${id}/`,
    }));
    if (searchOpen) renderSearch();
  })
  .catch(() => {});
let itemsPromise = null;
let itemError = false;
let searchType = 'all';
let searchMatches = [];
const expanded = new Map();
const INITIAL_ROWS = 4;
const PAGE_ROWS = 20;

// Search and the live market widget share one request. A failed request can be retried.
function loadItems() {
  if (items) return Promise.resolve(items);
  if (itemsPromise) return itemsPromise;
  itemError = false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  itemsPromise = fetch(searchPanel.dataset.items, { signal: controller.signal })
    .then((r) => {
      if (!r.ok) throw new Error(`Item index: ${r.status}`);
      return r.json();
    })
    .then((rows) => {
      if (!Array.isArray(rows) || !rows.length || rows.some((row) => !Array.isArray(row) || !Number.isInteger(row[0]) || typeof row[2] !== 'string')) throw new Error('Invalid item index');
      items = rows.map(([id, ko, en]) => ({ id, ko, en, name: korean ? ko || en : en }));
      itemEntries = items.map((it) => indexEntry({
        type: 'item', id: it.id, title: it.name, names: [it.ko, it.en, String(it.id)],
        keywords: '아이템 item', description: korean ? it.en : it.ko,
        href: `${searchPanel.dataset.market}?item=${it.id}`,
      }));
      return items;
    })
    .catch((error) => { itemError = true; throw error; })
    .finally(() => { clearTimeout(timeout); itemsPromise = null; renderSearch(); });
  return itemsPromise;
}

// Item rows carry the scanned market price, so a search answers "how much?" without opening the market page.
const priceApi = main.dataset.voteApi;
const prices = new Map();
let priceTimer = null;
function queuePrices(ids) {
  const missing = ids.filter((id) => !prices.has(id)).slice(0, 60);
  if (!priceApi || !missing.length) return;
  clearTimeout(priceTimer);
  priceTimer = setTimeout(async () => {
    try {
      const r = await fetch(`${priceApi}/prices?ids=${missing.join(',')}`);
      if (!r.ok) return;
      const data = await r.json();
      missing.forEach((id) => prices.set(id, data[id] || null));
      // Re-rendering while a result has focus would drop it; the prices show on the next keystroke instead.
      if (!searchPanel.contains(document.activeElement)) renderSearch();
    } catch (e) {}
  }, 250);
}
const priceBasis = korean ? { sold: '거래가', selling: '판매가', buying: '구매가' } : { sold: tx('Sold'), selling: tx('Asking'), buying: tx('Buying') };
function priceTag(id) {
  const p = prices.get(id);
  if (!p?.median) return labels.market;
  return `<b>${mesos(p.median)}</b><small>${priceBasis[p.basis]} · ${korean ? `${p.n}건` : tx('{n} seen', { n: p.n })}</small>`;
}

function resultRow(entry) {
  const external = entry.type === 'site';
  const icon = entry.type === 'mob'
    ? `<span class="search-result-icon" aria-hidden="true">⚔</span>`
    : entry.type === 'item'
    ? `<img src="https://maplestory.io/api/MCW/1/item/${entry.id}/icon" alt="" width="30" height="30" loading="lazy">`
    : `<span class="search-result-icon" aria-hidden="true">${external ? '↗' : '⌘'}</span>`;
  return `<a class="search-result" href="${escHtml(entry.href)}" data-result-type="${entry.type}" data-result-id="${escHtml(entry.id)}"${external ? ` target="_blank" rel="noopener" aria-label="${escHtml(entry.title)} · ${labels.external}"` : ''}>${icon}<span class="search-result-copy"><strong>${escHtml(entry.title)}</strong><small>${escHtml(entry.description || '')}</small></span><span class="search-result-action${entry.type === 'item' && prices.get(entry.id)?.median ? ' priced' : ''}">${entry.type === 'item' ? priceTag(entry.id) : entry.type === 'mob' ? `${labels.mobAction} →` : external ? '↗' : '→'}</span></a>`;
}

function sizeSearchPanel() {
  const box = searchShell.getBoundingClientRect();
  const viewport = window.visualViewport;
  const top = (viewport?.offsetTop || 0) + 12;
  const bottom = top + (viewport?.height || window.innerHeight) - 24;
  const below = bottom - box.bottom - 8;
  const above = box.top - top - 8;
  const openAbove = below < 180 && above > below;
  searchPanel.classList.toggle('above', openAbove);
  searchPanel.style.maxHeight = `${Math.max(140, Math.min(480, openAbove ? above : below))}px`;
}

function renderSearch() {
  const query = input.value.trim();
  const active = !!query && searchOpen;
  searchPanel.hidden = !active;
  clearSearch.hidden = !input.value;
  searchSubmit.setAttribute('aria-expanded', String(active));
  if (!active) return;
  sizeSearchPanel();
  searchMatches = searchEntries([...staticEntries, ...mobEntries, ...itemEntries], query);
  const counts = { all: searchMatches.length, item: 0, mob: 0, site: 0, tool: 0 };
  searchMatches.forEach((entry) => counts[entry.type]++);
  document.querySelectorAll('[data-count]').forEach((el) => {
    el.textContent = el.dataset.count === 'item' && !items ? (itemError ? '!' : '…') : counts[el.dataset.count].toLocaleString();
  });
  document.querySelectorAll('[data-search-type]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.searchType === searchType)));
  const suffix = !items ? itemError ? labels.failed : labels.partial : '';
  searchStatus.textContent = `${korean ? `총 ${counts.all.toLocaleString()}개` : tx('{n} results', { n: counts.all.toLocaleString() })}${suffix}`;
  itemState.hidden = !!items || (searchType !== 'all' && searchType !== 'item');
  itemState.querySelector('span').textContent = itemError ? labels.error : labels.loading;
  retryItems.hidden = !itemError;
  let visible = 0;
  // The group holding the best match comes first, so "시세" or "사냥터" opens with our own tool and "레이스" with the monster.
  const best = (type) => Math.max(0, ...searchMatches.filter((entry) => entry.type === type).map((entry) => entry.score));
  const order = ['item', 'mob', 'tool', 'site'].sort((a, b) => best(b) - best(a));
  searchGroups.innerHTML = order.map((type) => {
    if (searchType !== 'all' && searchType !== type) return '';
    let matches = searchMatches.filter((entry) => entry.type === type);
    if (!matches.length) return '';
    if (type === 'item') {
      // Within equally good matches, items with recent listings go first; a priced item never jumps above a better match
      // (typing "meba" once showed King Slime Balloon, which merely contains those letters, above the Meba claw).
      queuePrices(matches.slice(0, 60).map((entry) => entry.id));
      const priced = (entry) => (prices.get(entry.id)?.median ? 1 : 0);
      matches = matches.map((entry, i) => ({ entry, i })).sort((a, b) => b.entry.score - a.entry.score || priced(b.entry) - priced(a.entry) || a.i - b.i).map(({ entry }) => entry);
    }
    visible += matches.length;
    const limit = expanded.get(type) || (searchType === 'all' ? INITIAL_ROWS : PAGE_ROWS);
    const shown = matches.slice(0, limit);
    const more = matches.length - shown.length;
    return `<section class="search-group" aria-labelledby="search-heading-${type}"><header><h3 id="search-heading-${type}">${labels[type]} <span>${matches.length.toLocaleString()}</span></h3>${type === 'item' ? `<small>${labels.market} →</small>` : ''}</header><div class="search-result-list">${shown.map(resultRow).join('')}</div>${more ? `<button type="button" class="search-more" data-search-more="${type}">${korean ? `${labels[type]} ${Math.min(PAGE_ROWS, more)}개 더 보기 · ${more.toLocaleString()}개 남음` : tx('Show {n} more · {left} remaining', { n: Math.min(PAGE_ROWS, more), left: more.toLocaleString() })} ↓</button>` : ''}</section>`;
  }).join('');
  // Don't report an empty item result while its index is loading or unavailable.
  searchEmpty.hidden = !!visible || (!items && (searchType === 'all' || searchType === 'item'));
}

// The popup never changes the page URL, layout or scroll position.
function closeSearch(restoreFocus = false) {
  if (restoreFocus) input.focus({ preventScroll: true });
  searchOpen = false;
  renderSearch();
}
function focusResult(link) {
  if (!link) return;
  link.focus({ preventScroll: true });
  const box = searchPanel.getBoundingClientRect();
  const row = link.getBoundingClientRect();
  if (row.bottom > box.bottom) searchPanel.scrollTop += row.bottom - box.bottom + 8;
  else if (row.top < box.top) searchPanel.scrollTop -= box.top - row.top + 8;
}
function updateSearch() {
  searchOpen = !!input.value.trim();
  expanded.clear();
  searchPanel.scrollTop = 0;
  renderSearch();
  if (input.value.trim() && !items && !itemsPromise && !itemError) loadItems().catch(() => {});
}
function resetSearch() {
  input.value = '';
  searchType = 'all';
  updateSearch();
  input.focus({ preventScroll: true });
}
clearSearch.addEventListener('click', resetSearch);
retryItems.addEventListener('click', () => { loadItems().catch(() => {}); renderSearch(); });
searchPanel.addEventListener('click', (e) => {
  const type = e.target.closest('[data-search-type]');
  if (type) { searchType = type.dataset.searchType; expanded.clear(); renderSearch(); }
  const more = e.target.closest('[data-search-more]');
  if (more) {
    const kind = more.dataset.searchMore;
    const previousCount = searchGroups.querySelectorAll(`[data-result-type="${kind}"]`).length;
    expanded.set(kind, previousCount + PAGE_ROWS);
    renderSearch();
    focusResult(searchGroups.querySelectorAll(`[data-result-type="${kind}"]`)[previousCount]);
  }
  const result = e.target.closest('[data-result-type]');
  if (result) track('home_search_click', { result_type: result.dataset.resultType, result_id: result.dataset.resultId });
});
document.getElementById('home-search').addEventListener('submit', (e) => {
  e.preventDefault();
  input.focus({ preventScroll: true });
  updateSearch();
});
input.addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  if (e.key === 'ArrowDown' && input.value.trim()) {
    e.preventDefault();
    searchOpen = true;
    renderSearch();
    focusResult(searchGroups.querySelector('.search-result'));
  }
});
searchShell.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !e.isComposing) {
    e.preventDefault();
    closeSearch(true);
  }
});
for (const event of ['focus', 'click']) {
  input.addEventListener(event, () => {
    searchOpen = !!input.value.trim();
    renderSearch();
  });
}
window.addEventListener('resize', () => { if (searchOpen) sizeSearchPanel(); });
window.visualViewport?.addEventListener('resize', () => { if (searchOpen) sizeSearchPanel(); });
for (const event of ['pointerdown', 'focusin']) {
  document.addEventListener(event, (e) => {
    if (!searchShell.contains(e.target)) closeSearch();
  });
}
input.addEventListener('input', (e) => { if (!e.isComposing) updateSearch(); });
input.addEventListener('compositionend', updateSearch);
// Log the settled query with the count across every result type.
let searchTimer;
input.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const term = input.value.trim();
    if (term) track('search', { search_term: term, results: searchMatches.length });
  }, 1200);
});
window.addEventListener('popstate', () => {
  input.value = new URLSearchParams(location.search).get('q') || '';
  searchType = 'all';
  updateSearch();
});

function setCategory(id) {
  activeCat = activeCat === id ? null : id;
  if (activeCat) track('filter_category', { category: activeCat });
  document.querySelectorAll('.purpose').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === activeCat)));
  document.querySelectorAll('.toc a[href^="#"]').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${activeCat}`));
  filterBar.hidden = !activeCat;
  if (activeCat) {
    const name = document.getElementById(activeCat).dataset.name;
    document.getElementById('filter-label').textContent = main.dataset.filtering.replace('{name}', name);
  }
  filter();
}

document.querySelectorAll('.purpose').forEach((b) => b.addEventListener('click', () => setCategory(b.dataset.filter)));
document.getElementById('filter-clear').addEventListener('click', () => setCategory(activeCat));
// The sidebar points at sections a category filter or search may have hidden; reveal the target instead of doing nothing.
document.querySelectorAll('.toc a[href^="#"]').forEach((a) =>
  a.addEventListener('click', () => {
    const target = document.getElementById(a.getAttribute('href').slice(1));
    if (!target?.hidden) return;
    if (activeCat && target.dataset.cat !== undefined) setCategory(target.id);
    if (target.hidden && input.value) {
      resetSearch();
    }
    if (target.hidden && activeCat) setCategory(activeCat);
  })
);

input.value = new URLSearchParams(location.search).get('q') || '';
renderFavs();
updateSearch();

// Shared upvotes (Cloudflare Worker + D1). Hidden unless the build configured an API.
const voteApi = main.dataset.voteApi;
const VOTED_KEY = 'gmshub_voted';
function loadVoted() {
  try {
    return JSON.parse(localStorage.getItem(VOTED_KEY) || '[]');
  } catch (e) {
    return [];
  }
}
let voted = loadVoted();
let counts = {};

// Most-recommended first within each category; ties keep the curated order.
// Runs once on load only, so cards don't jump under the cursor right after a click.
function sortByVotes() {
  document.querySelectorAll('[data-cat] .cards').forEach((list) => {
    const cards = [...list.children];
    cards
      .map((c, i) => ({ c, i, n: counts[c.dataset.id] || 0 }))
      .sort((a, b) => b.n - a.n || a.i - b.i)
      .forEach(({ c }) => list.appendChild(c));
  });
}

function paintVotes() {
  document.querySelectorAll('.vote').forEach((btn) => {
    const id = btn.dataset.site;
    // Newly added links may be published before their vote ID is registered.
    btn.hidden = !Object.hasOwn(counts, id);
    // An empty count reads better than a row of zeros on a young site.
    btn.querySelector('b').textContent = counts[id] || '';
    btn.setAttribute('aria-pressed', String(voted.includes(id)));
  });
}

if (voteApi) {
  fetch(`${voteApi}/votes`)
    .then((r) => (r.ok ? r.json() : {}))
    .then((data) => {
      counts = data;
      sortByVotes();
      paintVotes();
    })
    .catch(() => {});

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.vote');
    if (!btn || voted.includes(btn.dataset.site)) return;
    const id = btn.dataset.site;
    voted = [...voted, id];
    track('recommend', { site_id: id });
    try {
      localStorage.setItem(VOTED_KEY, JSON.stringify(voted));
    } catch (err) {}
    counts[id] = (counts[id] || 0) + 1;
    paintVotes();
    try {
      const r = await fetch(`${voteApi}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ site: id }) });
      if (r.ok) counts[id] = (await r.json()).count;
    } catch (err) {}
    paintVotes();
  });
}

// Live Free Market section: realtime-search style top 10 (average price, change, 7-day sparkline) and the newest listings,
// refreshed every minute while the tab is visible.
const live = document.getElementById('live-market');
const LIVE_ROWS = 5;
const LIVE_REFRESH_MS = 60000;
const lang = document.documentElement.lang;
const liveRtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' });
const dayFmt = new Intl.DateTimeFormat(lang, { month: 'numeric', day: 'numeric' });
const liveText = live ? JSON.parse(live.dataset.text) : {};

// Korean players think in 만/억; elsewhere k/m/b.
function mesos(n) {
  if (korean) {
    if (n >= 1e8) return `${+(n / 1e8).toFixed(2)}억`;
    if (n >= 1e4) return `${+(n / 1e4).toFixed(n >= 1e6 ? 0 : 1)}만`;
    return n.toLocaleString('ko');
  }
  if (n >= 1e9) return `${+(n / 1e9).toFixed(2)}b`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(2)}m`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}k`;
  return String(n);
}

// D1 timestamps are UTC without a zone marker.
function ago(utc) {
  const s = Math.max(0, (Date.now() - Date.parse(`${utc.replace(' ', 'T')}Z`)) / 1000);
  if (s < 60) return liveRtf.format(0, 'second');
  if (s < 3600) return liveRtf.format(-Math.floor(s / 60), 'minute');
  if (s < 86400) return liveRtf.format(-Math.floor(s / 3600), 'hour');
  return liveRtf.format(-Math.floor(s / 86400), 'day');
}

// 7 daily medians, oldest first. Days without data break the line rather than being bridged; the latest point is marked.
function sparkline(values, name) {
  const pts = values.map((v, i) => ({ v, i })).filter((p) => p.v != null);
  // Fewer than two days of data: a quiet dash in the trend slot, with the reason for screen readers and on hover.
  if (pts.length < 2) return `<span class="spark-empty" title="${escHtml(liveText.noTrend)}" aria-label="${escHtml(liveText.noTrend)}">–</span>`;
  const W = 64;
  const H = 24;
  const lo = Math.min(...pts.map((p) => p.v));
  const hi = Math.max(...pts.map((p) => p.v));
  const x = (i) => (i / (values.length - 1)) * W;
  const y = (v) => (hi === lo ? H / 2 : 2 + (1 - (v - lo) / (hi - lo)) * (H - 4));
  let d = '';
  values.forEach((v, i) => {
    if (v == null) return;
    d += `${i > 0 && values[i - 1] != null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  const last = pts[pts.length - 1];
  const hits = values
    .map((v, i) => (v == null ? '' : `<rect x="${(x(i) - W / 12).toFixed(1)}" y="-4" width="${(W / 6).toFixed(1)}" height="${H + 8}" data-i="${i}" data-v="${v}"/>`))
    .join('');
  const label = liveText.sparkLabel.replace('{name}', name).replace('{from}', mesos(pts[0].v)).replace('{to}', mesos(last.v));
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escHtml(label)}"><path d="${d}"/><circle cx="${x(last.i).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="2.5"/>${hits}</svg>`;
}

function moveCell(move) {
  if (move == null) return `<span class="move new">${liveText.isNew}</span>`;
  if (move > 0) return `<span class="move up" aria-label="+${move}">▲${move}</span>`;
  if (move < 0) return `<span class="move down" aria-label="${move}">▼${-move}</span>`;
  return '<span class="move">–</span>';
}

function changeCell(change) {
  if (change == null) return '<span class="chg">–</span>';
  const cls = change > 0 ? 'up' : change < 0 ? 'down' : '';
  return `<span class="chg ${cls}">${change > 0 ? '▲' : change < 0 ? '▼' : ''}${Math.abs(change)}%</span>`;
}

function renderTop(top, byId) {
  const rows = top.items.filter((r) => byId.has(r.item));
  document.getElementById('market-top').hidden = !rows.length;
  document.getElementById('rank-list').innerHTML = rows
    .map((r) => {
      const it = byId.get(r.item);
      return `<li><a href="${live.dataset.price}?q=${encodeURIComponent(it.name)}">
<span class="rank">${r.rank}</span>${moveCell(r.move)}
<img src="https://maplestory.io/api/MCW/1/item/${it.id}/icon" alt="" width="26" height="26" loading="lazy">
<span class="name" title="${escHtml(it.name)}">${escHtml(it.name)}</span>
<span class="avg"><small>${r.median != null ? escHtml(r.basis === 'sold' ? liveText.soldMedian : liveText.askMedian) : escHtml(liveText.avg)}</small>${mesos(r.median ?? r.avg)}</span>
${sparkline(r.spark, it.name)}
${changeCell(r.change)}</a></li>`;
    })
    .join('');
  return rows.length;
}

function renderRecent(rows, byId) {
  const shown = rows.filter((r) => byId.has(r.item)).slice(0, LIVE_ROWS);
  document.getElementById('live-rows').innerHTML = shown
    .map((r) => {
      const it = byId.get(r.item);
      return `<li class="${r.sold ? 'sold' : ''}"><a href="${live.dataset.price}?q=${encodeURIComponent(it.name)}">
<img src="https://maplestory.io/api/MCW/1/item/${it.id}/icon" alt="" width="26" height="26" loading="lazy">
<span class="name">${escHtml(it.name)}${r.sold ? `<span class="tag">${escHtml(liveText.sold)}</span>` : ''}</span>
<span class="price">${mesos(r.price)}${r.qty > 1 ? ` <small>×${r.qty}</small>` : ''}</span>
<span class="meta">${escHtml(r.seller)} · CH ${r.channel} · FM${r.room}</span>
<span class="ago">${ago(r.seen)}</span></a></li>`;
    })
    .join('');
  return shown.length;
}

// ?preview=market shows the section with made-up numbers (clearly labelled) so it can be reviewed before real scans exist.
const PREVIEW = new URLSearchParams(location.search).get('preview') === 'market';
const PREVIEW_ITEMS = [[1372002, 580000], [2000001, 25], [2040801, 250000], [2070001, 122000], [2040800, 1150000], [2070006, 433000], [1472001, 95000], [2000002, 40], [4010000, 78], [4020000, 70]];

function previewData() {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const stamp = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString().slice(0, 19).replace('T', ' ');
  const items = PREVIEW_ITEMS.map(([item, base], i) => {
    const spark = Array.from({ length: 7 }, (_, d) => Math.round(base * (1 + (rnd() - 0.5) * 0.16 + (i % 3 === 0 ? d * 0.012 : -d * 0.008))));
    const change = Math.round(((spark[6] - spark[5]) / spark[5]) * 1000) / 10;
    return { item, rank: i + 1, move: i === 2 ? null : Math.round((rnd() - 0.5) * 6), avg: spark[6], n: 20 - i, sold: 6 - (i % 4), change, spark };
  });
  const sellers = ['SampleShop1', 'SampleShop2', 'SampleShop3', 'SampleShop4', 'SampleShop5'];
  const recent = PREVIEW_ITEMS.slice(0, 5).map(([item, base], i) => ({
    item,
    price: Math.round(base * (0.95 + rnd() * 0.1)),
    sold: i % 3 === 1 ? 1 : 0,
    seller: sellers[i],
    channel: 1 + Math.floor(rnd() * 40),
    room: 1 + Math.floor(rnd() * 22),
    seen: stamp(i * 4 + 1)
  }));
  return [{ items }, recent];
}

async function refreshLive() {
  if (!live || !live.dataset.api || document.hidden) return;
  try {
    const get = (path) => fetch(`${live.dataset.api}${path}`).then((r) => (r.ok ? r.json() : null));
    const [top, recent] = PREVIEW
      ? [...previewData(), await loadItems()]
      : await Promise.all([get('/market/top'), get('/listings/recent'), loadItems()]);
    document.getElementById('market-preview').hidden = !PREVIEW;
    const byId = new Map(items.map((it) => [it.id, it]));
    const ranked = top ? renderTop(top, byId) : 0;
    const listed = recent ? renderRecent(recent, byId) : 0;
    if (!listed) document.getElementById('live-rows').innerHTML = `<li class="market-empty">${escHtml(liveText.empty)}</li>`;
    if (recent?.length) document.getElementById('live-updated').textContent = liveText.updated.replace('{t}', ago(recent[0].seen));
  } catch (e) {}
}

// One tooltip for every sparkline: the day and its median, following the pointer.
const tip = document.getElementById('spark-tip');
if (live) {
  live.addEventListener('pointermove', (e) => {
    const rect = e.target.closest('.spark rect');
    if (!rect) {
      tip.hidden = true;
      return;
    }
    const daysAgo = 6 - Number(rect.dataset.i);
    tip.innerHTML = `<b>${mesos(Number(rect.dataset.v))}</b>${dayFmt.format(new Date(Date.now() - daysAgo * 86400000))}`;
    tip.style.left = `${e.clientX + 12}px`;
    tip.style.top = `${e.clientY - 40}px`;
    tip.hidden = false;
  });
  live.addEventListener('pointerleave', () => (tip.hidden = true));
  live.addEventListener('click', (e) => {
    const a = e.target.closest('a[href*="?q="]');
    if (a) track('live_market_click', { item: decodeURIComponent(a.href.split('?q=')[1] || ''), list: a.closest('#rank-list') ? 'top' : 'recent' });
  });
  refreshLive();
  setInterval(refreshLive, LIVE_REFRESH_MS);
  document.addEventListener('visibilitychange', refreshLive);
}

// "Pick up where you left off": the market wishlist and recently opened items saved by this browser, with their current
// price summary from one request, so a returning visitor goes straight back to the item they were watching.
const mine = document.getElementById('live-mine');
async function renderMine() {
  if (!mine || !live?.dataset.api) return;
  let wish = [], recentIds = [];
  try {
    const list = (k) => { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v.filter((id) => Number.isInteger(id)) : []; };
    wish = list('gms-market-wishlist');
    recentIds = list('gms-market-recent').filter((id) => !wish.includes(id));
  } catch (e) {}
  if (!wish.length && !recentIds.length) { mine.hidden = true; return; }
  let index;
  try { index = new Map((await loadItems()).map((it) => [it.id, it])); } catch (e) { return; }
  wish = wish.filter((id) => index.has(id));
  recentIds = recentIds.filter((id) => index.has(id)).slice(0, 5);
  if (!wish.length && !recentIds.length) { mine.hidden = true; return; }
  let summary = {};
  try {
    const r = await fetch(`${live.dataset.api}/prices?ids=${[...wish, ...recentIds].slice(0, 60).join(',')}`);
    if (r.ok) summary = await r.json();
  } catch (e) {}
  const chip = (id, kind) => {
    const it = index.get(id), p = summary[id];
    return `<a class="mine-chip" href="${live.dataset.price}?item=${id}&src=home" data-kind="${kind}" data-item="${id}"><img src="https://maplestory.io/api/MCW/1/item/${id}/icon" alt="" width="22" height="22" loading="lazy"><span class="mine-name">${escHtml(it.name)}</span>${p?.median ? `<b>${mesos(p.median)}</b><small>${priceBasis[p.basis]} · ${ago(p.last)}</small>` : `<small>${escHtml(liveText.noTrend)}</small>`}</a>`;
  };
  const group = (title, ids, kind) => ids.length ? `<div class="mine-group"><h4>${escHtml(title)} <span>${ids.length}</span></h4><div class="mine-row">${ids.map((id) => chip(id, kind)).join('')}</div></div>` : '';
  mine.innerHTML = `<div class="mine-head"><h3>${escHtml(liveText.mine)}</h3><a href="${live.dataset.price}?view=items">${escHtml(liveText.mineAll)}</a></div>${group(liveText.mineWish, wish, 'wishlist')}${group(liveText.mineRecent, recentIds, 'recent')}<p class="muted small">${escHtml(liveText.mineNote)}</p>`;
  mine.hidden = false;
}
mine?.addEventListener('click', (e) => {
  const a = e.target.closest('a.mine-chip');
  if (a) track('home_resume_click', { kind: a.dataset.kind, item_id: Number(a.dataset.item) });
});
renderMine();
