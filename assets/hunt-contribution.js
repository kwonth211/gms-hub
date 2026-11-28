import { savedSettlement } from './hunt-ledger.js';
// Only numeric rates and catalog IDs leave the browser; wallet balances and free-text notes stay private.
export function contribution(row, client, lang) {
  if (!row || !row.route || !row.job || !Number.isInteger(row.level) || row.level < 1 || row.level > 200 ||
      !Number.isInteger(row.party) || row.party < 1 || row.party > 6 || !Number.isFinite(row.durationMs) ||
      row.durationMs < 600000 || row.durationMs > 36000000 || !Number.isFinite(row.gained) || row.gained <= 0) return null;
  const s = savedSettlement(row);
  return { client, run: `r${row.id}`, route: row.route, mob: row.mob?.id || null, level: row.level, job: row.job,
    party: row.party, minutes: Math.floor(row.durationMs / 60000), perHour: Math.round(row.gained * 3600000 / row.durationMs),
    netPerHour: s ? Math.round(s.perHour) : null, elapsed: true, lang };
}
