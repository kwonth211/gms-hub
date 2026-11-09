import { DAY, parseUtc, marketRows } from './market-data.js';
import { mountMarketCharts } from './market-charts.js';
// Item search, observed-price analytics and shop locations, with a live ranking and listing feed.
const D = JSON.parse(document.getElementById('mk-data').textContent);
const T = D.t;
const L = D.live;
const korean = D.lang === 'ko';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const squash = (s) => s.toLowerCase().replace(/\s+/g, '');
const rtf = new Intl.RelativeTimeFormat(D.lang, { numeric: 'auto', style: 'short' });
const nf = new Intl.NumberFormat(D.lang);
const icon = (id, size = 28) => `<img src="https://maplestory.io/api/MCW/1/item/${id}/icon" alt="" width="${size}" height="${size}" loading="lazy">`;

let items = [];
let byId = new Map();
const nameOf = (it) => (korean ? it.ko || it.en : it.en);

// Korean players think in 만/억; elsewhere k/m/b.
function mesos(n) {
  if (n == null) return '–';
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

function ago(utc) {
  const s = Math.max(0, (Date.now() - parseUtc(utc)) / 1000);
  if (s < 60) return rtf.format(0, 'second');
  if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.floor(s / 3600), 'hour');
  return rtf.format(-Math.floor(s / 86400), 'day');
}

// ---------- item detail ----------
const sites = (it) =>
  D.sites
    .map((s) => `<a href="${esc(s.url.replace('{id}', it.id).replace('{en}', encodeURIComponent(it.en)))}" target="_blank" rel="noopener">${s.name}</a>`)
    .join(' · ');

