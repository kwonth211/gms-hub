import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExp, sameReading, summarize, levelTotal, EXP_GLYPHS, readExpText, readSmeared, levelTiles, findGauges, expTextBox, levelBox, inkImage } from '../assets/exp-reader.js';

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

// A frame enlarged with smoothing (full screen, display scaling): the exact table fails, the best fit still reads it.
test('a smoothly enlarged status bar is read, and never as another number', () => {
  const chars = Object.fromEntries(Object.entries(EXP_GLYPHS).reverse().map(([k, v]) => [v, k.split('/')]));
  const W = 300, H = 30, top = 22, expX0 = 30;
  for (const text of ['7,099[64.30%]', '18,487,446[80.96%]', '15,458[3.03%]', '123,328[98.71%]']) {
    const lum = new Float64Array(W * H).fill(30);
    let x = expX0 + 31;
    for (const ch of text) {
      const wide = ',.[]'.includes(ch) ? 1 : 0, rows = chars[ch], t = ch === ',' || ch === '.' ? 6 : 0;
      x += wide;
      rows.forEach((row, dy) => [...row].forEach((b, dx) => { if (b === '#') lum[(top - 13 + t + dy) * W + x + dx] = 240; }));
      x += rows[0].length + 1 + wide;
    }
    for (const z of [1.1, 1.25, 1.5, 2]) {
      const w = Math.round(W * z), h = Math.round(H * z), data = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
        const sx = Math.max(0, (xx + 0.5) / z - 0.5), sy = Math.max(0, (y + 0.5) / z - 0.5), ix = Math.min(W - 2, Math.floor(sx)), iy = Math.min(H - 2, Math.floor(sy)), fx = Math.min(1, sx - ix), fy = Math.min(1, sy - iy);
        const v = (lum[iy * W + ix] * (1 - fx) + lum[iy * W + ix + 1] * fx) * (1 - fy) + (lum[(iy + 1) * W + ix] * (1 - fx) + lum[(iy + 1) * W + ix + 1] * fx) * fy;
        const o = (y * w + xx) * 4; data[o] = data[o + 1] = data[o + 2] = v; data[o + 3] = 255;
      }
      const got = readSmeared({ width: w, height: h, data }, { pitch: 108 * z, expX0: Math.round(expX0 * z), top: Math.round(top * z), barH: Math.round(6 * z) });
      if (got !== null) assert.equal(got, text.replace(/,/g, ''), `${text} x${z}`);
      if (z > 1.1) assert.ok(got, `${text} x${z} read`);
    }
  }
});

test('each level tile is its own box', () => {
  const W = 40, H = 14, data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (const [a, b] of [[2, 13], [14, 25]]) for (let x = a; x < b; x++) { const i = (y * W + x) * 4; data[i] = 240; data[i + 1] = 130; data[i + 2] = 40; }
  assert.deepEqual(levelTiles({ width: W, height: H, data }, { x0: 2, x1: 25, y0: 0, y1: H, s: 1 }).map((t) => [t.x0, t.x1]), [[2, 13], [14, 25]]);
});

// Frames as a visitor's browser really delivers them (Chrome window share, 2026-11-24): compressed colours, smeared edges.
// Raw pixels, so this never depends on a decoder that may be missing (the PNG capture test is skipped without pngjs).
for (const [name, width, height] of [['exp-share-7099', 620, 106], ['exp-share-7099-x1.5', 930, 159]]) test(`a real shared frame reads 7,099 [64.30%] (${name})`, async () => {
  const data = new Uint8ClampedArray(gunzipSync(readFileSync(new URL(`./fixtures/${name}.rgba.gz`, import.meta.url))));
  const img = { width, height, data }, g = findGauges(img);
  assert.ok(g, 'gauges');
  const text = await readExpText(img, expTextBox(g, img), g);
  assert.deepEqual(parseExp(text) || parseExp(readSmeared(img, g)), { exp: 7099, pct: 64.3 });
  const lv = levelBox(img, g), tiles = levelTiles(img, lv);
  assert.equal(tiles.length, 2);
  // Both digits leave ink on their own tile (the 7 vanished under the tinted edge before).
  for (const t of tiles) assert.ok(inkImage(img, t, 1, { onTile: true }).data.filter((v, i) => i % 4 === 0 && v === 0).length >= 10);
});
