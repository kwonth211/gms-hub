// Run: node mega-learn.mjs <out.json> <segments-cache.json> <sample dirs...>  (delete the cache to re-read samples)
// Learn the chat font in passes: exact word alignments first, then fill single unknown glyphs (digits, punctuation,
// merged letter pairs, yellow item letters) by subtracting the known glyphs from the OCR word.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import Tesseract from 'tesseract.js';
import { findLines, findBadge, textLeft, lineBitmap, slotAnchor, windowTop, glyphs, glyphReader } from '../../assets/mega-reader.js';
const [out, cacheFile, ...dirs] = process.argv.slice(2);
const segs = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile)) : [];
if (!segs.length) {
  const text = await Tesseract.createWorker('eng');
  await text.setParameters({ tessedit_pageseg_mode: '7', preserve_interword_spaces: '1', tessedit_char_blacklist: '£©®°¢¥§«»€¬±™¦|' });
  const nick = await Tesseract.createWorker('eng');
  await nick.setParameters({ tessedit_pageseg_mode: '8', tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' });
  const toPng = (bm) => { const p = new PNG({ width: bm.width, height: bm.height }); p.data = Buffer.from(bm.data.buffer); return PNG.sync.write(p); };
  const seen = new Set();
  for (const dir of dirs) for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.png'))) {
    const img = PNG.sync.read(fs.readFileSync(path.join(dir, f)));
    const lines = findLines(img); const anchor = slotAnchor(img, lines);
    if (!anchor) continue;
    for (const l of lines) {
      const b = findBadge(img, l), wTop = windowTop(l, anchor), x0 = textLeft(img, l);
      const parts = b ? [[x0, b.left - 1, 'nick'], [b.message, img.width, 'text']] : [[x0, img.width, 'text']];
      for (const [a, z, kind] of parts) {
        const gs = glyphs(img, l, a, z, wTop);
        if (!gs.length || gs.length > 120) continue;
        const sig = gs.map((g) => g.key).join('|');
        if (seen.has(sig)) continue; seen.add(sig);
        const bm = lineBitmap(img, l, { x0: a, x1: z, scale: kind === 'nick' ? 4 : 3 });
        const str = (await (kind === 'nick' ? nick : text).recognize(toPng(bm))).data.text.trim();
        segs.push({ file: f, kind, gs, str });
      }
    }
  }
  fs.writeFileSync(cacheFile, JSON.stringify(segs));
  await text.terminate(); await nick.terminate();
}
const words = (s) => s.trim().split(/\s+/).filter(Boolean);
const runsOf = (gs) => { const r = []; for (const g of gs) { if (!r.length || g.space) r.push([]); r.at(-1).push(g.key); } return r; };
let table = {};
const build = (votes, min = 2) => {
  const t = {};
  for (const [k, m] of votes) { const [[ch, n]] = [...m].sort((a, b) => b[1] - a[1]); const tot = [...m.values()].reduce((a, b) => a + b, 0); if (n >= min && n / tot >= 0.7) t[k] = ch; }
  return t;
};
const votes = new Map();
const add = (k, ch) => { const m = votes.get(k) || new Map(); m.set(ch, (m.get(ch) || 0) + 1); votes.set(k, m); };
for (const s of segs) {
  const ws = words(s.str), rs = runsOf(s.gs);
  if (ws.length !== rs.length) continue;
  rs.forEach((r, i) => { if (r.length === ws[i].length) r.forEach((k, j) => add(k, ws[i][j])); });
}
table = build(votes);
for (let pass = 0; pass < 6; pass++) {
  const reader = glyphReader(table);
  for (const s of segs) {
    const ws = words(s.str), rs = runsOf(s.gs);
    if (ws.length !== rs.length) continue;
    rs.forEach((r, i) => {
      const known = r.map((k) => reader.charOf(k));
      const unknown = known.map((c, j) => (c == null ? j : -1)).filter((j) => j >= 0);
      // A run whose letters all split into known glyphs and spell the OCR word confirms itself as that string.
      if (!unknown.length) { if (known.join('') === ws[i] && r.length === 1 && table[r[0]] == null) add(r[0], ws[i]); return; }
      if (unknown.length !== 1) return;
      const u = unknown[0];
      const pre = known.slice(0, u).join(''), post = known.slice(u + 1).join('');
      const w = ws[i];
      if (w.startsWith(pre) && w.endsWith(post) && w.length - pre.length - post.length >= 1 && w.length - pre.length - post.length <= 4) add(r[u], w.slice(pre.length, w.length - post.length));
    });
  }
  table = build(votes);
}
// Shapes OCR keeps mislabelling, fixed by their geometry: a chevron learned as "=" is ">" or "<"; a "g" whose
// descender is a straight right-hand stroke is "q".
for (const [k, ch] of Object.entries(table)) {
  const cols = k.slice(2).split('/');
  const rowsLit = (c) => [...c].map((v, y) => (v === '#' ? y : -1)).filter((y) => y >= 0);
  if ((ch === '=' || ch === '<' || ch === '>') && cols.length >= 4) {
    const first = rowsLit(cols[0]), last = rowsLit(cols.at(-1));
    const bars = new Set(cols.flatMap(rowsLit)).size === 2;
    table[k] = bars ? '=' : first.length >= 2 && last.length === 1 ? '>' : first.length === 1 && last.length >= 2 ? '<' : ch;
  }
  // Letters sit on row 12 of the window; ink below it is a descender. An "i" with one is a "j".
  if (ch === 'i' && cols.some((c) => c.slice(13).includes('#'))) table[k] = 'j';
  if (ch === 'g') {
    const bottom = Math.max(...cols.flatMap(rowsLit));
    const lastCol = cols.length - 1;
    const onlyRight = cols.every((c, x) => x === lastCol || c[bottom] !== '#');
    if (onlyRight) table[k] = 'q';
  }
}
fs.writeFileSync(out, JSON.stringify(table));
// Coverage: share of segments every glyph of which is now known.
const finalReader = glyphReader(table);
const full = segs.filter((s) => finalReader(s.gs) != null).length;
const agree = segs.filter((s) => { const r = finalReader(s.gs); return r != null && r.replace(/\s+/g, ' ') === s.str.replace(/\s+/g, ' '); }).length;
console.log(`table reading equals OCR on ${agree} of ${full} readable segments`);
console.log(`segments ${segs.length}, glyph shapes ${new Set(segs.flatMap((s) => s.gs.map((g) => g.key))).size}, learned ${Object.keys(table).length}, fully readable ${full} (${Math.round((full / segs.length) * 100)}%)`);
console.log('chars:', [...new Set(Object.values(table))].sort().join(' '));
