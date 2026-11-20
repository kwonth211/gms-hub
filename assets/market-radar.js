import { radarEligible, radarDeals, RADAR_WINDOW, RADAR_REFERENCE_MAX_AGE } from './market-radar-data.js';
import { parseUtc } from './market-data.js';

export function mountMarketRadar({ box, get, getCatalog, name, url, openItem, lang }) {
  if (!box) return;
  const ko = lang === 'ko', tr = (k, e) => ko ? k : e;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = (n) => Number(n).toLocaleString(lang);
  const status = box.querySelector('[data-radar-status]'), cards = box.querySelector('[data-radar-cards]');
  const refresh = box.querySelector('[data-radar-refresh]');
  let busy = false, deals = [], lastAt = 0;
  async function load() {
    if (busy || !box.open || document.hidden) return;
    if (Date.now() - lastAt < 60000) return;
    busy = true; refresh.disabled = true; cards.setAttribute('aria-busy', 'true');
    status.textContent = tr('최근 매물을 확인하고 있어요…', 'Checking recent listings…');
    try {
      const catalog = await getCatalog();
      if (!catalog?.items || Date.now() - Date.parse(catalog.asOf) > RADAR_REFERENCE_MAX_AGE) throw Error('stale catalog');
      const ids = catalog.items.filter(radarEligible).sort((a, b) => (b.sales || 0) - (a.sales || 0) || b.open - a.open).slice(0, 120).map((s) => s.item);
      const since = new Date(Math.floor((Date.now() - RADAR_WINDOW) / 60000) * 60000).toISOString();
      // Two bounded samples, not an exhaustive bargain search. Each opens only on demand and uses the shared cache.
      const answers = ids.length ? await Promise.all(['recent', 'price'].map((sort) => get('/market/listings?' + new URLSearchParams({ ids: ids.join(','), state: 'open', sort, since, days: 1, limit: 100 })))) : [];
      const rows = [...new Map(answers.flatMap((a) => a.rows || []).map((r) => [r.id, r])).values()];
      deals = radarDeals(catalog, rows);
      lastAt = Date.now();
      const method = box.querySelector('.mb-radar-method');
      if (method) {
        let reference = method.querySelector('[data-radar-reference]');
        if (!reference) { reference = document.createElement('p'); reference.dataset.radarReference = ''; method.append(reference); }
        reference.textContent = tr('판매가 중앙값 집계 시점: ', 'Asking-median snapshot: ') + new Date(catalog.asOf).toLocaleString(lang, ko ? { timeZone: 'Asia/Seoul' } : {}) + (ko ? ' KST' : '');
      }
      status.textContent = tr(`${new Date(lastAt).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })} KST 확인 · 최근 매물 ${rows.length}건 비교 · 열어두면 1분마다 확인`,
        `Checked ${new Date(lastAt).toLocaleTimeString(lang)} · ${rows.length} recent listings compared · checks every minute while open`);
      // Preserve keyboard focus when the timed refresh replaces cards (including a card that disappears).
      const active = cards.contains(document.activeElement) ? document.activeElement : null;
      const focusKey = active?.hasAttribute('data-radar-share') ? `[data-radar-share="${active.dataset.radarShare}"]` : active?.hasAttribute('data-radar-item') ? `[data-radar-item="${active.dataset.radarItem}"]` : null;
      cards.innerHTML = deals.length ? deals.map((r) => {
        const at = new Date(parseUtc(r.seen)).toLocaleTimeString(lang, ko ? { timeZone: 'Asia/Seoul' } : {});
        return `<article class="mb-radar-card"><a href="${esc(url(r.item))}" data-radar-item="${r.item}"><img src="https://maplestory.io/api/MCW/1/item/${r.item}/icon" width="28" height="28" alt="" loading="lazy"><strong>${esc(name(r.item))}</strong></a><p class="mb-radar-price">${money(r.price)} <small>${tr('메소 / 개', 'mesos each')}</small><span>${tr(`중앙값보다 ${r.below}% 낮음`, `${r.below}% below median`)}</span></p><p>${tr('24h 판매가 중앙값', '24h asking median')} ${money(r.median)} · ${tr(`매물 ${r.sample}건 · 상점 ${r.shops}곳`, `${r.sample} listings · ${r.shops} shops`)}</p><p><b>CH ${r.channel} · FM ${r.room}</b> · ${esc(r.seller)}<br><time datetime="${new Date(parseUtc(r.seen)).toISOString()}">${esc(at)}${ko ? ' KST' : ''}</time> ${tr('확인', 'seen')}</p><div class="mb-radar-actions"><a class="btn small-btn" href="${esc(url(r.item))}" data-radar-item="${r.item}">${tr('현재 매물 비교', 'Compare listings')}</a><button class="btn ghost small-btn" type="button" data-radar-share="${r.item}">${tr('시세 요약 복사', 'Copy price summary')}</button></div></article>`;
      }).join('') : `<p class="market-empty">${tr('확인한 매물 중 조건을 만족하는 매물이 없어요. 아래 검색에서 원하는 아이템의 전체 매물을 확인할 수 있어요.', 'No sampled listings meet these conditions. Use the search below to check all listings for an item.')}</p>`;
      if (focusKey) (cards.querySelector(focusKey) || refresh).focus({ preventScroll: true });
      window.track?.('market_radar_result', { results: deals.length, sampled: rows.length, lang });
    } catch {
      deals = []; cards.innerHTML = '';
      status.textContent = tr('최신 매물을 확인하지 못했어요. 다시 확인하거나 아래 아이템 검색을 이용해 주세요.', 'Could not verify recent listings. Retry or use the item search below.');
    } finally { busy = false; refresh.disabled = false; cards.setAttribute('aria-busy', 'false'); }
  }
  box.addEventListener('toggle', () => { if (box.open) { window.track?.('market_radar_open', { lang }); load(); } });
  refresh.addEventListener('click', () => { lastAt = 0; load(); });
  box.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-radar-item]');
    if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault(); const id = Number(a.dataset.radarItem);
      window.track?.('market_radar_click', { item_id: id, lang }); openItem(id); return;
    }
    const b = e.target.closest('[data-radar-share]');
    if (!b) return;
    const r = deals.find((d) => d.item === Number(b.dataset.radarShare));
    if (!r) return;
    const seen = new Date(parseUtc(r.seen)).toLocaleString(lang, ko ? { timeZone: 'Asia/Seoul' } : {});
    const text = `${name(r.item)} · ${money(r.price)} ${tr('메소/개', 'mesos each')}\nCH ${r.channel} · FM ${r.room} · ${r.seller}\n${tr('확인', 'Seen')}: ${seen}${ko ? ' KST' : ''}\n${tr('24h 판매가 중앙값', '24h asking median')}: ${money(r.median)} (${r.sample} ${tr('매물', 'listings')})\n${tr('관측된 판매가이며 현재 판매 여부는 달라질 수 있어요.', 'Observed asking price; availability can change.')}\n${window.shareUrl(url(r.item), 'market-radar')}`;
    const ok = await window.copyText(text);
    box.querySelector('[data-radar-share-status]').textContent = ok ? tr('가격·위치·확인 시점과 아이템 링크를 복사했어요.', 'Copied price, location, observation time and item link.') : tr('복사하지 못했어요. 아이템 링크를 직접 복사해 주세요.', 'Could not copy. Copy the item link directly.');
    window.track?.('share_copy', { page_type: 'market', item_id: r.item, content: 'market-radar', result: ok ? 'ok' : 'fail' });
  });
  setInterval(load, 60000);
  if (location.hash === '#market-radar') box.open = true;
}
