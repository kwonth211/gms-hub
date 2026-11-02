import { DAY, parseUtc, median, marketRows } from './market-data.js';
// Live market page: item search with statistics, a 7-day price trend and a price-spread chart, where to buy now, plus the
// live top 10 and the scrolling feed of scanned listings.
const D = JSON.parse(document.getElementById('mk-data').textContent);
const T = D.t;
const L = D.live;
const korean = D.lang === 'ko';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const squash = (s) => s.toLowerCase().replace(/\s+/g, '');
const rtf = new Intl.RelativeTimeFormat(D.lang, { numeric: 'auto', style: 'short' });
const dayFmt = new Intl.DateTimeFormat(D.lang, { month: 'numeric', day: 'numeric' });
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

// ---------- tooltip shared by the charts ----------
const tip = $('spark-tip');
function showTip(html, e) {
  tip.innerHTML = html;
  tip.hidden = false;
  const x = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 14);
  tip.style.left = `${x}px`;
  tip.style.top = `${e.clientY - tip.offsetHeight - 10}px`;
}
const hideTip = () => (tip.hidden = true);

// ---------- charts ----------
// Price trend: one row of seven day-columns. The line is each day's median, the band that day's lowest to highest, and the
// dots individual listings (filled: for sale, ring: sold). Days without data leave a gap.
function trendChart(rows) {
  const W = 640;
  const H = 240;
  const pad = { l: 56, r: 16, t: 16, b: 30 };
  const now = Date.now();
  const days = Array.from({ length: 7 }, (_, k) => {
    const from = now - (7 - k) * DAY;
    const ps = rows.filter((r) => r.t > from && r.t <= from + DAY);
    const prices = ps.map((r) => r.price);
    return { k, end: from + DAY, ps, med: prices.length ? median(prices) : null, lo: prices.length ? Math.min(...prices) : null, hi: prices.length ? Math.max(...prices) : null };
  });
  const all = rows.map((r) => r.price);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || hi * 0.1 || 1;
  const y0 = Math.max(0, lo - span * 0.12);
  const y1 = hi + span * 0.12;
  const x = (t) => pad.l + ((t - (now - 7 * DAY)) / (7 * DAY)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  const mid = (d) => x(d.end - DAY / 2);
  const ticks = [y0 + (y1 - y0) * 0.1, (y0 + y1) / 2, y1 - (y1 - y0) * 0.1];
  let band = '';
  let line = '';
  days.forEach((d, i) => {
    if (d.med == null) return;
    const prev = days[i - 1];
    line += `${prev && prev.med != null ? 'L' : 'M'}${mid(d).toFixed(1)},${y(d.med).toFixed(1)}`;
    band += `<rect class="band" x="${(x(d.end - DAY) + 6).toFixed(1)}" y="${y(d.hi).toFixed(1)}" width="${(x(d.end) - x(d.end - DAY) - 12).toFixed(1)}" height="${Math.max(2, y(d.lo) - y(d.hi)).toFixed(1)}" rx="4"/>`;
    // A short median mark per day, so a day with no neighbour (no line segment) still shows its median.
    band += `<line class="median-tick" x1="${(mid(d) - 14).toFixed(1)}" x2="${(mid(d) + 14).toFixed(1)}" y1="${y(d.med).toFixed(1)}" y2="${y(d.med).toFixed(1)}"/>`;
  });
  const dots = rows
    .map((r) => `<circle class="${r.sold ? 'dot sold' : 'dot'}" cx="${x(r.t).toFixed(1)}" cy="${y(r.price).toFixed(1)}" r="4"/>`)
    .join('');
  const grid = ticks.map((v) => `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${mesos(Math.round(v))}</text>`).join('');
  const xs = days.map((d) => `<text class="axis" x="${mid(d)}" y="${H - 8}" text-anchor="middle">${dayFmt.format(new Date(d.end - 1))}</text>`).join('');
  const hits = days
    .map((d) => `<rect class="hit" x="${x(d.end - DAY)}" y="${pad.t}" width="${x(d.end) - x(d.end - DAY)}" height="${H - pad.t - pad.b}" data-k="${d.k}"/>`)
    .join('');
  const svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T.trend)}">${grid}${xs}${band}<path class="median" d="${line}"/>${dots}<line class="cross" id="trend-cross" y1="${pad.t}" y2="${H - pad.b}" hidden/>${hits}</svg>`;
  return { svg, days, mid };
}

