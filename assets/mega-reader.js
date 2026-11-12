// Megaphone reader, shared by the admin collector (browser) and the sample checks (Node). Works on raw RGBA images
// ({ width, height, data }) of the game's chat box. Megaphones sit on coloured bands one text line (16 px at 1x) high:
// gold, pink or teal; plain chat and notices sit on the dark chat background and are skipped.

// Background colour → band class. Pink bands are dithered between two tones, so the ranges are wide.
export function bandClass(r, g, b) {
  if (r > 170 && g > 120 && g < 200 && b < 90) return 'Y';
  if (r > 160 && g > 120 && g < 175 && b > 140) return 'P';
  if (b > 150 && g > 150 && r < 150) return 'C';
  return null;
}

// The chat box anywhere in a whole game frame: rows where megaphone-band colour covers most of a wide span, confirmed
// by red channel digits on them. Returns { x, y, w, h } in pixels with room for a few lines above and below, or null
// when no megaphone is on screen (the caller keeps the last box it found).
export function findChatBox(img) {
  const { width: w, height: h, data } = img;
  const rows = [];
  // Per row, the longest stretch of band colour where text gaps are shorter than 24 px; stray band-coloured pixels
  // elsewhere in the scene don't join it.
  for (let y = 0; y < h; y += 2) {
    let best = null, cur = null;
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
      const band = bandClass(r, g, b), red = isRed(r, g, b);
      if (band || red) {
        if (!cur || x - cur.last > 24) cur = { first: x, last: x, band: 0, red: 0 };
        cur.last = x; if (band) cur.band++; else cur.red++;
        if (!best || cur.last - cur.first > best.last - best.first) best = cur;
      }
    }
    if (best && best.last - best.first >= 160 && best.band * 2 >= (best.last - best.first) * 0.45) rows.push({ y, ...best });
  }
  // Megaphone lines carry red channel digits, so only band rows within a line's height of red pixels count; then the
  // biggest vertical cluster of those rows is the chat box.
  const reds = rows.filter((r) => r.red >= 2);
  const near = rows.filter((r) => reds.some((q) => Math.abs(q.y - r.y) <= 12 && Math.min(q.last, r.last) > Math.max(q.first, r.first)));
  const clusters = [];
  for (const r of near) (clusters.length && r.y - clusters.at(-1).at(-1).y <= 24 ? clusters.at(-1) : clusters[clusters.push([]) - 1]).push(r);
  const kept = clusters.sort((a, b) => b.length - a.length)[0] || [];
  if (kept.length < 4) return null;
  // Both edges are medians: a band-coloured patch of scenery next to a box moved off the window's edge (a shop sign,
  // a name tag) can stretch a few rows sideways.
  const lasts = kept.map((r) => r.last).sort((a, b) => a - b), firsts = kept.map((r) => r.first).sort((a, b) => a - b);
  const x0 = firsts[firsts.length >> 1], x1 = lasts[lasts.length >> 1];
  const y0 = Math.max(0, kept[0].y - 48), y1 = Math.min(h, kept.at(-1).y + 48);
  return { x: Math.max(0, x0 - 12), y: y0, w: Math.min(w, x1 + 24) - Math.max(0, x0 - 12), h: y1 - y0 };
}