let selectedItem = null;
let requestNumber = 0;
let itemRequest = null;
let charts = null;
async function loadItem(id, push = true) {
  const it = byId.get(id);
  if (!it) return;
  selectedItem = id;
  const request = ++requestNumber;
  itemRequest?.abort();
  itemRequest = new AbortController();
  charts?.destroy();
  charts = null;
  if (push) history.replaceState(null, '', `?item=${id}`);
  const box = $('mk-detail');
  box.setAttribute('aria-busy', 'true');
  const page = `${D.itemBase}${id}-${it.en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}/`.replace(/-\/$/, '/');
  const head = `<header class="mk-head">${icon(id, 36)}<div><h2>${esc(nameOf(it))}</h2>${it.ko && korean ? `<small>${esc(it.en)}</small>` : ''}${D.itemPages.includes(Number(id)) ? `<a class="small" href="${esc(page)}">${D.itemLink} ›</a>` : ''}</div><button type="button" class="btn ghost small-btn" data-refresh-item>${korean ? '새로고침' : 'Refresh'}</button></header>`;
  box.innerHTML = `${head}<p class="muted">${T.loading}</p>`;
  let data = null;
  try {
    const r = await fetch(`${D.api}/market/item?id=${id}`, { signal: itemRequest.signal });
    if (r.ok) data = await r.json();
  } catch (e) {}
  if (request !== requestNumber) return;
  box.setAttribute('aria-busy', 'false');
  if (!data || !Array.isArray(data.listings)) {
    box.innerHTML = `${head}<p role="status">${T.failed}</p><button class="btn small-btn" data-retry>${T.retry}</button><p class="mk-ext">${T.external}: ${sites(it)}</p>`;
    box.querySelector('[data-retry]').addEventListener('click', () => loadItem(id, false));
    return;
  }
  const now = Date.now();
  const summary = marketRows(data.listings, now);
  const { rows, open, sold: soldRows, stale } = summary;
  if (!rows.length) {
    box.innerHTML = `${head}<p class="muted">${T.noData}</p><p class="mk-ext">${T.external}: ${sites(it)}</p>`;
    return;
  }
  let priceBand = null;
  const line = (r) =>
    `<tr class="${r.sold ? 'sold' : ''}"><td class="num">${nf.format(r.price)}</td><td>${nf.format(r.qty)}<small>${T.total} ${nf.format(r.price * r.qty)}</small></td><td>${esc(r.seller)}</td><td><span class="where">CH ${r.channel}</span> <span class="where">FM ${r.room}</span></td><td class="muted">${ago(r.seen)}<small>${r.sold ? T.sold : Date.now() - r.t >= DAY ? T.stale : T.selling}</small></td></tr>`;
  const table = (rs) => `<div class="mk-where"><table><thead><tr><th>${T.table.price}</th><th>${T.table.qty}</th><th>${T.table.seller}</th><th>${T.table.where}</th><th>${T.table.seen}</th></tr></thead><tbody>${rs.map(line).join('')}</tbody></table></div>`;
  const options = (key) => [...new Set(open.map((r) => r[key]))].sort((a, b) => a - b).map((n) => `<option value="${n}">${key === 'channel' ? 'CH' : 'FM'} ${n}</option>`).join('');
  box.innerHTML = `${head}
<div class="mk-item-context"><span>${T.tiles.low} <strong>${open.length ? nf.format(open[0].price) : '–'}</strong> ${T.priceUnit}</span><span>${T.tiles.count} <strong>${nf.format(rows.length)}</strong></span></div>
<p class="muted note">${korean ? '아이템 시세 확인' : 'Item data checked'} ${new Date(now).toLocaleTimeString(D.lang)}${summary.excluded ? ` · ${T.excluded.replace('{n}', summary.excluded)}` : ''}</p>
<div id="mk-charts"></div>
<section id="mk-listings"><h3>${T.where}</h3><p class="muted note">${T.whereNote}</p>
<div class="mk-filters">
<label>${T.table.where}<select id="mk-channel"><option value="">${T.filterChannel}</option>${options('channel')}</select></label>
<label>${T.filterRoom}<select id="mk-room"><option value="">${T.filterRoom}</option>${options('room')}</select></label>
<label>${korean ? '정렬' : 'Sort'}<select id="mk-sort"><option value="price">${T.sortPrice}</option><option value="recent">${T.sortRecent}</option></select></label>
</div><div class="price-band-filter" id="mk-price-filter" hidden><span id="mk-price-label"></span><button type="button" class="btn ghost small-btn" id="mk-price-clear">${korean ? '가격대 해제' : 'Clear price band'}</button></div><p id="mk-filter-count" class="muted note" role="status"></p><div id="mk-open"></div></section>
<details class="mk-history"><summary>${T.history} (${soldRows.length + stale.length})</summary>${table([...soldRows, ...stale])}</details>
<p class="mk-ext">${T.external}: ${sites(it)}</p>`;
  function renderOpen() {
    let filtered = open.filter((r) => (!$('mk-channel').value || r.channel === Number($('mk-channel').value)) && (!$('mk-room').value || r.room === Number($('mk-room').value)));
    if (priceBand) filtered = filtered.filter((r) => r.price >= priceBand.from && r.price <= priceBand.to && r.t > priceBand.fromTime);
    $('mk-price-filter').hidden = !priceBand;
    $('mk-price-label').textContent = priceBand?.label || '';
    $('mk-filter-count').textContent = korean ? `조건에 맞는 매물 ${filtered.length}건 / 최근 판매 매물 ${open.length}건` : `${filtered.length} matching / ${open.length} recent asking listings`;
    if ($('mk-sort').value === 'recent') filtered.sort((a, b) => b.t - a.t);
    $('mk-open').innerHTML = filtered.length ? table(filtered) : `<p class="market-empty">${T.noOpen}</p>`;
  }
  ['mk-channel', 'mk-room', 'mk-sort'].forEach((key) => $(key).addEventListener('change', renderOpen));
  renderOpen();
  charts = mountMarketCharts($('mk-charts'), rows, { lang: D.lang, now, truncated: data.truncated, limit: data.limit,
    onBand(band) { priceBand = band; renderOpen(); }
  });
  $('mk-price-clear').addEventListener('click', () => { charts.clearBand(); $('mk-channel').focus({ preventScroll: true }); });
  track('market_item', { item_id: id, listings: rows.length });
}

