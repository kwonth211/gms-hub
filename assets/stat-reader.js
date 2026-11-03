// Finds the value boxes of the in-game CHARACTER STAT window in a captured frame, at any screen scale.
// Every row of that window is a coloured label box (pink for name to fame, olive green for STR to LUK, blue for the
// DETAIL panel) followed directly by a light grey value box. The label text itself is white on colour and reads badly,
// so rows are found by that colour pair and named by their order: the four green rows are STR, DEX, INT, LUK; the pink row
// after the tall JOB row is LEVEL; the blue rows run ATTACK, WEAPON DEF., MAGIC, MAGIC DEF., ACCURACY...
// Only the dark value text is handed to OCR afterwards.

const VALUE_BG = [220, 218, 208];
const BLUE_ORDER = ['attack', 'wdef', 'magic', 'mdef', 'acc', 'eva', 'critRate', 'critDmg', 'speed', 'jump'];

const close = (d, i, c, tol) => Math.abs(d[i] - c[0]) <= tol && Math.abs(d[i + 1] - c[1]) <= tol && Math.abs(d[i + 2] - c[2]) <= tol;

// Label colours by hue rather than exact value, so smoothing from screen scaling doesn't matter. Greys and whites (the
// thin borders between label and value) return null.
function labelKind(d, i) {
  const r = d[i];
  const g = d[i + 1];
  const b = d[i + 2];
  if (Math.max(r, g, b) - Math.min(r, g, b) < 40) return null;
  if (g > b + 50 && r > b + 40) return 'green';
  if (r > g + 50 && r > b + 25) return 'pink';
  if (b > r + 35 && b > g + 15) return 'blue';
  return null;
}

// Horizontal runs of the value colour whose left edge sits just after a label colour, merged into boxes down the rows.
// Rows with text are cut at the first letter, but the empty rows at the top and bottom of each box give its full width.
export function findStatCells(img) {
  const { width: W, height: H, data: d } = img;
  const runs = [];
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (!close(d, (y * W + x) * 4, VALUE_BG, 16)) {
        x++;
        continue;
      }
      const x0 = x;
      let last = x;
      // Bridge one or two blended pixels only.
      while (x < W && x - last <= 2) {
        if (close(d, (y * W + x) * 4, VALUE_BG, 16)) last = x;
        x++;
      }
      x = last + 1;
      if (last - x0 < 1) continue;
      // Between label and value there is a thin light border; look back past it for the label colour.
      let kind = null;
      for (let k = 1; k <= 16 && !kind && x0 - k >= 0; k++) kind = labelKind(d, (y * W + x0 - k) * 4);
      if (kind) runs.push({ y, x0, x1: last, kind });
    }
  }
  const cells = [];
  for (const r of runs) {
    const c = cells.find((b) => b.kind === r.kind && Math.abs(b.x0 - r.x0) <= 3 && r.y - b.y1 <= 3);
    if (c) {
      c.y1 = r.y;
      c.x1 = Math.max(c.x1, r.x1);
    } else cells.push({ kind: r.kind, x0: r.x0, x1: r.x1, y0: r.y, y1: r.y });
  }
  return cells.filter((c) => c.y1 - c.y0 >= 6 && c.x1 - c.x0 >= 20);
}

