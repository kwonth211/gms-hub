import { indexEntry, searchEntries } from './search-index.js';

const i18n = JSON.parse(document.getElementById('i18n').textContent);
const input = document.getElementById('pr-q');
const result = document.getElementById('pr-result');
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const squash = (s) => s.toLowerCase().replace(/\s+/g, '');
const MAX = 30;
let items = null;
let byId = new Map();
let twins = new Map();

// Korean players write prices as 58만 or 1.2억, others as 580k or 1.2m; plain digits and commas work everywhere.
function parsePrice(text) {
  const t = text.replace(/[,\s]|메소|mesos?/gi, '').toLowerCase();
  const units = { 억: 1e8, 만: 1e4, b: 1e9, m: 1e6, k: 1e3 };
  let total = 0;
  let rest = t;
  for (const [u, mult] of Object.entries(units)) {
    const m = rest.match(new RegExp(`^(\\d+(?:\\.\\d+)?)${u}`));
    if (m) {
      total += parseFloat(m[1]) * mult;
      rest = rest.slice(m[0].length);
    }
  }
  if (rest) {
    if (!/^\d+(\.\d+)?$/.test(rest)) return null;
    total += parseFloat(rest);
  }
  total = Math.round(total);
  return total >= 1 && total <= 1e10 ? total : null;
}

function fmtPrice(n) {
  if (i18n.lang === 'ko') {
    if (n >= 1e8) return `${+(n / 1e8).toFixed(2)}억`;
    if (n >= 1e4) return `${+(n / 1e4).toFixed(n >= 1e6 ? 0 : 1)}만`;
    return n.toLocaleString('ko');
  }
  if (n >= 1e9) return `${+(n / 1e9).toFixed(2)}b`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(2)}m`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}k`;
  return String(n);
}

// Each item gets one lowercase haystack; Korean scroll names keep English stat words, so typed Korean stats are translated first.
function prepare(rows) {
  return rows.map(([id, ko, en, cat, sub, lv]) => {
    const hay = `${ko} ${en}`.toLowerCase();
    // Korean pages lead with the Korean name and show the English one under it; English pages use English only.
    const name = i18n.lang === 'ko' ? ko || en : en;
    return { id, ko, en, cat, sub, lv, hay, flat: squash(hay), name };
  });
}

// A few names belong to more than one item (male and female versions of armour, older copies of potions), so their cards
// would look identical. Armour IDs carry the gender in one digit; other repeats show their ID.
function twinNote(it) {
  if (twins.get(it.en.toLowerCase()) < 2) return '';
  if ([104, 105, 106].includes(Math.floor(it.id / 10000))) return Math.floor(it.id / 1000) % 10 ? i18n.twin.female : i18n.twin.male;
  return fill(i18n.twin.other, { id: it.id });
}

// The shared search (also on the home page and live market): shorthand, Korean words for English-only cash items, ranking.
let entries = [];
function search(q) {
  return searchEntries(entries, q).map((e) => e.it);
}

function siteLink(site, it) {
  const url = site.url.replace('{id}', it.id).replace('{en}', encodeURIComponent(it.en));
  const note = site.direct ? i18n.direct : i18n.copyNote;
  return `<a class="price-link${site.direct ? ' direct' : ''}" href="${esc(url)}" target="_blank" rel="noopener" data-site="${site.id}" data-copy="${site.direct ? '' : esc(it.en)}">${site.name}${site.paid ? ` <em>${i18n.paid}</em>` : ''}<small>${note}</small></a>`;
}

function card(it) {
  const kind = [i18n.subs[it.sub] || (i18n.lang === 'ko' ? i18n.cats[it.cat] : it.sub), it.lv ? fill(i18n.level, { lv: it.lv }) : '', twinNote(it)].filter(Boolean).join(' · ');
  const en = it.name !== it.en ? `<span class="en">${esc(it.en)}</span>` : '';
  return `<article class="item-card" data-id="${it.id}">
<div class="item-head"><img src="https://maplestory.io/api/MCW/1/item/${it.id}/icon" alt="" width="32" height="32" loading="lazy"><div><strong>${esc(it.name)}</strong>${en}<small>${esc(kind)}</small></div></div>
${i18n.api ? `<div class="hub-price" data-id="${it.id}"><span class="hub-label">${i18n.hubLabel}</span><span class="hub-value">…</span></div>` : ''}
<div class="price-links">${i18n.sites.map((s) => siteLink(s, it)).join('')}</div>
${i18n.api ? reportForm(it) : ''}
</article>`;
}

function reportForm(it) {
  const kinds = Object.entries(i18n.kinds).map(([k, label]) => `<option value="${k}">${label}</option>`).join('');
  return `<details class="report"><summary>${i18n.report}</summary><form class="report-form" data-id="${it.id}">
<select name="kind" aria-label="${esc(i18n.report)}">${kinds}</select>
<input name="price" inputmode="decimal" autocomplete="off" placeholder="${esc(i18n.pricePh)}" aria-label="${esc(i18n.pricePh)}" required>
<button class="btn small-btn" type="submit">${i18n.submit}</button>
<p class="report-msg" aria-live="polite"></p></form></details>`;
}

function render() {
  const q = input.value.trim();
  history.replaceState(null, '', q ? `?q=${encodeURIComponent(q)}` : location.pathname);
  if (!q) {
    result.innerHTML = '';
    renderRecent();
    return;
  }
  if (!items) return;
  const hits = search(q);
  if (!hits.length) {
    result.innerHTML = `<p class="empty">${esc(fill(i18n.none, { q }))}</p>`;
    return;
  }
  result.innerHTML =
    (hits.length > MAX ? `<p class="muted">${fill(i18n.more, { n: MAX })}</p>` : '') + hits.slice(0, MAX).map(card).join('');
  loadSummaries(hits.slice(0, MAX).map((it) => it.id));
}

