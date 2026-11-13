// Korean names for item sub-categories in the Excel workbooks (scripts/workbooks.mjs, assets/xlsx-live.js). Scrolls are
// filed under the gear they go on ("Use" + "Gloves"), so those read "장갑 주문서".
const GEAR = { 'One-Handed Sword': '한손검', 'Two-Handed Sword': '두손검', 'One-Handed Axe': '한손도끼', 'Two-Handed Axe': '두손도끼', 'One-Handed Blunt Weapon': '한손둔기',
  'Two-Handed Blunt': '두손둔기', Spear: '창', 'Pole Arm': '폴암', Wand: '완드', Staff: '스태프', Bow: '활', Crossbow: '석궁', Claw: '아대', Dagger: '단검', Hat: '모자', Helmet: '모자',
  Top: '상의', Topwear: '상의', Overall: '한벌옷', Bottom: '하의', Bottomwear: '하의', Shoes: '신발', Glove: '장갑', Gloves: '장갑', Shield: '방패', Cape: '망토', Earrings: '귀고리',
  'Face Accessory': '얼굴장식', 'Eye Decoration': '눈장식', Ring: '반지', 'Pet Equipment': '펫 장비', Pet: '펫', Cash: '캐시' };
const OTHER = { Potion: '물약', 'Food and Drink': '음식', Thrown: '표창·화살', 'Teleport Item': '이동 아이템', 'Summoning Sack': '소환의 돌', Transformation: '변신',
  Other: '기타', 'Monster Drop': '몬스터 전리품', 'Mineral Ore': '광석', 'Rare Ore': '보석 원석', Gem: '보석', Decoration: '장식', Chair: '의자', Furniture: '가구', 'Event Item': '이벤트' };
export function subLabel(cat, sub, lang) {
  if (!sub || lang !== 'ko') return sub || '';
  if (cat === 'Use' && GEAR[sub] && !['Pet'].includes(sub)) return `${GEAR[sub]} 주문서`;
  return GEAR[sub] || OTHER[sub] || sub;
}

// Search keywords for a piece of gear: its type in Korean and English ("아대 Claw"), so a type search finds gear whose
// names do not say it (가니어, Steel Titans). Scrolls already carry the gear word in their names.
export const gearKeywords = (cat, sub) => (cat === 'Equip' && sub ? `${subLabel(cat, sub, 'ko')} ${sub}` : '');
export const gearTypes = (cat, sub) => (cat === 'Equip' && sub ? [subLabel(cat, sub, 'ko'), sub] : []);
