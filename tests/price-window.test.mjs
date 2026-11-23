import test from 'node:test';
import assert from 'node:assert/strict';
import { recentSummary } from '../worker/src/index.js';

const at = (now, hours) => new Date(now - hours * 3600000).toISOString().slice(0, 19).replace('T', ' ');
const now = Date.parse('2026-11-23T04:00:00Z');
const row = (price, kind, hours) => ({ price, kind, created_at: at(now, hours) });

test('headline price follows the last 24 hours when it has enough trades', () => {
  const rows = [row(15000, 'sold', 2), row(15500, 'sold', 5), row(14500, 'sold', 20),
    ...Array.from({ length: 20 }, (_, i) => row(25000, 'sold', 48 + i * 10))];
  const s = recentSummary(rows, now);
  assert.equal(s.window, '24h');
  assert.equal(s.median, 15000);
});

test('thin items widen to 3 days, then to the full window', () => {
  const three = recentSummary([row(100, 'sold', 30), row(110, 'sold', 40), row(120, 'sold', 50), row(999, 'sold', 200)], now);
  assert.equal(three.window, '3d');
  assert.equal(three.median, 110);
  const full = recentSummary([row(100, 'selling', 5), row(200, 'selling', 200)], now);
  assert.equal(full.window, '14d');
});
