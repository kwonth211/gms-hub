// Builds data/shop-glyphs.json, the bitmap-font table the shop reader uses, from frames in ~/gms-hub-samples.
// Each shop row is read once with Tesseract; the item list then fixes the exact spelling, and when the number of letters
// matches the number of glyphs every glyph gets its letter. Rows that don't line up are skipped, so OCR mistakes never
// enter the table. Run: cd scripts/scan-tools && npm i && node learn-glyphs.mjs
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { createWorker } from 'tesseract.js';
import { findShopRows, glyphs, lineImage, mapColumns, matchItem, ownerGlyphs, parsePriceLine, readLine, readOwner, titleKey } from '../../assets/shop-reader.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const samples = path.join(homedir(), 'gms-hub-samples');
const out = path.join(root, 'data/shop-glyphs.json');
const items = JSON.parse(readFileSync(path.join(root, 'data/items.json'), 'utf8')).items;
const saved = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {};
const table = saved.glyphs || {};
const map = saved.map?.rooms ? saved.map : { prefix: [], rooms: {} };
// Columns of "Free M" that every room title starts with.
const PREFIX_COLS = 30;

const votes = {};

const worker = await createWorker('eng');
await worker.setParameters({ tessedit_pageseg_mode: '7' });
const ocr = async (im) => {
  const p = new PNG({ width: im.width, height: im.height });
  p.data = Buffer.from(im.data);
  return (await worker.recognize(PNG.sync.write(p))).data.text.trim();
};

// Some letter pairs ("st") touch with no blank column and come out as one shape. When exactly one shape is left after
// pairing known shapes from both ends, it is learned as the multi-letter string between them.
function learn(gs, truth, into = votes, known = table) {
  const shapes = gs.filter((g) => g !== ' ');
  const letters = [...truth.replace(/\s+/g, '')];
  const vote = (g, text) => {
    into[g] ||= {};
    into[g][text] = (into[g][text] || 0) + 1;
  };
  if (shapes.length === letters.length) {
    shapes.forEach((g, i) => vote(g, letters[i]));
    return true;
  }
  if (shapes.length > letters.length) return false;
  let a = 0;
  while (a < shapes.length && known[shapes[a]] === letters[a]) a++;
  let b = 0;
  while (b < shapes.length - a && known[shapes[shapes.length - 1 - b]] === letters[letters.length - 1 - b]) b++;
  const middle = shapes.length - a - b;
  if (middle !== 1) {
    // Fall back to splitting widths evenly is too risky; also accept the case where all shapes but one are new but the
    // only width outlier is the merged one.
    const widths = shapes.map((g) => g.split('.').length);
    const extra = letters.length - shapes.length;
    if (extra !== 1) return false;
    const widest = widths.indexOf(Math.max(...widths));
    shapes.forEach((g, i) => vote(g, i < widest ? letters[i] : i === widest ? letters[i] + letters[i + 1] : letters[i + 1]));
    return true;
  }
  shapes.forEach((g, i) => vote(g, i < a ? letters[i] : i === a ? letters.slice(a, letters.length - b).join('') : letters[letters.length - (shapes.length - i)]));
  return true;
}

// Crop any light-on-dark text band into the black-on-white image Tesseract wants.
function bandImage(img, x0, x1, y0, h, test, scale = 4, pad = 0) {
  const w = x1 - x0;
  const W = w * scale + pad * 2;
  const H = h * scale + pad * 2;
  const out = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(255) };
  for (let y = 0; y < h * scale; y++)
    for (let x = 0; x < w * scale; x++) {
      const si = ((y0 + Math.floor(y / scale)) * img.width + x0 + Math.floor(x / scale)) * 4;
      const v = test((img.data[si] + img.data[si + 1] + img.data[si + 2]) / 3) ? 0 : 255;
      const di = ((y + pad) * W + x + pad) * 4;
      out.data[di] = out.data[di + 1] = out.data[di + 2] = v;
    }
  return out;
}

// The minimap title area in its default top-left spot; sky behind other parts of the screen is as bright as the text.
const MAP_X0 = 48;
const MAP_X1 = 160;

