// Equipment options ("상옵/하옵", scrolled stats) for one listing or megaphone. Another machine reads them (tooltip or
// megaphone text) and sends them with the row as `opts`; this file is the single gate: unknown keys and odd numbers are
// dropped, and a row with bad options is still stored, just without them. Stored as compact JSON text.
//
// opts = {
//   stats: { PAD: 9, LUK: 2, ... }  // the item's stat values as shown in game (base roll + scrolls), integers
//   slots: 5,                       // upgrades still available
//   used: 2,                        // upgrades already used (passes and fails)
//   ups: 1,                         // upgrades that passed: the '(+1)' after the item name in game
//   clean: true,                    // never scrolled
// }
// Stat names are the game data's (also used by data/item-details.json and the scroll forge).
export const OPTION_STATS = ['PAD', 'MAD', 'STR', 'DEX', 'INT', 'LUK', 'ACC', 'EVA', 'MHP', 'MMP', 'PDD', 'MDD', 'Speed', 'Jump', 'CRT', 'CRD'];
const MAX = { MHP: 5000, MMP: 5000, PDD: 999, MDD: 999 };

const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);

// Returns the cleaned options as JSON text, or null when nothing usable is left.
export function normalizeOptions(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  if (raw.stats && typeof raw.stats === 'object' && !Array.isArray(raw.stats)) {
    const stats = {};
    for (const k of OPTION_STATS) {
      const v = int(raw.stats[k], -99, MAX[k] ?? 255);
      if (v !== null && v !== 0) stats[k] = v;
    }
    if (Object.keys(stats).length) out.stats = stats;
  }
  const slots = int(raw.slots, 0, 20), used = int(raw.used, 0, 20);
  if (slots !== null) out.slots = slots;
  if (used !== null) out.used = used;
  // Passed upgrades cannot outnumber used ones; a count that does was misread, so it is dropped.
  const ups = int(raw.ups, 0, 20);
  if (ups !== null && (used === null || ups <= used)) out.ups = ups;
  if (raw.clean === true || raw.clean === false) out.clean = raw.clean;
  // "Clean" with upgrades used contradicts itself; keep the numbers, drop the claim.
  if (out.clean === true && (out.used > 0 || out.ups > 0)) delete out.clean;
  if (['very fast', 'fast', 'average', 'normal', 'slow', 'very slow'].includes(raw.attackSpeed)) out.attackSpeed = raw.attackSpeed;
  const knockback = int(raw.knockback, 0, 100);
  if (knockback !== null) out.knockback = knockback;
  // Scroll descriptions carry gains, not the total stats of an equipment piece.
  if (raw.scroll && typeof raw.scroll === 'object' && !Array.isArray(raw.scroll) && [10, 60, 100].includes(raw.scroll.chance)) {
    const stats = {};
    for (const k of OPTION_STATS) {
      const v = int(raw.scroll.stats?.[k], 1, MAX[k] ?? 255);
      if (v !== null) stats[k] = v;
    }
    if (Object.keys(stats).length) out.scroll = { chance: raw.scroll.chance, stats };
  }
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

export const parseOptions = (text) => {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
};