// Each row's most common colour (5-bit buckets), skipping the scrollbar at the right edge.
function rowBackground(img, y, right) {
  const { width: w, data } = img;
  const counts = new Map();
  for (let x = 0; x < right; x++) {
    const i = (y * w + x) * 4;
    const k = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let best = 0, n = 0;
  for (const [k, c] of counts) if (c > n) { best = k; n = c; }
  return { rgb: [((best >> 10) & 31) * 8 + 4, ((best >> 5) & 31) * 8 + 4, (best & 31) * 8 + 4], share: n / right };
}

// Text lines on megaphone bands: rows grouped by band colour, then split where a row has (almost) no text pixels.
export function findLines(img, { scrollbar = 20 } = {}) {
  const right = Math.max(10, img.width - scrollbar);
  const rows = [];
  for (let y = 0; y < img.height; y++) {
    const bg = rowBackground(img, y, right);
    // Pink bands are dithered between two tones, so the share counts every pixel of the band's class, not one tone.
    let cls = bandClass(...bg.rgb);
    if (cls) {
      let n = 0;
      for (let x = 0; x < right; x += 2) { const i = (y * img.width + x) * 4; if (bandClass(img.data[i], img.data[i + 1], img.data[i + 2]) === cls) n++; }
      if (n * 2 < right * 0.3) cls = null;
    }
    let text = 0;
    if (cls) for (let x = 0; x < right; x++) {
      const i = (y * img.width + x) * 4;
      if (Math.abs(img.data[i] - bg.rgb[0]) + Math.abs(img.data[i + 1] - bg.rgb[1]) + Math.abs(img.data[i + 2] - bg.rgb[2]) > 140 && !bandClass(img.data[i], img.data[i + 1], img.data[i + 2])) text++;
    }
    rows.push({ cls, bg: bg.rgb, text });
  }
  // The gap between two lines on the same colour still has a few stray ink pixels (descenders, the badge edge), so a
  // row counts as text only above a share of a typical text row. A change of band colour always ends a line.
  const inked = rows.map((r) => r.text).filter((n) => n > 0).sort((a, b) => a - b);
  const min = Math.max(3, (inked[Math.floor(inked.length * 0.75)] || 0) * 0.15);
  const isText = (r) => r.cls && r.text >= min;
  const lines = [];
  for (let y = 0; y < rows.length; y++) {
    if (!isText(rows[y])) continue;
    let end = y;
    while (end + 1 < rows.length && isText(rows[end + 1]) && rows[end + 1].cls === rows[y].cls) end++;
    // A line cut by the top or bottom edge of the box is not read; it is read whole in another frame.
    if (end - y + 1 >= 6 && y > 0 && end < rows.length - 1) {
      // The band ends where the scrollbar begins: the last band-coloured column on the line's middle row.
      const mid = (y + end) >> 1;
      let edge = right;
      while (edge > 10) { const i = (mid * img.width + edge - 1) * 4; if (bandClass(img.data[i], img.data[i + 1], img.data[i + 2])) break; edge--; }
      lines.push({ top: y, bottom: end, color: rows[y].cls, bg: rows[Math.min(end, y + 2)].bg, right: edge });
    }
    y = end;
  }
  return lines;
}

// The channel badge ("CHxx" in red inside a thin white frame, then the ear icon) is found by its red digits: the
// first cluster of red columns on the line. The message is read from just after it; the ear icon and the ": " are
// trimmed from the OCR text.
const LEFT = 4;
const isRed = (r, g, b) => r > 140 && g < 120 && b < 120 && r - g > 60;
export function findBadge(img, line, { scrollbar = 20 } = {}) {
  const right = Math.max(10, img.width - scrollbar);
  let first = -1, last = -1;
  for (let x = LEFT; x < right; x++) {
    let red = 0;
    for (let y = line.top; y <= line.bottom; y++) { const i = (y * img.width + x) * 4; if (isRed(img.data[i], img.data[i + 1], img.data[i + 2])) red++; }
    if (red) { if (first < 0) first = x; else if (x - last > 4) break; last = x; }
  }
  if (first < 0 || last - first < 6) return null;
  // The badge frame and the ear icon after it are drawn in near-white; the message begins after the last white column.
  let message = last + 5;
  for (let x = last + 1; x < Math.min(right, last + 32); x++) {
    let n = 0;
    for (let y = line.top; y <= line.bottom; y++) { const i = (y * img.width + x) * 4; if (Math.min(img.data[i], img.data[i + 1], img.data[i + 2]) > 200) n++; }
    if (n >= 2) message = x + 1;
  }
  return { left: Math.max(LEFT, first - 4), right: last + 4, message };
}

// Part of a line drawn black-on-white, `scale` times larger with a margin. 'ink' is anything far from the band
// colour (dark message text, bright yellow item names) but not the white badge fill; 'red' is the badge's channel digits.
export function lineBitmap(img, line, { x0 = LEFT, x1, scale = 3, scrollbar = 20, pad = 2, mode = 'ink' } = {}) {
  const right = Math.min(x1 ?? Infinity, line.right ?? Infinity, Math.max(10, img.width - scrollbar));
  const top = Math.max(0, line.top - pad), bottom = Math.min(img.height - 1, line.bottom + pad);
  const cols = Math.max(1, right - x0);
  const w = cols * scale + 24, h = (bottom - top + 1) * scale + 24;
  const out = new Uint8ClampedArray(w * h * 4).fill(255);
  let sig = 2166136261, ink = 0;
  for (let y = top; y <= bottom; y++) for (let x = x0; x < right; x++) {
    const i = (y * img.width + x) * 4, r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
    const on = mode === 'red' ? isRed(r, g, b)
      : Math.abs(r - line.bg[0]) + Math.abs(g - line.bg[1]) + Math.abs(b - line.bg[2]) >= 110 && Math.min(r, g, b) <= 225 && !bandClass(r, g, b);
    if (!on) continue;
    ink++;
    sig = Math.imul(sig ^ ((x - x0) * 131 + (y - top)), 16777619) >>> 0;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const o = ((12 + (y - top) * scale + dy) * w + 12 + (x - x0) * scale + dx) * 4;
      out[o] = out[o + 1] = out[o + 2] = 0;
    }
  }
  return { width: w, height: h, data: out, ink, sig: `${mode}:${line.color}:${x0}:${sig}` };
}

