import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { validFreeMega, postFreeMega, listFreeMegas, deleteFreeMega, reportFreeMega, pruneFreeMegas, DAILY_MAX } from '../worker/src/free-mega.js';

function environment() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(new URL('../worker/migrations/0020_free_megaphones.sql', import.meta.url), 'utf8'));
  const DB = { prepare(sql, args = []) { return { bind(...a) { return DB.prepare(sql, a); }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; } }; } };
  return { DB, sqlite };
}
const known = new Set([2040801]);
const sell = { nick: 'Hookstk', intent: 'sell', item: 2040801, price: '300만', text: '1개 급처', channel: 3 };

test('a trade post needs a game-style name, an item or a few words, and keeps links, cash talk and slurs out', () => {
  assert.deepEqual(validFreeMega(sell, known).row, { nick: 'Hookstk', intent: 'sell', item: 2040801, price: 3000000, text: '1개 급처', channel: 3 });
  assert.equal(validFreeMega({ ...sell, text: '' }, known).row.item, 2040801);
  for (const [change, code] of [[{ nick: '한글닉' }, 'nick'], [{ nick: 'a' }, 'nick'], [{ intent: 'trade' }, 'intent'], [{ item: 999 }, 'item'],
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

test('only the key deletes a post; three different reporters hide it; old posts leave the list and are pruned', async () => {
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
  assert.equal((await listFreeMegas(e, new URLSearchParams())).rows.length, 0);
  e.sqlite.exec(`UPDATE free_megaphones SET at = datetime('now', '-3 days') WHERE id = ${old.id}`);
  await pruneFreeMegas(e);
  assert.equal(e.sqlite.prepare('SELECT COUNT(*) n FROM free_megaphones').get().n, 0);
});
