// Reads Free Market shop windows out of a game screenshot. Works on plain RGBA image objects ({ width, height, data }) so the
// same code runs in the browser scanner and in Node tests against saved samples. Text recognition itself is pluggable: callers
// pass the cropped line images to an OCR engine and hand the strings back to parseRow.

const near = (d, i, [r, g, b], tol) => Math.abs(d[i] - r) <= tol && Math.abs(d[i + 1] - g) <= tol && Math.abs(d[i + 2] - b) <= tol;

// Colors of the shop item list in the English client (1366x768 windowed, default UI skin). Tolerances leave room for the
// small shifts a colour-managed screen capture (e.g. a Mac's display profile) introduces.
const SEPARATOR = [157, 165, 174];
const TEXT_BG = [205, 217, 228];
const SOLD_BG = [243, 245, 248];
const ROW_H = 40;
const ICON_W = 36;
const MIN_LIST_W = 180;
// Other windows (the chat box) use the same line colour but are wider than the 198px list.
const MAX_LIST_W = 210;

// How much bigger than the game's own pixels this frame is, measured from the shop list's separator lines (198px long in the
// game). Works for any window size and any screen scaling; null when no shop list is on screen.
const LIST_W = 198;
export function detectScale(img) {
  const { width, height } = img;
  // Separator lines blur into 2-3px bands when the capture is scaled smoothly, so they are found as thin dark lines: pixels
  // clearly darker than the panel rows three or four pixels above and below, in runs as long as the (scaled) list.
  const dark = (x, y) => {
    const l = lum(img, x, y);
    for (const d of [3, 4]) {
      if (y - d < 0 || y + d >= height) continue;
      if (l < lum(img, x, y - d) - 25 && l < lum(img, x, y + d) - 25 && l > 90) return true;
    }
    return false;
  };
  const runs = [];
  for (let y = 4; y < height - 4; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const on = x < width && dark(x, y);
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        const len = x - start;
        if (len >= LIST_W * 0.9 && len <= LIST_W * 4.2) runs.push({ y, x: start, len });
        start = -1;
      }
    }
  }
  if (!runs.length) return null;
  // Group by left edge (lines of one list share it), merging the rows one thick blurred line covers.
  const groups = new Map();
  for (const r of runs) {
    const key = Math.round(r.x / 8);
    if (!groups.has(key)) groups.set(key, []);
    const g = groups.get(key);
    const last = g[g.length - 1];
    if (last && r.y - last.last <= 3) {
      last.last = r.y;
      last.y = (last.first + r.y) / 2;
    } else g.push({ y: r.y, first: r.y, last: r.y, len: r.len });
  }
  // The list: the group whose lines are spaced most regularly (rows are 40 game pixels apart).
  let best = null;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const gaps = [];
    for (let k = 1; k < g.length; k++) gaps.push(g[k].y - g[k - 1].y);
    gaps.sort((a, b) => a - b);
    const mid = gaps[Math.floor(gaps.length / 2)];
    const steady = gaps.filter((gap) => Math.abs(gap - mid) <= 2).length;
    const scale = mid / ROW_H;
    const lens = g.map((l) => l.len).sort((a, b) => a - b);
    const byLen = lens[Math.floor(lens.length / 2)] / LIST_W;
    // Spacing and line length must tell the same story, which rules out other evenly spaced lines on screen.
    if (Math.abs(scale - byLen) > 0.25 * scale) continue;
    if (!best || steady > best.steady) best = { scale, steady };
  }
  return best ? best.scale : null;
}

// Every list row ends in a one-pixel separator line, so long separator runs give both the list's x-range and each row's bottom.
function separators(img) {
  const { width, height, data } = img;
  const lines = [];
  for (let y = 0; y < height; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const on = x < width && near(data, (y * width + x) * 4, SEPARATOR, 6);
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        if (x - start >= MIN_LIST_W && x - start <= MAX_LIST_W) lines.push({ y, x0: start, x1: x - 1 });
        start = -1;
      }
    }
  }
  return lines;
}

