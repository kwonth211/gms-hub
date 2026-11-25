import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { validFreeMega, postFreeMega, listFreeMegas, deleteFreeMega, reportFreeMega, pruneFreeMegas, requestTrade, DAILY_MAX, REQUEST_DAILY, REQUESTS_PER_POST } from '../worker/src/free-mega.js';
import { tradeRequestMessage } from '../worker/src/discord-alerts.js';

function environment() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of ['0020_free_megaphones.sql', '0023_free_mega_discord.sql', '0032_trade_requests.sql']) sqlite.exec(fs.readFileSync(new URL(`../worker/migrations/${f}`, import.meta.url), 'utf8'));
  const DB = { prepare(sql, args = []) { return { bind(...a) { return DB.prepare(sql, a); }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; } }; } };
  return { DB, sqlite };
}
const known = new Set([2040801]);
const sell = { nick: 'Hookstk', intent: 'sell', item: 2040801, price: '300만', text: '1개 급처', channel: 3 };

test('a trade post needs a game-style name, an item or a few words, and keeps links, cash talk and slurs out', () => {
  assert.deepEqual(validFreeMega(sell, known).row, { nick: 'Hookstk', intent: 'sell', item: 2040801, price: 3000000, text: '1개 급처', channel: 3 });
  assert.equal(validFreeMega({ ...sell, text: '' }, known).row.item, 2040801);
  for (const [change, code] of [[{ nick: '@everyone' }, 'nick'], [{ nick: 'a' }, 'nick'], [{ nick: 'x'.repeat(21) }, 'nick'], [{ intent: 'trade' }, 'intent'], [{ item: 999 }, 'item'],
    [{ price: 'lots' }, 'price'], [{ text: 'x'.repeat(81) }, 'length'], [{ text: 'discord.gg/abc' }, 'link'], [{ text: '현금 거래 가능' }, 'rmt'],
    [{ text: '5000원에 팜' }, 'rmt'], [{ text: '$20 paypal' }, 'rmt'], [{ channel: 41 }, 'channel'], [{ item: null, text: '' }, 'empty']])
    assert.equal(validFreeMega({ ...sell, ...change }, known).error, code, JSON.stringify(change));
  // A chat line drops any item or price, and needs words.
  assert.deepEqual(validFreeMega({ nick: 'Abc', intent: 'talk', item: 2040801, price: '3m', text: '파티 구해요' }, known).row, { nick: 'Abc', intent: 'talk', item: null, price: null, text: '파티 구해요', channel: null });
  assert.equal(validFreeMega({ nick: 'Abc', intent: 'talk', text: '' }, known).error, 'empty');
  assert.equal(validFreeMega({ ...sell, text: '씨발 싸게' }, known).row.text, '** 싸게');
});

test('one post per two minutes and ten a day per visitor; the list shows the newest first without keys or reporters', async () => {
  const e = environment();
  const [first, ok] = await postFreeMega(e, sell, 'v1', known);
  assert.equal(ok, 200);
  assert.match(first.key, /^[0-9a-f]{32}$/);
  assert.equal(first.row.price, 3000000);
  assert.equal((await postFreeMega(e, sell, 'v1', known))[1], 429);
  assert.equal((await postFreeMega(e, sell, 'v2', known))[1], 200);
  e.sqlite.exec("UPDATE free_megaphones SET at = datetime('now', '-10 minutes')");
  for (let i = 1; i < DAILY_MAX; i++) { e.sqlite.exec("UPDATE free_megaphones SET at = datetime('now', '-10 minutes')"); assert.equal((await postFreeMega(e, sell, 'v1', known))[1], 200); }
  e.sqlite.exec("UPDATE free_megaphones SET at = datetime('now', '-10 minutes')");
  assert.equal((await postFreeMega(e, sell, 'v1', known))[0].error, 'daily');
  const list = await listFreeMegas(e, new URLSearchParams());
  assert.equal(list.rows.length, DAILY_MAX + 1);
  assert.ok(list.rows[0].id > list.rows[1].id);
  assert.equal('key' in list.rows[0] || 'reporter' in list.rows[0], false);
  assert.equal((await listFreeMegas(e, new URLSearchParams({ after: String(list.rows[1].id) }))).rows.length, 1);
});

