// One short word for a listed item's options, as players say it: "+3" for scrolled gear (scrolls passed), and for
// unscrolled gear its main stat against the base value: "정옵" (same), "▲ 2상" (2 above), "▼ 1하" (1 below), arrows in the up/down colours. The main stat
// is weapon attack (magic attack for wands and staves), else weapon defense, else magic defense. No word when the
// item has no options, or its base stats are unknown. The full stats stay in the hover card (item-tip.js).
const ko = document.documentElement.lang === 'ko';
let loading = null, tips = null;
export const loadTips = () => (loading ||= fetch(document.body.dataset.tips).then((r) => r.json()).then((d) => (tips = d)).catch(() => null));
export const tipsReady = () => tips;

const MAGIC_WEAPONS = new Set(['Wand', 'Staff']);
export function mainStat(sub, base) {
  if (base.PAD != null && !MAGIC_WEAPONS.has(sub)) return 'PAD';
  if (base.MAD != null) return 'MAD';
  if (base.PDD != null) return 'PDD';
  if (base.MDD != null) return 'MDD';
  return null;
}

// { text, cls, title, sort } or null. sort: higher = better, for ordering groups.
export function optBadge(itemId, o, data = tips) {
  if (!o) return null;
  if (o.ups > 0)
    return { text: `+${o.ups}`, cls: 'plus', title: ko ? `주문서 ${o.ups}번 성공` : `${o.ups} scrolls passed`, sort: 100 + o.ups };
  if (o.used > 0) return null;
  const t = data?.items?.[itemId];
  const base = t?.[7];
  if (!base || !Object.keys(base).length) return null;
  const key = mainStat(t[3], base);
  if (!key || o.stats?.[key] == null) return null;
  const d = o.stats[key] - base[key];
  const text = d > 0 ? (ko ? `▲ ${d}상` : `▲ +${d} roll`) : d < 0 ? (ko ? `▼ ${-d}하` : `▼ ${d} roll`) : ko ? '정옵' : 'Base roll';
  return { text, cls: d > 0 ? 'hi' : d < 0 ? 'lo' : 'mid', title: '', sort: d };
}
