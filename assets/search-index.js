// Shared, deterministic search: no network or AI is needed after the item index loads.
// A trailing bare jamo is a syllable still being typed ("망ㅌ"); it is dropped so the finished part still matches.
// Initials-only queries ("ㅈㄱ") are kept whole.
const typing = (s) => (/[\uac00-\ud7a3]/.test(s) ? s.replace(/[\u3131-\u318e\u1100-\u11ff]+$/u, '') : s);
export const normalize = (value) => typing(String(value ?? '').trim()).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, '');

// Korean scroll names keep the English stat word ("귀고리 STR 주문서", "상의 DEF 주문서"), so Korean stat words map to those exact tokens.
const synonyms = [
  ['공격력', 'attack'], ['공격', 'attack'], ['마법공격력', 'magicattack'], ['마력', 'magicattack'], ['고급', '상급'],
  ['명중률', 'accuracy'], ['명중', 'accuracy'], ['회피율', 'evasion'], ['회피', 'evasion'],
  ['방어력', 'def'], ['이동속도', 'speed'], ['이속', 'speed'], ['점프력', 'jump'],
  ['점프', 'jump'], ['힘', 'str'], ['민첩', 'dex'], ['덱스', 'dex'], ['지력', 'int'],
  ['인트', 'int'], ['행운', 'luk'], ['럭', 'luk'], ['체력', 'hp'], ['투구', '모자'],
  ['크리티컬데미지', 'critdamage'], ['크리데미지', 'critdamage'], ['크뎀', 'critdamage'], ['크리티컬', 'crit'],
  ['장공', '장갑attack'], ['장마', '장갑magicattack'], ['마공', 'magicattack'], ['귀작', '귀고리'], ['카오스', '혼돈'],
  // Everyday names players type for gear types and common misspellings seen in failed market searches.
  ['아대', '클로'], ['공격려', 'attack'], ['방어려', 'def'], ['글로브', '장갑'], ['글러브', '장갑'], ['귀걸이', '귀고리'], ['귀골', '귀고리'], ['전갑', '전신갑옷'], ['전신갑옷', '전신갑옷'], ['너크', '너클'],
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

// A syllable still being typed often shows the next syllable's first consonant as its final ("귁" on the way to 귀고리,
// "갑오" to 갑옷, "됒" to 돼지). Comparing letter by letter (jamo) lets those half-typed words still find the item.
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅗㅏ', 'ㅗㅐ', 'ㅗㅣ', 'ㅛ', 'ㅜ', 'ㅜㅓ', 'ㅜㅔ', 'ㅜㅣ', 'ㅠ', 'ㅡ', 'ㅡㅣ', 'ㅣ'];
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const COMPAT = { ㅘ: 'ㅗㅏ', ㅙ: 'ㅗㅐ', ㅚ: 'ㅗㅣ', ㅝ: 'ㅜㅓ', ㅞ: 'ㅜㅔ', ㅟ: 'ㅜㅣ', ㅢ: 'ㅡㅣ', ㄳ: 'ㄱㅅ', ㄵ: 'ㄴㅈ', ㄶ: 'ㄴㅎ', ㄺ: 'ㄹㄱ', ㄻ: 'ㄹㅁ', ㄼ: 'ㄹㅂ', ㄽ: 'ㄹㅅ', ㄾ: 'ㄹㅌ', ㄿ: 'ㄹㅍ', ㅀ: 'ㄹㅎ', ㅄ: 'ㅂㅅ' };
export const jamo = (s) => [...String(s)].map((ch) => {
  const c = ch.charCodeAt(0) - 0xac00;
  if (c < 0 || c > 11171) return COMPAT[ch] || ch;
  return CHO[Math.floor(c / 588)] + JUNG[Math.floor((c % 588) / 28)] + JONG[c % 28];
}).join('');
// Korean typed with the keyboard still in English mode ("rnlrhf" for 귀골, "dkeo" for 아대): map the keys back to letters.
const KEY = { q: 'ㅂ', w: 'ㅈ', e: 'ㄷ', r: 'ㄱ', t: 'ㅅ', y: 'ㅛ', u: 'ㅕ', i: 'ㅑ', o: 'ㅐ', p: 'ㅔ', a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ',
  h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ', z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ', b: 'ㅠ', n: 'ㅜ', m: 'ㅡ', Q: 'ㅃ', W: 'ㅉ', E: 'ㄸ', R: 'ㄲ', T: 'ㅆ', O: 'ㅒ', P: 'ㅖ' };
export const keysToJamo = (s) => (/^[a-zA-Z\s]+$/.test(s) ? [...s].map((ch) => KEY[ch] || KEY[ch.toLowerCase()] || ch).join('') : null);
const jamoWords = (s) => String(s).trim().split(/\s+/u).map((w) => jamo(normalize(w) || w).replace(/[^ㄱ-ㆎ\p{L}\p{N}]/gu, '')).filter(Boolean);

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
    jamoNames: names.map((name) => jamo(normalize(name))),
    // Gear type words ("아대", "claw") from entry.types: a search for just the type ranks that gear with name matches.
    typeNames: (entry.types || []).filter(Boolean).flatMap((t) => [normalize(t), canonical(t)]),
  };
}