// Name the cells by their order inside each colour group. Returns { str, dex, int, luk, level, job, attack, magic, acc, ... }
// as rectangles to read, or null when no stat window is visible.
export function statLayout(img) {
  const cells = findStatCells(img);
  const group = (kind, inside = () => true) => {
    const g = cells.filter((c) => c.kind === kind && inside(c));
    if (!g.length) return [];
    // Other UI can share a colour; keep the column with the most rows, then the most value-box area.
    const byX = new Map();
    for (const c of g) {
      const key = [...byX.keys()].find((k) => Math.abs(k - c.x0) <= 3) ?? c.x0;
      byX.set(key, [...(byX.get(key) || []), c]);
    }
    const area = (col) => col.reduce((n, c) => n + (c.x1 - c.x0) * (c.y1 - c.y0 + 1), 0);
    const column = [...byX.values()].sort((a, b) => b.length - a.length || area(b) - area(a))[0].sort((a, b) => a.y0 - b.y0);
    // At some scales the thin border between two rows blends into the value colour and two boxes come out as one.
    // A box twice the usual height or more is cut back into rows (the JOB box is only ~1.7 rows tall and stays whole).
    const heights = column.map((c) => c.y1 - c.y0 + 1).sort((a, b) => a - b);
    const unit = heights[Math.floor(heights.length / 3)];
    const pitch = (unit * 18) / 15;
    return column.flatMap((c) => {
      const h = c.y1 - c.y0 + 1;
      if (h < unit * 1.9) return [c];
      const n = Math.round((h + pitch - unit) / pitch);
      return Array.from({ length: n }, (_, i) => ({ ...c, y0: Math.round(c.y0 + i * pitch), y1: Math.round(c.y0 + i * pitch + unit - 1) }));
    });
  };
  const green = group('green');
  const pink = group('pink');
  if (green.length < 4 && pink.length < 3) return null;
  // The DETAIL panel opens to the right of the main panel at the same height; the sky and other windows can be blue too.
  const left = [...green, ...pink];
  const unitH = left.map((c) => c.y1 - c.y0 + 1).sort((a, b) => a - b)[Math.floor(left.length / 3)];
  const lx = Math.min(...left.map((c) => c.x0));
  const top = Math.min(...left.map((c) => c.y0)) - unitH * 3;
  const bottom = Math.max(...left.map((c) => c.y1)) + unitH * 3;
  const blue = group('blue', (c) => c.x0 > lx + unitH * 4 && c.x0 < lx + unitH * 25 && c.y0 >= top && c.y1 <= bottom);
  const out = {};
  if (green.length >= 4) [out.str, out.dex, out.int, out.luk] = green.slice(-4);
  if (pink.length) {
    const heights = pink.map((c) => c.y1 - c.y0);
    const median = [...heights].sort((a, b) => a - b)[heights.length >> 1];
    const jobAt = heights.findIndex((h) => h > median * 1.5);
    if (jobAt >= 0) {
      out.job = pink[jobAt];
      if (pink[jobAt + 1]) out.level = pink[jobAt + 1];
    } else if (pink.length >= 3) out.level = pink[2];
  }
  if (blue.length >= 3) {
    // Blue rows are named by where they sit, not by counting: the DETAIL panel's ATTACK row is a fixed 5.94 rows above STR
    // in the game's layout, and rows follow every pitch. A missed, split or merged box can't shift the names of the others.
    let pitch;
    let anchor;
    if (green.length >= 4) {
      pitch = (out.luk.y0 - out.str.y0) / 3;
      anchor = out.str.y0 - 5.94 * pitch;
    } else {
      const unit = blue[0].y1 - blue[0].y0 + 1;
      pitch = (unit * 18) / 15;
      anchor = blue[0].y0;
    }
    // Each name gets exactly one row's rectangle, even where two boxes merged into one cell at an odd screen scale.
    const unit = Math.round(pitch * (15 / 18));
    BLUE_ORDER.forEach((k, i) => {
      const y0 = Math.round(anchor + i * pitch);
      const mid = y0 + unit / 2;
      const c = blue.find((b) => b.y0 <= mid && b.y1 >= mid);
      if (c) out[k] = { ...c, y0, y1: y0 + unit - 1 };
    });
  }
  // Row height in screen pixels, for scaling the crops to a size OCR reads well.
  out.rowHeight = green.length ? green[0].y1 - green[0].y0 + 1 : pink[0].y1 - pink[0].y0 + 1;
  return out;
}

// Pull numbers out of OCR text of one value box.
export function parseValue(key, text) {
  const t = text.replace(/[oO]/g, '0').replace(/[lI|]/g, '1').replace(/[Ss](?=\d)/g, '5');
  const nums = (t.match(/\d+/g) || []).map(Number);
  if (key === 'attack') return nums.length >= 2 ? [nums[0], nums[1]] : null;
  return nums.length ? nums[0] : null;
}