test('only the key deletes a post; three different reporters hide it; old posts stay listed and are never pruned (owner 2026-11-17)', async () => {
  const e = environment();
  const [{ row, key }] = await postFreeMega(e, sell, 'v1', known);
  assert.equal((await deleteFreeMega(e, row.id, 'nope'))[1], 404);
  assert.equal((await reportFreeMega(e, row.id, 'r1'))[0].hidden, false);
  await reportFreeMega(e, row.id, 'r1');
  assert.equal((await reportFreeMega(e, row.id, 'r2'))[0].hidden, false);
  assert.equal((await reportFreeMega(e, row.id, 'r3'))[0].hidden, true);
  assert.equal((await listFreeMegas(e, new URLSearchParams())).rows.length, 0);
  assert.equal((await deleteFreeMega(e, row.id, key))[1], 200);
  const [{ row: old }] = await postFreeMega(e, sell, 'v2', known);
  e.sqlite.exec(`UPDATE free_megaphones SET at = datetime('now', '-25 hours') WHERE id = ${old.id}`);
  assert.equal((await listFreeMegas(e, new URLSearchParams())).rows.length, 1);
  e.sqlite.exec(`UPDATE free_megaphones SET at = datetime('now', '-3 days') WHERE id = ${old.id}`);
  await pruneFreeMegas(e);
  assert.equal(e.sqlite.prepare('SELECT COUNT(*) n FROM free_megaphones').get().n, 1);
});

test('free megaphone names may hold spaces and any letters (GMS Manager)', () => {
  assert.equal(validFreeMega({ ...sell, nick: '  GMS   Manager ' }, known).row.nick, 'GMS Manager');
  assert.equal(validFreeMega({ ...sell, nick: '한글닉' }, known).row.nick, '한글닉');
});

test('a post written while logged in takes trade requests; the list says so without naming the writer', async () => {
  const e = environment();
  const [linked] = await postFreeMega(e, { ...sell, lang: 'en' }, 'v1', known, '123456789012345678');
  const [plain] = await postFreeMega(e, sell, 'v2', known);
  assert.equal(linked.row.dm, 1);
  assert.equal(plain.row.dm, 0);
  assert.equal('owner' in linked.row, false);
  const rows = (await listFreeMegas(e, new URLSearchParams())).rows;
  assert.deepEqual(rows.map((r) => r.dm), [0, 1]);
  assert.ok(rows.every((r) => !('owner' in r) && !('lang' in r)));
  assert.equal(e.sqlite.prepare('SELECT lang FROM free_megaphones WHERE id = ?').get(linked.row.id).lang, 'en');
  // A chat line never keeps a writer: there is nothing to trade.
  const [talk] = await postFreeMega(e, { nick: 'Abc', intent: 'talk', text: '파티 구해요' }, 'v3', known, '123456789012345678');
  assert.equal(talk.row.dm, 0);

  const [ok, status, send] = await requestTrade(e, { id: linked.row.id, nick: 'Hyunoo', channel: 3 }, 'buyer1');
  assert.deepEqual([ok, status], [{ ok: true }, 200]);
  assert.deepEqual(send, { owner: '123456789012345678', post: { id: linked.row.id, nick: 'Hookstk', intent: 'sell', item: 2040801, price: 3000000, lang: 'en' }, nick: 'Hyunoo', channel: 3 });
  // Once per visitor and post; a post without a linked writer, a hidden or missing post and a bad name are refused.
  assert.deepEqual((await requestTrade(e, { id: linked.row.id, nick: 'Hyunoo' }, 'buyer1')).slice(0, 2), [{ error: 'again' }, 409]);
  assert.deepEqual((await requestTrade(e, { id: plain.row.id, nick: 'Hyunoo' }, 'buyer2')).slice(0, 2), [{ error: 'nodm' }, 400]);
  assert.deepEqual((await requestTrade(e, { id: 9999, nick: 'Hyunoo' }, 'buyer2')).slice(0, 2), [{ error: 'gone' }, 404]);
  for (const nick of ['@everyone', 'a', 'discord.gg/x', '']) assert.equal((await requestTrade(e, { id: linked.row.id, nick }, 'buyer3'))[0].error, 'nick', nick);
  assert.equal((await requestTrade(e, { id: linked.row.id, nick: 'Hyunoo', channel: 99 }, 'buyer3'))[0].error, 'channel');
  e.sqlite.exec(`UPDATE free_megaphones SET hidden = 1 WHERE id = ${linked.row.id}`);
  assert.equal((await requestTrade(e, { id: linked.row.id, nick: 'Other' }, 'buyer4'))[0].error, 'gone');
});

