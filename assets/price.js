const i18n = JSON.parse(document.getElementById('i18n').textContent);
const input = document.getElementById('pr-q');
const result = document.getElementById('pr-result');
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const squash = (s) => s.toLowerCase().replace(/\s+/g, '');
const MAX = 30;
let items = null;

// Each item gets one lowercase haystack; Korean scroll names keep English stat words, so typed Korean stats are translated first.
function prepare(rows) {
  return rows.map(([id, ko, en, cat, sub, lv]) => {
    const hay = `${ko} ${en}`.toLowerCase();
    return { id, ko, en, cat, sub, lv, hay, flat: squash(hay), name: ko || en };
  });
}

function terms(q) {
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => i18n.aliases[w] || w);
}

function search(q) {
  const words = terms(q);
  const whole = squash(q);
  const hits = items.filter((it) => it.flat.includes(whole) || words.every((w) => it.hay.includes(w) || it.flat.includes(squash(w))));
  // Exact names first, then names that start with the query, then shorter names.
  const rank = (it) => (squash(it.name) === whole || squash(it.en) === whole ? 0 : squash(it.name).startsWith(whole) || squash(it.en).startsWith(whole) ? 1 : 2);
  return hits.sort((a, b) => rank(a) - rank(b) || !!b.ko - !!a.ko || a.name.length - b.name.length || a.id - b.id);
}

function siteLink(site, it) {
  const url = site.url.replace('{id}', it.id).replace('{en}', encodeURIComponent(it.en));
  const note = site.direct ? i18n.direct : i18n.copyNote;
  return `<a class="price-link${site.direct ? ' direct' : ''}" href="${esc(url)}" target="_blank" rel="noopener" data-site="${site.id}" data-copy="${site.direct ? '' : esc(it.en)}">${site.name}${site.paid ? ` <em>${i18n.paid}</em>` : ''}<small>${note}</small></a>`;
}

function card(it) {
  const kind = [i18n.subs[it.sub] || i18n.cats[it.cat] || it.sub, it.lv ? fill(i18n.level, { lv: it.lv }) : ''].filter(Boolean).join(' · ');
  const en = it.ko && it.en !== it.ko ? `<span class="en">${esc(it.en)}</span>` : '';
  return `<article class="item-card" data-id="${it.id}">
<div class="item-head"><img src="https://maplestory.io/api/MCW/1/item/${it.id}/icon" alt="" width="32" height="32" loading="lazy"><div><strong>${esc(it.name)}</strong>${en}<small>${esc(kind)}</small></div></div>
<div class="price-links">${i18n.sites.map((s) => siteLink(s, it)).join('')}</div>
</article>`;
}

function render() {
  const q = input.value.trim();
  history.replaceState(null, '', q ? `?q=${encodeURIComponent(q)}` : location.pathname);
  if (!q) {
    result.innerHTML = '';
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
    render();
  })
  .catch(() => {});
