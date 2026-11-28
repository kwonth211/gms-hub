// Reads "EXP. 83,631 [68.13%]" from the game's bottom status bar in a captured frame, at any screen scale.
// The bar is found by its three gauges on one row near the bottom of the frame: a red HP fill, a blue MP fill to its
// right of about the same width, and the EXP track after that. The EXP text sits on the line just above the EXP track,
// starting at the track's left edge. Only that text goes through OCR; the numbers are checked against each other
// (exp ÷ percent must give a sensible level total) so a misread digit is dropped rather than charted.

const NATIVE_PITCH = 108; // game pixels from one gauge's start to the next
// The game draws its bar smaller when its window is made smaller (2026-11-27: failures at 0.57x and 0.67x from players who
// read fine at 1x minutes before). Readable down to this scale; below it the page asks for a bigger window.
export const SMALL_SCALE = 0.65;
const isRed = (r, g, b) => r > 170 && g < 110 && b < 110 && r - g > 90;
// The MP fill has a lighter highlight row and edge, so green may run high; blue well above red is what counts.
const isBlue = (r, g, b) => b > 150 && r < 110 && g < 200 && b - r > 80;

// Longest run of a colour on one row within [x0, x1).
function runsOn(img, y, test, x0 = 0, x1 = img.width, minLen = 12) {
  const { width: W, data: d } = img;
  const runs = [], gap = Math.round(W * 0.0025);
  let start = -1, last = -1;
  for (let x = x0; x <= x1; x++) {
    const i = (y * W + x) * 4;
    const hit = x < x1 && test(d[i], d[i + 1], d[i + 2]);
    if (hit && start < 0) start = x;
    // Colour smear in a shared picture breaks a gauge for a pixel or a few; such a break does not end the run.
    if (hit) last = x;
    if (start >= 0 && (x === x1 || x - last > gap)) {
      if (last + 1 - start >= minLen) runs.push({ x0: start, x1: last + 1 });
      start = -1;
    }
  }
  return runs;
}

// The EXP fill: yellow-green.
const isGreen = (r, g, b) => g > 140 && b < 110 && g > b + 70 && r < g + 40;

// The three gauges start at fixed steps (HP, MP, EXP: 108 game pixels apart), so any two fills that can be seen fix where
// the bar is. A hunting character is often low on HP or MP, so a fill may be a sliver or missing: while full gauges were
// required, HP under about 60% or MP under about 25% meant "status bar not found" (found 2026-11-24). Every plausible
// placement is returned, best first; the caller keeps the one whose text reads.
export function gaugeCandidates(img, limit = 8) {
  const { height: H, width: W, data: d } = img, minLen = Math.max(2, Math.round(W * 0.0015));
  const hits = [];
  // The EXP fill begins a few pixels after its step (measured on the game's own bar).
  const kinds = [[isRed, 0], [isBlue, 1], [isGreen, 2.045]];
  for (let y = H - 2; y >= Math.floor(H * 0.6); y--) {
    const runs = [];
    for (const [test, slot] of kinds) for (const q of runsOn(img, y, test, 0, W, minLen)) runs.push({ ...q, slot });
    if (runs.length < 2) continue;
    for (const a of runs) for (const b of runs) {
      if (b.slot <= a.slot || b.x0 <= a.x0) continue;
      const pitch = (b.x0 - a.x0) / (b.slot - a.slot), k = pitch / NATIVE_PITCH;
      if (k < 0.5 || k > 5 || a.x1 - a.x0 > pitch * 1.03 || b.x1 - b.x0 > pitch * 1.03) continue;
      const hpX0 = a.x0 - a.slot * pitch;
      if (hpX0 < -2 || hpX0 + pitch * 3.3 > W + 2) continue;
      hits.push({ y, pitch, hpX0, len: (a.x1 - a.x0 + b.x1 - b.x0) / pitch });
    }
    if (hits.length > 60000) break;
  }
  const groups = new Map();
  for (const h of hits) {
    const key = `${Math.round(h.pitch / 3)}|${Math.round(h.hpX0 / 4)}`;
    const g = groups.get(key) || { rows: new Set(), pitch: [], hpX0: [], len: 0 };
    g.rows.add(h.y); g.pitch.push(h.pitch); g.hpX0.push(h.hpX0); g.len += h.len; groups.set(key, g);
  }
  const median = (v) => v.sort((x, y) => x - y)[v.length >> 1];
  const out = [];
  for (const g of groups.values()) {
    const pitch = median(g.pitch), k = pitch / NATIVE_PITCH, ys = [...g.rows].sort((x, y) => y - x);
    // The gauge rows are one solid band about six game rows tall.
    let top = ys[0], bottom = ys[0];
    for (const y of ys.slice(1)) { if (top - y <= 1 + Math.round(k * 0.5)) top = y; else break; }
    const barH = bottom - top + 1;
    if (barH < Math.max(2, k * 3) || barH > k * 10 + 2) continue;
    const hpX0 = Math.round(median(g.hpX0)), p = Math.round(pitch);
    out.push({ top, bottom, barH, hpX0, mpX0: Math.round(hpX0 + pitch), pitch: p, expX0: Math.round(hpX0 + pitch * 2), width: p, score: Math.min(1, barH / (k * 6)) + g.len / g.pitch.length });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit);
}
// The first placement whose numbers read, or the best placement with no reading. `last` is the placement that read
// before in a frame of the same size: the bar does not move, so it is tried first and needs no gauge at all.
export async function readExp(img, { last = null, ocrGlyph = null, learned = new Map() } = {}) {
  const list = [];
  if (last && last.W === img.width && last.H === img.height) list.push(last.g);
  const full = findGauges(img);
  if (full) list.push(full);
  let first = null;
  for (const g of list) {
    const text = await readExpText(img, expTextBox(g, img), g, { ocrGlyph, learned });
    if (parseExp(text)) return { g, text, how: 'exact' };
    first ??= { g, text, how: null };
  }
  for (const g of list) { const soft = readSmeared(img, g); if (soft) return { g, text: soft, how: 'soft' }; }
  // A placement guessed from slivers can be a few pixels off, where the exact reader could start mid-number, so only the
  // whole-line fit counts here, searched a little wider.
  for (const g of gaugeCandidates(img)) {
    const r = readSmeared(img, g, { wide: true, info: true });
    if (r?.ok) return { g: r.g, text: r.text, how: 'soft' };
    first ??= { g, text: '', how: null };
  }
  return first;
}

