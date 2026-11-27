// "지금 열린 상점" strip above the market page's tabs (owner 2026-11-27: the Shop Scan shops on the market page, not too
// heavy). One row of small shop chips from /market/scan-shops, newest first; each opens that shop on /trade/. Shown only
// when at least MIN shops still have something on sale, so a day with no scans shows nothing instead of an empty box.
const box = document.getElementById('mk-shops');
const MIN = 3, SHOW = 6;
if (box) {
  const ko = document.documentElement.lang === 'ko', tr = (k, e) => (ko ? k : e);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nf = new Intl.NumberFormat(ko ? 'ko-KR' : 'en-US');
  const icon = (id) => `<img src="https://maplestory.io/api/MCW/1.2/item/${id}/icon" alt="" width="22" height="22" loading="lazy">`;
  const FACE = new URL('nav/mushroom.webp?v=n1', import.meta.url).href;
  const ago = (at) => {
    const m = Math.max(0, Math.round((Date.now() - Date.parse(`${String(at).replace(' ', 'T')}Z`)) / 60000));
    return m < 1 ? tr('방금', 'just now') : m < 60 ? tr(`${m}분 전`, `${m} min ago`) : m < 1440 ? tr(`${Math.floor(m / 60)}시간 전`, `${Math.floor(m / 60)} h ago`) : tr(`${Math.floor(m / 1440)}일 전`, `${Math.floor(m / 1440)} d ago`);
  };
  const trade = box.dataset.trade;
  fetch(`${box.dataset.api}/market/scan-shops`).then((r) => (r.ok ? r.json() : null)).then((d) => {
    const shops = (d?.shops || []).filter((s) => s.items.some((i) => !i[3])).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    if (shops.length < MIN) return;
    const chips = shops.slice(0, SHOW).map((s) => {
      const items = s.items.filter((i) => !i[3]);
      const face = s.face?.photo ? `<img class="mks-face" src="${esc(s.face.photo)}" alt="" width="34" height="34" loading="lazy" referrerpolicy="no-referrer">` : `<img class="mks-face dflt" src="${FACE}" alt="" width="34" height="34">`;
      return `<li><a class="mks-shop" href="${trade}?shop=${encodeURIComponent(s.seller)}" data-mks>${face}<span class="mks-txt"><b translate="no">${esc(s.title || s.seller)}</b><small>CH ${s.ch} · ${tr('자유시장', 'FM')} ${s.room} · ${ago(s.at)}</small></span><span class="mks-icons">${items.slice(0, 3).map((i) => icon(i[0])).join('')}${items.length > 3 ? `<em>+${items.length - 3}</em>` : ''}</span></a></li>`;
    }).join('');
    box.innerHTML = `<div class="mks-head"><h2>${tr('지금 열린 상점', 'Open shops now')} <small>${tr(`${nf.format(shops.length)}곳`, `${nf.format(shops.length)}`)}</small></h2><a href="${trade}#tb-shops" data-mks-all>${tr('전체 보기', 'See all')}</a></div><ul class="mks-list">${chips}</ul>`;
    box.hidden = false;
    box.addEventListener('click', (e) => {
      const a = e.target.closest('[data-mks],[data-mks-all]');
      if (a) window.track?.('market_shops_click', { page_type: 'market', target: a.hasAttribute('data-mks-all') ? 'all' : 'shop' });
    });
    box.addEventListener('error', (e) => { const t = e.target; if (t instanceof HTMLImageElement && t.classList.contains('mks-face') && !t.classList.contains('dflt')) { t.classList.add('dflt'); t.src = FACE; } }, true);
  }).catch(() => {});
}
