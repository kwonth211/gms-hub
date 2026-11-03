import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseJob, parseValue, readLayout, rescale, vote } from '../assets/stat-reader.js';

// pngjs comes with the scan tools (scripts/scan-tools); without it the image tests are skipped.
let PNG = null;
try {
  PNG = createRequire(new URL('../scripts/scan-tools/package.json', import.meta.url))('pngjs').PNG;
} catch {}
const fixture = () => PNG.sync.read(readFileSync(new URL('./fixtures/stat-window.png', import.meta.url)));
const KEYS = ['str', 'dex', 'int', 'luk', 'level', 'job', 'attack', 'magic', 'acc'];

// Nearest-neighbour enlargement, what an integer Retina or 200% capture produces.
function enlarge(img, k) {
  const w = img.width * k;
  const h = img.height * k;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data.set(img.data.subarray(((Math.floor(y / k) * img.width) + Math.floor(x / k)) * 4, ((Math.floor(y / k) * img.width) + Math.floor(x / k)) * 4 + 4), (y * w + x) * 4);
  return { width: w, height: h, data };
}

test('finds every stat box in a real stat window, in order', { skip: !PNG }, () => {
  const L = readLayout(fixture());
  for (const k of KEYS) assert.ok(L[k], `missing ${k}`);
  assert.ok(L.str.y0 < L.dex.y0 && L.dex.y0 < L.int.y0 && L.int.y0 < L.luk.y0);
  assert.ok(L.attack.y0 < L.magic.y0 && L.magic.y0 < L.acc.y0);
  assert.ok(L.attack.x0 > L.str.x0, 'detail panel sits right of the main panel');
});

test('the same boxes are found on 2x and 3x captures', { skip: !PNG }, () => {
  const base = readLayout(fixture());
  for (const k of [2, 3]) {
    const L = readLayout(enlarge(fixture(), k));
    for (const key of KEYS) assert.ok(Math.abs(L[key].y0 - base[key].y0 * k) <= k * 2, `${key} at ${k}x`);
  }
});

test('rescale averages blocks back to the original pixels', { skip: !PNG }, () => {
  const img = fixture();
  const back = rescale(enlarge(img, 2), 2);
  assert.equal(back.width, img.width);
  const i = (40 * img.width + 60) * 4;
  assert.deepEqual([...back.data.subarray(i, i + 3)], [...img.data.subarray(i, i + 3)]);
});

test('value text parsing and voting', () => {
  assert.deepEqual(parseValue('attack', '22 - 30\n'), [22, 30]);
  assert.equal(parseValue('int', ' 157 '), 157);
  assert.equal(parseValue('level', 'l3'), 13);
  assert.equal(vote([157, 167, 157, null]), 157);
  assert.deepEqual(vote([[22, 30], null, [22, 30], [27, 30]]), [22, 30]);
  assert.equal(parseJob('MAGICIAN\nWIZARD-ICE/LIGHTNING')[1], 'il');
  assert.equal(parseJob('WARRIOR\nSPEARMAN')[1], 'spearman');
});