const JOBS = [
  [/SPEAR/, 'spearman', 'spear'], [/FIGHTER/, 'fighter'], [/PAGE/, 'page'], [/CROSS/, 'crossbowman', 'crossbow'], [/HUNTER/, 'hunter', 'bow'],
  [/ASSASSIN/, 'assassin', 'claw'], [/BANDIT/, 'bandit', 'dagger'], [/CLERIC/, 'cleric', 'wand'], [/FIRE|POISON/, 'fp', 'wand'], [/ICE|LIGHT/, 'il', 'wand'],
  [/WARRIOR/, '', ''], [/BOWMAN|ARCHER/, '', 'bow'], [/THIEF|ROGUE/, '', 'claw'], [/MAGICIAN/, '', 'wand']
];
// The JOB box shows the first job in large letters and the second job below it ("MAGICIAN / WIZARD-ICE/LIGHTNING").
export function parseJob(text) {
  const t = text.toUpperCase();
  return JOBS.find(([re]) => re.test(t)) || null;
}

// Area-average resize, the same thing a browser canvas does with smoothing on, so Node tests and the page agree.
export function rescale(img, s) {
  const w = Math.max(1, Math.round(img.width / s));
  const h = Math.max(1, Math.round(img.height / s));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy0 = y * s;
    const sy1 = Math.min(img.height, (y + 1) * s);
    for (let x = 0; x < w; x++) {
      const sx0 = x * s;
      const sx1 = Math.min(img.width, (x + 1) * s);
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = Math.floor(sy0); yy < Math.ceil(sy1); yy++) {
        const wy = Math.min(yy + 1, sy1) - Math.max(yy, sy0);
        for (let xx = Math.floor(sx0); xx < Math.ceil(sx1); xx++) {
          const wt = wy * (Math.min(xx + 1, sx1) - Math.max(xx, sx0));
          const i = (yy * img.width + xx) * 4;
          r += img.data[i] * wt;
          g += img.data[i + 1] * wt;
          b += img.data[i + 2] * wt;
          n += wt;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

const KEYS = ['str', 'dex', 'int', 'luk', 'level', 'job', 'attack', 'magic', 'acc'];

// Screen scaling (Retina, Windows 125%/150%) enlarges the window by an unknown factor. The frame is read as it is first,
// which works for whole and most smooth factors; when boxes are missing it is shrunk back towards game size and read
// again. The try that finds the most boxes wins. Rectangles are returned in the original frame's pixels.
export function readLayout(img) {
  let best = null;
  for (const s of [1, 2, 1.5, 1.25, 1.75, 3, 2.5]) {
    const small = s === 1 ? img : rescale(img, s);
    const layout = statLayout(small);
    if (!layout) continue;
    const score = KEYS.filter((k) => layout[k]).length;
    const scaled = { scale: s, score };
    for (const [k, v] of Object.entries(layout)) scaled[k] = typeof v === 'object' ? { ...v, x0: v.x0 * s, x1: v.x1 * s, y0: v.y0 * s, y1: v.y1 * s } : v * s;
    if (!best || score > best.score) best = scaled;
    if (score === KEYS.length) break;
  }
  return best;
}

// Cut one value box out, enlarged so letters are about 32px tall, as black text on white: values are dark on light grey,
// so everything darker than `ink` counts as ink (blur from screen scaling moves the best cut, so callers try a few). A white margin helps OCR find the line.
export function valueImage(img, cell, { from = 0, to = 1, ink = 130 } = {}) {
  const h = cell.y1 - cell.y0 + 1;
  const k = Math.max(1, 44 / h);
  const x0 = Math.round(cell.x0 + (cell.x1 - cell.x0) * from);
  const x1 = Math.round(cell.x0 + (cell.x1 - cell.x0) * to);
  const pad = 12;
  const W = Math.round((x1 - x0) * k) + pad * 2;
  const H = Math.round(h * k) + pad * 2;
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  for (let y = 0; y < H - pad * 2; y++)
    for (let x = 0; x < W - pad * 2; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x0 + x / k));
      const sy = Math.min(img.height - 1, Math.floor(cell.y0 + y / k));
      const i = (sy * img.width + sx) * 4;
      const lum = (img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000;
      const o = ((y + pad) * W + x + pad) * 4;
      data[o] = data[o + 1] = data[o + 2] = lum < ink ? 0 : 255;
    }
  return { width: W, height: H, data };
}

// Ink cut-offs to read each box with; the answer most of them agree on wins.
export const INK_LEVELS = [100, 130, 165];
export function vote(values) {
  const counts = new Map();
  for (const v of values) if (v !== null && v !== undefined) counts.set(JSON.stringify(v), (counts.get(JSON.stringify(v)) || 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? JSON.parse(best[0]) : null;
}