// Player-reported prices from our own API, fetched per batch of visible cards.
let summaryTimer;
function loadSummaries(ids, fresh = false) {
  if (!i18n.api || !ids.length) return;
  clearTimeout(summaryTimer);
  summaryTimer = setTimeout(async () => {
    let data = {};
    try {
      // Right after a report the browser's 30-second cached copy would hide it, so that refresh skips the cache.
      const r = await fetch(`${i18n.api}/prices?ids=${ids.join(',')}`, fresh ? { cache: 'reload' } : {});
      if (r.ok) data = await r.json();
    } catch (e) {}
    ids.forEach((id) => paintSummary(id, data[id]));
  }, 250);
}

function paintSummary(id, sum) {
  const box = result.querySelector(`.hub-price[data-id="${id}"]`);
  if (!box) return;
  const value = box.querySelector('.hub-value');
  box.classList.toggle('has', !!sum);
  if (!sum) {
    value.textContent = i18n.hubNone;
    return;
  }
  const kinds = Object.keys(i18n.kinds)
    .filter((k) => sum[k])
    .map((k) => `${i18n.kinds[k]} ${fmtPrice(sum[k].median)}`)
    .join(' · ');
  value.innerHTML = `<b>${fmtPrice(sum.median)}</b> <small>${sum.basis ? `${esc(i18n.kinds[sum.basis])} · ` : ''}${esc(fill(i18n.hubSummary, { n: sum.n, low: fmtPrice(sum.low), high: fmtPrice(sum.high) }))}${kinds ? `<br>${esc(kinds)}` : ''}</small>`;
}

async function renderRecent() {
  if (!i18n.api || !items) return;
  let rows = [];
  try {
    const r = await fetch(`${i18n.api}/prices/recent`);
    if (r.ok) rows = await r.json();
  } catch (e) {}
  if (input.value.trim()) return;
  const list = rows
    .filter((r) => byId.has(r.item))
    .map((r) => {
      const it = byId.get(r.item);
      return `<li><button type="button" class="linkish" data-q="${esc(it.name)}">${esc(it.name)}</button> <span class="muted">${i18n.kinds[r.kind]}</span> <b>${fmtPrice(r.price)}</b></li>`;
    })
    .join('');
  result.innerHTML = `<section class="recent-prices"><h2>${i18n.recent}</h2>${list ? `<ul>${list}</ul>` : `<p class="muted">${i18n.recentNone}</p>`}</section>`;
}

let timer;
input.addEventListener('input', () => {
  render();
  clearTimeout(timer);
  timer = setTimeout(() => {
    const q = input.value.trim();
    if (q && items) track('price_search', { search_term: q, results: search(q).length });
  }, 1200);
});

document.querySelectorAll('.chip').forEach((b) =>
  b.addEventListener('click', () => {
    input.value = b.dataset.q;
    render();
    track('price_search', { search_term: b.dataset.q, source: 'chip' });
  })
);

result.addEventListener('click', (e) => {
  const b = e.target.closest('.linkish');
  if (!b) return;
  input.value = b.dataset.q;
  render();
});

result.addEventListener('submit', async (e) => {
  const form = e.target.closest('.report-form');
  if (!form) return;
  e.preventDefault();
  const msg = form.querySelector('.report-msg');
  const price = parsePrice(form.price.value);
  if (!price) {
    msg.textContent = i18n.badPrice;
    return;
  }
  const btn = form.querySelector('button');
  btn.disabled = true;
  try {
    const r = await fetch(`${i18n.api}/price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: Number(form.dataset.id), price, kind: form.kind.value })
    });
    msg.textContent = r.ok ? `${i18n.thanks} (${fmtPrice(price)})` : i18n.failed;
    if (r.ok) {
      form.price.value = '';
      track('price_report', { item_id: form.dataset.id, kind: form.kind.value });
      loadSummaries([Number(form.dataset.id)], true);
    }
  } catch (err) {
    msg.textContent = i18n.failed;
  }
  btn.disabled = false;
});

// Sites without search links get the English name on the clipboard so one paste finishes the lookup.
result.addEventListener('click', (e) => {
  const a = e.target.closest('.price-link');
  if (!a) return;
  track('price_link', { site_id: a.dataset.site, item_id: a.closest('.item-card').dataset.id });
  if (!a.dataset.copy) return;
  navigator.clipboard?.writeText(a.dataset.copy).catch(() => {});
  const note = document.createElement('p');
  note.className = 'copied';
  note.textContent = fill(i18n.copied, { en: a.dataset.copy });
  a.closest('.item-card').querySelector('.copied')?.remove();
  a.closest('.item-card').appendChild(note);
});

const fromUrl = new URLSearchParams(location.search).get('q');
if (fromUrl) input.value = fromUrl;
fetch(i18n.itemsUrl)
  .then((r) => r.json())
  .then((rows) => {
    items = prepare(rows);
    byId = new Map(items.map((it) => [it.id, it]));
    entries = items.map((it) => indexEntry({ type: 'item', id: it.id, title: it.name, names: [it.ko, it.en, String(it.id)], it }));
    items.forEach((it) => twins.set(it.en.toLowerCase(), (twins.get(it.en.toLowerCase()) || 0) + 1));
    render();
  })
  .catch(() => {});
