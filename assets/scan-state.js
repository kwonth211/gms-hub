// Small, shared rules for the scanner's upload boundary. No DOM or network access.
// Character names are 4 to 13 letters or digits: 330k collected listings hold no shorter seller, while two-letter reads
// ("PA", "IE", "as") were a misread owner line that duplicated a whole shop under a fake seller (owner 2026-11-19).
export const SELLER = /^[A-Za-z0-9]{4,13}$/;
import { validRoom } from './place.js';
export const validLocation = (n) => Number.isInteger(n) && n >= 1 && n <= 40;
export const listingKey = (r) => `${r.shop.id}|${r.item?.id || r.name}|${r.price ?? '?'}|${r.qty}`;
export const payload = (r) => ({ item: r.item?.id, price: r.price, qty: r.qty, sold: r.sold, seller: r.owner, channel: r.channel, room: r.room });
export const fingerprint = (r) => JSON.stringify(payload(r));
export const validListing = (r) => !!r.item && Number.isInteger(r.price) && r.price >= 1 && r.price <= 1e10 &&
  Number.isInteger(r.qty) && r.qty >= 1 && r.qty <= 10000 && SELLER.test(r.owner) && validLocation(r.channel) && validRoom(r.room);
export const canUpload = (r) => validListing(r) && r.sure && !r.alternatives && (r.edited || r.confirmations >= 2);
export function verifiedPrice(bitmap, ocr, needsVerification) {
  if (!needsVerification) return bitmap || ocr;
  return ocr && (!bitmap || (bitmap.price === ocr.price && bitmap.qty === ocr.qty)) ? ocr : null;
}

// Identical merchandise alone is not a shop identity: neighbours often sell the same scrolls.
export function sameShop(shop, rows, channel, room) {
  const owner = rows[0]?.owner;
  return !!shop && shop.channel === channel && shop.room === room && SELLER.test(owner) && shop.votes.has(owner);
}
