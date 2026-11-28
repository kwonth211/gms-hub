import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { indexEntry, normalize, searchEntries } from '../assets/search-index.js';

const sourceItems = JSON.parse(fs.readFileSync(new URL('../data/items.json', import.meta.url))).items;
const items = sourceItems.map((it) => indexEntry({ type: 'item', id: it.id, title: it.ko || it.en, names: [it.ko, it.en, String(it.id)] }));
const sites = JSON.parse(fs.readFileSync(new URL('../data/sites.json', import.meta.url))).categories.flatMap((category) => category.sites.map((site) => indexEntry({ type: 'site', id: site.url, title: site.name, keywords: `${category.name.ko} ${category.name.en} ${site.desc.ko} ${site.desc.en} ${site.features.ko.join(' ')} ${site.features.en.join(' ')}` })));
const tools = [indexEntry({ type: 'tool', id: 'scroll', title: '주문서 계산기', keywords: '공격력 scroll calculator' })];
const results = (q) => searchEntries(items, q);
const ids = (q) => results(q).map((it) => it.id);
// Search once per assertion; do not rerun the entire search inside each Array.find iteration.
const firstSource = (q) => { const id = results(q)[0]?.id; return sourceItems.find(it => it.id === id); };

test('a site or tool match never suppresses item results', () => {
  const hits = searchEntries([...sites, ...tools, ...items], '주문서');
  assert.deepEqual(new Set(hits.map((hit) => hit.type)), new Set(['site', 'tool', 'item']));
  assert.equal(hits.filter((hit) => hit.type === 'item').length, results('주문서').length);
});

test('item names match across languages, case, spacing and reordered words', () => {
  const target = sourceItems.find((it) => it.en === 'Gloves Attack Scroll: Intermediate');
  assert.ok(target);
  for (const query of ['장갑 Attack 중급', '중급 장갑 attack', 'Gloves Attack Scroll Intermediate', 'GLOVESATTACKSCROLL:INTERMEDIATE', 'attack gloves intermediate', String(target.id)]) {
    assert.ok(ids(query).includes(target.id), query);
  }
  assert.equal(results(String(target.id))[0].id, target.id);
});

test('Korean stat synonyms and common scroll abbreviations find mixed-language names', () => {
  const physical = sourceItems.find((it) => it.en === 'Gloves Attack Scroll: Intermediate');
  const magic = sourceItems.find((it) => it.en === 'Gloves Magic Attack Scroll: Intermediate');
  for (const query of ['장갑 공격력', '장갑공격력', '장공', '장공 중급']) assert.ok(ids(query).includes(physical.id), query);
  for (const query of ['장갑 마력', '장갑마법공격력', '장마 중급']) assert.ok(ids(query).includes(magic.id), query);
  assert.ok(firstSource('장갑 공격력').en.startsWith('Gloves Attack'));
  assert.ok(!ids('장공').includes(magic.id));
});

test('single-character and Korean initial-consonant searches are supported', () => {
  assert.ok(results('검').length > 0);
  assert.ok(results('ㅁㅅㄹ').some((it) => it.title.includes('미스릴')));
});

test('all query words are required and blank/punctuation searches do not match everything', () => {
  for (const q of ['', '   ', '!!!', '장갑 definitelynotanitem']) assert.equal(results(q).length, 0, q);
  assert.equal(normalize(' Ｍｅｓｏ.Ｗａｔｃｈ '), 'mesowatch');
});

test('exact names outrank descriptions and aliases can find a named site', () => {
  const entries = [
    indexEntry({ title: 'Other', keywords: 'MesoWatch' }),
    indexEntry({ title: 'MesoWatch', names: ['MesoWatch', 'meso.watch', '메소워치'] }),
  ];
  assert.equal(searchEntries(entries, 'Meso Watch')[0].title, 'MesoWatch');
  assert.equal(searchEntries(entries, '메소 워치')[0].title, 'MesoWatch');
});

test('gear + stat abbreviations players type find the scroll (귀힘, 창공, 망럭, 신이속, 폴공 중급)', () => {
  const en = (q) => firstSource(q)?.en || '';
  assert.match(en('귀힘'), /^Earring STR Scroll/);
  assert.match(en('창공'), /^Spear Attack Scroll/);
  assert.match(en('창 공'), /^Spear Attack Scroll/);
  assert.match(en('망럭'), /^Cape LUK Scroll/);
  assert.match(en('신이속'), /^Shoes Speed Scroll/);
  assert.match(en('폴공 중급'), /^Polearm Attack Scroll: Intermediate/);
  assert.match(en('귀회'), /^Earring Evasion Scroll/);
  assert.ok(results('귀환').every((it) => !/Earring/.test(sourceItems.find((s) => s.id === it.id).en)), '귀환 is not rewritten');
});

