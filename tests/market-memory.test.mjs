import test from 'node:test';
import assert from 'node:assert/strict';
import { addRecent, removeRecent, toggleWishlist, visitDelta, snapshot, pruneSeen, readList, RECENT_MAX, WISHLIST_MAX } from '../assets/market-memory.js';

const HOUR = 3600000;

test('recent items: reopening moves to the front without a duplicate, list stays bounded, bad ids are ignored', () => {
  let list = [];
  for (let i = 0; i < RECENT_MAX + 5; i++) list = addRecent(list, 2040801 + i);
  assert.equal(list.length, RECENT_MAX);
  assert.equal(list[0], 2040801 + RECENT_MAX + 4);
  list = addRecent(list, 2040801 + RECENT_MAX);
  assert.equal(list[0], 2040801 + RECENT_MAX);
  assert.equal(new Set(list).size, list.length);
  assert.deepEqual(addRecent(list, 12), list);
  assert.deepEqual(addRecent(list, NaN), list);
  assert.ok(!removeRecent(list, list[0]).includes(list[0]));
  assert.deepEqual(readList('garbage'), []);
  assert.deepEqual(readList('[1372002, "x", 5]'), [1372002]);
});

test('wishlist refuses to grow past the cap but always allows removal', () => {
  const set = new Set();
  for (let i = 0; i < WISHLIST_MAX; i++) assert.equal(toggleWishlist(set, 1300000 + i).added, true);
  assert.deepEqual(toggleWishlist(set, 1400000), { ok: false, reason: 'full', added: false });
  assert.equal(set.size, WISHLIST_MAX);
  assert.deepEqual(toggleWishlist(set, 1300000), { ok: true, added: false });
  assert.equal(toggleWishlist(set, 1400000).added, true);
  assert.equal(toggleWishlist(set, 1).ok, false);
});

test('since-last-visit delta only exists with an earlier visit, both medians and enough listings on both sides', () => {
  const now = Date.now();
  const cur = snapshot({ median: 110, open: 5 }, now);
  assert.equal(visitDelta(null, cur, now), null, 'first visit');
  assert.equal(visitDelta(snapshot({ median: 100, open: 5 }, now - 20 * 60000), cur, now), null, 'a refresh within the hour is not a return');
  assert.equal(visitDelta(snapshot({ median: null, open: 5 }, now - 3 * HOUR), cur, now), null, 'no previous median');
  assert.equal(visitDelta(snapshot({ median: 100, open: 2 }, now - 3 * HOUR), cur, now), null, 'too few listings before');
  assert.equal(visitDelta(snapshot({ median: 100, open: 5 }, now - 3 * HOUR), snapshot({ median: 90, open: 1 }, now), now), null, 'too few listings now');
  assert.equal(visitDelta(snapshot(null, now - 3 * HOUR), cur, now), null, 'item had no summary last time');
  assert.deepEqual(visitDelta(snapshot({ median: 100, open: 5 }, now - 3 * HOUR), cur, now), { since: now - 3 * HOUR, from: 100, to: 110, pct: 10 });
  assert.equal(visitDelta(snapshot({ median: 100, open: 5 }, now - 3 * HOUR), snapshot({ median: 100, open: 3 }, now), now).pct, 0);
});

test('snapshots are kept only for items still in the wishlist or recent list', () => {
  const seen = { 1: { t: 1, m: 1, o: 1 }, 2: { t: 2, m: 2, o: 2 }, 3: { t: 3, m: 3, o: 3 } };
  assert.deepEqual(Object.keys(pruneSeen(seen, [2, 3, 9])), ['2', '3']);
});
