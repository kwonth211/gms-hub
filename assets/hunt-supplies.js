import { makeMarketIndex, matchingIds } from './market-catalog.js';

// Selection-time prices are frozen in the run. Never silently reprice a saved hunt.
export function supplyQuote(summary) {
  const n = summary?.median ?? summary?.typical?.price;
  return Number.isFinite(n) && n > 0 && n <= 1e12 ? { price: Math.round(n), basis: summary.basis || 'market' } : null;
}
export function supplyRows(rows) {
  const names = new Map();
  for (const r of rows) {
    if (r[0] < 2000000 || r[0] >= 2040000) continue;
    const key = JSON.stringify([r[1], r[2]]), old = names.get(key);
    // Identical event copies without a market price do not crowd out the traded potion.
    if (!old || (!old[6] && r[6])) names.set(key, r);
  }
  return [...names.values()];
}
export function bindSupplySearch({ root, ko, itemsUrl, api, changed, disabled }) {
  const L = (a, b) => ko ? a : b;
  let indexPromise;
  const prices = new Map();
  const load = () => indexPromise ||= fetch(itemsUrl).then(r => { if (!r.ok) throw Error(); return r.json(); })
    .then(rows => makeMarketIndex(supplyRows(rows), ko ? 'ko' : 'en'))
    .catch(e => { indexPromise = null; throw e; });
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const note = row => row.querySelector('[data-price-note]');
  async function search(input) {
    const row = input.closest('.hl-potion'), q = input.value.trim(), box = row.querySelector('[data-suggestions]');
    if (!q || disabled()) { box.hidden = true; return; }
    box.hidden = false; box.textContent = L('아이템 찾는 중…', 'Finding items…');
    try {
      const items = await load();
      if (!input.isConnected || input.value.trim() !== q || document.activeElement !== input) return;
      const ids = matchingIds(items, q)?.slice(0, 8) || [];
      const byId = new Map(items.map(i => [i.id, i]));
      box.innerHTML = ids.map(id => `<button type="button" data-supply="${id}" data-name="${esc(byId.get(id).name)}">${esc(byId.get(id).name)}</button>`).join('') || `<small>${L('검색 결과가 없어요. 이름과 가격을 직접 적으세요.', 'No matches. Enter the name and price directly.')}</small>`;
    } catch { box.textContent = L('검색을 불러오지 못했어요. 이름과 가격을 직접 적으세요.', 'Search unavailable. Enter the name and price directly.'); }
  }
  root.addEventListener('input', e => {
    const row = e.target.closest('.hl-potion'); if (!row) return;
    if (e.target.dataset.p === 'name') {
      if (row.dataset.item) { delete row.dataset.item; delete row.dataset.basis; row.querySelector('[data-p="price"]').value = ''; note(row).textContent = ''; }
      row.dataset.request = String(Number(row.dataset.request || 0) + 1);
      search(e.target);
    }
    if (e.target.dataset.p === 'price') { row.dataset.basis = 'manual'; row.dataset.request = String(Number(row.dataset.request || 0) + 1); note(row).textContent = L('직접 입력한 가격', 'Your price'); }
  });
  root.addEventListener('focusin', e => { if (e.target.dataset.p === 'name') search(e.target); });
  root.addEventListener('focusout', e => { const row = e.target.closest('.hl-potion'); if (row && !row.contains(e.relatedTarget)) row.querySelector('[data-suggestions]').hidden = true; });
  root.addEventListener('keydown', e => {
    const row = e.target.closest('.hl-potion'); if (!row) return;
    if (e.key === 'Escape') row.querySelector('[data-suggestions]').hidden = true;
    if (e.key === 'ArrowDown' && e.target.dataset.p === 'name') { const b = row.querySelector('[data-supply]'); if (b) { e.preventDefault(); b.focus(); } }
  });
  root.addEventListener('click', async e => {
    const button = e.target.closest('[data-supply]'); if (!button || disabled()) return;
    const row = button.closest('.hl-potion'), id = Number(button.dataset.supply), name = button.dataset.name;
    const request = String(Number(row.dataset.request || 0) + 1); row.dataset.request = request;
    row.dataset.item = String(id); row.dataset.basis = '';
    row.querySelector('[data-p="name"]').value = name;
    row.querySelector('[data-p="price"]').value = '';
    row.querySelector('[data-suggestions]').hidden = true;
    note(row).textContent = L('시세 불러오는 중…', 'Loading market price…');
    changed(); row.querySelector('[data-p="used"]').focus();
    try {
      let entry = prices.get(id);
      if (!entry || Date.now() - entry.at > 60000) {
        const response = await fetch(`${api}/prices?ids=${id}`, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw Error();
        entry = { quote: supplyQuote((await response.json())[id]), at: Date.now() }; prices.set(id, entry);
      }
      if (!row.isConnected || row.dataset.request !== request || disabled()) return;
      if (entry.quote) {
        row.querySelector('[data-p="price"]').value = entry.quote.price;
        row.dataset.basis = entry.quote.basis;
        note(row).textContent = L(entry.quote.basis === 'typical' ? '대표 시세 · 개당' : entry.quote.basis === 'mega' ? '확성기 판매가 중앙값 · 개당' : '최근 시세 중앙값 · 개당', entry.quote.basis === 'typical' ? 'Reference price · each' : entry.quote.basis === 'mega' ? 'Megaphone asking median · each' : 'Recent market median · each');
      } else note(row).textContent = L('시세가 없어요. 개당 가격을 적으세요.', 'No price available. Enter a unit price.');
      changed();
    } catch { if (row.isConnected && row.dataset.request === request) { note(row).textContent = L('시세를 불러오지 못했어요. 개당 가격을 적으세요.', 'Price unavailable. Enter a unit price.'); changed(); } }
  });
}
