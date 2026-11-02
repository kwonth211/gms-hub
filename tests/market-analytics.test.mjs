import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMarket, priceProfile, HOUR } from '../assets/market-analytics.js';
const now = Date.parse('2026-11-03T00:00:00Z');
const row = (price, hours, sold = false, qty = 1) => ({ price, t: now - hours * HOUR, sold, qty });

test('price bands include every integer edge once and count listings, not bundle quantity', () => {
  const rows = [100, 101, 102, 103, 104, 104, 108].map((p) => row(p, 1, false, 1000));
  const p = priceProfile(rows, 3);
  assert.deepEqual(p.bins, [{ from: 100, to: 102, count: 3 }, { from: 103, to: 105, count: 3 }, { from: 106, to: 108, count: 1 }]);
  assert.equal(p.total, rows.length);
  assert.equal(p.levels.at(-1).cumulative, rows.length);
  assert.deepEqual(p.levels.find((l) => l.price === 104), { price: 104, count: 2, cumulative: 6 });
  for (let i = 1; i < p.levels.length; i++) assert.ok(p.levels[i].cumulative > p.levels[i - 1].cumulative);
});

test('single-price, empty and large-price profiles stay finite and exact', () => {
  assert.equal(priceProfile([]).peak, null);
  assert.deepEqual(priceProfile([row(1e10, 1), row(1e10, 2)]).bins, [{ from: 1e10, to: 1e10, count: 2 }]);
  const p = priceProfile(Array.from({ length: 400 }, (_, i) => row(1 + i * 25000000, 1)));
  assert.ok(p.bins.length <= 8);
  assert.equal(p.bins.reduce((n, b) => n + b.count, 0), 400);
  assert.equal(p.levels.at(-1).cumulative, 400);
});

test('seven-day history includes old observations while depth excludes stale and sold listings', () => {
  const a = analyzeMarket([row(10, 100), row(20, 23), row(30, 2), row(40, 1, true), row(50, 200)], { now, hours: 168 });
  assert.equal(a.rows.length, 4);
  assert.equal(a.profileHours, 24);
  assert.equal(a.profile.total, 2);
  assert.deepEqual(a.profile.levels.map((p) => p.price), [20, 30]);
  const short = analyzeMarket([row(10, 5), row(20, 2)], { now, hours: 6 });
  assert.equal(short.profile.total, 2);
  assert.equal(short.profileHours, 6);
});

test('time boundaries, invalid prices and future observations do not leak into a selected range', () => {
  const a = analyzeMarket([row(100, 1), row(200, .5), row(300, -1), row(0, .2), row(1.5, .1), { price: 2, t: NaN }, row(400, 0)], { now, hours: 1 });
  assert.deepEqual(a.rows.map((r) => r.price), [200, 400]);
  assert.equal(a.buckets.reduce((n, b) => n + b.rows.length, 0), 2);
  const empty = analyzeMarket([row(100, 2)], { now, hours: 1 });
  assert.equal(empty.buckets.length, 0);
  assert.deepEqual(empty.changes, { asking: null, sold: null });
});

test('trend changes keep asking and sold separate, preserve gaps and use interval medians', () => {
  const a = analyzeMarket([row(100, 3), row(300, 3), row(250, 1), row(10, 3, true), row(15, 1, true)], { now });
  assert.equal(a.changes.asking.from, 200);
  assert.equal(a.changes.asking.to, 250);
  assert.equal(a.changes.asking.percent, 25);
  assert.equal(a.changes.sold.percent, 50);
  assert.ok(a.buckets.some((b) => !b.asking && !b.sold));
  assert.equal(a.buckets.filter((b) => b.asking).length, 2);
  assert.equal(analyzeMarket([row(100, 1), row(200, 1)], { now }).changes.asking, null);
});

test('sparse observations fit their actual time span instead of a mostly empty week', () => {
  const a = analyzeMarket([row(100, 1), row(110, 1.1)], { now, hours: 168 });
  assert.ok(a.to - a.from <= HOUR);
  assert.equal(a.buckets.reduce((n, b) => n + b.rows.length, 0), 2);
});
