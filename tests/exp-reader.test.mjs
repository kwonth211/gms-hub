import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExp, sameReading, summarize, levelTotal, EXP_GLYPHS, readExpText } from '../assets/exp-reader.js';

test('parseExp reads the status bar text and rejects nonsense pairs', () => {
  assert.deepEqual(parseExp('83,631[68.13%]'), { exp: 83631, pct: 68.13 });
  assert.deepEqual(parseExp('EXP 1,234,567 [12.34%]'), { exp: 1234567, pct: 12.34 });
  assert.equal(parseExp('83,631'), null);
  // 621 EXP at 2.13% would be a 29k level: fine; 5 EXP at 68% is not a level that exists.
  assert.equal(parseExp('5[68.13%]'), null);
  assert.equal(parseExp('83,631[168.13%]'), null);
});

test('two readings agree only when the numbers match', () => {
  assert.ok(sameReading({ exp: 1, pct: 1 }, { exp: 1, pct: 1 }));
  assert.ok(!sameReading({ exp: 83631, pct: 68.13 }, { exp: 83621, pct: 68.13 }));
});

test('summary gives rate, time to level, and carries EXP across a level-up', () => {
  const a = { t: 0, exp: 83631, pct: 68.13 }, b = { t: 1800000, exp: 112400, pct: 91.56 };
  const s = summarize([a, b], { now: 1800000 });
  assert.equal(s.gained, 28769);
  assert.equal(Math.round(s.perHour), 57538);
  assert.equal(levelTotal(b), 122761);
  assert.ok(s.toLevelMs > 600000 && s.toLevelMs < 700000);
  // Level-up: 10,361 left in the old level plus 4,000 into the new one.
  const c = { t: 3600000, exp: 4000, pct: 3.0 };
  const s2 = summarize([a, b, c], { now: 3600000 });
  assert.equal(s2.gained, 28769 + 10361 + 4000);
  assert.equal(s2.levels, 1);
});

test('idle stretches are left out of the hourly rate when asked', () => {
  const samples = [{ t: 0, exp: 1000, pct: 10 }, { t: 600000, exp: 2000, pct: 20 }, { t: 1800000, exp: 2000, pct: 20 }, { t: 2400000, exp: 3000, pct: 30 }];
  const on = summarize(samples, { now: 2400000, skipIdle: true });
  const off = summarize(samples, { now: 2400000, skipIdle: false });
  assert.equal(on.idle, 1200000);
  assert.ok(on.perHour > off.perHour);
});

test('the glyph table maps every digit', () => {
  const digits = new Set(Object.values(EXP_GLYPHS).filter((c) => /\d/.test(c)));
  assert.equal(digits.size, 10);
});

// A status-bar line drawn from the glyph table at several screen scales reads back exactly: the digits' own height
// sets the scale, so a gauge measured a row off, or a non-integer scale, does not break the bitmaps.
test('glyph reading is exact at whole and fractional screen scales', async () => {
  const chars = Object.fromEntries(Object.entries(EXP_GLYPHS).map(([k, v]) => [v, k.split('/')]));
  const text = '83,631[68.13%]';
  for (const s of [1, 2, 3, 1.25, 1.5, 2.5]) {
    const W = Math.ceil(160 * s), H = Math.ceil(16 * s);
    const data = new Uint8ClampedArray(W * H * 4).fill(0);
    const img = { width: W, height: H, data };
    const put = (x, y) => { for (let yy = Math.floor(y * s); yy < Math.floor((y + 1) * s); yy++) for (let xx = Math.floor(x * s); xx < Math.floor((x + 1) * s); xx++) { const i = (yy * W + xx) * 4; data[i] = data[i + 1] = data[i + 2] = 240; data[i + 3] = 255; } };
    let x = 12;
    for (const ch of text) {
      const rows = chars[ch];
      const top = ch === '.' ? 10 : ch === ',' ? 9 : 4;
      rows.forEach((row, dy) => [...row].forEach((b, dx) => { if (b === '#') put(x + dx, top + dy); }));
      x += rows[0].length + 1;
    }
    const box = { x0: 0, x1: W, y0: 0, y1: H };
    const got = await readExpText(img, box, { barH: 6 * s + 1 }, { learned: new Map() });
    assert.equal(got, text, `scale ${s}`);
  }
});
