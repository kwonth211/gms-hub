// Reads Free Market shop windows out of a game screenshot. Works on plain RGBA image objects ({ width, height, data }) so the
// same code runs in the browser scanner and in Node tests against saved samples. Text recognition itself is pluggable: callers
// pass the cropped line images to an OCR engine and hand the strings back to parseRow.

const near = (d, i, [r, g, b], tol) => Math.abs(d[i] - r) <= tol && Math.abs(d[i + 1] - g) <= tol && Math.abs(d[i + 2] - b) <= tol;

// Colors of the shop item list in the English client (1366x768 windowed, default UI skin).
const SEPARATOR = [157, 165, 174];
const TEXT_BG = [205, 217, 228];
const SOLD_BG = [243, 245, 248];
const ROW_H = 40;
const ICON_W = 36;
const MIN_LIST_W = 180;

// Every list row ends in a one-pixel separator line, so long separator runs give both the list's x-range and each row's bottom.
function separators(img) {
  const { width, height, data } = img;
  const lines = [];
  for (let y = 0; y < height; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const on = x < width && near(data, (y * width + x) * 4, SEPARATOR, 4);
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        if (x - start >= MIN_LIST_W) lines.push({ y, x0: start, x1: x - 1 });
        start = -1;
      }
    }
  }
  return lines;
}

function rowState(img, x0, top) {
  const i = ((top + 10) * img.width + x0 + ICON_W + 120) * 4;
  if (near(img.data, i, TEXT_BG, 6)) return 'open';
  if (near(img.data, i, SOLD_BG, 6)) return 'sold';
  return null;
}

// Rows of every shop list on screen, top to bottom. A row is the 40px band above a separator, plus the band below the last one.
export function findShopRows(img) {
  const lines = separators(img);
  const lists = new Map();
  for (const l of lines) {
    const key = `${l.x0}:${l.x1}`;
    if (!lists.has(key)) lists.set(key, []);
    lists.get(key).push(l.y);
  }
  const rows = [];
  for (const [key, ys] of lists) {
    const [x0, x1] = key.split(':').map(Number);
    const tops = new Set(ys.map((y) => y - ROW_H));
    const last = Math.max(...ys);
    if (last + 1 + ROW_H <= img.height) tops.add(last + 1);
    for (const top of [...tops].sort((a, b) => a - b)) {
      if (top < 0) continue;
      const state = rowState(img, x0, top);
      if (state) rows.push({ x0, x1, top, sold: state === 'sold' });
    }
  }
  return rows;
}

// Crop one text line of a row (0 = item name, 1 = "<qty> for <price> mesos"), scaled up and turned to clean black-on-white,
// which OCR engines read far better than the 11px antialiased game font.
export function lineImage(img, row, line, scale = 4) {
  const x0 = row.x0 + ICON_W + 2;
  const w = row.x1 - x0 - 4;
  const y0 = row.top + (line === 0 ? 3 : 20);
  const h = 17;
  const out = { width: w * scale, height: h * scale, data: new Uint8ClampedArray(w * scale * h * scale * 4) };
  for (let y = 0; y < h * scale; y++) {
    for (let x = 0; x < w * scale; x++) {
      const si = ((y0 + Math.floor(y / scale)) * img.width + x0 + Math.floor(x / scale)) * 4;
      const lum = (img.data[si] + img.data[si + 1] + img.data[si + 2]) / 3;
      // Sold rows draw grey text on a near-white background, so the cut-off sits higher for them.
      const ink = lum < (row.sold ? 200 : 140);
      const v = ink ? 0 : 255;
      const di = (y * w * scale + x) * 4;
      out.data[di] = out.data[di + 1] = out.data[di + 2] = v;
      out.data[di + 3] = 255;
    }
  }
  return out;
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9%:]/g, '');

function distance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

// Long names are cut off with "..." in the list, so a read name may only be the start of the real one.
export function matchItem(text, items) {
  const t = norm(text.replace(/\.{2,}|…/g, ''));
  if (t.length < 3) return null;
  const cut = /\.{2,}|…\s*$/.test(text.trim());
  let best = null;
  for (const it of items) {
    const n = it.key || (it.key = norm(it.en));
    const target = cut ? n.slice(0, t.length) : n;
    const d = distance(t, target);
    if (!best || d < best.d) best = { item: it, d };
  }
  if (!best) return null;
  const confidence = 1 - best.d / Math.max(t.length, 1);
  return confidence >= 0.75 ? { item: best.item, confidence } : null;
}

// "25 for 80 mesos" -> { qty: 25, price: 80 }. OCR sometimes reads the commas as dots or drops them, both are fine.
export function parsePriceLine(text) {
  const m = text.replace(/[oO](?=[\d,.]*\s*mesos)/g, '0').match(/(\d+)\s*for\s*([\d,.\s]+?)\s*meso/i);
  if (!m) return null;
  const price = Number(m[2].replace(/[,.\s]/g, ''));
  const qty = Number(m[1]);
  return price > 0 && qty > 0 ? { qty, price } : null;
}

export function parseRow(row, nameText, priceText, items) {
  const match = matchItem(nameText, items);
  const p = parsePriceLine(priceText);
  return { sold: row.sold, read: nameText.trim(), item: match?.item || null, confidence: match?.confidence || 0, qty: p?.qty || null, price: p?.price || null };
}

// ---------- bitmap-font reading ----------
// The list uses a fixed 1px bitmap font with at least one blank column between letters, so each letter is an exact pixel
// pattern. A glyph table learned from labelled samples (scripts/scan-tools/learn-glyphs.mjs) maps patterns back to letters.

const LINE_H = 17;
// Word gaps are 4+ blank columns in names; digits are padded to a fixed width, so price lines ignore spaces altogether.
const SPACE_GAP = 4;

function inkAt(img, x, y, sold) {
  const i = (y * img.width + x) * 4;
  const lum = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
  return lum < (sold ? 200 : 140);
}

// Split one text line of a row into glyph patterns, with spaces where the gap between letters is wide.
export function glyphs(img, row, line) {
  const x0 = row.x0 + ICON_W + 2;
  const x1 = row.x1 - 4;
  const y0 = row.top + (line === 0 ? 3 : 20);
  const cols = [];
  for (let x = x0; x < x1; x++) {
    let bits = 0n;
    for (let y = 0; y < LINE_H; y++) if (inkAt(img, x, y0 + y, row.sold)) bits |= 1n << BigInt(y);
    cols.push(bits);
  }
  const out = [];
  let start = -1;
  let gap = 0;
  for (let i = 0; i <= cols.length; i++) {
    const ink = i < cols.length && cols[i] !== 0n;
    if (ink && start < 0) {
      if (out.length && gap >= SPACE_GAP) out.push(' ');
      start = i;
    }
    if (!ink && start >= 0) {
      out.push(cols.slice(start, i).map((c) => c.toString(36)).join('.'));
      start = -1;
      gap = 0;
    }
    if (!ink && start < 0) gap++;
  }
  return out;
}

// Letters the table does not know come back as "?", which item matching tolerates and price reading treats as unreadable.
export function readLine(img, row, line, table) {
  return glyphs(img, row, line)
    .filter((g) => line === 0 || g !== ' ')
    .map((g) => (g === ' ' ? ' ' : table[g] ?? '?'))
    .join('');
}
