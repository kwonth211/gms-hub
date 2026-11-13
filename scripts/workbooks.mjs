// Excel workbooks for each menu (built once per language into dist/xlsx/). Each one is organised for a player, not a dump:
// the sheets answer the questions people bring to that page (where to train at my level, which monster pays best, what
// to bring for a quest, what my class can wear) and every row links back to the page on the site. Live menus (prices,
// megaphones, ranking) are built in the browser instead (assets/xlsx-live.js).
import fs from 'node:fs';
import path from 'node:path';
import { xlsx } from '../assets/xlsx.js';
import { equipmentCells, EQ_CLASSES, subName } from './equipment-pages.mjs';
import { monsterPath, mapPath } from './monster-pages.mjs';
import { regionName } from './map-pages.mjs';
import { questPath, areaName } from './quest-pages.mjs';
import { jobNames, publicRates } from '../assets/training-evidence.js';

const BANDS = [[1, 10], [11, 20], [21, 30], [31, 40], [41, 50], [51, 60], [61, 70], [71, 80], [81, 200]];

export function buildWorkbooks({ out, langs, abs, buildDate, monsters, items, equipment, maps, quests, npcs, training, evidence, scrolls, boxes, questGuides, accNeed, itemPagePath }) {
  const written = {};
  for (const lang of langs) {
    const ko = lang === 'ko';
    const L = (ko, en) => (lang === 'ko' ? ko : en);
    const nm = (o) => (ko ? o?.ko || o?.en : o?.en) || '';
    const url = (p) => abs(lang, p);
    const link = (text, p) => ({ text, url: url(p) });
    const itemById = new Map(items.map((i) => [i.id, i]));
    const itemName = (id) => { const i = itemById.get(id); return i ? nm(i) : L(`퀘스트 아이템 #${id}`, `Quest item #${id}`); };
    const itemLink = (id) => { const p = itemPagePath(id); return p ? link(L('아이템', 'Item'), p) : link(L('시세', 'Price'), `/tools/market/?item=${id}`); };
    const mobById = new Map(monsters.map((m) => [m.id, m]));
    const active = monsters.filter((m) => m.status === 'active');
    const stamp = L(`GMS Hub (gms-hub.com) · ${buildDate} 기준 · 글로벌 메이플스토리 클래식 월드`, `GMS Hub (gms-hub.com) · as of ${buildDate} · MapleStory Classic World`);
    const books = {};

    // Monsters: by level with value per HP, the best monster in each level band, and "who drops this item".
    const openMaps = (m) => (m.locations || []).filter((l) => l.availability === 'open').sort((a, b) => b.count - a.count);
    const monRow = (m) => [nm(m), m.lv, m.hp, m.exp, +(m.exp / m.hp * 100).toFixed(2), accNeed(m.lv, m), m.wdef, m.mdef, m.el || '', openMaps(m).slice(0, 3).map((l) => `${nm(l)} (${l.count})`).join(', '),
      (m.drops || []).length, link(L('보기', 'Open'), monsterPath(m))];
    const monCols = [{ h: L('몬스터', 'Monster') }, { h: L('레벨', 'Level'), t: 'int' }, { h: 'HP', t: 'int' }, { h: L('경험치', 'EXP'), t: 'int' }, { h: L('HP 100당 경험치', 'EXP per 100 HP'), t: 'num' },
      { h: L('같은 레벨 필요 명중', 'Accuracy needed (same level)'), t: 'int' }, { h: L('물리 방어', 'W.Def'), t: 'int' }, { h: L('마법 방어', 'M.Def'), t: 'int' }, { h: L('속성', 'Element') },
      { h: L('많이 나오는 맵 (마릿수)', 'Main maps (spawns)'), t: 'wrap' }, { h: L('드롭 종류', 'Drops'), t: 'int' }, { h: L('사이트', 'Site'), t: 'link' }];
    const dropRows = [];
    const byItem = new Map();
    for (const m of active) for (const d of m.drops || []) (byItem.get(d.itemId) || byItem.set(d.itemId, { d, mobs: [] }).get(d.itemId)).mobs.push(m);
    for (const [id, { d, mobs }] of byItem) { mobs.sort((a, b) => a.lv - b.lv); dropRows.push([nm(d), d.cat || '', mobs.length, mobs.map((m) => `${nm(m)} Lv.${m.lv}`).join(', '), mobs[0].lv, itemLink(id)]); }
    dropRows.sort((a, b) => String(a[0]).localeCompare(String(b[0]), lang));
    books.monsters = { title: L('몬스터 도감', 'Monsters'), sheets: [
      { name: L('레벨순 전체', 'All by level'), title: L('몬스터 도감 — 레벨순', 'Monsters by level'), note: `${stamp}. ${L('HP 100당 경험치가 높을수록 같은 시간에 경험치를 많이 줘요.', 'Higher EXP per 100 HP means more EXP for the same damage.')}`,
        cols: monCols, rows: [...active].sort((a, b) => a.lv - b.lv || a.id - b.id).map(monRow) },
      { name: L('레벨대별 효율 TOP', 'Best per level band'), title: L('레벨대별 경험치 효율 TOP 5', 'Top 5 EXP per HP in each level band'), note: L('보스는 빼고, 지금 열린 맵에 나오는 몬스터만 비교했어요.', 'Bosses left out; only monsters that spawn on open maps.'),
        cols: [{ h: L('레벨대', 'Levels') }, { h: L('순위', 'Rank'), t: 'int' }, ...monCols],
        rows: BANDS.flatMap(([a, b]) => active.filter((m) => !m.boss && m.lv >= a && m.lv <= b && openMaps(m).length).sort((x, y) => y.exp / y.hp - x.exp / x.hp).slice(0, 5).map((m, i) => [`${a}–${b > 100 ? '' : b}`, i + 1, ...monRow(m)])) },
      { name: L('아이템별 드롭 몬스터', 'Who drops what'), title: L('이 아이템은 누가 떨어뜨리나', 'Which monsters drop each item'), note: L('플레이어 제보로 모은 드롭 목록이에요. 드롭 확률은 공개되지 않아요.', 'Drop lists come from player reports; drop rates are not published.'),
        cols: [{ h: L('아이템', 'Item') }, { h: L('분류', 'Type') }, { h: L('떨어뜨리는 몬스터 수', 'Monsters'), t: 'int' }, { h: L('몬스터 (레벨)', 'Monsters (level)'), t: 'wrap' }, { h: L('가장 낮은 레벨', 'Lowest level'), t: 'int' }, { h: L('사이트', 'Site'), t: 'link' }], rows: dropRows },
      { name: L('보스', 'Bosses'), title: L('보스 몬스터', 'Bosses'), note: stamp, cols: monCols, rows: active.filter((m) => m.boss).sort((a, b) => a.lv - b.lv).map(monRow) }
    ] };

    // Maps: where to go, by region, with the EXP of one full clear.
    const mapCols = [{ h: L('맵', 'Map') }, { h: L('몬스터 레벨', 'Monster levels') }, { h: L('몬스터 (마릿수)', 'Monsters (spawns)'), t: 'wrap' }, { h: L('전체 마릿수', 'Total spawns'), t: 'int' }, { h: L('한 바퀴 경험치', 'EXP per full clear'), t: 'int' }, { h: L('사이트', 'Site'), t: 'link' }];
    const mapRow = (l) => [nm(l), l.minLv === l.maxLv ? `${l.minLv}` : `${l.minLv}–${l.maxLv}`, l.mobs.map(({ m, count }) => `${nm(m)} ${count}`).join(', '), l.total, l.clearExp, link(L('보기', 'Open'), mapPath(l))];
    const open = maps.filter((l) => l.availability === 'open');
    const regions = [...new Set(open.map((l) => l.region))];
    books.maps = { title: L('맵 도감', 'Maps'), sheets: [
      { name: L('레벨대별 추천 맵', 'By level'), title: L('레벨대별 한 바퀴 경험치가 높은 맵', 'Maps with the most EXP per full clear, by level band'), note: L('한 바퀴 경험치 = 맵의 몬스터를 한 번씩 다 잡았을 때 받는 경험치 합이에요.', 'EXP per full clear = the EXP for killing every monster on the map once.'),
        cols: [{ h: L('레벨대', 'Levels') }, ...mapCols], rows: BANDS.flatMap(([a, b]) => open.filter((l) => l.maxLv >= a && l.maxLv <= b).sort((x, y) => y.clearExp - x.clearExp).slice(0, 8).map((l) => [`${a}–${b > 100 ? '' : b}`, ...mapRow(l)])) },
      ...regions.map((r) => ({ name: regionName(r, lang), title: `${regionName(r, lang)} ${L('맵', 'maps')}`, note: stamp, cols: mapCols, rows: open.filter((l) => l.region === r).map(mapRow) }))
    ] };

    // Quests: by level, the best EXP, repeatables, and what to bring.
    const live = quests.filter((q) => !q.expired);
    const npc = (id) => (id && npcs[id] ? (ko ? npcs[id].ko || npcs[id].en : npcs[id].en) : '');
    const todo = (q) => [...q.hunt.map((h) => `${mobById.has(h.id) ? nm(mobById.get(h.id)) : `#${h.id}`} ${h.count}${L('마리', '')}`), ...q.bring.map((b) => `${itemName(b.id)} ${b.count}${L('개', '')}`)].join(', ');
    const qCols = [{ h: L('시작 레벨', 'Level'), t: 'int' }, { h: L('퀘스트', 'Quest') }, { h: L('지역', 'Area') }, { h: L('시작 NPC', 'Start NPC') }, { h: L('할 일', 'To do'), t: 'wrap' }, { h: L('경험치', 'EXP'), t: 'int' }, { h: L('메소', 'Mesos'), t: 'int' },
      { h: L('보상 아이템', 'Reward items'), t: 'wrap' }, { h: L('완료', 'Done'), t: 'check' }, { h: L('사이트', 'Site'), t: 'link' }];
    const qRow = (q) => [q.lv || null, q.name, areaName(q.area, lang), npc(q.startNpc), todo(q), q.exp || null, q.meso || null, q.gets.map((g) => `${itemName(g.id)}${g.count > 1 ? ` ×${g.count}` : ''}`).join(', '), null, link(L('공략', 'Guide'), questPath(q))];
    const bringRows = [];
    const need = new Map();
    for (const q of live) for (const b of q.bring) (need.get(b.id) || need.set(b.id, []).get(b.id)).push({ q, count: b.count });
    for (const [id, list] of need) { const drops = byItem.get(id)?.mobs || []; bringRows.push([itemName(id), list.length, list.map(({ q, count }) => `${q.name} (${count})`).join(', '), drops.map((m) => `${nm(m)} Lv.${m.lv}`).join(', ') || L('몬스터 드롭 아님 (상점·퀘스트)', 'Not a monster drop (shop or quest)'), drops.length ? itemLink(id) : null]); }
    bringRows.sort((a, b) => b[1] - a[1]);
    books.quests = { title: L('퀘스트', 'Quests'), sheets: [
      { name: L('레벨순 체크리스트', 'Checklist by level'), title: L('퀘스트 체크리스트 — 시작 레벨순', 'Quest checklist by start level'), note: `${stamp}. ${L('완료 칸에 표시하면서 쓰세요.', 'Tick the Done column as you go.')}`, cols: qCols, rows: [...live].sort((a, b) => (a.lv || 0) - (b.lv || 0) || a.id - b.id).map(qRow) },
      { name: L('경험치 많이 주는 퀘스트', 'Best EXP quests'), title: L('경험치 많이 주는 퀘스트 TOP 60', 'Top 60 quests by EXP'), note: stamp, cols: qCols, rows: [...live].filter((q) => q.exp).sort((a, b) => b.exp - a.exp).slice(0, 60).map(qRow) },
      { name: L('반복 퀘스트', 'Repeatable'), title: L('반복할 수 있는 퀘스트', 'Repeatable quests'), note: stamp, cols: qCols, rows: live.filter((q) => q.repeat).sort((a, b) => (a.lv || 0) - (b.lv || 0)).map(qRow) },
      { name: L('모아 올 아이템', 'Items to collect'), title: L('퀘스트에 들어가는 아이템과 얻는 곳', 'Quest items and where to get them'), note: L('여러 퀘스트에 쓰이는 아이템은 버리지 말고 모아 두세요.', 'Keep items that several quests ask for.'),
        cols: [{ h: L('아이템', 'Item') }, { h: L('쓰는 퀘스트 수', 'Quests'), t: 'int' }, { h: L('퀘스트 (개수)', 'Quests (count)'), t: 'wrap' }, { h: L('떨어뜨리는 몬스터', 'Dropped by'), t: 'wrap' }, { h: L('사이트', 'Site'), t: 'link' }], rows: bringRows }
    ] };

    // Training: the route list as a planner, measured rates, and one sheet per class family.
    const routes = training.routes;
    const party = { solo: L('솔로 가능', 'Solo'), preferred: L('파티 권장', 'Party preferred'), required: L('파티 필요', 'Party required') };
    const best = (r) => { const rs = publicRates(r, evidence).filter((x) => x.exp != null); const v = rs.map((x) => (Array.isArray(x.exp) ? x.exp[1] : x.exp)); return v.length ? Math.max(...v) : null; };
    const bestMeso = (r) => { const v = publicRates(r, evidence).filter((x) => x.mesos != null).map((x) => (Array.isArray(x.mesos) ? x.mesos[1] : x.mesos)); return v.length ? Math.max(...v) : null; };
    const trCols = [{ h: L('시작 레벨', 'From'), t: 'int' }, { h: L('끝 레벨', 'To'), t: 'int' }, { h: L('사냥터', 'Spot') }, { h: L('몬스터', 'Monsters'), t: 'wrap' }, { h: L('필요 명중', 'Accuracy'), t: 'int' }, { h: L('파티', 'Party') },
      { h: L('시간당 경험치 (실측 최고)', 'EXP/h (best measured)'), t: 'int' }, { h: L('시간당 메소', 'Mesos/h'), t: 'int' }, { h: L('가는 길과 동선', 'Access and rotation'), t: 'wrap' }, { h: L('물약과 비용', 'Supplies and costs'), t: 'wrap' }, { h: L('옮길 때', 'When to move'), t: 'wrap' }, { h: L('사이트', 'Site'), t: 'link' }];
    const trRow = (r) => [r.level.min, r.level.max, r.title[lang], (r.mobs || []).map((m) => `${ko ? m.ko : m.en} Lv.${m.lv}`).join(', ') || r.monsters[lang], r.mobs?.length ? Math.max(...r.mobs.map((m) => m.acc)) : null, party[r.party],
      best(r), bestMeso(r), r.route[lang], r.cost[lang], r.exit[lang], link(L('보기', 'Open'), `/tools/training/#route-${r.id}`)];
    const sorted = [...routes].sort((a, b) => a.level.min - b.level.min || a.level.max - b.level.max);
    const rateRows = routes.flatMap((r) => publicRates(r, evidence).map((x) => [r.level.min, r.title[lang], x.level || '', x.job ? jobNames[lang][x.job] || x.job : '', party[x.party === 'party' ? 'required' : 'solo'] || '',
      Array.isArray(x.exp) ? x.exp[1] : x.exp, Array.isArray(x.mesos) ? x.mesos[1] : x.mesos, { measured: L('실측', 'measured'), calc: L('계산', 'calculated'), model: L('추정', 'estimate'), community: L('후기', 'community'), report: L('유저 보고', 'reports') }[x.basis] || x.basis, x.note ? x.note[lang] : ''])).sort((a, b) => a[0] - b[0]);
    const families = [['warrior', ['warrior', 'fighter', 'page', 'spear']], ['archer', ['archer', 'hunter', 'crossbow']], ['mage', ['mage', 'fire', 'ice', 'cleric']], ['thief', ['thief', 'assassin', 'bandit']]];
    books.training = { title: L('사냥터 추천', 'Training spots'), sheets: [
      { name: L('레벨별 사냥터', 'By level'), title: L('레벨별 사냥터 플래너', 'Training planner by level'), note: `${stamp}. ${L('필요 명중은 그 레벨대 시작 레벨 기준이에요. 시간당 수치는 영상·후기에서 잰 값 중 가장 높은 것이에요.', 'Accuracy is for the band\'s first level. Hourly figures are the best measured in videos and posts.')}`, cols: trCols, rows: sorted.map(trRow) },
      { name: L('시간당 경험치·메소', 'EXP and mesos an hour'), title: L('시간당 경험치·메소 측정값', 'Measured EXP and mesos an hour'), note: L('직업·장비·파티 인원에 따라 달라져요. 조건을 같이 보세요.', 'They depend on class, gear and party size; read the conditions.'),
        cols: [{ h: L('레벨', 'Level'), t: 'int' }, { h: L('사냥터', 'Spot') }, { h: L('캐릭터 레벨', 'Character level') }, { h: L('직업', 'Class') }, { h: L('파티', 'Party') }, { h: L('시간당 경험치', 'EXP/h'), t: 'int' }, { h: L('시간당 메소', 'Mesos/h'), t: 'int' }, { h: L('근거 종류', 'Basis') }, { h: L('메모', 'Note'), t: 'wrap' }], rows: rateRows },
      ...families.map(([fam, jobs]) => ({ name: jobNames[lang][fam] || fam, title: `${jobNames[lang][fam] || fam} ${L('사냥터', 'training spots')}`, note: L('그 직업 전용 경로와 모든 직업 공통 경로를 같이 넣었어요.', 'Routes for this class plus routes for every class.'),
        cols: trCols, rows: sorted.filter((r) => !r.jobs.length || r.jobs.some((j) => jobs.includes(j))).map(trRow) }))
    ] };

    // Equipment: one sheet per class, sorted by level and slot, with how to get each piece.
    const eqCols = [{ h: L('착용 레벨', 'Level'), t: 'int' }, { h: L('부위', 'Slot') }, { h: L('장비', 'Item') }, { h: L('능력치', 'Stats'), t: 'wrap' }, { h: L('요구 능력치', 'Requirements') }, { h: L('업그레이드', 'Slots'), t: 'int' },
      { h: L('떨어뜨리는 몬스터', 'Dropped by'), t: 'wrap' }, { h: L('주는 퀘스트', 'Quest reward'), t: 'wrap' }, { h: L('사이트', 'Site'), t: 'link' }];
    const eqRow = (e) => { const c = equipmentCells(e, lang); return [e.lv, c.sub, ko ? e.ko : e.en, c.stats, c.req, e.slots, e.mobs.slice(0, 6).map((m) => `${nm(m)} Lv.${m.lv}`).join(', '), e.quests.map((q) => q.name).join(', '), itemLink(e.id)]; };
    books.equipment = { title: L('직업별 장비', 'Gear by class'), sheets: [
      ...EQ_CLASSES.map((c) => ({ name: ko ? c.ko : c.en, title: `${ko ? c.ko : c.en} ${L('장비 — 레벨순', 'gear by level')}`, note: `${stamp}. ${L('지금 몬스터 드롭이나 퀘스트로 얻을 수 있는 장비만 넣었어요.', 'Only gear you can get now from monster drops or quests.')}`,
        cols: eqCols, rows: equipment.filter((e) => e.job & c.bit).map(eqRow) })),
      { name: L('공용', 'All classes'), title: L('모든 직업이 쓰는 장비', 'Gear every class can wear'), note: stamp, cols: eqCols, rows: equipment.filter((e) => !e.job).map(eqRow) }
    ] };

    // Items: by category, with who drops them.
    const cats = [['Equip', L('장비', 'Equipment')], ['Use', L('소비', 'Use')], ['Etc', L('기타', 'Etc')], ['Setup', L('설치', 'Set-up')]];
    // Only items a player can actually get or use: dropped by a monster, asked for or given by a quest, or with its own page.
    const questUse = new Map();
    for (const q of live) { for (const b of q.bring) (questUse.get(b.id) || questUse.set(b.id, []).get(b.id)).push(q.name); for (const g of q.gets) (questUse.get(g.id) || questUse.set(g.id, []).get(g.id)).push(q.name); }
    const useful = (i) => byItem.has(i.id) || questUse.has(i.id) || itemPagePath(i.id);
    books.items = { title: L('아이템', 'Items'), sheets: cats.map(([c, label]) => ({ name: label, title: `${label} ${L('아이템', 'items')}`, note: `${stamp}. ${L('몬스터가 떨어뜨리거나 퀘스트에 쓰이는, 지금 얻을 수 있는 아이템만 넣었어요.', 'Only items you can get now: monster drops and quest items.')}`,
      cols: [{ h: L('아이템', 'Item') }, { h: L('영문 이름', 'Korean name') }, { h: L('세부 분류', 'Type') }, { h: L('레벨', 'Level'), t: 'int' }, { h: L('떨어뜨리는 몬스터', 'Dropped by'), t: 'wrap' }, { h: L('관련 퀘스트', 'Quests'), t: 'wrap' }, { h: L('사이트', 'Site'), t: 'link' }],
      rows: items.filter((i) => i.cat === c && useful(i)).sort((a, b) => (a.lv || 0) - (b.lv || 0) || String(a.sub).localeCompare(String(b.sub))).map((i) => [nm(i), ko ? i.en : i.ko || '', subName(i.sub || '', lang), i.lv || null, (byItem.get(i.id)?.mobs || []).map((m) => `${nm(m)} Lv.${m.lv}`).join(', '), [...new Set(questUse.get(i.id) || [])].slice(0, 4).join(', '), itemLink(i.id)]) })) };

    // Scrolls: chances for a whole run of slots, the numbers people work out by hand.
    const tiers = scrolls.tiers;
    const slotRows = [];
    for (let n = 1; n <= 10; n++) slotRows.push([n, ...tiers.flatMap((t) => [+(n * t.success / 100).toFixed(2), +(Math.pow(t.success / 100, n) * 100).toFixed(4)])]);
    books.scrolls = { title: L('주문서', 'Scrolls'), sheets: [
      { name: L('단계별 확률', 'Tiers'), title: L('주문서 단계별 성공·파괴 확률', 'Scroll success and destroy chance by tier'), note: stamp,
        cols: [{ h: L('단계', 'Tier') }, { h: L('성공률', 'Success'), t: 'rate' }, { h: L('실패 시 파괴', 'Destroyed on fail'), t: 'rate' }, { h: L('성공 1번에 필요한 평균 장수', 'Scrolls per success (avg)'), t: 'num' }],
        rows: tiers.map((t) => [ko ? t.ko : t.name, t.success, t.destroyOnFail, +(100 / t.success).toFixed(1)]) },
      { name: L('업그레이드 횟수별', 'By slots'), title: L('업그레이드 횟수만큼 발랐을 때', 'Using every upgrade slot'), note: L('기대 성공 = 평균적으로 붙는 횟수, 전부 성공 = 모든 칸이 다 붙을 확률이에요. 혼돈은 실패 시 파괴도 있어요.', 'Expected = average successes; all succeed = chance every slot passes. Chaos can also destroy the item on a fail.'),
        cols: [{ h: L('업그레이드 횟수', 'Slots'), t: 'int' }, ...tiers.flatMap((t) => [{ h: `${ko ? t.ko : t.name} ${L('기대 성공', 'expected')}`, t: 'num' }, { h: `${ko ? t.ko : t.name} ${L('전부 성공', 'all succeed')}`, t: 'rate' }])], rows: slotRows }
    ] };

    // Random boxes: per box, sorted by rate, with how many boxes an item takes on average.
    books.boxes = { title: L('랜덤박스 확률', 'Random box rates'), sheets: boxes.boxes.flatMap((b) => b.tables.map((t) => ({ name: t.title || b.name, title: t.title || b.name, note: L(`${boxes.updated} 기준 공식 확률. "평균 개수"는 그 아이템 하나가 나오기까지 평균 몇 개를 열어야 하는지예요.`, `Official rates as of ${boxes.updated}. "Boxes on average" is how many you open, on average, to get that item once.`),
      cols: [{ h: L('아이템', 'Item') }, { h: L('확률', 'Rate'), t: 'rate' }, { h: L('평균 개수', 'Boxes on average'), t: 'int' }],
      rows: [...t.items].sort((a, b) => b.rate - a.rate).map((i) => [i.name, i.rate, i.rate ? Math.round(100 / i.rate) : null]) }))) };

    // Quest guides: a checklist and a shopping list per guide.
    for (const { guide: g, data } of questGuides) {
      const steps = data.chains.flatMap((c) => c.steps.map((s, i) => ({ c, s, i })));
      const mats = new Map();
      for (const { s } of steps) for (const b of s.bring || []) { const e = mats.get(b.id) || mats.set(b.id, { b, count: 0, quests: [] }).get(b.id); e.count += b.count; e.quests.push(s.name); }
      books[`quest-${g.slug}`] = { title: g.title?.[lang] || g.slug, sheets: [
        { name: L('진행 체크리스트', 'Checklist'), title: `${g.h1?.[lang] || g.title?.[lang] || g.slug}`, note: `${stamp}. ${L('위에서부터 순서대로 하고 완료 칸에 표시하세요.', 'Go top to bottom and tick Done.')}`,
          cols: [{ h: L('완료', 'Done'), t: 'check' }, { h: L('묶음', 'Chain') }, { h: L('단계', 'Step'), t: 'int' }, { h: L('퀘스트', 'Quest') }, { h: L('레벨', 'Level'), t: 'int' }, { h: 'NPC' }, { h: L('NPC 위치', 'Where'), t: 'wrap' }, { h: L('할 일', 'To do'), t: 'wrap' },
            { h: L('잡을 몬스터', 'Hunt'), t: 'wrap' }, { h: L('주의', 'Watch out'), t: 'wrap' }, { h: L('보상', 'Reward'), t: 'wrap' }],
          rows: steps.map(({ c, s, i }) => [null, c.title?.[lang] || '', i + 1, s.name, s.lv || null, s.npcStart ? nm(s.npcStart) : '', s.where?.[lang] || '', s.do?.[lang] || '',
            (s.kills || []).map((k) => `${nm(k)} ${k.count}${L('마리', '')}${k.maps?.[0] ? ` (${nm(k.maps[0])})` : ''}`).join(', '), s.warn?.[lang] || '',
            [s.exp ? `EXP ${s.exp.toLocaleString('en-US')}` : '', s.meso ? `${s.meso.toLocaleString('en-US')} ${L('메소', 'mesos')}` : '', (s.gets || []).map((x) => `${nm(x)}${x.count > 1 ? ` ×${x.count}` : ''}`).join(', ')].filter(Boolean).join(' · ')]) },
        { name: L('준비물', 'Shopping list'), title: L('모아 갈 아이템', 'Items to bring'), note: L('여러 단계에 쓰이는 아이템은 합친 개수예요.', 'Counts are totals across steps.'),
          cols: [{ h: L('챙김', 'Got it'), t: 'check' }, { h: L('아이템', 'Item') }, { h: L('필요 개수', 'Count'), t: 'int' }, { h: L('얻는 곳', 'Where to get it'), t: 'wrap' }, { h: L('쓰는 퀘스트', 'Used in'), t: 'wrap' }],
          rows: [...mats.values()].map(({ b, count, quests: qs }) => [null, nm(b), count, b.note?.[lang] || (b.from || []).map((m) => `${nm(m)} Lv.${m.lv}${m.maps?.[0] ? ` — ${nm(m.maps[0])}` : ''}`).join(', '), [...new Set(qs)].join(', ')]) }
      ] };
    }

    const dir = path.join(out, 'xlsx');
    fs.mkdirSync(dir, { recursive: true });
    for (const [key, b] of Object.entries(books)) {
      const file = `${key}-${lang}.xlsx`;
      const sheets = b.sheets.filter((s) => s.rows.length);
      fs.writeFileSync(path.join(dir, file), xlsx({ sheets, title: `GMS Hub — ${b.title}` }));
      const w = (written[key] ||= { files: {}, sheets: {} });
      w.files[lang] = file;
      w.sheets[lang] = sheets.map((s) => s.name);
    }
  }
  return written;
}