// The chat box's dark left border is inked on every row of the band; text starts at the first column that isn't.
// When the chat box is moved away from the window's left edge the crop also holds map scenery, so the scan starts a few
// columns before the first column that is mostly band colour.
export function textLeft(img, line) {
  const h = line.bottom - line.top + 1;
  let start = 0;
  for (let x = 0; x < img.width >> 1; x++) {
    let n = 0;
    for (let y = line.top; y <= line.bottom; y++) { const i = (y * img.width + x) * 4; if (bandClass(img.data[i], img.data[i + 1], img.data[i + 2]) === line.color) n++; }
    if (n >= h * 0.5) { start = Math.max(0, x - 6); break; }
  }
  for (let x = start; x < start + 40; x++) {
    let n = 0;
    for (let y = line.top; y <= line.bottom; y++) { const i = (y * img.width + x) * 4, r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
      if (Math.abs(r - line.bg[0]) + Math.abs(g - line.bg[1]) + Math.abs(b - line.bg[2]) >= 110 && !bandClass(r, g, b)) n++; }
    if (n < h * 0.7) return x + 1;
  }
  return start + LEFT;
}

// Channel digits are a fixed 4x5 pixel font (red on white): split the badge into glyphs by empty columns, skip "C"
// and "H", and look each digit up by its exact column pattern. Any unknown glyph means no channel rather than a guess.
const DIGITS = { '.###./#...#/#...#/.###.': 0, '#..../#####': 1, '#..##/#.#.#/#.#.#/.##.#': 2, '#...#/#.#.#/#.#.#/.###.': 3,
  '###../..#../..#../#####': 4, '###.#/#.#.#/#.#.#/#..#.': 5, '.###./#.#.#/#.#.#/...#.': 6, '#..../#..##/###..': 7,
  '.#.#./#.#.#/#.#.#/.#.#.': 8, '.#.../#.#.#/#.#.#/.###.': 9 };
