// Shared, deterministic search: no network or AI is needed after the item index loads.
export const normalize = (value) => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, '');

const synonyms = [
  ['공격력', 'attack'], ['마법공격력', 'magicattack'], ['마력', 'magicattack'],
  ['명중률', 'accuracy'], ['명중', 'accuracy'], ['회피율', 'avoid'], ['회피', 'avoid'],
  ['방어력', 'defense'], ['이동속도', 'speed'], ['이속', 'speed'], ['점프력', 'jump'],
  ['점프', 'jump'], ['힘', 'str'], ['민첩', 'dex'], ['덱스', 'dex'], ['지력', 'int'],
  ['인트', 'int'], ['행운', 'luk'], ['럭', 'luk'], ['체력', 'hp'], ['투구', '모자'],
  ['장공', '장갑attack'], ['장마', '장갑magicattack'],
].sort((a, b) => b[0].length - a[0].length);
const aliasPattern = new RegExp(synonyms.map(([key]) => key).join('|'), 'g');
const aliasMap = new Map(synonyms);
const canonical = (s) => normalize(s).replace(aliasPattern, (key) => aliasMap.get(key));
const initials = (s) => [...s].map((ch) => {
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 ? String.fromCharCode(0x1100 + Math.floor(code / 588)) : ch;
}).join('');

export function indexEntry(entry) {
  const names = (entry.names || [entry.title]).filter(Boolean);
  const keywords = String(entry.keywords || '');
  return {
    ...entry,
    searchNames: names.map(normalize),
    searchText: normalize(`${names.join(' ')} ${keywords}`),
    aliasNames: names.map(canonical),
    aliasText: canonical(`${names.join(' ')} ${keywords}`),
    initials: names.map((name) => normalize(initials(name))),
  };
}

export function searchEntries(entries, query) {
  const flat = normalize(query);
  if (!flat) return [];
  const words = String(query).trim().split(/\s+/u).map(normalize).filter(Boolean);
  const alias = canonical(query);
  const aliasWords = String(query).trim().split(/\s+/u).map(canonical).filter(Boolean);
  const initialQuery = /^[\u1100-\u1112]+$/.test(flat);
  return entries.map((entry, order) => {
    const { searchNames: names, searchText: text, aliasNames, aliasText } = entry;
    let score = 0;
    if (names.includes(flat)) score = 120;
    else if (names.some((name) => name.startsWith(flat))) score = 100;
    else if (names.some((name) => name.includes(flat))) score = 85;
    else if (names.some((name) => words.every((word) => name.includes(word)))) score = 75;
    else if (aliasNames.some((name) => name.includes(alias))) score = 70;
    else if (aliasNames.some((name) => aliasWords.every((word) => name.includes(word)))) score = 65;
    else if (initialQuery && entry.initials.some((name) => name.includes(flat))) score = 60;
    else if (text.includes(flat) || words.every((word) => text.includes(word))) score = 40;
    else if (aliasText.includes(alias) || aliasWords.every((word) => aliasText.includes(word))) score = 30;
    return { entry, score, order };
  }).filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ entry }) => entry);
}