// Sampled in the strip above the name, which text never reaches (long names would cover any point on the text line).
function rowState(img, x0, top) {
  const i = ((top + 5) * img.width + x0 + ICON_W + 60) * 4;
  if (near(img.data, i, TEXT_BG, 8)) return 'open';
  if (near(img.data, i, SOLD_BG, 8)) return 'sold';
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

// Rows for frames scaled back from a non-integer screen scale, where the 1px separator lines blur away. The text panel's flat
// background survives scaling, so rows are found as 34px-tall bands of it, 160px wide, all starting at the same x.
const PANEL_W = 161;
export function findShopRowsLoose(img) {
  const { width, height, data } = img;
  const bgAt = (x, y) => {
    const i = (y * width + x) * 4;
    return near(data, i, TEXT_BG, 16) ? 1 : near(data, i, SOLD_BG, 8) ? 2 : 0;
  };
  // 1. The panel's left edge: x where unbroken 160px runs of panel background start most often (the blank pixel rows above,
  //    between and below the two text lines give several per row).
  const starts = new Map();
  for (let y = 0; y < height; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      // Only the open-slot colour: the sold-slot colour is close to the white window chrome around the list.
      const on = x < width && bgAt(x, y) === 1;
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        if (x - start >= PANEL_W - 18 && x - start <= PANEL_W + 8) starts.set(start, (starts.get(start) || 0) + 1);
        start = -1;
      }
    }
  }
  const top = [...starts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] < 6) return [];
  const x = top[0];
  // 2. Rows lie between the list's dark separator lines (the divider inside a row is near-white, so it never counts, even
  //    after blurring). A row is the 40px band from one separator to the next; the top and bottom rows are taken when panel
  //    background fills the 40px beyond the outermost separators.
  const n = (PANEL_W - 8) / 2;
  const scan = (y) => {
    let open = 0;
    let sold = 0;
    let light = 0;
    for (let k = 4; k < PANEL_W - 4; k += 2) {
      const i = (y * width + x + k) * 4;
      light += (data[i] + data[i + 1] + data[i + 2]) / 3;
      const b = bgAt(x + k, y);
      if (b === 1) open++;
      else if (b === 2) sold++;
    }
    return { open, sold, light: light / n };
  };
  const lines = [];
  for (let y = 1; y < height - 1; y++) {
    const here = scan(y);
    if (here.open + here.sold > n * 0.3 || here.light > 215) continue;
    // Sold rows have a white hairline two pixels under the separator, so either of two neighbours may carry the background.
    const filledAt = (yy) => yy >= 0 && yy < height && scan(yy).open + scan(yy).sold >= n * 0.55;
    if ((filledAt(y - 2) || filledAt(y - 3)) && (filledAt(y + 2) || filledAt(y + 3))) {
      if (!lines.length || y - lines[lines.length - 1] > 3) lines.push(y);
    }
  }
  // Keep the longest run of lines spaced one row apart; stray lines elsewhere in the window are dropped.
  let chain = [];
  for (let a = 0; a < lines.length; a++) {
    const run = [lines[a]];
    for (let b = a + 1; b < lines.length; b++) if (Math.abs(lines[b] - run[run.length - 1] - ROW_H) <= 3) run.push(lines[b]);
    if (run.length > chain.length) chain = run;
  }
  if (!chain.length) return [];
  const band = (from) => {
    let open = 0;
    let sold = 0;
    let filled = 0;
    for (let y = from + 3; y < from + 37 && y < height; y++) {
      const r = scan(y);
      open += r.open;
      sold += r.sold;
      if (r.open + r.sold >= n * 0.55) filled++;
    }
    return { open, sold, filled };
  };
  const tops = [chain[0] - ROW_H, ...chain];
  const rows = [];
  for (const t of tops) {
    if (t < 0 || t + ROW_H > height) continue;
    const b = band(t);
    if (b.filled < 22) continue;
    rows.push({ x0: x - ICON_W, x1: x - ICON_W + 197, top: t, sold: b.sold > b.open, loose: true });
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
  let ties = [];
  for (const it of items) {
    const n = it.key || (it.key = norm(it.en));
    const target = cut ? n.slice(0, t.length) : n;
    const d = distance(t, target);
    if (!best || d < best.d) {
      best = { item: it, d };
      ties = [it];
    } else if (d === best.d) ties.push(it);
  }
  if (!best) return null;
  const confidence = 1 - best.d / Math.max(t.length, 1);
  if (confidence < 0.75) return null;
  // A name cut short in the list ("Gloves Attack Scr...") can fit several items equally well, typically the tiers of one
  // scroll. Those come back as alternatives for the caller to settle (by price, or by asking the player).
  // Several ids can share one exact name (two "Red Potion"s); those are the same thing to a buyer, not a real choice.
  const distinct = [...new Map(ties.map((it) => [it.en, it])).values()];
  return { item: best.item, confidence, alternatives: distinct.length > 1 ? distinct : null };
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

// Otsu's threshold over a rectangle: the brightness that best splits text from background. Frames scaled back from a
// non-integer screen scale blur grey text into its background, where no fixed cut-off works.
function otsu(img, x0, x1, y0, y1) {
  const hist = new Array(256).fill(0);
  let total = 0;
  for (let y = Math.max(0, y0); y < Math.min(img.height, y1); y++)
    for (let x = Math.max(0, x0); x < Math.min(img.width, x1); x++) {
      hist[Math.round(lum(img, x, y))]++;
      total++;
    }
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sB = 0;
  let wB = 0;
  let best = -1;
  let th = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    const wF = total - wB;
    if (!wB || !wF) continue;
    sB += t * hist[t];
    const between = wB * wF * (sB / wB - (sum - sB) / wF) ** 2;
    if (between > best) {
      best = between;
      th = t;
    }
  }
  return th;
}
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

