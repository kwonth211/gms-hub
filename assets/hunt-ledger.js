// Pure accounting for an EXP session. Amounts are whole mesos; blank required fields are not zero.
export const MIN_RANK_MS = 10 * 60000;
const LIMIT = 1_000_000_000_000;
export function amount(value, optional = false) {
  if (value === '' || value == null) return optional ? 0 : null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!text) return optional ? 0 : null;
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n >= 0 && n <= LIMIT ? n : null;
}

export function settleHunt(input, durationMs) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'wallet' };
  const start = amount(input.start), end = amount(input.end);
  if (start === null || end === null) return { ok: false, error: 'wallet' };
  const purchased = amount(input.purchased, true), otherIn = amount(input.otherIn, true), otherOut = amount(input.otherOut, true), soldAfter = amount(input.soldAfter, true);
  if ([purchased, otherIn, otherOut, soldAfter].includes(null)) return { ok: false, error: 'adjustment' };
  const potions = Array.isArray(input.potions) ? input.potions : [];
  if (input.noPotions !== true && (!potions.length || potions.length > 8)) return { ok: false, error: 'potions' };
  let supplyCost = 0;
  if (input.noPotions !== true) for (const p of potions) {
    const used = amount(p?.used), price = amount(p?.price);
    if (!String(p?.name || '').trim() || used === null || price === null) return { ok: false, error: 'potions' };
    supplyCost += used * price;
    if (!Number.isSafeInteger(supplyCost) || supplyCost > LIMIT) return { ok: false, error: 'potions' };
  }
  // Purchases reduce the wallet but are not all consumed this run. Add them back, then expense only supplies used.
  // Transfers / unrelated trades are removed. Sales after the ending wallet count are included exactly once.
  const earned = end - start + purchased - otherIn + otherOut + soldAfter;
  const net = earned - supplyCost;
  if (![earned, net].every(Number.isSafeInteger) || Math.abs(net) > LIMIT || Math.abs(earned) > LIMIT) return { ok: false, error: 'adjustment' };
  const timed = Number.isFinite(durationMs) && durationMs > 0;
  return { ok: true, earned, supplyCost, net, perHour: timed ? net * 3600000 / durationMs : null };
}

export function savedSettlement(row) {
  const s = row?.settlement;
  if (s?.version !== 1 || !Number.isFinite(row.durationMs) || row.durationMs <= 0 || s.sampleEnd !== row.at) return null;
  const result = settleHunt(s.input, row.durationMs);
  return result.ok ? result : null;
}

// Group only complete records in the selected class, level window and party size. Keep gear notes separate.
// Rates use total elapsed time (including breaks), so a short fast run cannot outweigh a long slow one.
export function rankHunts(rows, { job, level, party } = {}) {
  if (!job || !Number.isInteger(level) || level < 1 || level > 200) return [];
  const groups = new Map(), seen = new Set();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || seen.has(r.id) || r.job !== job || !Number.isInteger(r.level) || Math.abs(r.level - level) > 5 ||
      !Number.isInteger(r.party) || r.party < 1 || r.party > 6 || (party && r.party !== party) ||
      !Number.isFinite(r.durationMs) || r.durationMs < MIN_RANK_MS ||
      !Number.isFinite(r.gained) || r.gained <= 0) continue;
    const s = savedSettlement(r);
    const spot = String(r.spot || '').trim().slice(0, 60), gear = String(r.settlement?.input?.gear || '').trim().slice(0, 100);
    if (!s || !spot) continue;
    seen.add(r.id);
    const key = JSON.stringify([r.route || '', spot.normalize('NFKC').toLowerCase().replace(/\s+/g, ' '), r.party, gear]);
    const g = groups.get(key) || { spot, route: r.route || null, mob: r.mob || null, party: r.party, gear, n: 0, durationMs: 0, gained: 0, net: 0, minLevel: r.level, maxLevel: r.level, latest: 0 };
    g.n++; g.durationMs += r.durationMs; g.gained += r.gained; g.net += s.net;
    g.minLevel = Math.min(g.minLevel, r.level); g.maxLevel = Math.max(g.maxLevel, r.level);
    if (r.at >= g.latest) { g.latest = r.at; g.spot = spot; g.mob = r.mob || null; }
    groups.set(key, g);
  }
  return [...groups.values()].map(g => ({ ...g, expPerHour: g.gained * 3600000 / g.durationMs, netPerHour: g.net * 3600000 / g.durationMs }));
}
