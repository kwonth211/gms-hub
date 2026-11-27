import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { findRoom } from '../assets/shop-reader.js';

// The Free Market room is read off the minimap title digit by digit (assets/shop-reader.js roomByTitle). Until
// 2026-11-25 only titles someone had captured were known (room 10), so every other room came back "unknown".
const map = JSON.parse(readFileSync(new URL('../data/shop-glyphs.json', import.meta.url))).map;
const FW = 176, FH = 48;
const corner = (room) => ({ width: FW, height: FH, data: new Uint8ClampedArray(gunzipSync(readFileSync(new URL(`./fixtures/fm-title-${room}.rgba.gz`, import.meta.url)))) });
// A game-sized dark frame with the minimap corner where the game puts it (or anywhere else).
function frame(piece, x = 36, y = 44, W = 640, H = 300) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = 40; data[i + 1] = 44; data[i + 2] = 52; data[i + 3] = 255; }
  for (let yy = 0; yy < piece.height; yy++) for (let xx = 0; xx < piece.width; xx++) for (let c = 0; c < 4; c++) data[((y + yy) * W + x + xx) * 4 + c] = piece.data[(yy * piece.width + xx) * 4 + c];
  return { width: W, height: H, data };
}
// What a screen does when it enlarges the game and the browser brings it back: every pixel smeared over its neighbours.
function resample(img, w, h) {
  const out = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }, sx = img.width / w, sy = img.height / h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
    let v = 0, n = 0;
    if (sx < 1) {
      const fx = Math.max(0, (x + 0.5) * sx - 0.5), fy = Math.max(0, (y + 0.5) * sy - 0.5), ix = Math.min(img.width - 2, Math.floor(fx)), iy = Math.min(img.height - 2, Math.floor(fy)), tx = Math.min(1, fx - ix), ty = Math.min(1, fy - iy);
      const at = (px, py) => img.data[(py * img.width + px) * 4 + c];
      v = (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty; n = 1;
    } else for (let py = Math.floor(y * sy); py < Math.ceil((y + 1) * sy); py++) for (let px = Math.floor(x * sx); px < Math.ceil((x + 1) * sx); px++) {
      const wt = (Math.min(px + 1, (x + 1) * sx) - Math.max(px, x * sx)) * (Math.min(py + 1, (y + 1) * sy) - Math.max(py, y * sy));
      v += img.data[(Math.min(img.height - 1, py) * img.width + Math.min(img.width - 1, px)) * 4 + c] * wt; n += wt;
    }
    out.data[(y * w + x) * 4 + c] = v / n;
  }
  return out;
}

test('real minimap titles read as their room, wherever the minimap sits', () => {
  for (const room of [7, 8, 10]) {
    assert.equal(findRoom(frame(corner(room)), map), room, `room ${room}`);
    assert.equal(findRoom(frame(corner(room), 301, 170), map), room, `room ${room}, minimap moved`);
  }
});

test('a title the screen enlarged and smoothed still reads, and never as another room', () => {
  for (const room of [7, 8, 10]) {
    const f = frame(corner(room));
    let read = 0;
    for (const z of [1.125, 1.25, 1.5, 1.75, 2]) {
      const back = resample(resample(f, Math.round(f.width * z), Math.round(f.height * z)), f.width, f.height);
      const got = findRoom(back, map, true);
      assert.ok(got === room || got === 0, `room ${room} x${z} read as ${got}`);
      if (got === room) read++;
    }
    assert.ok(read >= 4, `room ${room}: ${read} of 5 enlarged frames read`);
  }
});

