// Reads "EXP. 83,631 [68.13%]" from the game's bottom status bar in a captured frame, at any screen scale.
// The bar is found by its three gauges on one row near the bottom of the frame: a red HP fill, a blue MP fill to its
// right of about the same width, and the EXP track after that. The EXP text sits on the line just above the EXP track,
// starting at the track's left edge. Only that text goes through OCR; the numbers are checked against each other
// (exp ÷ percent must give a sensible level total) so a misread digit is dropped rather than charted.

const isRed = (r, g, b) => r > 170 && g < 110 && b < 110 && r - g > 90;
// The MP fill has a lighter highlight row and edge, so green may run high; blue well above red is what counts.
const isBlue = (r, g, b) => b > 150 && r < 110 && g < 200 && b - r > 80;

// Longest run of a colour on one row within [x0, x1).
function runsOn(img, y, test, x0 = 0, x1 = img.width, minLen = 12) {
  const { width: W, data: d } = img;
  const runs = [];
  let start = -1;
  for (let x = x0; x <= x1; x++) {
    const i = (y * W + x) * 4;
    const hit = x < x1 && test(d[i], d[i + 1], d[i + 2]);
    if (hit && start < 0) start = x;
    if (!hit && start >= 0) {
      if (x - start >= minLen) runs.push({ x0: start, x1: x });
      start = -1;
    }
  }
  return runs;
}

// The HP and MP gauges: same row, similar width, blue starting shortly after red ends. Searched in the bottom quarter
// of the frame, bottom-up, so a red cape or blue water higher up never wins. Returns the gauge row band and geometry.
export function findGauges(img) {
  const { height: H, width: W } = img;
  const minW = Math.max(12, Math.round(W * 0.02));
  for (let y = H - 2; y >= Math.floor(H * 0.6); y--) {
    const reds = runsOn(img, y, isRed, 0, W, minW);
    if (!reds.length) continue;
    const blues = runsOn(img, y, isBlue, 0, W, minW);
    for (const r of reds) {
      const w = r.x1 - r.x0;
      // The HP fill may be partial, so the MP gauge's start is what fixes the pitch; it begins within half a width.
      const b = blues.find((q) => q.x0 > r.x1 && q.x0 - r.x1 < w * 0.6 && q.x0 - r.x0 > w * 0.9);
      if (!b) continue;
      // Rows of the gauge: extend up and down while the red run persists.
      let top = y, bottom = y;
      while (top > 0 && runsOn(img, top - 1, isRed, r.x0, r.x1 + 2, Math.min(minW, w * 0.6)).length) top--;
      while (bottom < H - 1 && runsOn(img, bottom + 1, isRed, r.x0, r.x1 + 2, Math.min(minW, w * 0.6)).length) bottom++;
      const barH = bottom - top + 1;
      if (barH < 2 || barH > w) continue;
      const pitch = b.x0 - r.x0;
      return { top, bottom, barH, hpX0: r.x0, mpX0: b.x0, pitch, expX0: b.x0 + pitch, width: pitch };
    }
  }
  return null;
}

