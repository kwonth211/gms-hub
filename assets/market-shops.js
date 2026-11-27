// "지금 열린 상점" above the market page's tabs (owner 2026-11-27): the Shop Scan shops drawn as the same booths as on
// /trade/, smaller, in a grid. One row first; "더 보기" adds two rows at a time (no sideways scrolling, owner's call).
// Each booth opens that shop's window on /trade/ (?shop=<name>). Hidden when no shop has anything left on sale.
const box = document.getElementById('mk-shops');
if (box) {
  const ko = document.documentElement.lang === 'ko', tr = (k, e) => (ko ? k : e);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nf = new Intl.NumberFormat(ko ? 'ko-KR' : 'en-US');
  const icon = (id) => `<img src="https://maplestory.io/api/MCW/1.2/item/${id}/icon" alt="" width="18" height="18" loading="lazy">`;
  const FACE = new URL('nav/mushroom.webp?v=n1', import.meta.url).href;
  const COIN = new URL('nav/coin.webp?v=n1', import.meta.url).href;
  const ago = (at) => {
    const m = Math.max(0, Math.round((Date.now() - Date.parse(`${String(at).replace(' ', 'T')}Z`)) / 60000));
    return m < 1 ? tr('방금', 'just now') : m < 60 ? tr(`${m}분 전`, `${m} min ago`) : m < 1440 ? tr(`${Math.floor(m / 60)}시간 전`, `${Math.floor(m / 60)} h ago`) : tr(`${Math.floor(m / 1440)}일 전`, `${Math.floor(m / 1440)} d ago`);
  };
  // Same booth colour per seller as /trade/ (trade-board.js wood()).
  const WOODS = ['wood-gold', 'wood-pink', 'wood-sky', 'wood-mint'];
  const wood = (s) => WOODS[[...String(s.seller)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % WOODS.length];
  const trade = box.dataset.trade;
  let shops = [], shown = 0, names = new Map();
  const booth = (s) => {
    const items = s.items.filter((i) => !i[3]), more = items.length - 3;
    const first = names.get(items[0]?.[0]) || '';
    const title = s.title || (!first ? tr(`${items.length}개 판매`, `${items.length} for sale`) : items.length > 1 ? tr(`${first} 외 ${items.length - 1}개`, `${first} +${items.length - 1} more`) : first);
    const face = s.face?.photo
      ? `<img class="trd-shop-face" src="${esc(s.face.photo)}" alt="" width="96" height="96" loading="lazy" referrerpolicy="no-referrer">`
      : `<img class="trd-shop-face dflt" src="${FACE}" alt="" width="96" height="96">`;
    return `<a class="trd-shop ${wood(s)}" href="${trade}?shop=${encodeURIComponent(s.seller)}" data-mks aria-label="${esc(tr(`${s.seller}의 상점, ${items.length}개 판매 중`, `${s.seller}'s shop, ${items.length} on sale`))}">
<span class="trd-booth"><span class="trd-booth-roof" aria-hidden="true"></span><span class="trd-booth-board"${s.title ? ' translate="no"' : ''}>${esc(title)}</span>
<span class="trd-booth-bar"><img class="trd-booth-coin" src="${COIN}" width="16" height="16" alt=""><span class="trd-shop-icons">${items.slice(0, 3).map((i) => icon(i[0])).join('')}${more > 0 ? `<em>+${more}</em>` : ''}</span></span>
<span class="trd-booth-body">${face}<span class="trd-booth-counter" aria-hidden="true"></span></span></span>
<span class="trd-booth-name" translate="no">${esc(s.seller)}</span>
<span class="trd-shop-where">CH ${s.ch} · ${tr('자유시장', 'FM')} ${s.room}</span>
<span class="trd-shop-foot">${tr(`${items.length}개`, `${items.length} items`)} · ${ago(s.at)}</span></a>`;
  };
  // How many booths fit in one row of the grid right now (matches the CSS minmax width).
  const perRow = () => { const grid = box.querySelector('.mks-grid'); const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0; return Math.max(2, cols || Math.floor(((grid?.clientWidth || 360) + 8) / 132)); };
  const draw = () => {
    const grid = box.querySelector('.mks-grid');
    grid.innerHTML = shops.slice(0, shown).map(booth).join('');
    const rest = shops.length - shown, btn = box.querySelector('.mks-more');
    btn.hidden = rest <= 0;
    btn.textContent = tr(`상점 ${nf.format(rest)}곳 더 보기`, `Show ${nf.format(rest)} more`);
  };
  const load = async () => {
    const d = await fetch(`${box.dataset.api}/market/scan-shops`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    shops = (d?.shops || []).filter((s) => s.items.some((i) => !i[3])).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    if (!shops.length) return;
    box.innerHTML = `<div class="mks-head"><h2>${tr('지금 열린 상점', 'Open shops now')} <small>${tr(`${nf.format(shops.length)}곳 · 상점 스캔으로 올라온 상점`, `${nf.format(shops.length)} · from Shop Scan`)}</small></h2><a href="${trade}#tb-shops" data-mks-all>${tr('팝니다·삽니다에서 보기', 'Open the trade board')}</a></div><div class="mks-grid"></div><button type="button" class="mks-more" hidden></button>`;
    box.hidden = false;
    shown = perRow();
    draw();
    // Sign boards name the first item when the shop has no title: names come from the shared item list.
    if (shops.some((s) => !s.title)) {
      const url = document.getElementById('mk-data') && JSON.parse(document.getElementById('mk-data').textContent).itemsUrl;
      if (url) fetch(url).then((r) => r.json()).then((j) => { for (const r of j) names.set(r[0], (ko ? r[1] : r[2]) || r[2] || r[1]); draw(); }).catch(() => {});
    }
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.mks-more')) { shown += perRow() * 2; draw(); window.track?.('market_shops_more', { page_type: 'market', shown }); return; }
    const a = e.target.closest('[data-mks],[data-mks-all]');
    if (a) window.track?.('market_shops_click', { page_type: 'market', target: a.hasAttribute('data-mks-all') ? 'all' : 'shop' });
  });
  box.addEventListener('error', (e) => { const t = e.target; if (t instanceof HTMLImageElement && t.classList.contains('trd-shop-face') && !t.classList.contains('dflt')) { t.classList.add('dflt'); t.src = FACE; } }, true);
  load();
}
