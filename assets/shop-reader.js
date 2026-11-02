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

// Sampled in the strip above the name, which text never reaches (long names would cover any point on the text line).
function rowState(img, x0, top) {
  const i = ((top + 5) * img.width + x0 + ICON_W + 60) * 4;
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
// Game text uses fixed 1px bitmap fonts with at least one blank column between letters, so each letter is an exact pixel
// pattern. Glyph tables learned from labelled samples (scripts/scan-tools/learn-glyphs.mjs) map patterns back to letters.

const LINE_H = 17;
const SPACE_GAP = 4;
const lum = (img, x, y) => {
  const i = (y * img.width + x) * 4;
  return (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
};
const darkInk = (limit) => (img, x, y) => lum(img, x, y) < limit;
const lightInk = (limit) => (img, x, y) => lum(img, x, y) > limit;

// Glyph patterns of one 17px text band, left to right, with ' ' where letters are 4+ columns apart.
function bandGlyphs(img, x0, x1, y0, ink) {
  const out = [];
  let start = -1;
  let gap = 0;
  let cols = [];
  for (let x = x0; x <= x1; x++) {
    let bits = 0n;
    if (x < x1) for (let y = 0; y < LINE_H; y++) if (ink(img, x, y0 + y)) bits |= 1n << BigInt(y);
    if (bits && start < 0) {
      if (out.length && gap >= SPACE_GAP) out.push(' ');
      start = x;
      cols = [];
    }
    if (bits) cols.push(bits.toString(36));
    if (!bits && start >= 0) {
      out.push(cols.join('.'));
      start = -1;
      gap = 0;
    }
    if (!bits && start < 0) gap++;
  }
  return out;
}

const decode = (gs, table, spaces = true) =>
  gs
    .filter((g) => spaces || g !== ' ')
    .map((g) => (g === ' ' ? ' ' : table[g] ?? '?'))
    .join('');

// Item rows: line 0 is the name, line 1 "<n> for <price> mesos". Sold rows draw grey text, so their cut-off is lighter.
export function glyphs(img, row, line) {
  return bandGlyphs(img, row.x0 + ICON_W + 2, row.x1 - 4, row.top + (line === 0 ? 3 : 20), darkInk(row.sold ? 200 : 140));
}

// Digits are padded to a fixed width, which looks like spaces, so price lines drop spaces altogether.
export function readLine(img, row, line, table) {
  return decode(glyphs(img, row, line), table, line === 0);
}

// The shop owner's name sits in a dark box under their avatar, in the list font drawn light on dark.
// Only the inside of the box counts as ink; its light border would otherwise join every letter into one shape.
export function ownerGlyphs(img, listTop, x0) {
  const ink = (im, x, y) => y >= listTop - 19 && y <= listTop - 6 && lum(im, x, y) > 180;
  return bandGlyphs(img, x0 + 10, x0 + 92, listTop - 21, ink);
}

export function readOwner(img, listTop, x0, table) {
  return decode(ownerGlyphs(img, listTop, x0), table).trim();
}

// ---------- channel ----------
// The Change Channel window can be anywhere, so its text is not read at all: the highlighted cell is found by colour and its
// channel is its position in the 8-column grid of grey cells around it.
const CH_ON = [61, 169, 216];
const CH_OFF = [177, 177, 177];
const CH_DX = 70.1;
const CH_DY = 22;
const CH_COLS = 8;

export function findChannel(img) {
  const { width, height, data } = img;
  for (let y = 0; y < height; y += 2) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const on = x < width && near(data, (y * width + x) * 4, CH_ON, 10);
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        if (x - start >= 55 && x - start <= 75) {
          // Sample each neighbour cell near its right end, where the "CH.n" label never reaches.
          const px = x - 8;
          const grey = (cx, cy) => cx >= 0 && cy >= 0 && cx < width && cy < height && near(data, (Math.round(cy) * width + Math.round(cx)) * 4, CH_OFF, 6);
          let col = 0;
          while (col < CH_COLS && grey(px - (col + 1) * CH_DX, y)) col++;
          let right = 0;
          while (right < CH_COLS && grey(px + (right + 1) * CH_DX, y)) right++;
          let row = 0;
          while (row < 10 && grey(px, y - (row + 1) * CH_DY)) row++;
          if (col + right === CH_COLS - 1) return row * CH_COLS + col + 1;
        }
        start = -1;
      }
    }
  }
  return null;
}

// ---------- room ----------
// The minimap title ("Free Market <10>") uses an outlined font whose letters break into pieces, so it is not read letter by
// letter. Instead the whole title is matched as one pixel pattern: a stored prefix ("Free M...") finds it anywhere in the
// top-left of the screen, and the full line is looked up among titles already seen for each room.
const MAP_AREA_W = 600;
const MAP_AREA_H = 450;
const MAP_END_GAP = 6;
let roomAt = null;

function lightColumns(img, x0, x1, y0) {
  const cols = [];
  for (let x = x0; x < x1; x++) {
    let bits = 0;
    for (let y = 0; y < LINE_H; y++) if (lum(img, x, y0 + y) > 225) bits |= 1 << y;
    cols.push(bits);
  }
  return cols;
}

const popcount = (n) => {
  let c = 0;
  for (; n; n &= n - 1) c++;
  return c;
};

// The title from its first lit column up to a wide gap or the minimap's frame (an almost fully lit column), as one key.
export function titleKey(cols, start) {
  let end = start;
  let gap = 0;
  for (let x = start; x < cols.length && gap < MAP_END_GAP; x++) {
    if (popcount(cols[x]) >= 13) break;
    if (cols[x]) {
      end = x + 1;
      gap = 0;
    } else gap++;
  }
  return cols.slice(start, end).join('.');
}

function findPrefix(cols, prefix) {
  outer: for (let x = 0; x + prefix.length <= cols.length; x++) {
    for (let k = 0; k < prefix.length; k++) if (cols[x + k] !== prefix[k]) continue outer;
    return x;
  }
  return -1;
}

// Free Market room number from the minimap title; null when no Free Market title is on screen.
export function findRoom(img, map) {
  if (!map?.prefix?.length) return null;
  const w = Math.min(img.width, MAP_AREA_W);
  const at = (y0) => {
    const cols = lightColumns(img, 0, w, y0);
    const x = findPrefix(cols, map.prefix);
    return x < 0 ? null : { y0, key: titleKey(cols, x) };
  };
  let hit = roomAt !== null && roomAt + LINE_H <= img.height ? at(roomAt) : null;
  for (let y0 = 0; !hit && y0 + LINE_H < Math.min(img.height, MAP_AREA_H); y0++) hit = at(y0);
  if (!hit) return null;
  roomAt = hit.y0;
  // 0 means "a Free Market room, but one whose title has not been learned yet".
  return map.rooms[hit.key] ?? 0;
}

export function mapColumns(img, x0, x1, y0) {
  return lightColumns(img, x0, x1, y0);
}
