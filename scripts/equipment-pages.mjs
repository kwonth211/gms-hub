// Equipment finder: every piece of gear you can actually get in Classic World (a monster drops it, a quest gives it or
// players sell it), by class, slot and level. Stats and requirements are client data; sources are drop reports and quests.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const EQ_CLASSES = [
  { slug: 'warrior', bit: 1, ko: '전사', en: 'Warrior' },
  { slug: 'magician', bit: 2, ko: '마법사', en: 'Magician' },
  { slug: 'bowman', bit: 4, ko: '궁수', en: 'Bowman' },
  { slug: 'thief', bit: 8, ko: '도적', en: 'Thief' }
];
export const equipPath = (c) => (c ? `/equipment/${c.slug}/` : '/equipment/');

const WEAPONS = ['One-Handed Sword', 'Two-Handed Sword', 'One-Handed Axe', 'Two-Handed Axe', 'One-Handed Blunt Weapon', 'Two-Handed Blunt',
  'Spear', 'Pole Arm', 'Wand', 'Staff', 'Bow', 'Crossbow', 'Claw', 'Dagger'];
const ARMOR = ['Hat', 'Top', 'Overall', 'Bottom', 'Shoes', 'Glove', 'Shield', 'Cape', 'Earrings', 'Face Accessory', 'Eye Decoration', 'Ring'];
const SUB_KO = {
  'One-Handed Sword': '한손검', 'Two-Handed Sword': '두손검', 'One-Handed Axe': '한손도끼', 'Two-Handed Axe': '두손도끼',
  'One-Handed Blunt Weapon': '한손둔기', 'Two-Handed Blunt': '두손둔기', Spear: '창', 'Pole Arm': '폴암', Wand: '완드', Staff: '스태프',
  Bow: '활', Crossbow: '석궁', Claw: '아대', Dagger: '단검', Hat: '모자', Top: '상의', Overall: '한벌옷', Bottom: '하의', Shoes: '신발',
  Glove: '장갑', Shield: '방패', Cape: '망토', Earrings: '귀고리', 'Face Accessory': '얼굴장식', 'Eye Decoration': '눈장식', Ring: '반지'
};
const INC_ORDER = ['PAD', 'MAD', 'STR', 'DEX', 'INT', 'LUK', 'ACC', 'EVA', 'MHP', 'MMP', 'PDD', 'MDD', 'Speed', 'Jump'];
const INC_LABEL = {
  ko: { PAD: '공격력', MAD: '마력', MHP: 'HP', MMP: 'MP', PDD: '물방', MDD: '마방', ACC: '명중', EVA: '회피', Speed: '이속', Jump: '점프' },
  en: { PAD: 'W.Att', MAD: 'M.Att', MHP: 'HP', MMP: 'MP', PDD: 'W.Def', MDD: 'M.Def', ACC: 'Acc', EVA: 'Avoid', Speed: 'Speed', Jump: 'Jump' }
};

// One row per obtainable equip, with how to get it. A quest reward that is restricted to a job counts for that job only.
export function collectEquipment({ items, details, dropIndex, quests }) {
  const questBy = new Map();
  for (const q of quests) if (!q.expired) for (const g of q.gets) (questBy.get(g.id) || questBy.set(g.id, []).get(g.id)).push(q);
  return items
    .filter((i) => i.cat === 'Equip' && (WEAPONS.includes(i.sub) || ARMOR.includes(i.sub)) && details[i.id])
    .map((i) => {
      const d = details[i.id];
      const mobs = (dropIndex.get(i.id) || []).filter(({ m }) => m.status === 'active').sort((a, b) => a.m.lv - b.m.lv).map(({ m }) => m);
      return { id: i.id, en: i.en, ko: i.ko || i.en, sub: i.sub, weapon: WEAPONS.includes(i.sub), lv: d.req?.lv || 0, job: d.req?.job || 0,
        req: d.req || {}, inc: d.inc || {}, slots: d.slots || 0, mobs, quests: questBy.get(i.id) || [] };
    })
    .filter((e) => e.mobs.length || e.quests.length)
    .sort((a, b) => a.lv - b.lv || a.id - b.id);
}