// The quick search for full HP and MP gauges: same row, similar width, blue starting shortly after red ends. Searched
// bottom-up, so a red cape or blue water higher up never wins. Returns the gauge row band and geometry.
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
      // The first row found is the gauge's faint bottom edge, where part of the red can be missing; the start of each
      // gauge is taken from its middle row.
      const mid = (top + bottom) >> 1;
      const red = runsOn(img, mid, isRed, 0, W, minW).find((q) => q.x0 < r.x1 && q.x1 > r.x0) || r;
      const blue = runsOn(img, mid, isBlue, 0, W, minW).find((q) => q.x0 < b.x1 && q.x1 > b.x0) || b;
      const pitch = blue.x0 - red.x0;
      // The gauges are 6 rows for a pitch of 108; a two-row sliver of button border on an enlarged frame is not a gauge.
      // A pitch far under half the game's own is not the bar (a 1026-wide window once gave 27 for a real 109).
      if (pitch < NATIVE_PITCH * 0.5 || barH < 2 || barH > pitch || barH < pitch * 0.025) continue;
      return { top, bottom, barH, hpX0: red.x0, mpX0: blue.x0, pitch, expX0: blue.x0 + pitch, width: pitch };
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
  const t = String(text || '').replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/\s+/g, '').replace(/^EXP\.?/i, '');
  // The whole line must be the number: an unread glyph ('?') in front of it used to leave only its tail ("?,099" read
  // as 99, owner 2026-11-19), and thousands separators must make whole groups.
  const m = /^(\d{1,3}(?:,\d{3})*|\d+)[\[(]?(\d{1,3}\.\d{1,2})%[\])]?$/.exec(t);
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
  [G(['#####', '....#', '....#', '....#', '...#.', '..#..', '..#..'])]: '7', // seen 2026-11-19 (EXP 7,099)
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

