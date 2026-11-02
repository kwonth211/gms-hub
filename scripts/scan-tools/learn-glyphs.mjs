// Builds data/shop-glyphs.json, the bitmap-font table the shop reader uses, from frames in ~/gms-hub-samples.
// Each shop row is read once with Tesseract; the item list then fixes the exact spelling, and when the number of letters
// matches the number of glyphs every glyph gets its letter. Rows that don't line up are skipped, so OCR mistakes never
// enter the table. Run: cd scripts/scan-tools && npm i && node learn-glyphs.mjs
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { createWorker } from 'tesseract.js';
import { findShopRows, glyphs, lineImage, matchItem, parsePriceLine, readLine } from '../../assets/shop-reader.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const samples = path.join(homedir(), 'gms-hub-samples');
const out = path.join(root, 'data/shop-glyphs.json');
const items = JSON.parse(readFileSync(path.join(root, 'data/items.json'), 'utf8')).items;
const table = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')).glyphs : {};
const votes = {};

const worker = await createWorker('eng');
await worker.setParameters({ tessedit_pageseg_mode: '7' });
const ocr = async (im) => {
  const p = new PNG({ width: im.width, height: im.height });
  p.data = Buffer.from(im.data);
  return (await worker.recognize(PNG.sync.write(p))).data.text.trim();
};

function learn(gs, truth) {
  const shapes = gs.filter((g) => g !== ' ');
  const letters = [...truth.replace(/\s+/g, '')];
  if (shapes.length !== letters.length) return false;
  shapes.forEach((g, i) => {
    votes[g] ||= {};
    votes[g][letters[i]] = (votes[g][letters[i]] || 0) + 1;
  });
  return true;
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
  for (const row of findShopRows(img)) {
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
}
await worker.terminate();

let conflicts = 0;
for (const [g, v] of Object.entries(votes)) {
  const [best, n] = Object.entries(v).sort((a, b) => b[1] - a[1])[0];
  if (Object.keys(v).length > 1) conflicts++;
  if (!table[g] || n > 1) table[g] = best;
}
writeFileSync(out, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), glyphs: table }) + '\n');
const letters = [...new Set(Object.values(table))].sort().join('');
console.log(`${rowsUsed} distinct rows, ${lines} lines learned, ${Object.keys(table).length} glyphs (${conflicts} conflicting) -> ${letters}`);

// Re-read every row with the table alone to show what the browser will get.
for (const f of readdirSync(samples).filter((f) => f.endsWith('.png')).sort().slice(-1)) {
  const img = PNG.sync.read(readFileSync(path.join(samples, f)));
  for (const row of findShopRows(img)) console.log(`${row.sold ? 'SOLD ' : '     '}${readLine(img, row, 0, table)} | ${readLine(img, row, 1, table)}`);
}