test('trade requests are paced: 20 seconds apart and 20 a day per visitor, 30 a day per post', async () => {
  const e = environment();
  const ids = [];
  for (let i = 0; i < REQUEST_DAILY + 1; i++) { ids.push((await postFreeMega(e, sell, `w${i}`, known, '123456789012345678'))[0].row.id); }
  assert.equal((await requestTrade(e, { id: ids[0], nick: 'Hyunoo' }, 'b'))[1], 200);
  assert.deepEqual((await requestTrade(e, { id: ids[1], nick: 'Hyunoo' }, 'b')).slice(0, 2), [{ error: 'slow', wait: 20 }, 429]);
  for (let i = 1; i < REQUEST_DAILY; i++) { e.sqlite.exec("UPDATE free_mega_requests SET at = datetime('now', '-1 minute')"); assert.equal((await requestTrade(e, { id: ids[i], nick: 'Hyunoo' }, 'b'))[1], 200); }
  e.sqlite.exec("UPDATE free_mega_requests SET at = datetime('now', '-1 minute')");
  assert.equal((await requestTrade(e, { id: ids[REQUEST_DAILY], nick: 'Hyunoo' }, 'b'))[0].error, 'daily');
  // One post never passes more than 30 requests a day on to its writer.
  for (let i = 0; i < REQUESTS_PER_POST; i++) e.sqlite.prepare("INSERT OR IGNORE INTO free_mega_requests (post, reporter, nick) VALUES (?, ?, 'Someone')").run(ids[REQUEST_DAILY], `x${i}`);
  assert.equal((await requestTrade(e, { id: ids[REQUEST_DAILY], nick: 'Late' }, 'fresh'))[0].error, 'busy');
  // Requests of deleted posts and requests older than a month are cleared.
  e.sqlite.exec(`DELETE FROM free_megaphones WHERE id = ${ids[0]}`);
  e.sqlite.exec(`UPDATE free_mega_requests SET at = datetime('now', '-31 days') WHERE post = ${ids[1]}`);
  await pruneFreeMegas(e);
  assert.equal(e.sqlite.prepare('SELECT COUNT(*) n FROM free_mega_requests WHERE post IN (?, ?)').get(ids[0], ids[1]).n, 0);
});

test('the writer reads who asked, how to whisper them and a link to the post, in the language they posted in', () => {
  const post = { id: 12, intent: 'sell', item: 1082000, price: 3900000, lang: 'ko' };
  const ko = tradeRequestMessage({ post, nick: 'Hyunoo', channel: 3, name: '노가다 목장갑' });
  assert.match(ko, /거래 신청이 왔어요/);
  assert.match(ko, /`노가다 목장갑` 390만 메소 팝니다 글에 `Hyunoo` 님이 신청했어요 \(CH 3\)/);
  assert.match(ko, /`\/w Hyunoo`/);
  assert.match(ko, /<https:\/\/gms-hub\.com\/ko\/trade\/\?[^>]*#p-12>/);
  const en = tradeRequestMessage({ post: { ...post, intent: 'buy', lang: 'en' }, nick: 'Hy`unoo', channel: null, name: 'Work Gloves' });
  assert.match(en, /`Hy'unoo` asked about your `Work Gloves` 3\.9M mesos buying post\./);
  assert.ok(!en.includes('Hy`unoo'));
  // A small price still reads as money.
  assert.match(tradeRequestMessage({ post: { ...post, price: 450 }, nick: 'Abc', channel: 2, name: '검은색 머리띠' }), /`검은색 머리띠` 450 메소 팝니다 글에/);
  assert.match(en, /gms-hub\.com\/en\/trade\//);
});
