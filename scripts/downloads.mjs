// Spreadsheet downloads: every database on the site as a CSV file that Excel opens directly (UTF-8 with a byte-order mark
// and Windows line ends, so Korean text and line breaks survive on Windows Excel). Files are written at build time into
// dist/downloads/, one per dataset and language (ko, en; zh/ja use the English file). Live data (prices, ranking,
// megaphone trends) is turned into a file in the browser from the API snapshots the pages already use (assets/csv.js).
import fs from 'node:fs';
import path from 'node:path';
import { equipmentCells } from './equipment-pages.mjs';

const cell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s;
};
export const toCsv = (head, rows) => '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

export function downloadSets({ monsters, items, equipment, maps, quests, training, scrolls, boxes, questArea }) {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const nm = (o, lang) => (lang === 'ko' ? o.ko || o.en : o.en);
  const itemName = (id, lang) => { const i = itemById.get(id); return i ? nm(i, lang) : `#${id}`; };
  const mobById = new Map(monsters.map((m) => [m.id, m]));
  const T = (ko, en) => (lang) => (lang === 'ko' ? ko : en);
  return [
    { key: 'monsters', icon: 'slime', title: T('몬스터 도감', 'Monsters'), desc: T('레벨·HP·경험치·방어·출현 맵·드롭 아이템', 'Level, HP, EXP, defence, maps and drops'),
      head: (l) => l === 'ko' ? ['이름', '영문 이름', '레벨', 'HP', 'MP', '경험치', '물리 공격', '마법 공격', '물리 방어', '마법 방어', '명중', '회피', '속성', '보스', '출현 맵', '드롭 아이템']
        : ['Name', 'Korean name', 'Level', 'HP', 'MP', 'EXP', 'W.Att', 'M.Att', 'W.Def', 'M.Def', 'Accuracy', 'Avoid', 'Element', 'Boss', 'Maps', 'Drops'],
      rows: (l) => monsters.filter((m) => m.status === 'active').sort((a, b) => a.lv - b.lv).map((m) => [l === 'ko' ? m.ko || m.en : m.en, l === 'ko' ? m.en : m.ko || '', m.lv, m.hp, m.mp, m.exp, m.watk, m.matk, m.wdef, m.mdef, m.acc, m.eva, m.el || '', m.boss ? 'O' : '',
        (m.locations || []).map((x) => nm(x, l)).join(' / '), (m.drops || []).map((d) => nm(d, l)).join(' / ')]) },
    { key: 'items', icon: 'bag', title: T('아이템 목록', 'Items'), desc: T('아이템 ID·한글·영문 이름·분류·레벨', 'Item ID, names, category and level'),
      head: (l) => l === 'ko' ? ['아이템 ID', '이름', '영문 이름', '분류', '세부 분류', '레벨'] : ['Item ID', 'Name', 'Korean name', 'Category', 'Type', 'Level'],
      rows: (l) => items.map((i) => [i.id, l === 'ko' ? i.ko || i.en : i.en, l === 'ko' ? i.en : i.ko || '', i.cat, i.sub || '', i.lv || '']) },
    { key: 'equipment', icon: 'hammer', title: T('직업별 장비', 'Gear by class'), desc: T('얻을 수 있는 장비의 직업·부위·능력치·업그레이드 횟수·얻는 곳', 'Obtainable gear: class, slot, stats, slots and where to get it'),
      head: (l) => l === 'ko' ? ['이름', '영문 이름', '부위', '착용 레벨', '직업', '요구 능력치', '능력치', '업그레이드 횟수', '드롭 몬스터', '주는 퀘스트']
        : ['Name', 'Korean name', 'Slot', 'Level', 'Class', 'Requirements', 'Stats', 'Upgrade slots', 'Dropped by', 'Quest reward'],
      rows: (l) => equipment.map((e) => { const c = equipmentCells(e, l); return [l === 'ko' ? e.ko : e.en, l === 'ko' ? e.en : e.ko, c.sub, e.lv, c.jobs, c.req, c.stats, e.slots, e.mobs.map((m) => nm(m, l)).join(' / '), e.quests.map((q) => q.name).join(' / ')]; }) },
    { key: 'maps', icon: 'tree', title: T('맵 도감', 'Maps'), desc: T('사냥터별 지역과 나오는 몬스터·마릿수', 'Hunting maps with region, monsters and spawn counts'),
      head: (l) => l === 'ko' ? ['맵', '영문 이름', '지역', '전체 마릿수', '몬스터'] : ['Map', 'Korean name', 'Region', 'Total spawns', 'Monsters'],
      rows: (l) => maps.map((x) => [nm(x, l), l === 'ko' ? x.en : x.ko || '', x.region, x.total, x.mobs.map(({ m, count }) => `${nm(m, l)} ${count}`).join(' / ')]) },
    { key: 'quests', icon: 'scroll', title: T('퀘스트 목록', 'Quests'), desc: T('시작 레벨·모아 올 아이템·처치 몬스터·보상', 'Start level, items to bring, monsters to hunt and rewards'),
      head: (l) => l === 'ko' ? ['퀘스트 ID', '퀘스트', '지역', '시작 레벨', '모아 올 아이템', '처치 몬스터', '경험치', '메소', '보상 아이템', '반복']
        : ['Quest ID', 'Quest', 'Area', 'Start level', 'Items to bring', 'Monsters to hunt', 'EXP', 'Mesos', 'Reward items', 'Repeatable'],
      rows: (l) => quests.filter((q) => !q.expired).map((q) => [q.id, q.name, questArea(q.area, l), q.lv || '', q.bring.map((b) => `${itemName(b.id, l)} ${b.count}`).join(' / '),
        q.hunt.map((h) => `${mobById.has(h.id) ? nm(mobById.get(h.id), l) : `#${h.id}`} ${h.count}`).join(' / '), q.exp || '', q.meso || '', q.gets.map((g) => `${itemName(g.id, l)}${g.count > 1 ? ` ${g.count}` : ''}`).join(' / '), q.repeat ? 'O' : '']) },
    { key: 'training', icon: 'sword', title: T('사냥터 추천', 'Training spots'), desc: T('레벨별 추천 사냥터, 몬스터, 파티 여부, 동선과 옮길 때', 'Spots by level: monsters, party, route and when to move'),
      head: (l) => l === 'ko' ? ['시작 레벨', '끝 레벨', '사냥터', '몬스터', '파티', '장비 조건부', '요약', '가는 길과 동선', '물약과 비용', '옮길 때']
        : ['From level', 'To level', 'Spot', 'Monsters', 'Party', 'Gear dependent', 'Summary', 'Access and rotation', 'Supplies and costs', 'When to move'],
      rows: (l) => training.routes.map((r) => [r.level.min, r.level.max, r.title[l], r.monsters[l], { solo: l === 'ko' ? '솔로 가능' : 'solo', preferred: l === 'ko' ? '파티 권장' : 'party preferred', required: l === 'ko' ? '파티 필요' : 'party required' }[r.party],
        r.advanced ? 'O' : '', r.summary[l], r.route[l], r.cost[l], r.exit[l]]) },
    { key: 'scrolls', icon: 'scroll', title: T('주문서 성공률', 'Scroll success rates'), desc: T('주문서 단계별 성공률과 실패 시 파괴 확률', 'Success and destroy chance by scroll tier'),
      head: (l) => l === 'ko' ? ['단계', '영문', '성공률(%)', '실패 시 파괴(%)'] : ['Tier', 'Korean', 'Success (%)', 'Destroyed on fail (%)'],
      rows: (l) => scrolls.tiers.map((t) => [l === 'ko' ? t.ko : t.name, l === 'ko' ? t.name : t.ko, t.success, t.destroyOnFail]) },
    { key: 'random-boxes', icon: 'bag', title: T('랜덤박스 확률', 'Random box rates'), desc: T('캐시 랜덤박스별 아이템 확률', 'Item rates for each cash random box'),
      head: (l) => l === 'ko' ? ['상자', '구분', '아이템', '확률(%)'] : ['Box', 'Table', 'Item', 'Rate (%)'],
      rows: () => boxes.boxes.flatMap((b) => b.tables.flatMap((t) => t.items.map((i) => [b.name, t.title, i.name, i.rate]))) }
  ];
}

export function writeDownloads(dir, sets) {
  fs.mkdirSync(dir, { recursive: true });
  const out = [];
  for (const s of sets) for (const lang of ['ko', 'en']) {
    const rows = s.rows(lang);
    fs.writeFileSync(path.join(dir, `${s.key}-${lang}.csv`), toCsv(s.head(lang), rows));
    out.push({ key: s.key, lang, rows: rows.length });
  }
  return out;
}
