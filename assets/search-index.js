// Shared, deterministic search: no network or AI is needed after the item index loads.
export const normalize = (value) => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, '');

// Korean scroll names keep the English stat word ("귀고리 STR 주문서", "상의 DEF 주문서"), so Korean stat words map to those exact tokens.
const synonyms = [
  ['공격력', 'attack'], ['공격', 'attack'], ['마법공격력', 'magicattack'], ['마력', 'magicattack'], ['고급', '상급'],
  ['명중률', 'accuracy'], ['명중', 'accuracy'], ['회피율', 'evasion'], ['회피', 'evasion'],
  ['방어력', 'def'], ['이동속도', 'speed'], ['이속', 'speed'], ['점프력', 'jump'],
  ['점프', 'jump'], ['힘', 'str'], ['민첩', 'dex'], ['덱스', 'dex'], ['지력', 'int'],
  ['인트', 'int'], ['행운', 'luk'], ['럭', 'luk'], ['체력', 'hp'], ['투구', '모자'],
  ['크리티컬데미지', 'critdamage'], ['크리데미지', 'critdamage'], ['크뎀', 'critdamage'], ['크리티컬', 'crit'],
  ['장공', '장갑attack'], ['장마', '장갑magicattack'],
].sort((a, b) => b[0].length - a[0].length);

// Players type scrolls as gear + stat in two or three syllables (귀힘, 창공, 폴공, 망럭, 신이속). A query made only of such a
// pair, optionally followed by the tier, expands to the full words; names are never rewritten this way, so 귀환 stays 귀환.
const GEAR = { 장: '장갑', 귀: '귀고리', 모: '모자', 투: '모자', 상: '상의', 하: '하의', 신: '신발', 망: '망토', 방: '방패', 전: '전신갑옷',
  창: '창', 폴: '폴암', 활: '활', 석: '석궁', 아: '클로', 클: '클로', 단: '단검', 완: '완드', 스: '스태프', 한검: '한손검', 양검: '양손검',
  두검: '양손검', 한도: '한손도끼', 양도: '양손도끼', 두도: '양손도끼', 한둔: '한손둔기', 양둔: '양손둔기', 두둔: '양손둔기', 펫: '펫장비' };
const STAT = { 공: 'attack', 마: 'magicattack', 힘: 'str', 민: 'dex', 덱: 'dex', 지: 'int', 인: 'int', 럭: 'luk', 행: 'luk', 명: 'accuracy',
  회: 'evasion', 이속: 'speed', 이: 'speed', 점: 'jump', 방: 'def', 체: 'hp', 엠: 'mp', 크뎀: 'critdamage', 크: 'crit' };
const gearKeys = Object.keys(GEAR).sort((a, b) => b.length - a.length).join('|');
const statKeys = Object.keys(STAT).sort((a, b) => b.length - a.length).join('|');
const pairPattern = new RegExp(`^(${gearKeys})(${statKeys})(하급|중급|고급|상급|카오스|10|60|100)?$`);
function expandPair(query) {
  const m = normalize(query).match(pairPattern);
  return m ? `${GEAR[m[1]]}${STAT[m[2]]}${m[3] ? ` ${m[3]}` : ''}` : null;
}
const aliasPattern = new RegExp(synonyms.map(([key]) => key).join('|'), 'g');
const aliasMap = new Map(synonyms);
const canonical = (s) => normalize(s).replace(aliasPattern, (key) => aliasMap.get(key));
const initials = (s) => [...s].map((ch) => {
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 ? String.fromCharCode(0x1100 + Math.floor(code / 588)) : ch;
}).join('');

// Cash items have English names only, even in the Korean client, so Korean descriptive words also try their English
// counterparts ("토끼 모자" finds Bunny Hat). These rank below any name match but above a word that only appears in a description.
const KO_EN = { 토끼: ['bunny', 'rabbit'], 고양이: ['cat'], 강아지: ['puppy', 'dog'], 곰: ['bear'], 악마: ['devil'], 천사: ['angel'],
  잠옷: ['pajama'], 날개: ['wing'], 왕관: ['crown'], 하트: ['heart'], 안경: ['glasses'], 고블린: ['goblin'], 펭귄: ['penguin'],
  판다: ['panda'], 여우: ['fox'], 늑대: ['wolf'], 공룡: ['dino'], 마녀: ['witch'], 해적: ['pirate'], 산타: ['santa'], 눈사람: ['snowman'],
  우산: ['umbrella'], 풍선: ['balloon'], 의자: ['chair'], 반지: ['ring'], 귀: ['ears'], 모자: ['hat'], 망토: ['cape'], 신발: ['shoes'],
  가방: ['bag'], 날개옷: ['wing'], 검은: ['black'], 검정: ['black'], 하얀: ['white'], 흰: ['white'], 빨간: ['red'], 파란: ['blue'],
  분홍: ['pink'], 노란: ['yellow'], 초록: ['green'], 보라: ['purple'], 쿠폰: ['coupon'], 시그니처: ['signature'], 펫: ['pet'] };

export function indexEntry(entry) {
  const names = (entry.names || [entry.title]).filter(Boolean);
  const keywords = String(entry.keywords || '');
  return {
    ...entry,
    searchNames: names.map(normalize),
    wordNames: names.map((name) => ` ${String(name).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, ' ')}`),
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
  const expanded = expandPair(query) || query;
  const alias = canonical(expanded);
  const aliasWords = String(expanded).trim().split(/\s+/u).map(canonical).filter(Boolean);
  const initialQuery = /^[\u1100-\u1112]+$/.test(flat);
  const latin = /^[a-z0-9]+$/.test(flat);
  // Every word with an English counterpart, swapped in turn, gives the query a set of English variants.
  const typed = String(query).trim().split(/\s+/u);
  let variants = typed.some((word) => KO_EN[word]) ? [typed] : [];
  typed.forEach((word, i) => {
    if (KO_EN[word]) variants = variants.flatMap((v) => KO_EN[word].map((w) => v.map((x, j) => (j === i ? w : x))));
  });
  variants = variants.map((v) => v.map(normalize).filter(Boolean));
  return entries.map((entry, order) => {
    const { searchNames: names, searchText: text, aliasNames, aliasText } = entry;
    let score = 0;
    if (names.includes(flat)) score = 120;
    else if (names.some((name) => name.startsWith(flat))) score = 100;
    // A short Latin query inside another word ("mp" in Stump, "ore" in Sporewood) is a weak hit, not a name match.
    else if (names.some((name) => name.includes(flat))) score = latin && !entry.wordNames.some((name) => name.includes(` ${words[0]}`)) ? 45 : 85;
    else if (names.some((name) => words.every((word) => name.includes(word)))) score = 75;
    else if (aliasNames.some((name) => name.includes(alias))) score = 70;
    else if (aliasNames.some((name) => aliasWords.every((word) => name.includes(word)))) score = 65;
    else if (initialQuery && entry.initials.some((name) => name.includes(flat))) score = 60;
    else if (text.includes(flat) || words.every((word) => text.includes(word))) score = 40;
    else if (aliasText.includes(alias) || aliasWords.every((word) => aliasText.includes(word))) score = 30;
    if (score < 42 && variants.some((v) => names.some((name) => v.every((word) => name.includes(word))))) score = 42;
    return { entry, score, order };
  }).filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ entry, score }) => ({ ...entry, score }));
}