// ---------- level and job, next to the gauges ----------
// The level is drawn as white digits on orange tiles left of the HP gauge; the job name is the white line beside them
// (owner 2026-11-19: read the level too). Both are found from the gauges' position and size, at any screen scale.
const isOrange = (d, i) => d[i] > 200 && d[i + 1] > 80 && d[i + 1] < 200 && d[i + 2] < 90;
export function levelBox(img, g) {
  const s = g.pitch / 108, { width: W, data: d } = img;
  const xa = Math.max(0, Math.round(g.hpX0 - 230 * s)), xb = Math.max(0, Math.round(g.hpX0 - 10 * s));
  let best = null;
  for (let y = Math.max(0, Math.round(g.top - 16 * s)); y <= Math.min(img.height - 1, Math.round(g.top + 6 * s)); y++) {
    let x0 = -1, x1 = -1, n = 0;
    for (let x = xa; x < xb; x++) { if (isOrange(d, (y * W + x) * 4)) { n++; if (x0 < 0) x0 = x; x1 = x; } }
    if (n >= 8 * s && (!best || n > best.n)) best = { n, x0, x1 };
  }
  if (!best) return null;
  let y0 = null, y1 = null;
  for (let y = Math.max(0, Math.round(g.top - 20 * s)); y <= Math.min(img.height - 1, Math.round(g.top + 8 * s)); y++) {
    let n = 0;
    for (let x = best.x0; x <= best.x1; x++) if (isOrange(d, (y * W + x) * 4)) n++;
    if (n >= (best.x1 - best.x0 + 1) * 0.3) { if (y0 == null) y0 = y; y1 = y; }
  }
  return y0 == null ? null : { x0: best.x0, x1: best.x1 + 1, y0, y1: y1 + 1, s };
}
// The level's digits sit on one tile each, with a dark gap between tiles. The OCR once dropped one
// ("17" came back as 1 on 2026-11-24), so a read only counts when it has as many digits as there are tiles.
export function levelTiles(img, lv) {
  const tiles = [];
  let start = -1;
  for (let x = lv.x0; x <= lv.x1; x++) {
    let n = 0;
    if (x < lv.x1) for (let y = lv.y0; y < lv.y1; y++) if (isOrange(img.data, (y * img.width + x) * 4)) n++;
    const on = n >= (lv.y1 - lv.y0) * 0.2;
    if (on && start < 0) start = x;
    if (!on && start >= 0) { if (x - start >= 6 * lv.s) tiles.push({ x0: start, x1: x, y0: lv.y0, y1: lv.y1 }); start = -1; }
  }
  return tiles.length <= 3 ? tiles : [];
}
// The job line: from just right of the level tiles to well before the HP gauge, on the upper half of the tiles' height.
export function jobBox(img, g, lv) {
  if (!lv) return null;
  const s = lv.s;
  return { x0: Math.round(lv.x1 + 8 * s), x1: Math.round(Math.min(g.hpX0 - 8 * s, lv.x1 + 120 * s)), y0: Math.max(0, Math.round(lv.y0 - 8 * s)), y1: Math.round(lv.y0 + (lv.y1 - lv.y0) * 0.45 + 2 * s) };
}
// Bright, unsaturated pixels (the white letters) as black on white, enlarged k times with a margin, for OCR.
// `onTile`: white on the orange tiles, told by brightness alone: in a shared picture the orange tints the thin strokes.
export function inkImage(img, box, k = 6, { onTile = false } = {}) {
  const pad = 12, W = (box.x1 - box.x0) * k + pad * 2, H = (box.y1 - box.y0) * k + pad * 2;
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  for (let y = box.y0; y < box.y1; y++) for (let x = box.x0; x < box.x1; x++) {
    const i = (y * img.width + x) * 4, r = img.data[i], gg = img.data[i + 1], b = img.data[i + 2];
    if (onTile ? r * 0.299 + gg * 0.587 + b * 0.114 < 190 : !(r + gg + b > 540 && Math.max(r, gg, b) - Math.min(r, gg, b) < 60)) continue;
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const o = (((y - box.y0) * k + dy + pad) * W + (x - box.x0) * k + dx + pad) * 4; data[o] = data[o + 1] = data[o + 2] = 0; }
  }
  return { width: W, height: H, data };
}
// Game job names (first and second job) to the site's job keys.
const JOBS = [[/fighter/i, 'fighter'], [/page/i, 'page'], [/spear/i, 'spear'], [/crossbow/i, 'crossbow'], [/hunter/i, 'hunter'], [/(fire|poison)/i, 'fire'], [/(ice|light)/i, 'ice'], [/cleric/i, 'cleric'], [/assassin/i, 'assassin'], [/bandit/i, 'bandit'],
  [/warrior/i, 'warrior'], [/(bowman|archer)/i, 'archer'], [/(magician|wizard|mage)/i, 'mage'], [/(rogue|thief)/i, 'thief']];