// Price spread: listings counted into up to ten equal price bands between the cheapest and dearest listing (typos far from
// the median are already left out). Bars start at the baseline with rounded tops.
function spreadChart(rows) {
  const W = 640;
  const H = 200;
  const pad = { l: 36, r: 16, t: 14, b: 34 };
  const prices = rows.map((r) => r.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const n = Math.max(1, Math.min(10, new Set(prices).size));
  const width = (hi - lo) / n || 1;
  const bins = Array.from({ length: n }, (_, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, count: 0, sold: 0 }));
  for (const r of rows) {
    const i = Math.min(n - 1, Math.floor((r.price - lo) / width));
    bins[i].count++;
    if (r.sold) bins[i].sold++;
  }
  const top = Math.max(...bins.map((b) => b.count));
  const bw = (W - pad.l - pad.r) / n;
  const h = (c) => (c / top) * (H - pad.t - pad.b);
  const bars = bins
    .map((b, i) => {
      const bh = h(b.count);
      const bx = pad.l + i * bw + 2;
      const by = H - pad.b - bh;
      // Rounded top, square base: a path rather than a rect so only the data end is rounded.
      const r = Math.min(4, bh, (bw - 4) / 2);
      const d = bh ? `M${bx},${H - pad.b}V${by + r}Q${bx},${by} ${bx + r},${by}H${bx + bw - 4 - r}Q${bx + bw - 4},${by} ${bx + bw - 4},${by + r}V${H - pad.b}Z` : '';
      return `<path class="bar" d="${d}"/><rect class="hit" x="${pad.l + i * bw}" y="${pad.t}" width="${bw}" height="${H - pad.t - pad.b}" data-i="${i}"/>`;
    })
    .join('');
  const labels = [0, Math.floor(n / 2), n - 1]
    .filter((v, i, a) => a.indexOf(v) === i)
    .map((i) => `<text class="axis" x="${pad.l + i * bw + bw / 2}" y="${H - 12}" text-anchor="middle">${mesos(Math.round(bins[i].from))}</text>`)
    .join('');
  const svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T.dist)}"><line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${H - pad.b}" y2="${H - pad.b}"/><text class="axis" x="${pad.l - 6}" y="${pad.t + 8}" text-anchor="end">${top}</text>${bars}${labels}</svg>`;
  return { svg, bins };
}

// ---------- item detail ----------
const sites = (it) =>
  D.sites
    .map((s) => `<a href="${esc(s.url.replace('{id}', it.id).replace('{en}', encodeURIComponent(it.en)))}" target="_blank" rel="noopener">${s.name}</a>`)
    .join(' · ');

let selectedItem = null;
let requestNumber = 0;
let itemRequest = null;
async function loadItem(id, push = true) {
  const it = byId.get(id);
  if (!it) return;
  selectedItem = id;
  const request = ++requestNumber;
  itemRequest?.abort();
  itemRequest = new AbortController();
  hideTip();
  if (push) history.replaceState(null, '', `?item=${id}`);
  const box = $('mk-detail');
  box.setAttribute('aria-busy', 'true');
  const head = `<header class="mk-head">${icon(id, 36)}<div><h2>${esc(nameOf(it))}</h2>${it.ko && korean ? `<small>${esc(it.en)}</small>` : ''}</div><button type="button" class="btn ghost small-btn" data-refresh-item>${korean ? '새로고침' : 'Refresh'}</button></header>`;
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
  const summary = marketRows(data.listings);
  const { rows, open, sold: soldRows, stale } = summary;
  if (!rows.length) {
    box.innerHTML = `${head}<p class="muted">${T.noData}</p><p class="mk-ext">${T.external}: ${sites(it)}</p>`;
    return;
  }
  const tiles = [
    [T.tiles.avg, summary.askingMedian == null ? '–' : nf.format(summary.askingMedian)],
    [T.tiles.low, open.length ? nf.format(open[0].price) : '–'],
    [T.tiles.last, summary.soldMedian == null ? '–' : nf.format(summary.soldMedian)],
    [T.tiles.count, `${nf.format(rows.length)}`]
  ];
  let chartSold = false;
  const line = (r) =>
    `<tr class="${r.sold ? 'sold' : ''}"><td class="num">${nf.format(r.price)}</td><td>${nf.format(r.qty)}<small>${T.total} ${nf.format(r.price * r.qty)}</small></td><td>${esc(r.seller)}</td><td><span class="where">CH ${r.channel}</span> <span class="where">FM ${r.room}</span></td><td class="muted">${ago(r.seen)}<small>${r.sold ? T.sold : Date.now() - r.t >= DAY ? T.stale : T.selling}</small></td></tr>`;
  const table = (rs) => `<div class="mk-where"><table><thead><tr><th>${T.table.price}</th><th>${T.table.qty}</th><th>${T.table.seller}</th><th>${T.table.where}</th><th>${T.table.seen}</th></tr></thead><tbody>${rs.map(line).join('')}</tbody></table></div>`;
  const options = (key) => [...new Set(open.map((r) => r[key]))].sort((a, b) => a - b).map((n) => `<option value="${n}">${key === 'channel' ? 'CH' : 'FM'} ${n}</option>`).join('');
  box.innerHTML = `${head}