// A frame scaled back from a non-integer screen scale (125%, 150%) can leave a letter a pixel or two off its learned shape.
// Unknown shapes are matched to the closest learned letter of the same width, allowing a one-row shift, when the difference
// stays small next to the letter's ink.
const parseShape = (g) => g.split('.').map((c) => BigInt(parseInt(c, 36)));
const popcount = (n) => {
  let c = 0;
  if (typeof n === 'number') for (; n; n &= n - 1) c++;
  else for (; n; n &= n - 1n) c++;
  return c;
};
const shapeCache = new WeakMap();

function nearestLetter(g, table) {
  let byWidth = shapeCache.get(table);
  if (!byWidth) {
    byWidth = new Map();
    for (const [key, ch] of Object.entries(table)) {
      const cols = parseShape(key);
      if (!byWidth.has(cols.length)) byWidth.set(cols.length, []);
      byWidth.get(cols.length).push({ cols, ch });
    }
    byWidth.memo = new Map();
    shapeCache.set(table, byWidth);
  }
  if (byWidth.memo.has(g)) return byWidth.memo.get(g);
  const cols = parseShape(g);
  const ink = cols.reduce((a, c) => a + popcount(c), 0);
  // Best distance per letter, so the winner can be compared with the closest *other* letter.
  const perLetter = new Map();
  for (const w of [cols.length, cols.length - 1, cols.length + 1]) {
    for (const cand of byWidth.get(w) || []) {
      for (const shift of [0, 1, -1]) {
        let d = Math.abs(w - cols.length) * 6;
        for (let i = 0; i < Math.max(w, cols.length); i++) {
          let a = cols[i] ?? 0n;
          const b = cand.cols[i] ?? 0n;
          a = shift > 0 ? a << 1n : shift < 0 ? a >> 1n : a;
          d += popcount(a ^ b);
        }
        if (!perLetter.has(cand.ch) || d < perLetter.get(cand.ch)) perLetter.set(cand.ch, d);
      }
    }
  }
  const ranked = [...perLetter.entries()].sort((a, b) => a[1] - b[1]);
  const [best, second] = ranked;
  // Digits decide prices, where 8-for-9 is worse than no read: a digit must beat the runner-up clearly, or it stays unknown
  // and the row goes to the slower OCR reader instead.
  const digit = best && /\d/.test(best[0]);
  const margin = !second ? Infinity : second[1] - best[1];
  const ok = best && best[1] <= Math.max(2, Math.floor(ink * 0.2)) && (!digit || margin >= 3);
  const ch = ok ? best[0] : '?';
  byWidth.memo.set(g, ch);
  return ch;
}