const subName = (sub, lang) => (lang === 'ko' ? SUB_KO[sub] || sub : sub);
const statLine = (e, lang) => INC_ORDER.filter((k) => e.inc[k]).map((k) => `<span>${INC_LABEL[lang][k] || k} +${e.inc[k]}</span>`).join('');
const reqLine = (e) => ['str', 'dex', 'int', 'luk'].filter((k) => e.req[k]).map((k) => `<span>${k.toUpperCase()} ${e.req[k]}</span>`).join('');

function row(e, { lang, link, itemHref, mobHref, questHref, mobSprite }) {
  const ko = lang === 'ko';
  const name = ko ? e.ko : e.en;
  const from = [
    ...e.mobs.slice(0, 2).map((m) => `<a class="eq-mob" href="${mobHref(m)}" translate="no"><img class="mob-sprite" src="${mobSprite(m)}" width="28" height="28" alt="" loading="lazy">${esc(ko ? m.ko || m.en : m.en)}</a>`),
    ...(e.mobs.length > 2 ? [`<small>+${e.mobs.length - 2}</small>`] : []),
    ...e.quests.slice(0, 1).map((q) => `<a class="eq-quest" href="${questHref(q)}" translate="no">${esc(q.name)}</a>`)
  ].join('');
  return `<tr data-lv="${e.lv}" data-sub="${esc(e.sub)}" data-job="${e.job}">
<td class="num">${e.lv}</td>
<th scope="row"><a class="eq-name" href="${itemHref(e)}"><img src="https://maplestory.io/api/MCW/1/item/${e.id}/icon" alt="" width="32" height="32" loading="lazy"><span translate="no">${esc(name)}</span></a>${reqLine(e) ? `<small class="eq-req">${reqLine(e)}</small>` : ''}</th>
<td><div class="eq-stats">${statLine(e, lang) || '—'}</div></td>
<td class="num">${e.slots || '—'}</td>
<td><div class="eq-from">${from}</div></td></tr>`;
}

function table(rows, ctx) {
  const ko = ctx.lang === 'ko';
  return `<div class="table-wrap"><table class="data eq-table"><thead><tr><th scope="col">${ko ? '레벨' : 'Lv'}</th><th scope="col">${ko ? '아이템' : 'Item'}</th><th scope="col">${ko ? '능력치' : 'Stats'}</th><th scope="col">${ko ? '업그레이드' : 'Slots'}</th><th scope="col">${ko ? '얻는 곳' : 'Where to get it'}</th></tr></thead><tbody>${rows.map((e) => row(e, ctx)).join('')}</tbody></table></div>`;
}

function filters(lang, subs) {
  const ko = lang === 'ko';
  return `<form class="panel eq-filters" id="eq-filters" hidden>
<label>${ko ? '내 레벨' : 'My level'}<input type="number" name="lv" min="1" max="200" inputmode="numeric" placeholder="${ko ? '예: 35' : 'e.g. 35'}"></label>
<label>${ko ? '부위' : 'Slot'}<select name="sub"><option value="">${ko ? '모든 부위' : 'All slots'}</option>${subs.map((s) => `<option value="${esc(s)}">${esc(subName(s, lang))}</option>`).join('')}</select></label>
<label class="eq-check"><input type="checkbox" name="near">${ko ? '내 레벨 ±10만 보기' : 'Only gear within 10 levels of mine'}</label>
<p class="eq-count" role="status" aria-live="polite">${ko ? '표시' : 'Showing'} <b id="eq-count"></b></p></form>`;
}

