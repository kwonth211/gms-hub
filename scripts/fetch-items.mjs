// Refreshes data/items.json: every tradeable (non-cash) MapleStory Classic World item with its official Korean and English
// names, read from the Classic World client data that maplestory.io serves. Item ids differ from old GMS versions, so only
// the MCW region is used. Run by hand after a game patch: node scripts/fetch-items.mjs
import { writeFileSync } from 'node:fs';

const VERSION = process.argv[2] || '1';
const res = await fetch(`https://maplestory.io/api/MCW/${VERSION}/item?count=50000`);
if (!res.ok) throw new Error(`maplestory.io ${res.status}`);
const raw = await res.json();

// Character looks, quest items and cash-category entries never reach the Free Market.
const SKIP_SUB = new Set(['Hair', 'Face', 'Head', 'Quest Item']);
const items = raw
  .filter((x) => !x.isCash && x.names?.en && x.typeInfo.overallCategory !== 'Cash' && !SKIP_SUB.has(x.typeInfo.subCategory))
  .map((x) => {
    const translated = !(x.untranslated || []).includes('ko') && x.names.ko;
    return {
      id: x.id,
      en: x.names.en,
      ...(translated ? { ko: x.names.ko } : {}),
      cat: x.typeInfo.overallCategory,
      sub: x.typeInfo.subCategory,
      ...(x.requiredLevel ? { lv: x.requiredLevel } : {})
    };
  })
  .sort((a, b) => a.id - b.id);

writeFileSync(
  new URL('../data/items.json', import.meta.url),
  JSON.stringify({ updated: new Date().toISOString().slice(0, 10), source: `https://maplestory.io/api/MCW/${VERSION}/item`, items }) + '\n'
);
console.log(`${items.length} items, ${items.filter((i) => i.ko).length} with Korean names`);
