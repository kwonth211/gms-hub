// Megaphone text helpers shared by the megaphone page and the header ticker: trade shorthand spelled out for the
// on-device translator, and a plain Korean reading when no translator is on this device.
export const koMesos = (n) => (n >= 1e8 ? `${+(n / 1e8).toFixed(2)}억` : n >= 1e4 ? `${+(n / 1e4).toFixed(n >= 1e6 ? 0 : 1)}만` : n.toLocaleString('ko'));

// Plain Korean for the usual trade shorthand (item names are swapped by the caller when it knows them).
export const GLOSS = [[/\b(s\s?>|wts|selling|sell)\b:?/gi, '[팝니다]'], [/\b(b\s?>|wtb|buying|buy)\b:?/gi, '[삽니다]'], [/\bc\/o\b/gi, '현재 제시가'], [/\bb\/o\b/gi, '즉구가'],
  [/\bobo\b/gi, '협상 가능'], [/\bea\b/gi, '개당'], [/\b(pm|w)\s?me\b/gi, '귓말 주세요'], [/\bpm\b/gi, '귓말'], [/\blf\b/gi, '구함'], [/\blfg\b/gi, '파티 구함'],
  [/\bnow\b/gi, '지금'], [/\bclean\b/gi, '노작'], [/\b(\d+)\s?slots?\b/gi, '$1업횟'], [/\batt\b/gi, '공격력'], [/\bmatt\b/gi, '마력'], [/\bacc\b/gi, '명중'],
  [/(\d+(?:\.\d+)?)\s?(k|m|b)\b/gi, (_, n, u) => koMesos(Math.round(Number(n) * { k: 1e3, m: 1e6, b: 1e9 }[u.toLowerCase()]))]];

export const SHORT = [[/(^|\s|\])\s*(s\s?>+|wts)\s*/gi, '$1Selling: '], [/(^|\s|\])\s*(b\s?>+|wtb)\s*/gi, '$1Buying: '], [/(^|\s)t\s?>\s*/gi, '$1Trading: '],
  [/\bc\s?\/\s?o\b/gi, 'current offer'], [/\ba\s?\/\s?w\b/gi, 'instant buy price'], [/\bb\s?\/\s?o\b/gi, 'buyout price'], [/\bobo\b/gi, 'or best offer'],
  [/\bpmo\b/gi, 'message me with offers'], [/\b(pm|w|dm|whisper) ?me\b/gi, 'message me'], [/\bpm\b/gi, 'message me'], [/\bea\b/gi, 'each'],
  [/\bfm\b/gi, 'Free Market'], [/\bcc\b/gi, 'change channel'], [/\blf\b/gi, 'looking for'], [/\bnx\b/gi, 'NX'], [/\bgfa\b/gi, 'Gloves Attack scroll'],
  [/\b(\d+(?:\.\d+)?)\s?(k|m|b|mil)\b/gi, (_, n, u) => `${n}${{ k: ' thousand', m: ' million', mil: ' million', b: ' billion' }[u.toLowerCase()]} mesos`]];
// The bracketed item at the front is never sent to the model (it mistranslates game names); the card shows it in this
// language's item name and translates only the rest. Shouting in capitals is lowered, which the model reads far better.
export const capsI = (t) => t.replace(/[A-Za-z]{3,}/g, (w) => (w.replace(/l/g, '').length >= 2 && w.replace(/l/g, '') === w.replace(/l/g, '').toUpperCase() ? w.replace(/l/g, 'I') : w));
export const plain = (text) => {
  let t = capsI(text).replace(/^\s*\[[^\]]*\]\s*/, '');
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length > 6 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.7) t = t.toLowerCase();
  for (const [re, to] of SHORT) t = t.replace(re, to);
  return t.replace(/\s+/g, ' ').trim();
};

// Selling or buying, and the first amount as the asking price (shared with the market's item panel).
const SELL = /(^|[^a-z])(s\s?>|wts|selling|sell(?:ing)?|s:)/i;
const BUY = /(^|[^a-z])(b\s?>|wtb|buying|buy(?:ing)?|b:)/i;
export function intentOf(text) {
  const s = SELL.exec(text), b = BUY.exec(text);
  if (s && (!b || s.index <= b.index)) return 'sell';
  return b ? 'buy' : '';
}
// "132K", "4m", "1.5b", "380k ea" → mesos. The first amount is the asking price.
export function priceOf(text) {
  // OCR often splits a decimal: "1 .9m" is 1.9m, not 9m.
  const m = /(?<![\d.])(\d+(?:[.,]\d+)?)\s?(k|m|mil|b)\b/i.exec(String(text).replace(/(\d)\s+([.,]\d)/g, '$1$2'));
  if (!m) return null;
  return Math.round(Number(m[1].replace(',', '.')) * { k: 1e3, m: 1e6, mil: 1e6, b: 1e9 }[m[2].toLowerCase()]);
}
