import test from 'node:test';
import assert from 'node:assert/strict';
import { koTitle, maintWindow, officialNews, discordNotice } from '../worker/src/news.js';
import { newsInner } from '../assets/official-news.js';

test('formulaic notice titles get Korean wording, the rest stay as written', () => {
  assert.equal(koTitle(1, 'Scheduled Game Update - November 18, 2026'), '11월 18일 업데이트 점검');
  assert.equal(koTitle(1, '[Completed] Unscheduled Emergency Maintenance - October 30, 2026'), '[완료] 10월 30일 긴급 점검');
  assert.equal(koTitle(1, '[Completed] Unscheduled Maintenance - November 4, 2026'), '[완료] 11월 4일 임시 점검');
  assert.equal(koTitle(1, 'Scheduled Maintenance - October 29, 2026'), '10월 29일 정기 점검');
  assert.equal(koTitle(1, '[Update Oct 28] Classic World Cash Shop Update: Oct. 28'), '[10/28 수정] 10월 28일 캐시샵 업데이트');
  assert.equal(koTitle(1, 'December Update: Patch Notes'), '12월 업데이트: 패치 노트');
  assert.equal(koTitle(1, 'v.2.0.0 Release Notes'), 'v.2.0.0 패치 노트');
  assert.equal(koTitle(1, 'Ossyria Exploration Report'), 'Ossyria Exploration Report');
  assert.equal(koTitle(46506, 'Grand Launch Release Notes'), '정식 출시 패치 노트');
});

const BODY = '<p>starting on <strong>Wednesday, November 18, 2026</strong> at 5:00 AM PST</p><ul><li>PST (UTC -8): 5:00 AM - 10:00 AM</li><li>AEDT (UTC +11): 12:00 AM November 19 - 5:00 AM November 19</li></ul>';
test('maintenance window is read from the Pacific time row', () => {
  assert.deepEqual(maintWindow(BODY), { start: '2026-11-18T13:00:00.000Z', end: '2026-11-18T18:00:00.000Z' });
  assert.deepEqual(maintWindow('<p>Thursday, July 9, 2026</p><p>PDT (UTC -7): 10:00 PM - 2:00 AM</p>'), { start: '2026-07-10T05:00:00.000Z', end: '2026-07-10T09:00:00.000Z' });
  assert.equal(maintWindow('<p>The maintenance has been completed.</p>'), null);
});

test('only live Classic World notices are listed, newest first, with the open maintenance window', async () => {
  const now = Date.parse('2026-11-18T00:00:00Z');
  const list = [
    { id: 1, name: 'Other game news', liveDate: '2026-11-17T00:00:00Z', category: 'general' },
    { id: 2, name: 'Classic World Cash Shop Update: Nov. 11', liveDate: '2026-11-10T16:00:00Z', category: 'sale', isMSCW: true },
    { id: 3, name: 'Scheduled Game Update - November 18, 2026', liveDate: '2026-11-16T19:00:00Z', category: 'maintenance', isMSCW: true },
    { id: 4, name: 'Not out yet', liveDate: '2026-12-01T00:00:00Z', category: 'weird', isMSCW: true },
  ];
  const calls = [];
  const fetcher = async (url) => { calls.push(url); return Response.json(url.endsWith('/3') ? { body: BODY } : list); };
  const d = await officialNews(fetcher, now);
  assert.deepEqual(d.items.map((x) => x.id), ['d1572077114297942107', 3, 2]);
  assert.equal(d.items[1].maint.start, '2026-11-18T13:00:00.000Z');
  assert.equal(d.items[2].ko, '11월 11일 캐시샵 업데이트');
  assert.deepEqual(d.items[1].sum.ko.slice(0, 2), ['점검 시간: 11월 18일(수) 22:00 ~ 19일(목) 03:00 (한국 시간, 약 5시간)', '점검하는 동안에는 게임 서버에 접속할 수 없어요.']);
  assert.match(d.items[1].url, /^https:\/\/www\.nexon\.com\/maplestory\/news\/maintenance\/3\/scheduled-game-update/);
  assert.equal(calls.length, 2);
  await assert.rejects(officialNews(async () => new Response('no', { status: 500 }), now));
});

test('home list: Korean titles and Korea time on Korean pages, the maintenance line leaves once it is over', () => {
  const data = { items: [{ id: 3, cat: 'maintenance', date: '2026-11-16T19:00:00Z', en: 'Scheduled <b>Game</b> Update', ko: '11월 18일 업데이트 점검', url: 'https://www.nexon.com/x', link: '/forgotten-hollow/', sum: { ko: ['점검하는 동안에는 <접속>할 수 없어요.'], en: ['Servers are down.'] },
    maint: { start: '2026-11-18T13:00:00.000Z', end: '2026-11-18T18:00:00.000Z' } }] };
  const tr = (k) => k;
  const before = newsInner(data, { ko: true, tr, now: Date.parse('2026-11-18T00:00:00Z'), site: (p) => `/ko${p}` });
  assert.match(before, /<details data-news="3">/); assert.match(before, /<li>점검하는 동안에는 &lt;접속&gt;할 수 없어요\.<\/li>/); assert.match(before, /href="\/ko\/forgotten-hollow\/"/);
  assert.match(before, /점검 예정/); assert.match(before, /11월 18일\(수\) 22:00 ~ 19일\(목\) 03:00/); assert.match(before, /11\/17/);
  assert.match(newsInner(data, { ko: true, tr, now: Date.parse('2026-11-18T14:00:00Z') }), /점검 중/);
  assert.doesNotMatch(newsInner(data, { ko: true, tr, now: Date.parse('2026-11-18T19:00:00Z') }), /gn-maint/);
  const en = newsInner(data, { ko: false, tr: (k, e) => e, now: Date.parse('2026-11-18T00:00:00Z'), tz: 'UTC' });
  assert.match(en, /1:00 PM – 6:00 PM UTC/); assert.match(en, /Scheduled &lt;b&gt;Game/); assert.match(en, /<li>Servers are down\.<\/li>/);
  assert.equal(newsInner({ items: [] }, { ko: true, tr }), '');
});

test('followed Discord announcements become notices; our own posts and pointers to listed notices are skipped', () => {
  const m = { id: '9', flags: 2, timestamp: '2026-11-17T02:32:00Z', content: 'Hi Classic Maplers,\n\nWe are aware of players who believe their bans are false-positive bans.\n\nWe would like to clarify that mass reporting does **NOT** trigger automatic bans.\n<@&123>' };
  const n = discordNotice(m, new Set(), 'https://discord.gg/x');
  assert.equal(n.id, 'd9'); assert.equal(n.src, 'discord'); assert.equal(n.url, 'https://discord.gg/x');
  assert.equal(n.en, 'We are aware of players who believe their bans are false-positive bans');
  assert.deepEqual(n.sum.en, ['We would like to clarify that mass reporting does NOT trigger automatic bans.']);
  assert.equal(discordNotice({ ...m, flags: 0 }), null);
  assert.equal(discordNotice({ ...m, content: 'Check out [HERE](https://www.nexon.com/maplestory/news/events/48552/x)' }, new Set([48552])), null);
});