export function readChannel(img, line, badge) {
  const red = (x, y) => { const i = (y * img.width + x) * 4; return isRed(img.data[i], img.data[i + 1], img.data[i + 2]); };
  let y0 = Infinity, y1 = -1;
  for (let y = line.top; y <= line.bottom; y++) for (let x = badge.left; x <= badge.right; x++) if (red(x, y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  // The digits are 5 px tall at 1x; a 2x (Retina) capture draws every font pixel as a 2x2 block, so sample every s-th pixel.
  const s = Math.round((y1 - y0 + 1) / 5);
  if (s < 1 || y1 - y0 + 1 !== 5 * s) return null;
  const glyphs = [];
  let cur = null;
  for (let x = badge.left; x <= badge.right + s; x += s) {
    let col = '';
    for (let y = y0; y <= y1; y += s) col += red(x, y) ? '#' : '.';
    if (col.includes('#')) (cur ||= []).push(col);
    else if (cur) { glyphs.push(cur.join('/')); cur = null; }
  }
  const digits = glyphs.slice(2).map((g) => DIGITS[g]);
  if (!digits.length || digits.some((d) => d == null)) return null;
  const ch = Number(digits.join(''));
  return ch >= 1 && ch <= 40 ? ch : null;
}

// Read one line with an OCR function (bitmap, kind → text). kind is 'nick' (one word, letters and digits), 'nickline'
// (a line, letters and digits) or 'text'.
// glyph (optional) is { read, wTop }: the learned font table reader and this line's glyph window. Text the table can
// read in full is taken from it; anything else falls back to the OCR function.
export async function readLine(img, line, ocr, glyph = null) {
  const badge = findBadge(img, line);
  const x0 = textLeft(img, line);
  const byTable = (a, z) => (glyph ? glyph.read(glyphs(img, line, a, z, glyph.wTop)) : null);
  // Table first; failing that, OCR with the table's known words kept.
  const readText = async (a, z, bm) => {
    const t = byTable(a, z);
    if (t != null) return t;
    const raw = await ocr(bm, 'text');
    if (!glyph) return raw;
    return mergeReading(glyph.read.words(glyphs(img, line, a, z, glyph.wTop)), raw) ?? raw;
  };
  if (!badge) {
    return { color: line.color, cont: true, text: cleanText(await readText(x0, img.width, lineBitmap(img, line, { x0 }))) };
  }
  // Without the font table, nicks (short, no dictionary words) get three OCR readings that vote: one word at 4x, a line
  // at 2x and at 3x, letters and digits only; without a majority the one-word reading wins.
  let nick = byTable(x0, badge.left - 1)?.replace(/[^A-Za-z0-9]/g, '');
  if (!nick) {
    const reads = [];
    for (const [kind, scale] of [['nick', 4], ['nickline', 2], ['nickline', 3]]) reads.push((await ocr(lineBitmap(img, line, { x0, x1: badge.left - 1, scale }), kind)).replace(/[^A-Za-z0-9]/g, ''));
    const votes = new Map();
    for (const r of reads) if (r) votes.set(r, (votes.get(r) || 0) + 1);
    const top = [...votes].sort((a, b) => b[1] - a[1])[0];
    nick = top && top[1] >= 2 ? top[0] : reads[0];
  }
  const channel = readChannel(img, line, badge);
  const text = cleanText((await readText(badge.message, img.width, lineBitmap(img, line, { x0: badge.message }))).replace(/^[^A-Za-z0-9[<>]*/, ''));
  return { color: line.color, nick, channel, text };
}

// Common misreads of the trade shorthand at the start of a phrase: "S>" read as "5»", "S=", "5=" or "S<", "B>" as "B=",
// "Bx" or "B»"; "Cal's"/"Cat's" style letter swaps are left alone.
// In a word of capitals a small l is the capital I the font draws the same way ("SELLlNG" → "SELLING").
export const capsI = (t) => t.replace(/[A-Za-z]{3,}/g, (w) => (w.replace(/l/g, '').length >= 2 && w.replace(/l/g, '') === w.replace(/l/g, '').toUpperCase() ? w.replace(/l/g, 'I') : w));
export function cleanText(t) {
  // A run of @ or ~ at the end is the chat box's background pattern read as letters, never part of the message.
  return capsI(t).replace(/(?:\s*[@~]){3,}\s*$/, '').replace(/\s*\|\s*$/, '').replace(/(^|[\s\]])[S5]\s?(?:=+>*|»|>|<|«)\s?/g, '$1S> ').replace(/(^|[\s\]])B\s?(?:=+>*|»|>|x|«)\s?/g, '$1B> ').replace(/\s+/g, ' ').trim();
}

// Lines in reading order → megaphones. A line without a channel badge continues the megaphone above it (long
// megaphones wrap onto an indented second line) when both are on the same band colour.
export function assemble(lines) {
  const out = [];
  for (const l of lines) {
    if (!l.cont && /^[A-Za-z0-9]{2,13}$/.test(l.nick || '') && l.text) out.push({ nick: l.nick, channel: l.channel, color: l.color, text: l.text });
    else if (l.cont && out.length && out.at(-1).color === l.color && l.text) out.at(-1).text += ` ${l.text}`;
  }
  return out;
}

// The chat box is semi-transparent, so the same megaphone reads slightly differently from frame to frame. Letters and
// digits only, compared by shared 3-letter pieces: a near match from the same nick (or the same channel) within 15
// minutes is a repeat.
export const shape = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
export function similar(a, b) {
  if (a === b) return true;
  const grams = (t) => new Set(Array.from({ length: Math.max(0, t.length - 2) }, (_, i) => t.slice(i, i + 3)));
  const A = grams(a), B = grams(b);
  if (!A.size || !B.size) return false;
  let both = 0;
  for (const g of A) if (B.has(g)) both++;
  return both / Math.min(A.size, B.size) > 0.7;
}
export function repeatFilter(windowMs = 15 * 60000) {
  const recent = [];
  return (m, now = Date.now()) => {
    while (recent.length && now - recent[0].at > windowMs) recent.shift();
    const key = shape(m.text);
    // A nick read differently (Kuramei/Kuromei) is still the same megaphone when the channel matches too.
    if (recent.some((r) => (r.nick.toLowerCase() === m.nick.toLowerCase() || r.channel === m.channel) && similar(r.key, key))) return true;
    recent.push({ nick: m.nick, channel: m.channel, key, at: now });
    return false;
  };
}

// Bracketed item names are the game's own item names, so a misread one ("Sapphire Earmings") is put back to the closest
// catalogue name when it is clearly that name; anything less certain is left as read.
export function itemFixer(names) {
  const list = [...new Set(names.map((n) => n.toLowerCase()))];
  const exact = new Map(names.map((n) => [n.toLowerCase(), n]));
  const grams = (t) => { const g = new Set(); const s = ` ${t} `; for (let i = 0; i < s.length - 2; i++) g.add(s.slice(i, i + 3)); return g; };
  const index = list.map((n) => [n, grams(n)]);
  return (text) => text.replace(/\[([^\]]{3,60})\]/g, (whole, raw) => {
    const low = raw.toLowerCase().trim();
    if (exact.has(low)) return `[${exact.get(low)}]`;
    const g = grams(low);
    let best = null, score = 0;
    for (const [n, ng] of index) {
      if (Math.abs(n.length - low.length) > 4) continue;
      let both = 0;
      for (const x of g) if (ng.has(x)) both++;
      const s = (2 * both) / (g.size + ng.size);
      if (s > score) { score = s; best = n; }
    }
    return score >= 0.6 ? `[${exact.get(best)}]` : whole;
  });
}

