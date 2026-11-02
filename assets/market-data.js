export const DAY = 86400000;
export const parseUtc = (s) => Date.parse(/[zZ]$|[+-]\d\d:\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`);
export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

// Asking prices and observed sales have different distributions; do not trim one against the other.
export function marketRows(listings, now = Date.now()) {
  const raw = listings.map((r) => ({ ...r, sold: !!r.sold, t: parseUtc(r.seen) }))
    .filter((r) => Number.isInteger(r.price) && r.price > 0 && r.t > now - 7 * DAY && r.t <= now);
  const rows = [false, true].flatMap((sold) => {
    const group = raw.filter((r) => r.sold === sold);
    const mid = median(group.map((r) => r.price));
    return group.length >= 3 ? group.filter((r) => r.price >= mid / 5 && r.price <= mid * 5) : group;
  });
  const open = rows.filter((r) => !r.sold && r.t > now - DAY).sort((a, b) => a.price - b.price || b.t - a.t);
  const sold = rows.filter((r) => r.sold).sort((a, b) => b.t - a.t);
  const stale = rows.filter((r) => !r.sold && r.t <= now - DAY).sort((a, b) => b.t - a.t);
  return { rows, open, sold, stale, excluded: raw.length - rows.length,
    askingMedian: median(open.map((r) => r.price)), soldMedian: median(sold.filter((r) => r.t > now - DAY).map((r) => r.price)) };
}