const decode = (gs, table, spaces = true) =>
  gs
    .filter((g) => spaces || g !== ' ')
    .map((g) => (g === ' ' ? ' ' : table[g] ?? nearestLetter(g, table)))
    .join('');

// Item rows: line 0 is the name, line 1 "<n> for <price> mesos". Sold rows draw grey text, so their cut-off is lighter.
export function glyphs(img, row, line) {
  const x0 = row.x0 + ICON_W + 2;
  const x1 = row.x1 - 4;
  const y0 = row.top + (line === 0 ? 3 : 20);
  // Rows found on a rescaled frame get a cut-off fitted to their own pixels; exact frames keep the fixed ones.
  const limit = row.loose ? otsu(img, x0, x1, y0, y0 + LINE_H) + 1 : row.sold ? 200 : 140;
  return bandGlyphs(img, x0, x1, y0, darkInk(limit));
}

// Digits are padded to a fixed width, which looks like spaces, so price lines drop spaces altogether.
// Rows found on a rescaled frame can sit a pixel above or below where the letters really are, so those are read at three
// heights and the read with the fewest unknown letters wins.
const unknowns = (t) => (t.match(/\?/g) || []).length * 4 + (t.trim() ? 0 : 50) - t.replace(/[^A-Za-z0-9]/g, '').length;
function bestShift(read, loose) {
  if (!loose) return read(0);
  return [0, -1, 1].map(read).sort((a, b) => unknowns(a) - unknowns(b))[0];
}

export function readLine(img, row, line, table) {
  return bestShift((dy) => decode(glyphs(img, { ...row, top: row.top + dy }, line), table, line === 0), row.loose);
}

// The shop owner's name sits in a dark box under their avatar, in the list font drawn light on dark.
// Only the inside of the box counts as ink; its light border would otherwise join every letter into one shape.
export function ownerGlyphs(img, listTop, x0, loose = false) {
  const limit = loose ? otsu(img, x0 + 10, x0 + 92, listTop - 19, listTop - 5) : 180;
  // Rescaled frames can push descenders (p, g, y) a row lower; clipping them turns "p" into "n".
  const ink = (im, x, y) => y >= listTop - 19 && y <= listTop - (loose ? 4 : 6) && lum(im, x, y) > limit;
  return bandGlyphs(img, x0 + 10, x0 + 92, listTop - 21, ink);
}

export function readOwner(img, listTop, x0, table, loose = false) {
  return bestShift((dy) => decode(ownerGlyphs(img, listTop + dy, x0, loose), table).trim(), loose);
}

// "<qty> for <price> mesos" as read from the glyphs (spaces dropped). Blur can fuse the "me" of "mesos" into one unknown shape;
// that is accepted, but the digits themselves must all be read.
export function priceFromLine(text) {
  const m = text.match(/^(\d+)for(\d{1,3}(?:,\d{3})*)(?:mesos|[me?]{1,2}sos)$/);
  return m ? { qty: Number(m[1]), price: Number(m[2].replace(/,/g, '')) } : null;
}

