// Drop finder on the odds page: type an item, see the monsters players report dropping it (lowest level first).
// Uses the site search's matching, so Korean shorthand (장공, 귀힘) and stat words (공격력 → Attack) work here too.
import { indexEntry, searchEntries } from './search-index.js';

const box = document.getElementById('drop-finder');
const input = document.getElementById('df-q');
const out = document.getElementById('df-results');
if (box && input && out) {
  const { items, mobs, t } = JSON.parse(document.getElementById('drop-index').textContent);
  const ko = document.documentElement.lang === 'ko';
  const entries = items.map((it, i) => indexEntry({ names: [it[0], it[1]], i }));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let timer;
  function render(user) {
    if (!input.value.trim()) { out.innerHTML = ''; return; }
    const hits = searchEntries(entries, input.value).slice(0, 8).map((e) => ({ it: items[e.i] }));
    out.innerHTML = hits.length
      ? `<ul class="df-list">${hits.map(({ it: [nameKo, nameEn, href, rows] }) => {
          const shown = rows.slice(0, 6).map(([mi, rep]) => {
            const [mk, me, lv, mh] = mobs[mi];
            return `<a href="${mh}"${rep ? ` title="${esc(t.repeated)}"` : ''}><b>${esc(ko ? mk : me)}</b><small>Lv. ${lv}</small></a>`;
          }).join('');
          const more = rows.length > 6 ? `<a class="df-more" href="${href}">${t.more.replace('{n}', rows.length - 6)}</a>` : '';
          return `<li><a class="df-item" href="${href}">${esc(ko ? nameKo : nameEn)}</a><div class="df-mobs">${shown}${more}</div></li>`;
        }).join('')}</ul>`
      : `<p class="muted">${t.none}</p>`;
    if (user) {
      clearTimeout(timer);
      timer = setTimeout(() => window.track && window.track('drop_search', { results: hits.length }), 1200);
    }
  }
  input.addEventListener('input', () => render(true));
  box.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { input.value = b.dataset.q; render(true); input.focus(); }));
  const q = new URLSearchParams(location.search).get('q');
  if (q) { input.value = q; render(false); }
}