function searchCore(entries, query) {
  const flat = normalize(query);
  if (!flat) return [];
  const words = String(query).trim().split(/\s+/u).map(normalize).filter(Boolean);
  const expanded = expandPair(query) || query;
  const alias = canonical(expanded);
  const aliasWords = String(expanded).trim().split(/\s+/u).map(canonical).filter(Boolean);
  const initialQuery = /^[\u1100-\u1112]+$/.test(flat);
  const latin = /^[a-z0-9]+$/.test(flat);
  // Letter-level matching only for Korean with at least two letters per word, so one stray consonant matches nothing.
  const hangulish = /[\u3131-\u318e\uac00-\ud7a3]/.test(query);
  const jamoQuery = hangulish ? jamoWords(query) : [];
  if (jamoQuery.some((w) => [...w].length < 3)) jamoQuery.length = 0;
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
    else if (hangulish && jamoQuery.length && entry.jamoNames.some((name) => jamoQuery.every((w) => name.includes(w)))) score = 38;
    else if (aliasText.includes(alias) || aliasWords.every((word) => aliasText.includes(word))) score = 30;
    if (score < 80 && entry.typeNames.length && (entry.typeNames.includes(flat) || entry.typeNames.includes(alias))) score = 80;
    if (score < 42 && variants.some((v) => names.some((name) => v.every((word) => name.includes(word))))) score = 42;
    return { entry, score, order };
  }).filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ entry, score }) => ({ ...entry, score }));
}

// English players type gear shorthand ("glove att 60", "zhelm", "gfa", "helm str"). Latin queries are also tried with those
// words spelled out; tier percents map to the Classic tiers (100% Lesser, 60% Intermediate, 10% Greater). Results of both
// spellings are merged, keeping the best score per entry, so a literal name match is never lost.
const EN_WHOLE = { zhelm: 'zakum helmet', zhelmet: 'zakum helmet', zakhelm: 'zakum helmet', steelies: 'steely', steelys: 'steely',
  ilbis: 'ilbi', gfa: 'gloves attack', gfatt: 'gloves attack', gma: 'gloves magic attack', gfma: 'gloves magic attack',
  pelix: 'power elixir', pelixir: 'power elixir', elix: 'elixir', melix: 'mana elixir' };
const EN_WORD = { glove: 'gloves', earrings: 'earring', ear: 'earring', ears: 'earring', helm: 'hat', top: 'topwear',
  bottom: 'bottomwear', bot: 'bottomwear', pants: 'bottomwear', shoe: 'shoes', boots: 'shoes', ova: 'overall', att: 'attack',
  atk: 'attack', attk: 'attack', wa: 'attack', matt: 'magic attack', matk: 'magic attack', acc: 'accuracy', avoid: 'evasion',
  avoidability: 'evasion', eva: 'evasion', spd: 'speed', jmp: 'jump', zak: 'zakum', '1h': 'one-handed', '2h': 'two-handed',
  luck: 'luk', luc: 'luk', earing: 'earring', '100': 'lesser', '60': 'intermediate', '10': 'greater', ...EN_WHOLE };
