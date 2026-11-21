// Common rule (owner 2026-11-22): wherever a page shows a piece of equipment with known options (a shop listing, a
// megaphone, the home gear set…), its element carries those options, so the hover card (item-tip.js) shows that piece's
// own stats, never the catalogue's base ones. Every page builds the attributes here instead of writing them by hand.
//   itemAttrs(id, opts, source) -> ' data-item-id="…" data-option-source="…" data-opts="{…}"'
// opts: { stats: {PAD: 6, …}, slots, ups } (the shop reader's shape); source: 'listing' | 'megaphone' | 'set' | ….
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function itemAttrs(id, opts, source) {
  if (!Number.isInteger(id) || id <= 0) return '';
  return ` data-item-id="${id}"${source ? ` data-option-source="${esc(source)}"` : ''}${opts ? ` data-opts="${esc(JSON.stringify(opts))}"` : ''}`;
}
