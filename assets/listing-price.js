import { DAY, parseUtc } from './market-data.js';

// The catalog summarizes 24h asking prices (not completed trades). Never mix gear rolls.
export function listingPriceBand(row, catalog, now = Date.now()) {
  const at = Date.parse(catalog?.asOf), seen = parseUtc(row.seen);
  if (!Number.isFinite(at) || now - at > 25 * 60000 || at > now + 60000 ||
      !Number.isFinite(seen) || seen > now || now - seen > DAY ||
      row.sold || row.goneN || row.opts || row.item < 2000000 ||
      !Number.isFinite(row.price) || row.price <= 0) return 'unrated';
  const ref = catalog.items?.find(r => r.item === row.item);
  if (!ref || ref.open < 5 || ref.shops < 2 || !Number.isFinite(ref.median) || ref.median <= 0) return 'unrated';
  return row.price <= ref.median * .9 ? 'cheap' : row.price >= ref.median * 1.1 ? 'expensive' : 'typical';
}

export function priceBadge(band, ko = true) {
  if (!['cheap', 'expensive'].includes(band)) return '';
  const cheap = band === 'cheap';
  const label = ko ? cheap ? '싼 매물' : '비싼 매물' : cheap ? 'Low price' : 'High price';
  const hint = ko ? '같은 아이템의 24시간 판매가 중앙값보다 10% 이상 ' + (cheap ? '낮아요' : '높아요') + ' · 5건·2상점 이상 · 체결가 아님'
    : 'At least 10% ' + (cheap ? 'below' : 'above') + ' the same item’s 24h asking median · 5+ listings, 2+ shops · not sale prices';
  return `<span class="mb-deal listing-price-badge ${cheap ? 'cheap' : 'pricey'}" title="${hint}">${label}</span>`;
}