export function englishQuery(query) {
  const raw = String(query).trim().toLowerCase();
  if (!raw || !/^[a-z0-9%.\s-]+$/.test(raw)) return null;
  const words = raw.replace(/%/g, '').replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2').split(/\s+/).filter(Boolean);
  const out = words.map((w) => EN_WORD[w] || w).join(' ');
  return out === raw ? null : out;
}


// Builds syllables from a row of letters the way a Korean keyboard does (ㄱㅟㄱㅗㄹ → 귀골).
const CHO_I = Object.fromEntries([...CHO].map((c, i) => [c, i]));
const JUNG_I = Object.fromEntries(['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'].map((c, i) => [c, i]));
const JONG_I = Object.fromEntries(['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'].map((c, i) => [c, i]));
const VV = { ㅗㅏ: 'ㅘ', ㅗㅐ: 'ㅙ', ㅗㅣ: 'ㅚ', ㅜㅓ: 'ㅝ', ㅜㅔ: 'ㅞ', ㅜㅣ: 'ㅟ', ㅡㅣ: 'ㅢ' };
const CC = { ㄱㅅ: 'ㄳ', ㄴㅈ: 'ㄵ', ㄴㅎ: 'ㄶ', ㄹㄱ: 'ㄺ', ㄹㅁ: 'ㄻ', ㄹㅂ: 'ㄼ', ㄹㅅ: 'ㄽ', ㄹㅌ: 'ㄾ', ㄹㅍ: 'ㄿ', ㄹㅎ: 'ㅀ', ㅂㅅ: 'ㅄ' };
const isV = (c) => c in JUNG_I;
export function compose(letters) {
  const a = [...letters];
  let out = '';
  for (let i = 0; i < a.length;) {
    const c = a[i];
    if (!(c in CHO_I) || !isV(a[i + 1] || '')) { out += c; i += 1; continue; }
    let v = a[i + 1]; i += 2;
    if (VV[v + a[i]]) { v = VV[v + a[i]]; i += 1; }
    let t = '';
    if (a[i] in JONG_I && a[i] && !isV(a[i + 1] || '')) {
      t = a[i]; i += 1;
      if (CC[t + a[i]] && !isV(a[i + 1] || '')) { t = CC[t + a[i]]; i += 1; }
    }
    out += String.fromCharCode(0xac00 + (CHO_I[c] * 21 + JUNG_I[v]) * 28 + JONG_I[t]);
  }
  return out;
}

export function searchEntries(entries, query) {
  const base = searchCore(entries, query);
  // Nothing found for Latin letters: maybe Korean typed in English keyboard mode. Rebuild the syllables and try that.
  if (!base.length) {
    const keyed = keysToJamo(String(query).trim());
    const ko = keyed && compose(keyed);
    if (ko && /^[\uac00-\ud7a3\s]+$/.test(ko)) {
      const hits = searchCore(entries, ko);
      if (hits.length) return hits;
    }
  }
  const en = englishQuery(query);
  if (!en) return base;
  const best = new Map();
  for (const hit of [...base, ...searchCore(entries, en)]) {
    const key = `${hit.type}|${hit.id}`;
    if (!best.has(key) || best.get(key).score < hit.score) best.set(key, hit);
  }
  // Among equal scores, names holding the typed words as whole words come first ("ear int 60": INT before "intermediate").
  const words = en.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()).filter(Boolean);
  const whole = (hit) => words.filter((w) => hit.wordNames?.some((n) => `${n} `.includes(` ${w} `))).length;
  const order = new Map(entries.map((e, i) => [`${e.type}|${e.id}`, i]));
  return [...best.values()].map((hit) => ({ hit, w: whole(hit) }))
    .sort((a, b) => b.hit.score - a.hit.score || b.w - a.w || order.get(`${a.hit.type}|${a.hit.id}`) - order.get(`${b.hit.type}|${b.hit.id}`))
    .map(({ hit }) => hit);
}