// ---------- channel ----------
// The Change Channel window can be anywhere, so its text is not read at all: the selected cell is found by its blue and its
// channel is its position in the 8-column grid of cells around it. The mouse is usually over the window when it opens,
// and a hovered cell changes colour, so cells are recognised by kind (a neutral grey, or a blue) rather than exact colour.
const CH_DX = 70.1;
const CH_DY = 22;
const CH_COLS = 8;

const pix = (img, x, y) => {
  const i = (Math.round(y) * img.width + Math.round(x)) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};
// The selected cell: clearly blue (measured 61,169,216; hovered it turns lighter, still blue).
const isPicked = ([r, g, b]) => b - r > 80 && g - r > 40 && b > 150;
// Any cell: neutral grey from mid to light (177 normally, lighter or darker when hovered or pressed), or the blue one.
const isCell = (p) => {
  const [r, g, b] = p;
  const hi = Math.max(r, g, b);
  return isPicked(p) || (hi - Math.min(r, g, b) < 26 && hi >= 120 && hi <= 236);
};

export function findChannel(img) {
  const { width, height } = img;
  const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height;
  for (let y = 0; y < height; y += 2) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const on = x < width && isPicked(pix(img, x, y));
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        if (x - start >= 55 && x - start <= 75) {
          // Sample each neighbour cell near its right end, where the "CH.n" label never reaches.
          const px = x - 8;
          const cell = (cx, cy) => inside(cx, cy) && isCell(pix(img, cx, cy));
          let col = 0;
          while (col < CH_COLS && cell(px - (col + 1) * CH_DX, y)) col++;
          let right = 0;
          while (right < CH_COLS && cell(px + (right + 1) * CH_DX, y)) right++;
          // Rows above the selected one can only hold grey cells; the window's blue title bar must not count as a row.
          const greyCell = (cx, cy) => inside(cx, cy) && !isPicked(pix(img, cx, cy)) && isCell(pix(img, cx, cy));
          let row = 0;
          while (row < 10 && greyCell(px, y - (row + 1) * CH_DY)) row++;
          // Exactly eight cells in the row, and exactly one of them blue: that is the channel grid.
          const blues = Array.from({ length: CH_COLS }, (_, k) => px + (k - col) * CH_DX).filter((cx) => inside(cx, y) && isPicked(pix(img, cx, y))).length;
          if (col + right === CH_COLS - 1 && blues === 1) return row * CH_COLS + col + 1;
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
// Pattern key of the last Free Market title seen, so a player can name a room the table does not know yet.
export let lastRoomKey = null;

function lightColumns(img, x0, x1, y0, limit = 225) {
  const cols = [];
  for (let x = x0; x < x1; x++) {
    let bits = 0;
    for (let y = 0; y < LINE_H; y++) if (lum(img, x, y0 + y) > limit) bits |= 1 << y;
    cols.push(bits);
  }
  return cols;
}

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

// Column-by-column bit difference; a rescaled frame can differ from the learned title by a few pixels.
const colDiff = (a, b) => {
  let d = 0;
  for (let k = 0; k < Math.max(a.length, b.length); k++) d += popcount((a[k] ?? 0) ^ (b[k] ?? 0));
  return d;
};
const inkOf = (cols) => cols.reduce((n, c) => n + popcount(c), 0);

function findPrefix(cols, prefix, share = 0.12) {
  const budget = Math.max(3, Math.floor(inkOf(prefix) * share));
  for (let x = 0; x + prefix.length <= cols.length; x++) {
    if (!cols[x]) continue;
    let d = 0;
    for (let k = 0; k < prefix.length && d <= budget; k++) d += popcount(cols[x + k] ^ prefix[k]);
    if (d <= budget) return x;
  }
  return -1;
}

// The learned title closest to what is on screen. Every title starts with the same "Free Market <", so only the part after
// that shared prefix (the room number) is compared; "<3>" and "<4>" differ in a handful of pixels and a whole-title
// comparison would let one pass for the other. The nearest room must also clearly beat the runner-up.
function roomFor(key, rooms, rescaled = false, skip = 0) {
  if (rooms[key] !== undefined) return rooms[key];
  const tail = key.split('.').map(Number).slice(skip);
  const scored = Object.entries(rooms)
    .map(([known, room]) => ({ room, d: colDiff(tail, known.split('.').map(Number).slice(skip)) }))
    .sort((a, b) => a.d - b.d);
  const [best, second] = scored;
  if (!best) return 0;
  const ink = inkOf(tail);
  const close = best.d <= Math.max(2, Math.floor(ink * (rescaled ? 0.15 : 0.05)));
  const clear = !second || second.room === best.room || second.d - best.d >= 3;
  return close && clear ? best.room : 0;
}

// Free Market room number from the minimap title; null when no Free Market title is on screen.
export function findRoom(img, map, rescaled = false) {
  if (!map?.prefix?.length) return null;
  const w = Math.min(img.width, MAP_AREA_W);
  // A rescaled frame dims the title's white a little and moves a few pixels, so its cut-off and match budget are looser.
  const limit = rescaled ? 200 : 225;
  const at = (y0) => {
    const cols = lightColumns(img, 0, w, y0, limit);
    const x = findPrefix(cols, map.prefix, rescaled ? 0.3 : 0.12);
    return x < 0 ? null : { y0, key: titleKey(cols, x) };
  };
  let hit = roomAt !== null && roomAt + LINE_H <= img.height ? at(roomAt) : null;
  for (let y0 = 0; !hit && y0 + LINE_H < Math.min(img.height, MAP_AREA_H); y0++) hit = at(y0);
  if (!hit) return null;
  roomAt = hit.y0;
  lastRoomKey = hit.key;
  // 0 means "a Free Market room, but one whose title has not been learned yet".
  return roomFor(hit.key, map.rooms, rescaled, map.prefix.length);
}

export function mapColumns(img, x0, x1, y0) {
  return lightColumns(img, x0, x1, y0);
}

// ---------- scroll tier by icon colour ----------
// Scroll icons are tinted by tier, and the icon is always fully visible even when the name is cut short: grey-teal for
// Lesser (100%), brown for Intermediate (60%), yellow for Greater (10%), greyish brown for Chaos. Sold slots fade the icon
// toward white, which keeps the tint's direction but not its strength, so the tier is read from the direction of the
// average colour (what is left after removing its grey part) and how saturated it is. Measured on the game's own icons:
// Lesser 128,153,151 · Intermediate 191,114,72 · Greater 208,161,66 · Chaos 134,120,116.
const SLOT_BG = [224, 223, 212];

export function scrollTier(img, row) {
  let n = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let y = row.top + 4; y < row.top + 26; y++)
    for (let x = row.x0 + 3; x < row.x0 + ICON_W - 3; x++) {
      const i = (y * img.width + x) * 4;
      const [pr, pg, pb] = [img.data[i], img.data[i + 1], img.data[i + 2]];
      if (Math.max(pr, pg, pb) < 60 || Math.min(pr, pg, pb) > 235 || near(img.data, i, SLOT_BG, 14) || near(img.data, i, SOLD_BG, 10)) continue;
      r += pr;
      g += pg;
      b += pb;
      n++;
    }
  if (n < 40) return null;
  [r, g, b] = [r / n, g / n, b / n];
  const lo = Math.min(r, g, b);
  const hi = Math.max(r, g, b);
  const sat = (hi - lo) / hi;
  if (hi - lo < 4) return null;
  // Blue-green tint: Lesser.
  if (g > r && b > r) return 'Lesser';
  if (r > g && g >= b) {
    if (sat < (row.sold ? 0.09 : 0.2)) return 'Chaos';
    // Yellow keeps much more green than brown does.
    return (g - lo) / (r - lo) > 0.5 ? 'Greater' : 'Intermediate';
  }
  return null;
}