// Where the EXP text is, relative to the gauges (ratios measured on the game's own bar: the text line sits between 2.9
// and 0.8 gauge-heights above the gauge, so the bar's bright top border and the gauge itself stay out). To the right the
// box ends at the panel's edge, found as the first column that is bright down the whole text line (the Cash Shop button
// border), or at 1.5 gauge widths.
export function expTextBox(g, img) {
  const y0 = Math.max(0, Math.round(g.top - g.barH * 2.9));
  const y1 = Math.max(y0 + 2, Math.round(g.top - g.barH * 0.8));
  const x0 = Math.max(0, Math.round(g.expX0 - g.width * 0.08));
  let x1 = Math.min(img.width, Math.round(g.expX0 + g.width * 1.5));
  for (let x = Math.round(g.expX0 + g.width * 0.9); x < x1; x++) {
    let bright = 0;
    for (let y = y0; y < y1; y++) { const i = (y * img.width + x) * 4; if ((img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000 > 180) bright++; }
    if (bright >= (y1 - y0) * 0.7) { x1 = x - 1; break; }
  }
  return { x0, x1, y0, y1 };
}

// The text is pale on the dark bar: light pixels become black ink on white, enlarged so letters are about 40px tall.
export function textImage(img, box, { ink = 150 } = {}) {
  const h = box.y1 - box.y0;
  const k = Math.max(1, 40 / h);
  const pad = 14;
  const W = Math.round((box.x1 - box.x0) * k) + pad * 2;
  const H = Math.round(h * k) + pad * 2;
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  for (let y = 0; y < H - pad * 2; y++)
    for (let x = 0; x < W - pad * 2; x++) {
      const sx = Math.min(img.width - 1, Math.floor(box.x0 + x / k));
      const sy = Math.min(img.height - 1, Math.floor(box.y0 + y / k));
      const i = (sy * img.width + sx) * 4;
      const lum = (img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000;
      const o = ((y + pad) * W + x + pad) * 4;
      data[o] = data[o + 1] = data[o + 2] = lum > ink ? 0 : 255;
    }
  return { width: W, height: H, data };
}

// "EXP. 83,631 [68.13%]" (OCR may drop the brackets or read O for 0) → { exp, pct } or null. The pair must agree:
// exp / pct gives the level's total, which is between 15 and 5 billion in this game, and the percent has two decimals.
export function parseExp(text) {
  const t = String(text || '').replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/\s+/g, '');
  const m = /(\d[\d,]*)[\[(]?(\d{1,3}\.\d{1,2})%/.exec(t);
  if (!m) return null;
  const exp = Number(m[1].replace(/,/g, ''));
  const pct = Number(m[2]);
  if (!Number.isFinite(exp) || !Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  if (pct > 0) {
    const total = exp / (pct / 100);
    if (total < 15 || total > 5e9) return null;
  }
  return { exp, pct };
}

// Two readings agree when both numbers match, or when they imply the same level total within 2% (one digit of the
// percent rounding away).
export function sameReading(a, b) {
  if (!a || !b) return false;
  if (a.exp === b.exp && a.pct === b.pct) return true;
  const ta = a.pct ? a.exp / a.pct : 0, tb = b.pct ? b.exp / b.pct : 0;
  return a.exp === b.exp && ta && tb && Math.abs(ta - tb) / tb < 0.02;
}

// ---------- the session: samples → rates ----------
// A sample is { t (ms), exp, pct }. A level-up shows as exp dropping while pct resets near 0; the level's total at that
// moment comes from the last sample before it (exp / pct), so EXP gained is counted across the level change.
// Idle stretches (no change for `idleMs`) are left out of the hourly rate when `skipIdle` is on.
export function levelTotal(s) {
  return s && s.pct > 0 ? Math.round(s.exp / (s.pct / 100)) : null;
}

export function summarize(samples, { now = Date.now(), skipIdle = true, idleMs = 120000 } = {}) {
  if (!samples.length) return null;
  let gained = 0, active = 0, idle = 0, levels = 0;
  let last = samples[0];
  for (let i = 1; i < samples.length; i++) {
    const s = samples[i];
    const dt = s.t - last.t;
    let d = s.exp - last.exp;
    if (d < 0 && s.pct < last.pct) {
      // Level-up: what was left of the previous level plus what is in the new one.
      const tot = levelTotal(last);
      d = (tot ? Math.max(0, tot - last.exp) : 0) + s.exp;
      levels++;
    }
    if (d < 0) d = 0;
    gained += d;
    if (skipIdle && d === 0 && dt >= idleMs) idle += dt;
    else active += dt;
    last = s;
  }
  // Time since the last sample counts as idle only once the idle threshold has passed.
  const tail = now - last.t;
  if (skipIdle && tail >= idleMs) idle += tail;
  else active += tail;
  const hours = active / 3600000;
  const perHour = hours > 0.002 ? gained / hours : null;
  const total = levelTotal(last);
  const pctPerHour = perHour != null && total ? (perHour / total) * 100 : null;
  const remain = total ? Math.max(0, total - last.exp) : null;
  const toLevelMs = perHour && remain != null ? (remain / perHour) * 3600000 : null;
  return { gained, active, idle, levels, perHour, pctPerHour, total, remain, toLevelMs, last, first: samples[0] };
}

// ---------- reading the digits without OCR ----------
// The status bar uses a fixed 5x7 pixel font for the numbers (1 is 2 wide, the comma, dot and brackets narrower). At
// game scale the glyphs are exact, so they are matched against this table; a shape not in the table is handed to the
// caller's OCR for one character and remembered. Digits marked (?) were not seen in a capture yet and follow the same
// font's standard shapes; a wrong one is caught by the exp/percent consistency check and then relearned by OCR.
const G = (rows) => rows.join('/');
export const EXP_GLYPHS = {
  [G(['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'])]: '8',
  [G(['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'])]: '3',
  [G(['.###.', '#...#', '#....', '####.', '#...#', '#...#', '.###.'])]: '6',
  [G(['.#', '##', '.#', '.#', '.#', '.#', '.#'])]: '1',
  [G(['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'])]: '0', // (?)
  [G(['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'])]: '2', // (?)
  [G(['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'])]: '4', // (?)
  [G(['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'])]: '5', // (?)
  [G(['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'])]: '7', // (?)
  [G(['.###.', '#...#', '#...#', '.####', '....#', '#...#', '.###.'])]: '9', // (?)
  [G(['.#', '#.'])]: ',',
  [G(['#'])]: '.',
  [G(['##', '#.', '#.', '#.', '#.', '#.', '##'])]: '[',
  [G(['##', '.#', '.#', '.#', '.#', '.#', '##'])]: ']',
  [G(['.#....#', '#.#..#.', '.#..#..', '...#...', '..#..#.', '.#..#.#', '#....#.'])]: '%',
};
const NATIVE_BAR_H = 6;
const NATIVE_GLYPH_H = 7;

// Glyph bitmaps on the text line. The box is binarised on luminance at the frame's own resolution, rows that are
// bright almost all the way across (the bar's border lines) are dropped, and the line is split at empty columns. The
// game scale is then taken from the glyphs themselves: the tallest ones (digits, brackets, percent) are 7 rows at game
// scale. Each glyph is brought to that scale from its own bounding box, so a frame whose scale is not a whole number,
// or whose gauge height was measured a row off, still gives exact bitmaps. Each glyph is its ink rows only, so "."
// (one pixel) and "," (two) keep their shape. Positions and gaps are returned in game pixels.
export function expGlyphs(img, box, g, { ink = 150 } = {}) {
  const W = box.x1 - box.x0, H = box.y1 - box.y0;
  const lum = (x, y) => { const i = ((box.y0 + y) * img.width + box.x0 + x) * 4; return (img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000; };
  const grid = [];
  for (let y = 0; y < H; y++) {
    const row = []; let n = 0;
    for (let x = 0; x < W; x++) { const b = lum(x, y) > ink; row.push(b); if (b) n++; }
    grid.push(n > W * 0.6 ? row.map(() => false) : row);
  }
  const colInk = (x) => grid.some((row) => row[x]);
  const segs = [];
  let start = -1;
  for (let x = 0; x <= W; x++) {
    const inked = x < W && colInk(x);
    if (inked && start < 0) start = x;
    if (!inked && start >= 0) {
      let top = H, bottom = -1;
      for (let y = 0; y < H; y++) for (let xx = start; xx < x; xx++) if (grid[y][xx]) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
      segs.push({ x0: start, x1: x, top, bottom });
      start = -1;
    }
  }
  // The most common tall height is the digit height (a button border at the edge may be taller).
  const counts = new Map();
  for (const q of segs) { const h = q.bottom - q.top + 1; if (h >= 5) counts.set(h, (counts.get(h) || 0) + 1); }
  const tall = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
  const s = tall ? tall / NATIVE_GLYPH_H : g.barH / NATIVE_BAR_H;
  const out = [];
  for (const q of segs) {
    const w = q.x1 - q.x0, h = q.bottom - q.top + 1;
    const nw = Math.max(1, Math.round(w / s)), nh = Math.max(1, Math.round(h / s));
    const rows = [];
    for (let cy = 0; cy < nh; cy++) {
      let row = '';
      for (let cx = 0; cx < nw; cx++) {
        // Area average of the source pixels this game pixel covers.
        let on = 0, n = 0;
        for (let y = Math.floor(q.top + (cy * h) / nh); y < Math.max(Math.floor(q.top + (cy * h) / nh) + 1, Math.ceil(q.top + ((cy + 1) * h) / nh)); y++)
          for (let x = Math.floor(q.x0 + (cx * w) / nw); x < Math.max(Math.floor(q.x0 + (cx * w) / nw) + 1, Math.ceil(q.x0 + ((cx + 1) * w) / nw)); x++) { n++; if (grid[y]?.[x]) on++; }
        row += on * 2 > n ? '#' : '.';
      }
      rows.push(row);
    }
    const x0 = Math.round(q.x0 / s), x1 = x0 + nw;
    const bits = [];
    for (let y = q.top; y <= q.bottom; y++) bits.push(grid[y].slice(q.x0, q.x1).map((b) => (b ? '#' : '.')).join(''));
    out.push({ x0, x1, top: Math.round(q.top / s), bottom: Math.round(q.bottom / s), key: rows.join('/'), bits, gap: out.length ? Math.round((q.x0 - out[out.length - 1].src1) / s) : 0, src1: q.x1 });
  }
  const list = out.map(({ src1, ...rest }) => rest);
  list.scale = s;
  return list;
}

// Keys for a glyph at other grid phases. At scales like 1.25 or 1.5 (Windows display scaling) the game's pixels are
// stretched unevenly, so one cell grid may cut them wrong. The grid is slid by eighth cells both ways and the scale
// swept across the range the measured digit height allows (a whole row either way); each resulting bitmap, trimmed of empty edge rows and columns, is a candidate for the table.
function phaseKeys(bits, s) {
  const h = bits.length, w = bits[0].length, keys = new Set();
  for (const sc of [-2, -1, 0, 1, 2].map((k) => s + (k * 0.45) / NATIVE_GLYPH_H)) for (let px = 0; px < 1; px += 0.125) for (let py = 0; py < 1; py += 0.125) {
    const nw = Math.ceil(w / sc) + 1, nh = Math.ceil(h / sc) + 1;
    const on = Array.from({ length: nh }, () => new Array(nw).fill(0)), n = Array.from({ length: nh }, () => new Array(nw).fill(0));
    for (let y = 0; y < h; y++) {
      const cy = Math.min(nh - 1, Math.floor((y + py * sc) / sc));
      for (let x = 0; x < w; x++) { const cx = Math.min(nw - 1, Math.floor((x + px * sc) / sc)); n[cy][cx]++; if (bits[y][x] === '#') on[cy][cx]++; }
    }
    const rows = on.map((r, y) => r.map((v, x) => (v * 2 > n[y][x] ? '#' : '.')).join('')).filter((r) => r.includes('#'));
    if (!rows.length) continue;
    let c0 = 0, c1 = rows[0].length;
    while (c0 < c1 && rows.every((r) => r[c0] === '.')) c0++;
    while (c1 > c0 && rows.every((r) => r[c1 - 1] === '.')) c1--;
    keys.add(rows.map((r) => r.slice(c0, c1)).join('/'));
  }
  return keys;
}
// The character the phase keys agree on, or null. A hit on a bigger bitmap counts for more, so a comma cut into one
// cell by many phases does not become a dot.
function phaseMatch(gl, s, learned) {
  const votes = new Map();
  for (const k of phaseKeys(gl.bits, s)) { const ch = EXP_GLYPHS[k] ?? learned.get(k); if (ch != null) votes.set(ch, (votes.get(ch) || 0) + k.replace(/\//g, '').length); }
  return [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// Text from the glyphs: table hits are exact; the rest go to `ocrGlyph(key)` (a single character, may return '').
// The "EXP." label is the wide first glyphs before the first digit and is skipped by position (anything before a gap
// of 3+ columns after a glyph wider than 8).
export async function readExpText(img, box, g, { ocrGlyph = null, learned = new Map() } = {}) {
  const glyphs = expGlyphs(img, box, g);
  let text = '';
  let started = false;
  for (const gl of glyphs) {
    const w = gl.x1 - gl.x0;
    if (!started) { if (w > 8 || (gl.key in EXP_GLYPHS) === false && !learned.has(gl.key) && w > 6) continue; started = true; }
    // Nothing after the closing bracket belongs to the number.
    if (text.includes(']')) break;
    let ch = EXP_GLYPHS[gl.key] ?? learned.get(gl.key) ?? phaseMatch(gl, glyphs.scale, learned);
    if (ch == null && ocrGlyph) { ch = await ocrGlyph(gl.key); if (ch) learned.set(gl.key, ch); }
    if (gl.gap >= 3 && text) text += ' ';
    text += ch ?? '?';
  }
  return text.replace(/\s+/g, '');
}
