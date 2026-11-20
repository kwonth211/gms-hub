// GA4's item dimensions and itemsClickedInList metric work without custom definitions.
// One unit represents one intentional click, never the listing's stack quantity.
export function bindListingClicks(root, { selector, rowSelector, idKey, name, list }, send = (...args) => window.track?.(...args)) {
  if (!root) return;
  const clicked = e => {
    if (e.type === 'auxclick' && e.button !== 1) return;
    if (e.type === 'click' && e.button > 0) return;
    const control = e.target.closest('a,button,input,select,label,summary');
    const a = control ? control.matches(selector) ? control : null
      : rowSelector && e.type === 'click' && !e.ctrlKey && !e.metaKey && !e.shiftKey ? e.target.closest(rowSelector)?.querySelector(selector) : null;
    if (!a || !root.contains(a)) return;
    const id = a.dataset[idKey];
    if (!/^\d+$/.test(id || '')) return;
    const row = a.closest('[data-price-band]');
    const band = row?.dataset.priceBand || 'unrated';
    const itemList = row?.dataset.itemList || list;
    send('select_item', { item_list_id: itemList, item_list_name: itemList,
      price_band: band, items: [{ item_id: String(id), item_name: String(name(id)).slice(0, 100),
        item_category: band, item_list_id: itemList, item_list_name: itemList, quantity: 1 }] });
  };
  root.addEventListener('click', clicked, { capture: true, passive: true });
  root.addEventListener('auxclick', clicked, { capture: true, passive: true });
}