export function equipmentClassBody(ctx, cls, all) {
  const { lang, link } = ctx, ko = lang === 'ko';
  const name = ko ? cls.ko : cls.en;
  const own = all.filter((e) => e.job & cls.bit);
  const shared = all.filter((e) => !e.job);
  const weapons = own.filter((e) => e.weapon), armor = own.filter((e) => !e.weapon);
  const groups = (list) => [...WEAPONS, ...ARMOR].filter((s) => list.some((e) => e.sub === s));
  const section = (list) => groups(list).map((s) => `<section class="eq-group" data-group="${esc(s)}"><h3>${esc(subName(s, lang))}</h3>${table(list.filter((e) => e.sub === s), ctx)}</section>`).join('');
  return `<section class="page-head wrap"><h1>${ko ? `${name} 장비` : `${name} equipment`}</h1><p class="lead">${ko
    ? `${name} 직업이 입을 수 있고 지금 얻을 수 있는 장비 ${own.length + shared.length}개예요. 레벨을 넣으면 지금 입을 수 있는 것만 남아요.`
    : `${own.length + shared.length} pieces of gear a ${name} can wear and actually get right now. Enter your level to see what you can equip.`}</p>${classLinks(lang, link, cls)}</section>
<div class="wrap eq-page" data-eq>
${filters(lang, groups([...own, ...shared]))}
<h2>${ko ? `${name} 무기` : `${name} weapons`}</h2>${section(weapons)}
<h2>${ko ? `${name} 전용 방어구` : `${name} armor`}</h2>${section(armor)}
<h2>${ko ? '모든 직업 공용' : 'Any class'}</h2>${section(shared)}
${notes(lang, link)}</div>`;
}

function classLinks(lang, link, current) {
  const ko = lang === 'ko';
  return `<nav class="char-links" aria-label="${ko ? '직업' : 'Class'}">${EQ_CLASSES.map((c) => (current && c.slug === current.slug
    ? `<strong aria-current="page">${ko ? c.ko : c.en}</strong>`
    : `<a href="${link(equipPath(c))}">${ko ? c.ko : c.en}</a>`)).join('')}</nav>`;
}

function notes(lang, link) {
  const ko = lang === 'ko';
  return `<section class="panel eq-notes"><h2>${ko ? '이 목록은' : 'About this list'}</h2>
<p>${ko ? '능력치와 착용 조건은 게임 클라이언트 데이터의 기본값이에요. 실제 아이템은 옵션이 조금씩 다르게 나와요.' : 'Stats and requirements are the base values from the game client; real drops roll slightly different stats.'}</p>
<p>${ko ? '지금 열린 맵의 몬스터가 떨어뜨린다는 제보가 있거나, 기간이 끝나지 않은 퀘스트 보상인 장비만 넣었어요. 상점 판매 장비는 빠져 있어요.' : 'Only gear that a monster in an open map is reported to drop, or that a current quest gives, is listed. NPC shop gear is not included yet.'} <a href="${link('/monsters/')}">${ko ? '몬스터 도감' : 'Monster database'}</a> · <a href="${link('/quests/')}">${ko ? '퀘스트' : 'Quests'}</a></p></section>`;
}

export function equipmentIndexBody(ctx, all) {
  const { lang, link } = ctx, ko = lang === 'ko';
  const cards = EQ_CLASSES.map((c) => {
    const n = all.filter((e) => e.job & c.bit).length;
    return `<a class="tool-card" href="${link(equipPath(c))}"><strong>${ko ? `${c.ko} 장비` : `${c.en} equipment`}</strong><p>${ko ? `${c.ko} 무기와 방어구 ${n}개` : `${n} ${c.en} weapons and armor pieces`}</p><span>${ko ? '보기' : 'Open'}</span></a>`;
  }).join('');
  const shared = all.filter((e) => !e.job);
  return `<section class="page-head wrap"><h1>${ko ? '장비 찾기' : 'Equipment finder'}</h1><p class="lead">${ko
    ? `지금 글클메에서 얻을 수 있는 장비 ${all.length}개를 직업, 부위, 레벨로 찾아요. 어느 몬스터가 떨어뜨리는지, 어떤 퀘스트가 주는지도 같이 보여요.`
    : `${all.length} pieces of gear you can actually get in Classic World, by class, slot and level, with the monsters that drop them and the quests that give them.`}</p></section>
<div class="wrap eq-page" data-eq>
<div class="tool-cards">${cards}</div>
<h2>${ko ? '모든 직업 공용 장비' : 'Gear any class can wear'}</h2>
${filters(lang, [...WEAPONS, ...ARMOR].filter((s) => shared.some((e) => e.sub === s)))}
${[...WEAPONS, ...ARMOR].filter((s) => shared.some((e) => e.sub === s)).map((s) => `<section class="eq-group" data-group="${esc(s)}"><h3>${esc(subName(s, lang))}</h3>${table(shared.filter((e) => e.sub === s), ctx)}</section>`).join('')}
${notes(lang, link)}</div>`;
}