export const jobKey = (text) => (JOBS.find(([re]) => re.test(String(text || ''))) || [])[1] || null;
export const parseLevel = (text) => { const m = /^\s*(\d{1,3})\s*$/.exec(String(text || '').replace(/[Oo]/g, '0').replace(/[Il|]/g, '1')); const n = m ? Number(m[1]) : NaN; return n >= 1 && n <= 200 ? n : null; };

// ---------- reading a smeared frame ----------
// The game draws its status bar at one size: the HP and MP gauges start 108 pixels apart whatever the window size. A share
// can arrive enlarged or reduced (full screen on a bigger monitor, display scaling), and then the digits are blurred and
// the exact table above no longer matches. Here the text line is sampled back onto the game's own pixel grid, at several
// scales and sub-pixel shifts, and the sequence of glyphs whose softened shapes fit best is found by a shortest path. The
// result only counts when it has the form "digits[digits.digits%]" and beats the best different text clearly.
// Game pixels from the EXP gauge's corner to the text strip (measured on the game's own bar).
const TEXT_TOP = -14;
const TEXT_LEFT = 25;
const TEXT_ROWS = 9; // the 7 glyph rows with one row of margin above and below
const SOFT = (() => {
  const list = [];
  for (const [key, ch] of Object.entries(EXP_GLYPHS)) {
    const rows = key.split('/');
    if (ch === '7' && rows[2][3] === '#') continue; // the unseen alternative 7
    const w = rows[0].length, top = ch === ',' ? 6 : ch === '.' ? 6 : 0;
    const grid = Array.from({ length: TEXT_ROWS }, () => new Array(w + 2).fill(0));
    rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#' && grid[y + top + 1]) grid[y + top + 1][x + 1] = 1; }));
    list.push({ ch, w, grid });
  }
  return list;
})();
export function softTemplates(a) {
  return SOFT.map(({ ch, w, grid }) => ({ ch, w, cells: grid.map((row, y) => row.map((_, x) => {
    let v = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) v += (grid[y + dy]?.[x + dx] || 0) * (dy ? a : 1 - 2 * a) * (dx ? a : 1 - 2 * a);
    return v;
  })) }));
}
const TEMPLATES = [0.04, 0.12, 0.2].map(softTemplates);
// A reduced frame (the game window made smaller, so the game draws its bar smaller) blurs each game pixel over 1/k of a
// source pixel and more; these shapes are the glyphs softened by a Gaussian of that width.
export function gaussTemplates(sigma) {
  const r = 2, wt = [];
  for (let d = -r; d <= r; d++) wt.push(Math.exp(-(d * d) / (2 * sigma * sigma)));
  const sum = wt.reduce((a, b) => a + b, 0); for (let i = 0; i < wt.length; i++) wt[i] /= sum;
  return SOFT.map(({ ch, w, grid }) => ({ ch, w, cells: grid.map((row, y) => row.map((_, x) => {
    let v = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) v += (grid[y + dy]?.[x + dx] || 0) * wt[dy + r] * wt[dx + r];
    return v;
  })) }));
}
// k = game scale of the frame. Width from the source downscale (1/k) plus the sampling onto the game grid (1).
const SMALL = new Map();
const smallTemplates = (k) => { const key = Math.round(k * 20); if (!SMALL.has(key)) { const s0 = 0.29 * Math.sqrt(1 / (key / 20) ** 2 + 1); SMALL.set(key, [0.85, 1, 1.15].map((f) => gaussTemplates(s0 * f))); } return SMALL.get(key); };
// A reduced frame made by the game or the browser shrinking the window: how each glyph really looks after that shrink,
// worked out exactly instead of approximated by a blur (2026-11-28, owner: "배율 상관없이 인식되도록"). A real capture of
// the game shrunk point-sampled was not read even at 0.95x, bilinear below 0.8x, area-averaged below 0.7x. The glyph is
// placed on the game grid at scale k with its sub-pixel phase, shrunk to screen pixels by one of the three ways, and then
// sampled back onto the game grid exactly as readSmeared samples the frame, so template and frame go through the same steps.
// A reduced frame must beat the next different reading by more: on 240 synthetic shrinks (8 numbers, 0.65-0.9x, area and
// bilinear) every wrong reading won by at most 1.26x, while 85% of the right ones won by more.
const SMALL_MARGIN = 1.27;
const PHASES = 8;
const EXACT = new Map();
function exactTemplates(kernel, k, px, py) {
  const key = `${kernel}|${k.toFixed(3)}|${px}|${py}`;
  if (EXACT.has(key)) return EXACT.get(key);
  const X0 = px / PHASES, Y0 = py / PHASES;
  const list = SOFT.map(({ ch, w, grid }) => {
    const C = w + 2, R = TEXT_ROWS;
    const native = (c, r) => (r >= 0 && r < R && c >= 0 && c < C ? grid[r][c] : 0);
    // Screen pixels covering the block, value of each after the shrink.
    const OW = Math.ceil(X0 + C * k) + 2, OH = Math.ceil(Y0 + R * k) + 2, v = new Float64Array(OW * OH);
    for (let j = 0; j < OH; j++) for (let i = 0; i < OW; i++) {
      let val = 0;
      if (kernel === 'nearest') val = native(Math.floor((i + 0.5 - X0) / k), Math.floor((j + 0.5 - Y0) / k));
      else if (kernel === 'bilinear') {
        const u = (i + 0.5 - X0) / k - 0.5, t = (j + 0.5 - Y0) / k - 0.5, iu = Math.floor(u), it = Math.floor(t), fu = u - iu, ft = t - it;
        val = (native(iu, it) * (1 - fu) + native(iu + 1, it) * fu) * (1 - ft) + (native(iu, it + 1) * (1 - fu) + native(iu + 1, it + 1) * fu) * ft;
      } else { // area
        const a0 = (i - X0) / k, a1 = (i + 1 - X0) / k, b0 = (j - Y0) / k, b1 = (j + 1 - Y0) / k;
        for (let r = Math.floor(b0); r < Math.ceil(b1); r++) for (let c = Math.floor(a0); c < Math.ceil(a1); c++) {
          const ov = (Math.min(c + 1, a1) - Math.max(c, a0)) * (Math.min(r + 1, b1) - Math.max(r, b0));
          if (ov > 0) val += native(c, r) * ov;
        }
        val /= (a1 - a0) * (b1 - b0);
      }
      v[j * OW + i] = val;
    }
    // Back onto the game grid: each game cell is the average of the screen pixels under it.
    const cells = Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => {
      const x0 = X0 + c * k, x1 = x0 + k, y0 = Y0 + r * k, y1 = y0 + k;
      let sum = 0;
      for (let j = Math.floor(y0); j < Math.ceil(y1); j++) for (let i = Math.floor(x0); i < Math.ceil(x1); i++) {
        const ov = (Math.min(i + 1, x1) - Math.max(i, x0)) * (Math.min(j + 1, y1) - Math.max(j, y0));
        if (ov > 0 && i >= 0 && j >= 0 && i < OW && j < OH) sum += v[j * OW + i] * ov;
      }
      return sum / (k * k);
    }));
    return { ch, w, cells };
  });
  EXACT.set(key, list);
  return list;
}
const phaseOf = (f) => ((Math.round((f - Math.floor(f)) * PHASES) % PHASES) + PHASES) % PHASES;
// Digits, then "[", digits, ".", digits, "%", "]".
const STEP = (state, ch) => {
  const digit = ch >= '0' && ch <= '9';
  if (state === 0) return digit ? 1 : -1;
  if (state === 1) return digit || ch === ',' ? 1 : ch === '[' ? 2 : -1;
  if (state === 2) return digit ? 3 : -1;
  if (state === 3) return digit ? 3 : ch === '.' ? 4 : -1;
  if (state === 4) return digit ? 5 : -1;
  if (state === 5) return digit ? 6 : -1;
  if (state === 6) return ch === '%' ? 7 : -1;
  return state === 7 && ch === ']' ? 8 : -1;
};
function decode(cells, cols, T) {
  // best[state][x]: cost so far per glyph column, each glyph being its width plus one empty column.
  const INF = 1e9, best = Array.from({ length: 9 }, () => new Float64Array(cols + 12).fill(INF)), from = Array.from({ length: 9 }, () => new Array(cols + 12).fill(null));
  const blank = Float64Array.from({ length: cols + 1 }, (_, x) => { let e = 0; for (let y = 0; y < TEXT_ROWS; y++) e += cells[y][x + 1] ** 2; return e; });
  // Columns skipped before the first digit must be empty (from just past the EXP label), so a thin leading 1 is not lost.
  for (let x = 0, skipped = 0; x < 11; x++) { best[0][x] = skipped; if (x >= 3) skipped += blank[x]; }
  let end = null;
  for (let x = 0; x < cols; x++) for (let st = 0; st < 8; st++) {
    const c0 = best[st][x];
    if (c0 >= INF) continue;
    // One more empty column between glyphs (commas, dots and brackets have wider margins than digits).
    if (st && blank[x] < 0.8 && c0 + blank[x] < best[st][x + 1]) { best[st][x + 1] = c0 + blank[x]; from[st][x + 1] = [st, x, '', (from[st][x]?.[3] ?? 0) + 1]; }
    for (const t of (typeof T === 'function' ? T(x) : T)) {
      const ns = STEP(st, t.ch);
      if (ns < 0 || x + t.w + 1 > cols) continue;
      let e = 0;
      for (let y = 0; y < TEXT_ROWS; y++) { const row = cells[y], tr = t.cells[y]; for (let k = 1; k <= t.w + 1; k++) { const d = row[x + k] - tr[k]; e += d * d; } }
      const nx = x + t.w + 1, c = c0 + e;
      if (c < best[ns][nx]) { best[ns][nx] = c; from[ns][nx] = [st, x, t.ch, (from[st][x]?.[3] ?? 0) + t.w + 1]; }
      if (ns === 8 && c === best[8][nx] && (!end || c / from[8][nx][3] < end.cost)) end = { x: nx, cost: c / from[8][nx][3] };
    }
  }
  if (!end) return null;
  let text = '', st = 8, x = end.x;
  while (st > 0 || from[st][x]) { const f = from[st][x]; if (!f) break; text = f[2] + text; st = f[0]; x = f[1]; if (st === 0) break; }
  return { text, cost: end.cost / TEXT_ROWS };
}
// The text of a smeared frame, or null when nothing fits well enough. `info` (tests) also returns the fit.
export function readSmeared(img, g, { info = false, maxCost = 0.022, margin = 1.15, wide = false } = {}) {
  const k0 = g.pitch / NATIVE_PITCH;
  // Below about 0.65 the digits blur into each other and wrong readings start to fit (a test at 0.62 read 64.90 for
  // 64.30), so such a frame is not read; the page asks for a bigger game window instead (SMALL_SCALE).
  if (!(k0 >= SMALL_SCALE && k0 < 5)) return null;
  const lum = (x, y) => { x = x < 0 ? 0 : x >= img.width ? img.width - 1 : x; y = y < 0 ? 0 : y >= img.height ? img.height - 1 : y; const i = (y * img.width + x) * 4; return (img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000; };
  // Summed areas of the strip, so averaging a game pixel costs four lookups.
  const bx0 = Math.max(0, Math.floor(g.expX0 - 6 * k0)), bx1 = Math.min(img.width, Math.ceil(g.expX0 + 150 * k0)), by0 = Math.max(0, Math.floor(g.top - 26 * k0)), by1 = Math.min(img.height, g.top + 2);
  const W = bx1 - bx0, H = by1 - by0;
  if (W < 20 || H < 6) return null;
  const sat = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += lum(bx0 + x, by0 + y); sat[(y + 1) * (W + 1) + x + 1] = sat[y * (W + 1) + x + 1] + row; } }
  const S = (x, y) => { // summed area at fractional coordinates
    x = Math.max(0, Math.min(W, x)); y = Math.max(0, Math.min(H, y));
    const xi = Math.min(W - 1, Math.floor(x)), yi = Math.min(H - 1, Math.floor(y)), fx = x - xi, fy = y - yi, n = W + 1;
    return (sat[yi * n + xi] * (1 - fx) + sat[yi * n + xi + 1] * fx) * (1 - fy) + (sat[(yi + 1) * n + xi] * (1 - fx) + sat[(yi + 1) * n + xi + 1] * fx) * fy;
  };
  const cols = 104, found = new Map(), digits = (t) => t.replace(/,/g, '');
  const tryAt = (k, oy, ox, Ts, exact = false) => {
    const top = g.top - by0 + (TEXT_TOP + oy) * k, left = g.expX0 - bx0 + (TEXT_LEFT + ox) * k;
    const cells = [], vals = [];
    for (let y = 0; y < TEXT_ROWS; y++) { const row = new Float64Array(cols + 12); for (let x = 0; x < cols; x++) { const X = left + x * k, Y = top + y * k; row[x] = (S(X + k, Y + k) - S(X, Y + k) - S(X + k, Y) + S(X, Y)) / (k * k); vals.push(row[x]); } cells.push(row); }
    vals.sort((a, b) => a - b);
    const lo = vals[Math.floor(vals.length * 0.3)], hi = vals[Math.floor(vals.length * 0.985)];
    if (hi - lo < 40) return 9;
    for (const row of cells) for (let x = 0; x < cols; x++) row[x] = Math.max(-0.2, Math.min(1.2, (row[x] - lo) / (hi - lo)));
    let best = 9;
    const sets = exact ? [...Ts, ...['area', 'bilinear'].map((kernel) => (x) => exactTemplates(kernel, Math.round(k * 1000) / 1000, phaseOf(left + x * k), phaseOf(top)))] : Ts;
    for (const T of sets) {
      const r = decode(cells, cols, T);
      if (!r) continue;
      r.k = k; r.oy = oy; r.ox = ox;
      best = Math.min(best, r.cost);
      // A comma is the faintest mark, so readings that differ only in commas count as one.
      const id = digits(r.text), old = found.get(id);
      if (!old || r.cost < old.cost) found.set(id, r);
    }
    return best;
  };
  // The gauge edges smear in a shared picture (a real share measured 106 for 108), so the scale is searched over two pixels.
  // Coarse: where the line sits. Fine: around the three best spots, at finer scales and shifts.
  const small = k0 < 0.98, TS = small ? smallTemplates(k0) : TEMPLATES;
  const spots = [];
  for (const f of [0, 0.9, 1.8, -0.9].map((px) => 1 + px / g.pitch)) for (let oy = -2; oy <= 2; oy += 0.5) for (const ox of wide ? [-3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5] : [0, 0.5]) spots.push([tryAt(k0 * f, oy, ox, [TS[1]]), k0 * f, oy, ox]);
  spots.sort((a, b) => a[0] - b[0]);
  const fine = (exact) => { for (const [, k, oy, ox] of spots.slice(0, 3)) for (const f of [1, 1.003, 0.997]) for (const dy of [-0.25, 0, 0.25]) for (const dx of [-0.25, 0, 0.25]) tryAt(k * f, oy + dy, ox + dx, TS, exact); };
  // A reduced frame never fits as tightly; the margin over the next reading still has to hold.
  const judge = () => { const l = [...found.values()].sort((a, b) => a.cost - b.cost); return [l, l[0] && l[0].cost <= (small ? Math.max(maxCost, 0.036) : maxCost) && (!l[1] || l[1].cost >= l[0].cost * (small ? Math.max(margin, SMALL_MARGIN) : margin)) && parseExp(digits(l[0].text))]; };
  fine(false);
  let [list, ok] = judge();
  // Not read with the blurred shapes: the exact shapes of a shrunk window are tried (slower, so only when needed).
  if (!ok && small) { fine(true); [list, ok] = judge(); }
  const b = list[0], p = b && b.k * NATIVE_PITCH, shift = b ? Math.round(b.ox * b.k) : 0;
  // The placement as the text itself shows it, good for the frames that follow.
  const fit = b && { ...g, pitch: Math.round(p), width: Math.round(p), expX0: g.expX0 + shift, top: g.top + Math.round(b.oy * b.k) };
  return info ? { ok: !!ok, text: b && digits(b.text), cost: b?.cost, next: list[1], g: fit } : ok ? digits(list[0].text) : null;
}

// Chrome shrinks a shared window to the sharer's screen size in CSS pixels unless a bigger size is asked for: on a laptop
// at 125-150% display scaling a 1366-wide game arrived 1234 wide and the 5-pixel digits were lost (measured 2026-11-24).
export const SHARE_SIZE = { width: { ideal: 3840, max: 7680 }, height: { ideal: 2160, max: 4320 } };

// A frame with nothing in it (a full-screen game shared as a window on some PCs).
export function isBlack(img) {
  let bright = 0, n = 0;
  for (let i = 0; i < img.data.length; i += 4 * 997) { n++; if (img.data[i] + img.data[i + 1] + img.data[i + 2] > 60) bright++; }
  return n > 20 && bright < n * 0.01;
}