<p class="muted note">${T.priceUnit}</p>
<dl class="mk-tiles">${tiles.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
<p class="muted note">${T.sample}${summary.excluded ? ` ${T.excluded.replace('{n}', summary.excluded)}` : ''}</p>
<section><h3>${T.where}</h3><p class="muted note">${T.whereNote}</p>
<div class="mk-filters">
<label>${T.table.where}<select id="mk-channel"><option value="">${T.filterChannel}</option>${options('channel')}</select></label>
<label>${T.filterRoom}<select id="mk-room"><option value="">${T.filterRoom}</option>${options('room')}</select></label>
<label>${korean ? '정렬' : 'Sort'}<select id="mk-sort"><option value="price">${T.sortPrice}</option><option value="recent">${T.sortRecent}</option></select></label>
</div><div id="mk-open"></div></section>
<div class="mk-chart-tabs" role="group" aria-label="${T.trend}"><button type="button" class="btn ghost small-btn" data-chart="selling" aria-pressed="true">${T.chartSelling}</button><button type="button" class="btn ghost small-btn" data-chart="sold" aria-pressed="false">${T.chartSold}</button></div>
<div id="mk-charts"></div>
<details class="mk-history"><summary>${T.history} (${soldRows.length + stale.length})</summary>${table([...soldRows, ...stale])}</details>
<p class="mk-ext">${T.external}: ${sites(it)}</p>`;
  function renderOpen() {
    let filtered = open.filter((r) => (!$('mk-channel').value || r.channel === Number($('mk-channel').value)) && (!$('mk-room').value || r.room === Number($('mk-room').value)));
    if ($('mk-sort').value === 'recent') filtered.sort((a, b) => b.t - a.t);
    $('mk-open').innerHTML = filtered.length ? table(filtered) : `<p class="market-empty">${T.noOpen}</p>`;
  }
  ['mk-channel', 'mk-room', 'mk-sort'].forEach((key) => $(key).addEventListener('change', renderOpen));
  renderOpen();
  function renderCharts() {
    hideTip();
    const chartRows = rows.filter((r) => r.sold === chartSold);
    const area = $('mk-charts');
    if (!chartRows.length) { area.innerHTML = `<p class="market-empty">${T.chartEmpty}</p>`; return; }
    const trend = trendChart(chartRows);
    const spread = spreadChart(chartRows);
    area.innerHTML = `<section><h3>${T.trend}</h3><p class="muted note">${T.trendNote}</p>${trend.svg}</section><section><h3>${T.dist}</h3><p class="muted note">${T.distNote}</p>${spread.svg}</section>`;
  // Hover: the trend shows a crosshair and the day's numbers; the spread shows the band's range and counts.
  const [trendSvg, spreadSvg] = box.querySelectorAll('svg.chart');
  const cross = box.querySelector('#trend-cross');
  trendSvg.addEventListener('pointermove', (e) => {
    const hit = e.target.closest('.hit');
    if (!hit) return hideTip();
    const d = trend.days[Number(hit.dataset.k)];
    cross.setAttribute('x1', trend.mid(d));
    cross.setAttribute('x2', trend.mid(d));
    cross.hidden = false;
    showTip(
      d.med == null
        ? `<b>${dayFmt.format(new Date(d.end - 1))}</b>–`
        : `<b>${dayFmt.format(new Date(d.end - 1))}</b>${T.median} ${mesos(d.med)}<br>${T.range} ${mesos(d.lo)} – ${mesos(d.hi)}<br>${d.ps.length} ${T.listings}`,
      e
    );
  });
  trendSvg.addEventListener('pointerleave', () => {
    cross.hidden = true;
    hideTip();
  });
  spreadSvg.addEventListener('pointermove', (e) => {
    const hit = e.target.closest('.hit');
    if (!hit) return hideTip();
    const b = spread.bins[Number(hit.dataset.i)];
    showTip(`<b>${mesos(Math.round(b.from))} – ${mesos(Math.round(b.to))}</b>${b.count} ${T.listings} · ${b.sold} ${T.soldN}`, e);
  });
  spreadSvg.addEventListener('pointerleave', hideTip);
  }
  box.querySelectorAll('[data-chart]').forEach((button) => button.addEventListener('click', () => {
    chartSold = button.dataset.chart === 'sold';
    box.querySelectorAll('[data-chart]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    renderCharts();
  }));
  renderCharts();
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
