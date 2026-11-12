// Search from any page: the header button (or "/") opens a search sheet over items, monsters and the site's own pages.
// Items open their market panel, monsters their page. Uses the same matcher as the home search (initials, abbreviations
// like 장공, Korean or English names); the item and monster lists load the first time the sheet opens.
import { indexEntry, searchEntries } from './search-index.js';

const btn = document.querySelector('[data-hs]');
if (btn) {
  const ko = document.documentElement.lang === 'ko';
  const tr = (k, e) => (ko ? k : (globalThis.tx || ((s) => s))(e));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const sheet = document.createElement('dialog');
  sheet.className = 'hs-sheet';
  sheet.setAttribute('aria-label', tr('사이트 검색', 'Search the site'));
  sheet.innerHTML = `<form method="dialog" class="hs-form" role="search"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13 13l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input type="search" class="hs-input" autocomplete="off" maxlength="80" placeholder="${esc(tr('아이템, 몬스터, 페이지 (예: 장공, 머쉬맘, 사냥터)', 'Items, monsters, pages (e.g. gloves attack, Mushmom)'))}" aria-label="${esc(tr('검색어', 'Search'))}"><button type="submit" class="hs-close" aria-label="${esc(tr('닫기', 'Close'))}">Esc</button></form><ul class="hs-results" role="listbox"></ul><p class="hs-hint muted small">${tr('↑↓로 고르고 Enter로 열어요.', 'Use ↑↓ and Enter.')}</p>`;
  document.body.append(sheet);
  const input = sheet.querySelector('.hs-input');
  const list = sheet.querySelector('.hs-results');
  let entries = null, loading = null, hits = [], cursor = 0;

  const pageEntries = JSON.parse(btn.dataset.pages || '[]').map(([title, href]) => indexEntry({ type: 'page', id: href, title, href, names: [title] }));
  const load = () => (loading ||= Promise.all([
    fetch(btn.dataset.items).then((r) => r.json()).catch(() => []),
    fetch(btn.dataset.mobs).then((r) => r.json()).catch(() => []),
  ]).then(([items, mobs]) => {
    entries = [
      ...pageEntries,
      ...mobs.map(([id, mko, men, lv, , , , , , , , , aliases]) => indexEntry({ type: 'mob', id: `m${id}`, title: ko && mko ? mko : men, sub: `Lv. ${lv}`, href: `${btn.dataset.monsters}${id}/`, icon: `/assets/monsters/${id}.gif`, names: [mko, men, ...String(aliases || '').split(' ')] })),
      ...items.map(([id, iko, ien]) => indexEntry({ type: 'item', id, title: ko && iko ? iko : ien, sub: ko && iko ? ien : '', href: `${btn.dataset.market}?item=${id}`, icon: `https://maplestory.io/api/MCW/1/item/${id}/icon`, names: [iko, ien, String(id)] })),
    ];
    render();
  }));

  const TYPE = { item: () => tr('시세', 'Price'), mob: () => tr('몬스터', 'Monster'), page: () => tr('페이지', 'Page') };
  function render() {
    const q = input.value.trim();
    if (!q) { list.innerHTML = ''; hits = []; return; }
    if (!entries) { list.innerHTML = `<li class="hs-empty">${tr('불러오는 중…', 'Loading…')}</li>`; return; }
    // Pages first when they match, then a mix of items and monsters in match order.
    const found = searchEntries(entries, q);
    hits = [...found.filter((e) => e.type === 'page').slice(0, 3), ...found.filter((e) => e.type !== 'page').slice(0, 9)];
    cursor = 0;
    list.innerHTML = hits.length
      ? hits.map((e, i) => `<li role="option" aria-selected="${i === cursor}"><a href="${esc(e.href)}" data-hs-type="${e.type}">${e.icon ? `<img src="${esc(e.icon)}" width="28" height="28" alt="" loading="lazy">` : '<span class="hs-ico" aria-hidden="true">›</span>'}<span class="hs-name">${esc(e.title)}${e.sub ? `<small>${esc(e.sub)}</small>` : ''}</span><span class="hs-type">${TYPE[e.type]()}</span></a></li>`).join('')
      : `<li class="hs-empty">${tr('찾는 결과가 없어요. 한글·영문·초성(ㅈㄱ)·줄임말(장공)로도 찾아져요.', 'No match. Korean, English, initials and short names work too.')}</li>`;
  }
  const move = (d) => {
    if (!hits.length) return;
    cursor = (cursor + d + hits.length) % hits.length;
    list.querySelectorAll('[role="option"]').forEach((li, i) => li.setAttribute('aria-selected', i === cursor));
    list.children[cursor]?.scrollIntoView({ block: 'nearest' });
  };
  function open() {
    if (!sheet.open) sheet.showModal();
    input.focus();
    input.select();
    load();
    window.track?.('header_search_open', { page: document.body.dataset.page || '' });
  }
  btn.addEventListener('click', open);
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !sheet.open && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') && !document.activeElement?.isContentEditable) {
      e.preventDefault();
      open();
    }
  });
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter' && hits[cursor]) {
      e.preventDefault();
      window.track?.('header_search_go', { type: hits[cursor].type });
      location.href = hits[cursor].href;
    }
  });
  list.addEventListener('click', (e) => { const a = e.target.closest('a'); if (a) window.track?.('header_search_go', { type: a.dataset.hsType }); });
  // A click on the backdrop (outside the sheet's box) closes it.
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });
}
