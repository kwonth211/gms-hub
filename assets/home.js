const input = document.getElementById('site-search');
const main = document.querySelector('.dir-main');
const favSection = document.getElementById('favorites');
const favCards = document.getElementById('fav-cards');
const favToc = document.getElementById('fav-toc');
const empty = document.getElementById('no-results');
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

function filter() {
  const q = input.value.trim().toLowerCase();
  document.querySelectorAll('.site-card').forEach((c) => (c.hidden = q !== '' && !c.dataset.search.includes(q)));
  let any = false;
  document.querySelectorAll('[data-cat]').forEach((cat) => {
    const visible = (!activeCat || cat.id === activeCat) && [...cat.querySelectorAll('.site-card')].some((c) => !c.hidden);
    cat.hidden = !visible;
    any ||= visible;
  });
  // Our own calculators answer many searches better than an outside site does.
  const hits = [...document.querySelectorAll('.tool-hit')];
  hits.forEach((h) => (h.hidden = q === '' || !h.dataset.search.includes(q)));
  const toolHit = hits.some((h) => !h.hidden);
  document.getElementById('tool-hits').hidden = !toolHit;
  any ||= toolHit;
  any ||= showItemHits(q);
  // Favorites stay out of the way while a single category is selected.
  if (favCards.children.length) favSection.hidden = !!activeCat || ![...favCards.children].some((c) => !c.hidden);
  empty.hidden = any;
}

// Most searches here are item names ("미스릴"), which no listed site matches. Show matching items with direct links to the
// price trackers right here; trackers without linkable search get the English name copied before they open.
const itemHits = document.getElementById('item-hits');
const itemRows = document.getElementById('item-rows');
const moreItems = document.getElementById('more-items');
const priceSites = JSON.parse(itemHits.dataset.sites);
const ITEM_ROWS = 5;
const korean = document.documentElement.lang === 'ko';
let items = null;
let itemsPromise = null;
// One shared fetch of the item index for the search and the live market widget.
function loadItems() {
  itemsPromise ||= fetch(itemHits.dataset.items)
    .then((r) => r.json())
    .then((rows) => (items = rows.map(([id, ko, en]) => ({ id, ko, en, name: korean ? ko || en : en, flat: squash(`${ko}${en}`) }))));
  return itemsPromise;
}
const squash = (s) => s.toLowerCase().replace(/\s+/g, '');
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function itemRow(it) {
  const links = priceSites
    .map((s) => {
      const url = s.url.replace('{id}', it.id).replace('{en}', encodeURIComponent(it.en));
      return `<a class="item-link${s.direct ? ' direct' : ''}" href="${escHtml(url)}" target="_blank" rel="noopener" data-site="${s.id}" data-item="${it.id}"${s.direct ? '' : ` data-copy="${escHtml(it.en)}"`}>${s.name}</a>`;
    })
    .join('');
  return `<div class="item-row"><img src="https://maplestory.io/api/MCW/1/item/${it.id}/icon" alt="" width="28" height="28" loading="lazy"><span class="item-name"><strong>${escHtml(it.name)}</strong>${it.name !== it.en ? `<small>${escHtml(it.en)}</small>` : ''}</span><span class="item-links">${links}</span></div>`;
}

function showItemHits(q) {
  const flat = squash(q);
  if (flat.length < 2) {
    itemHits.hidden = true;
    return false;
  }
  if (!items) {
    loadItems()
      .then(filter)
      .catch(() => {});
    return false;
  }
  const hits = items.filter((it) => it.flat.includes(flat)).sort((a, b) => a.name.length - b.name.length || a.id - b.id);
  itemRows.innerHTML = hits.slice(0, ITEM_ROWS).map(itemRow).join('');
  moreItems.hidden = hits.length <= ITEM_ROWS;
  moreItems.href = `${itemHits.dataset.price}?q=${encodeURIComponent(q.trim())}`;
  moreItems.textContent = itemHits.dataset.more.replace('{n}', hits.length - ITEM_ROWS);
  itemHits.hidden = !hits.length;
  return hits.length > 0;
}

itemRows.addEventListener('click', (e) => {
  const a = e.target.closest('.item-link');
  if (!a) return;
  track('price_link', { site_id: a.dataset.site, item_id: a.dataset.item, source: 'home' });
  if (!a.dataset.copy) return;
  navigator.clipboard?.writeText(a.dataset.copy).catch(() => {});
  a.closest('.item-row').querySelector('.copied')?.remove();
  const note = document.createElement('small');
  note.className = 'copied';
  note.textContent = itemHits.dataset.copied.replace('{en}', a.dataset.copy);
  a.closest('.item-row').appendChild(note);
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
      input.value = '';
      filter();
    }
    if (target.hidden && activeCat) setCategory(activeCat);
  })
);

input.addEventListener('input', filter);
// Log the settled query, not every keystroke.
let searchTimer;
input.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const term = input.value.trim();
    if (term) track('search', { search_term: term, results: document.querySelectorAll('[data-cat] .site-card:not([hidden])').length });
  }, 1200);
});
const q = new URLSearchParams(location.search).get('q');
if (q) input.value = q;
renderFavs();
if (q) document.querySelector('.directory').scrollIntoView();

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
    btn.hidden = false;
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