test('every room number from 1 to 22 reads back from a title drawn with the stored pieces', () => {
  const t = map.title, cut = (hex, w) => ({ w, px: [...hex].map((c) => parseInt(c, 16) / 15) });
  const pre = cut(t.prefix.px, t.prefix.w);
  for (let room = 1; room <= 22; room++) {
    const W = 320, H = 120, data = new Uint8ClampedArray(W * H * 4);
    // The minimap bar: its blue, with the white strokes laid over it.
    for (let i = 0; i < data.length; i += 4) { data[i] = 149; data[i + 1] = 177; data[i + 2] = 196; data[i + 3] = 255; }
    const put = (piece, x0, y0) => { for (let y = 0; y < t.h; y++) for (let x = 0; x < piece.w; x++) { const a = piece.px[y * piece.w + x], i = ((y0 + y) * W + x0 + x) * 4; for (const [c, bar] of [[0, 149], [1, 177], [2, 196]]) data[i + c] = Math.max(data[i + c], bar + (255 - bar) * a); } };
    put(pre, 60, 40);
    [...`${room}>`].forEach((ch, k) => put(cut(t.glyphs[ch], t.cell), 60 + pre.w + k * t.adv, 40));
    assert.equal(findRoom({ width: W, height: H, data }, map), room, `room ${room}`);
  }
});

test('no Free Market title on screen reads as nothing', () => {
  const W = 640, H = 300, noise = new Uint8ClampedArray(W * H * 4);
  for (let i = 0, s = 7; i < noise.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; noise[i] = i % 4 === 3 ? 255 : s >> 16; }
  assert.equal(findRoom({ width: W, height: H, data: noise }, map), null);
  // White upright strokes of the right height that are not the title (a list of names, a window edge).
  const bars = new Uint8ClampedArray(W * H * 4).fill(255);
  for (let i = 0; i < bars.length; i += 4) { bars[i] = 60; bars[i + 1] = 70; bars[i + 2] = 90; }
  for (let k = 0; k < 20; k++) for (let y = 30; y < 39; y++) for (let x = 20 + k * 24; x < 22 + k * 24; x++) { const i = (y * W + x) * 4; bars[i] = bars[i + 1] = bars[i + 2] = 255; }
  assert.equal(findRoom({ width: W, height: H, data: bars }, map), null);
});

// A game window the screen shrank (or a share Chrome reduced) comes back to game size smoothed: the white strokes turn grey
// and touch the bar. From 2026-11-27 such titles are found with a lower stroke cut-off and softened pieces, and an
// unclear cell is settled by weighing whole room numbers. Real and drawn titles at 13 scales: never another room.
test('shrunk and enlarged titles read as their room or as unknown, never as another room', () => {
  const t = map.title, cut = (hex, w) => ({ w, px: [...hex].map((c) => parseInt(c, 16) / 15) }), pre = cut(t.prefix.px, t.prefix.w);
  const drawn = (room) => {
    const W = 320, H = 120, data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < data.length; i += 4) { data[i] = 149; data[i + 1] = 177; data[i + 2] = 196; data[i + 3] = 255; }
    const put = (piece, x0, y0) => { for (let y = 0; y < t.h; y++) for (let x = 0; x < piece.w; x++) { const a = piece.px[y * piece.w + x], i = ((y0 + y) * W + x0 + x) * 4; for (const [c, bar] of [[0, 149], [1, 177], [2, 196]]) data[i + c] = Math.max(data[i + c], bar + (255 - bar) * a); } };
    put(pre, 60, 40);
    [...`${room}>`].forEach((ch, k) => put(cut(t.glyphs[ch], t.cell), 60 + pre.w + k * t.adv, 40));
    return { width: W, height: H, data };
  };
  const cases = [...[7, 8, 10].map((r) => [r, frame(corner(r))]), ...Array.from({ length: 22 }, (_, i) => [i + 1, drawn(i + 1)])];
  let read = 0, total = 0;
  for (const [room, f] of cases) for (const z of [0.6, 0.67, 0.72, 0.75, 0.8, 0.85, 0.9, 0.95, 1.125, 1.25, 1.5, 1.75, 2]) for (const ph of [0, 1]) {
    const back = resample(resample(f, Math.round(f.width * z) + ph, Math.round(f.height * z) + ph), f.width, f.height);
    const got = findRoom(back, map, true);
    assert.ok(got === room || got === 0, `room ${room} x${z} read as ${got}`);
    total++; if (got === room) read++;
  }
  // 509 of 650 before this change; 639 after.
  assert.ok(read >= 620, `${read} of ${total} read`);
});