// ---------- search ----------
const input = $('mk-q');
const suggest = $('mk-suggest');
let active = -1;
$('mk-detail').addEventListener('click', (e) => {
  if (e.target.closest('[data-refresh-item]') && selectedItem) loadItem(selectedItem, false);
});

function matches(q) {
  const f = squash(q);
  if (f.length < 1) return [];
  return items
    .filter((it) => it.flat.includes(f))
    .sort((a, b) => !a.flat.startsWith(f) - !b.flat.startsWith(f) || nameOf(a).length - nameOf(b).length)
    .slice(0, 8);
}

function renderSuggest() {
  const list = matches(input.value);
  active = -1;
  suggest.hidden = !list.length;
  input.setAttribute('aria-expanded', String(list.length > 0));
  input.removeAttribute('aria-activedescendant');
  $('mk-search-status').hidden = !input.value.trim() || !!list.length;
  $('mk-search-status').textContent = T.noMatches;
  suggest.innerHTML = list
    .map((it, i) => `<li role="option" aria-selected="false" id="mk-opt-${i}" data-id="${it.id}">${icon(it.id, 24)}<span>${esc(nameOf(it))}${korean && it.ko ? ` <small>${esc(it.en)}</small>` : ''}</span></li>`)
    .join('');
}

function hideSuggest() {
  suggest.hidden = true;
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
}

function choose(id) {
  hideSuggest();
  input.value = nameOf(byId.get(id));
  loadItem(id);
}

input.addEventListener('input', renderSuggest);
input.addEventListener('keydown', (e) => {
  const opts = [...suggest.querySelectorAll('li')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!opts.length || suggest.hidden) return;
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
    opts.forEach((o, i) => { o.classList.toggle('on', i === active); o.setAttribute('aria-selected', String(i === active)); });
    input.setAttribute('aria-activedescendant', opts[active]?.id || '');
  } else if (e.key === 'Enter') {
    const pick = opts[active] || opts[0];
    if (pick && !suggest.hidden) choose(Number(pick.dataset.id));
  } else if (e.key === 'Escape') hideSuggest();
});
suggest.addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (li) choose(Number(li.dataset.id));
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.mk-search')) hideSuggest();
});