// Light text lines in the minimap title; the band starts 5px above the first lit row, matching how
// the reader scans.
function lightLines(img) {
  const lines = [];
  let top = -1;
  for (let y = 0; y < Math.min(img.height, 400); y++) {
    let lit = 0;
    for (let x = MAP_X0; x < MAP_X1; x++) {
      const i = (y * img.width + x) * 4;
      if ((img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3 > 225) lit++;
    }
    // The minimap frame keeps a few columns lit on every row; text rows light up more than that.
    const on = lit > 8 && lit < 60;
    if (on && top < 0) top = y;
    if (!on && top >= 0) {
      if (y - top >= 6 && y - top <= 12) lines.push(top - 5);
      top = -1;
    }
  }
  return lines;
}

// The list shortens long names to fit; the truth for those is the name's start plus "...".
function nameTruth(read, item, shapeCount) {
  if (!/\.{2,}\s*$/.test(read)) return item.en;
  const letters = [...item.en];
  let n = 0;
  let k = 0;
  while (k < letters.length && n < shapeCount - 3) if (letters[k++] !== ' ') n++;
  return letters.slice(0, k).join('').trimEnd() + '...';
}

const seen = new Set();
let rowsUsed = 0;
let lines = 0;
for (const f of readdirSync(samples).filter((f) => f.endsWith('.png')).sort()) {
  const img = PNG.sync.read(readFileSync(path.join(samples, f)));
  const all = findShopRows(img);
  const listTop = all.length ? Math.min(...all.map((r) => r.top)) : 0;
  for (const row of all) {
    // Rows caught mid-scroll sit a pixel or two off the 40px grid; their shapes are distorted and must not be learned.
    const off = (row.top - listTop) % 40;
    if (off !== 0 && !(off === 1 && row.top === Math.max(...all.map((r) => r.top)))) continue;
    const nameG = glyphs(img, row, 0);
    const priceG = glyphs(img, row, 1);
    const key = nameG.join('|') + '#' + priceG.join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    rowsUsed++;
    const read = await ocr(lineImage(img, row, 0));
    const match = matchItem(read, items);
    if (match && match.confidence >= 0.85) lines += learn(nameG, nameTruth(read, match.item, nameG.filter((g) => g !== ' ').length));
    const p = parsePriceLine(await ocr(lineImage(img, row, 1)));
    if (p) lines += learn(priceG, `${p.qty} for ${p.price.toLocaleString('en')} mesos`);
  }
  const rows = findShopRows(img);
  if (rows.length) {
    const top = Math.min(...rows.map((r) => r.top));
    const x0 = rows[0].x0;
    const ownerKey = 'owner#' + ownerGlyphs(img, top, x0).join('|');
    if (!seen.has(ownerKey)) {
      seen.add(ownerKey);
      // Owner names are free text, so Tesseract is only trusted where it agrees with every letter the table already reads.
      const gs = ownerGlyphs(img, top, x0);
      const partial = readOwner(img, top, x0, table);
      const name = (await ocr(bandImage(img, x0 + 10, x0 + 92, top - 21, 17, (l) => l > 180))).replace(/[^A-Za-z0-9]/g, '');
      const fits = new RegExp('^' + partial.replace(/[^A-Za-z0-9?]/g, '').replace(/\?/g, '([A-Za-z0-9]{1,3})') + '$');
      if (name.length >= 3 && fits.test(name)) lines += learn(gs, name);
    }
  }
  for (const y0 of lightLines(img)) {
    const cols = mapColumns(img, MAP_X0, MAP_X1, y0);
    const start = cols.findIndex((c) => c);
    if (start < 0) continue;
    const title = titleKey(cols, start);
    const key = 'map#' + title;
    if (seen.has(key)) continue;
    seen.add(key);
    // Tesseract misreads this small outlined font often, so the room number has to come out the same in at least two of
    // three crops. Only the leading glyphs are labelled; the minimap frame after the text is left alone.
    const reads = [];
    for (const scale of [3, 4, 5]) {
      // Just the text rows plus a white margin; the empty band rows around them throw Tesseract off.
      const text = (await ocr(bandImage(img, MAP_X0, MAP_X1 - 4, y0 + 3, 13, (l) => l > 225, scale, 8))).replace(/\s+/g, '');
      const m = text.match(/Fre[ea]Mark[a-z]*[<(]?(\d{1,2})/i);
      if (m) reads.push(m[1]);
    }
    const room = reads.find((r) => reads.filter((x) => x === r).length >= 2);
    if (room) {
      if (!map.prefix.length) map.prefix = cols.slice(start, start + PREFIX_COLS);
      map.rooms[title] = Number(room);
      lines++;
    }
  }
}
await worker.terminate();

let conflicts = 0;
for (const [into, from] of [[table, votes]])
  for (const [g, v] of Object.entries(from)) {
    const [best, n] = Object.entries(v).sort((a, b) => b[1] - a[1])[0];
    if (Object.keys(v).length > 1) {
      conflicts++;
      if (process.env.DEBUG) console.log("conflict", JSON.stringify(v));
    }
    if (!into[g] || n > 1) into[g] = best;
  }
writeFileSync(out, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), glyphs: table, map }) + '\n');
console.log(`rooms known: ${[...new Set(Object.values(map.rooms))].sort((a, b) => a - b).join(', ') || 'none'}`);
const letters = [...new Set(Object.values(table))].sort().join('');
console.log(`${rowsUsed} distinct rows, ${lines} lines learned, ${Object.keys(table).length} glyphs (${conflicts} conflicting) -> ${letters}`);

// Re-read every row with the table alone to show what the browser will get.
for (const f of readdirSync(samples).filter((f) => f.endsWith('.png')).sort().slice(-1)) {
  const img = PNG.sync.read(readFileSync(path.join(samples, f)));
  const rows = findShopRows(img);
  if (rows.length) console.log(`owner: ${readOwner(img, Math.min(...rows.map((r) => r.top)), rows[0].x0, table)}`);
  for (const row of rows) console.log(`${row.sold ? 'SOLD ' : '     '}${readLine(img, row, 0, table)} | ${readLine(img, row, 1, table)}`);
}