test('Korean defence and evasion words match the DEF / Evasion tokens in scroll names', () => {
  assert.ok(results('상의 방어력').length > 0);
  assert.ok(results('귀고리 회피').length > 0);
});

test('results carry their score so callers never rank a weaker match above a better one', () => {
  const hits = results('meba');
  assert.equal(hits[0].title, '메바');
  assert.ok(hits.every((hit, i) => i === 0 || hits[i - 1].score >= hit.score));
});

test('공격 and 고급 work like the words players use for attack and Greater', () => {
  assert.ok(results('장갑 공격').some((it) => /Gloves Attack Scroll/.test(sourceItems.find((s) => s.id === it.id).en)));
  assert.ok(results('고급 망토').every((it, i) => i > 2 || /Cape .* Scroll: Greater/.test(sourceItems.find((s) => s.id === it.id).en)));
});

test('a short Latin query inside another word ranks below real word matches', () => {
  const top = firstSource('mp').en;
  assert.match(top, /\bMP\b/);
});

test('English shorthand finds scrolls and common item nicknames', () => {
  const name = (q) => firstSource(q)?.en;
  assert.equal(name('glove att 60'), 'Gloves Attack Scroll: Intermediate');
  assert.equal(name('gfa60'), 'Gloves Attack Scroll: Intermediate');
  assert.equal(name('GFA 10%'), 'Gloves Attack Scroll: Greater');
  assert.equal(name('ear int 60'), 'Earring INT Scroll: Intermediate');
  assert.equal(name('zhelm'), 'Zakum Helmet');
  assert.equal(name('steelies'), 'Steely Throwing Knives');
  assert.equal(name('work gloves'), 'Work Gloves');
});

test('half-typed Korean and English-keyboard Korean still find items', async () => {
  const { indexEntry, searchEntries, compose, keysToJamo } = await import('../assets/search-index.js');
  const entries = [
    { type: 'item', id: 1, title: '귀고리 STR 주문서: 하급', names: ['귀고리 STR 주문서: 하급'] },
    { type: 'item', id: 2, title: '전신 갑옷 DEF 주문서: 하급', names: ['전신 갑옷 DEF 주문서: 하급'] },
    { type: 'item', id: 3, title: '리본돼지 머리띠', names: ['리본돼지 머리띠'] },
  ].map(indexEntry);
  const first = (q) => searchEntries(entries, q)[0]?.id;
  assert.equal(first('귁'), 1);
  assert.equal(first('전신 갑오'), 2);
  assert.equal(first('됒'), 3);
  assert.equal(compose(keysToJamo('rnlrhf')), '귀골');
  assert.equal(first('rnlrhf'), 1);
});

test('failed market searches from 11/23: whole gear word + short stat, one slipped letter, loan words', () => {
  const first = firstSource;
  const names = (q) => results(q).map((hit) => hit.title);
  assert.ok(first('아대공').en.startsWith('Claw Attack'));
  assert.ok(first('장갑공').en.startsWith('Gloves Attack'));
  assert.ok(first('전신민첩').en.startsWith('Overall Armor DEX'));
  assert.ok(names('양손둔기 공').some((n) => n.startsWith('양손둔기')));
  assert.ok(first('상의 갑옷 DEF').en.startsWith('Topwear DEF'));
  for (const q of ['귀거리', '귀걸', '에메랄드 이어링']) assert.ok(names(q).some((n) => n.includes('귀고리')), q);
  assert.ok(names('스테프').some((n) => n.includes('스태프')));
  assert.ok(names('아다마티움').every((n) => n.includes('아다만티움')) && names('아다마티움').length > 0);
  assert.ok(names('저주바은').includes('저주받은 인형'));
  assert.equal(first('iceicle').en, 'Icicle');
  assert.equal(first('draon skin').en, 'Dragon Skin');
  assert.ok(results('파자마').length > 0 && results('마스크').length > 0);
  // A slip is only forgiven when nothing matched as typed, and short words are never guessed.
  assert.ok(!names('귀환').some((n) => n.includes('귀고리')));
  assert.equal(results('zzq').length, 0);
});