// ---------- ranking & feed ----------
function sparkline(values) {
  const pts = values.map((v, i) => ({ v, i })).filter((p) => p.v != null);
  if (pts.length < 2) return `<span class="spark-empty" title="${esc(L.noTrend)}">–</span>`;
  const W = 64;
  const H = 24;
  const lo = Math.min(...pts.map((p) => p.v));
  const hi = Math.max(...pts.map((p) => p.v));
  const x = (i) => (i / (values.length - 1)) * W;
  const y = (v) => (hi === lo ? H / 2 : 2 + (1 - (v - lo) / (hi - lo)) * (H - 4));
  let d = '';
  values.forEach((v, i) => {
    if (v != null) d += `${i > 0 && values[i - 1] != null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}"/><circle cx="${x(last.i).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="2.5"/></svg>`;
}

const moveCell = (m) =>
  m == null ? `<span class="move new">${L.isNew}</span>` : m > 0 ? `<span class="move up">▲${m}</span>` : m < 0 ? `<span class="move down">▼${-m}</span>` : '<span class="move">–</span>';
const changeCell = (c) =>
  c == null ? '<span class="chg">–</span>' : `<span class="chg ${c > 0 ? 'up' : c < 0 ? 'down' : ''}">${c > 0 ? '▲' : c < 0 ? '▼' : ''}${Math.abs(c)}%</span>`;

let refreshing = false;
let hadMarketData = false;
async function refresh() {
  if (document.hidden || refreshing) return;
  refreshing = true;
  const get = (p) => fetch(`${D.api}${p}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [top, recent] = await Promise.all([get('/market/top'), get('/listings/recent?limit=60')]);
  $('mk-retry').hidden = !!top && !!recent;
  $('mk-status').textContent = top && recent ? `${korean ? '시장 목록' : 'Market feed'} ${T.refreshed} ${new Date().toLocaleTimeString(D.lang)} · ${korean ? '30초마다 확인' : 'Checked every 30s'}` : hadMarketData ? T.staleData : T.failed;
  hadMarketData ||= !!top && !!recent;
  if (top?.stats) for (const k of ['listings', 'shops', 'items', 'sold']) $(`mk-stat-${k}`).textContent = nf.format(top.stats[k] || 0);
  if (top)
    $('rank-list').innerHTML = top.items
      .filter((r) => byId.has(r.item))
      .map((r) => {
        const it = byId.get(r.item);
        return `<li><a href="?item=${it.id}" data-id="${it.id}"><span class="rank">${r.rank}</span>${moveCell(r.move)}${icon(it.id, 26)}<span class="name" title="${esc(nameOf(it))}">${esc(nameOf(it))}</span><span class="avg"><small>${r.median != null ? `${r.basis === 'sold' ? T.sold : T.selling} · ${T.median}` : L.avg}</small>${mesos(r.median ?? r.avg)}</span>${sparkline(r.spark)}${changeCell(r.change)}</a></li>`;
      })
      .join('') || `<li class="market-empty">${T.emptyRank}</li>`;
  else if (!hadMarketData) $('rank-list').innerHTML = `<li class="market-empty">${T.failed}</li>`;
  if (recent)
    $('live-rows').innerHTML = recent
      .filter((r) => byId.has(r.item))
      .map((r) => {
        const it = byId.get(r.item);
        return `<li class="${r.sold ? 'sold' : ''}"><a href="?item=${it.id}" data-id="${it.id}">${icon(it.id, 26)}<span class="name">${esc(nameOf(it))}${r.sold ? `<span class="tag">${L.sold}</span>` : ''}</span><span class="price">${nf.format(r.price)}${r.qty > 1 ? ` <small>×${r.qty}</small>` : ''}</span><span class="meta">${esc(r.seller)} · CH ${r.channel} · FM${r.room}</span><span class="ago">${ago(r.seen)}</span></a></li>`;
      })
      .join('') || `<li class="market-empty">${T.emptyFeed}</li>`;
  else if (!hadMarketData) $('live-rows').innerHTML = `<li class="market-empty">${T.failed}</li>`;
  if (top?.items && selectedItem == null && !input.value.trim()) {
    const available = top.items.filter((r) => byId.has(r.item));
    const first = available.find((r) => r.n > r.sold) || available[0];
    if (first) { input.value = nameOf(byId.get(first.item)); loadItem(first.item, false); }
  }
  refreshing = false;
}

// Ranking and feed rows open the item here instead of navigating away.
document.querySelector('.mk-side').addEventListener('click', (e) => {
  const a = e.target.closest('a[data-id]');
  if (!a) return;
  e.preventDefault();
  const id = Number(a.dataset.id);
  input.value = nameOf(byId.get(id));
  loadItem(id);
  $('mk-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ---------- start ----------
function initialize() {
$('mk-retry').hidden = true;
$('mk-status').textContent = T.loading;
fetch(D.itemsUrl)
  .then((r) => { if (!r.ok) throw new Error('items'); return r.json(); })
  .then((rows) => {
    items = rows.map(([id, ko, en]) => ({ id, ko, en, flat: squash(`${ko}${en}`) }));
    byId = new Map(items.map((it) => [it.id, it]));
    const params = new URLSearchParams(location.search);
    const id = Number(params.get('item'));
    const q = params.get('q');
    if (byId.has(id)) {
      input.value = nameOf(byId.get(id));
      loadItem(id, false);
    } else if (q) {
      const hit = matches(q)[0];
      if (hit) {
        input.value = nameOf(hit);
        loadItem(hit.id);
      }
    }
    refresh();
  }).catch(() => {
    $('mk-status').textContent = T.failed;
    $('mk-retry').hidden = false;
  });
}
$('mk-retry').addEventListener('click', () => {
  if (!items.length) initialize();
  else { refresh(); if (selectedItem) loadItem(selectedItem, false); }
});
setInterval(refresh, 30000);
document.addEventListener('visibilitychange', refresh);
initialize();