// ---------- glyph reading ----------
// The chat font is a fixed pixel font (1 px dark letters; item names in a 2 px bold yellow), so once a glyph's exact
// pixel pattern is known it reads with certainty. Glyphs are the column runs of ink between empty columns; a gap of
// SPACE_D (dark) or SPACE_Y (yellow) empty columns or more is a space. Each glyph's key is its columns over a 16-row
// window anchored to the line slot (lines sit on a 16 px pitch, found from the channel digits), so "'" and "," differ.
const SPACE_D = 4, SPACE_Y = 4;
export function inkKind(r, g, b, bgLuma) {
  if (r > 240 && g > 240 && b < 200) return 'Y';
  return (r + g + b) / 3 < bgLuma - 60 ? 'D' : '';
}
// Row where the line's 16-row glyph window starts: the frame's slot phase (from any badge's digit top) applied to
// this line. Returns null when the frame has no badge to anchor on.
export function slotAnchor(img, lines) {
  for (const l of lines) {
    const b = findBadge(img, l);
    if (!b) continue;
    for (let y = l.top; y <= l.bottom; y++) for (let x = b.left; x <= b.right; x++) {
      const i = (y * img.width + x) * 4;
      if (isRed(img.data[i], img.data[i + 1], img.data[i + 2])) return { phase: ((y - 5) % 16 + 16) % 16, digitTop: y, top: l.top };
    }
  }
  return null;
}
export function windowTop(line, anchor) {
  // Where this line's window would start if it sat like the anchor line, snapped to the frame's 16-row slot phase.
  const target = line.top + (anchor.digitTop - 5 - anchor.top);
  let d = (((anchor.phase - target) % 16) + 16) % 16;
  if (d >= 8) d -= 16;
  return target + d;
}
export function glyphs(img, line, x0, x1, wTop) {
  const bgLuma = (line.bg[0] + line.bg[1] + line.bg[2]) / 3;
  const out = [];
  let cur = null, gap = 0;
  const right = Math.min(x1, line.right ?? x1);
  // Only rows that are on this line's band count: the dark seams between bands would otherwise join every letter.
  const inBand = [];
  for (let y = wTop; y < wTop + 16; y++) {
    let n = 0, m = 0;
    if (y >= 0 && y < img.height) for (let x = x0; x < right; x += 2) { const i = (y * img.width + x) * 4; m++; if (bandClass(img.data[i], img.data[i + 1], img.data[i + 2]) === line.color) n++; }
    inBand.push(m > 0 && n / m > 0.3);
  }
  for (let x = x0; x < right; x++) {
    let col = '', kinds = '';
    for (let y = wTop; y < wTop + 16; y++) {
      const i = (y * img.width + x) * 4;
      const k = inBand[y - wTop] ? inkKind(img.data[i], img.data[i + 1], img.data[i + 2], bgLuma) : '';
      col += k ? '#' : '.';
      if (k) kinds += k;
    }
    if (kinds) {
      if (!cur) { cur = { cols: [], kind: kinds[0], gap }; }
      cur.cols.push(col);
      if (kinds.includes('Y')) cur.kind = 'Y';
      gap = 0;
    } else {
      if (cur) { out.push(cur); cur = null; }
      gap++;
    }
  }
  if (cur) out.push(cur);
  return out.map((g, i) => ({ key: `${g.kind}:${g.cols.join('/')}`, gap: i > 0 ? g.gap : 0, space: i > 0 && g.gap >= (g.kind === 'Y' ? SPACE_Y : SPACE_D) }));
}
// Glyphs → text with a learned table (glyph key → one or more characters). Letters that touch with no empty column
// between them come out as one run; such a run is split into known single letters when their columns line up
// exactly end to end. Returns null if any run stays unknown (the caller falls back to Tesseract).
export function glyphReader(table) {
  const singles = new Map(); // kind → [{ cols, ch }]
  for (const [key, ch] of Object.entries(table)) {
    if (ch.length !== 1) continue;
    const [kind, cols] = [key.slice(0, 1), key.slice(2).split('/')];
    if (!singles.has(kind)) singles.set(kind, []);
    singles.get(kind).push({ cols, ch });
  }
  // A letter fits at column i when every pixel of it is lit there; extra lit pixels are allowed only in its first and
  // last column (where a neighbour's stroke may touch or overlap by one column, like a bold "t" crossbar). The next
  // letter starts right after it or one column back (overlap). Fewest stray pixels wins, then fewest letters.
  const fits = (cols, i, g) => {
    let extra = 0;
    for (let k = 0; k < g.cols.length; k++) {
      const b = cols[i + k], t = g.cols[k];
      if (b == null) return -1;
      for (let y = 0; y < t.length; y++) {
        if (t[y] === '#' && b[y] !== '#') return -1;
        if (b[y] === '#' && t[y] !== '#') { if (k > 0 && k < g.cols.length - 1) return -1; extra++; }
      }
    }
    return extra;
  };
  const split = (key) => {
    const kind = key.slice(0, 1), cols = key.slice(2).split('/'), list = singles.get(kind) || [];
    const best = new Array(cols.length + 1).fill(null);
    best[cols.length] = { str: '', cost: 0 };
    for (let i = cols.length - 1; i >= 0; i--) {
      for (const g of list) {
        const extra = fits(cols, i, g);
        if (extra < 0) continue;
        for (const next of [i + g.cols.length, i + g.cols.length - 1]) {
          if (next <= i || next > cols.length || !best[next]) continue;
          const cand = { str: g.ch + best[next].str, cost: extra + best[next].cost + (next < i + g.cols.length ? 1 : 0) };
          if (!best[i] || cand.cost < best[i].cost || (cand.cost === best[i].cost && cand.str.length < best[i].str.length)) best[i] = cand;
        }
      }
    }
    return best[0] && best[0].cost <= Math.max(2, cols.length / 2) ? best[0].str : null;
  };
  const memo = new Map();
  const charOf = (key) => {
    if (table[key] != null) return table[key];
    if (!memo.has(key)) memo.set(key, split(key));
    return memo.get(key);
  };
  // Digits and "." sit in wider cells, so a 4-column gap next to them is not a space; 5 or more always is.
  const narrow = (c) => /^[0-9.,]$/.test(c);
  const read = (gs) => {
    let out = '', prev = '';
    for (const g of gs) {
      const ch = charOf(g.key);
      if (ch == null) return null;
      const space = g.gap >= 5 || (g.space && !(narrow(prev.slice(-1)) || narrow(ch[0])));
      out += (space ? ' ' : '') + ch;
      prev = ch;
    }
    // Capital I and small l are the same glyph in this font: inside a word of capitals it is I, otherwise l.
    return out.replace(/[A-Za-z]*[Il][A-Za-z]*/g, (w) => {
      const others = w.replace(/[Il]/g, '');
      const upper = others.length ? others === others.toUpperCase() : w[0] === 'I';
      // At the start of a word: I before a capital ("IGfusion"), l before a small letter ("lord0").
      return w.replace(/[Il]/g, (c, i) => (upper ? 'I' : i === 0 && w[1] ? (w[1] === w[1].toUpperCase() && /[A-Z]/.test(w[1]) ? 'I' : 'l') : 'l'));
    });
  };
  // Words of a line: each word's letters as read by the table, null where a run is unknown.
  const words = (gs) => {
    const out = [];
    let prev = '';
    for (const g of gs) {
      const ch = charOf(g.key);
      const space = g.gap >= 5 || (g.space && !(narrow(prev.slice(-1)) || narrow((ch || 'x')[0])));
      if (!out.length || space) out.push([]);
      out.at(-1).push(ch);
      prev = ch || '';
    }
    return out;
  };
  return Object.assign(read, { charOf, words });
}

// A line the table can't read in full: keep every word it can read, and take the OCR's word where it can't. When a
// word's runs are mostly known and the OCR word has the same length, only the unknown letters come from the OCR.
export function mergeReading(tableWords, ocrText) {
  const ocr = ocrText.trim().split(/\s+/).filter(Boolean);
  if (tableWords.length !== ocr.length) return null;
  return tableWords.map((w, i) => {
    if (w.every((c) => c != null)) return w.join('');
    if (w.length === ocr[i].length && w.every((c) => c == null || c.length === 1)) return w.map((c, j) => c ?? ocr[i][j]).join('');
    return ocr[i];
  }).join(' ');
}
