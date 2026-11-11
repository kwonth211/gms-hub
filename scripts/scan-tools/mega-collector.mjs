// Megaphone collector for the admin's Mac (macOS only): every 1.5 s it captures the MapleStory window with
// `screencapture -l` (works even when other windows cover it; maple-window.swift finds the window), finds the chat box by its megaphone bands, reads new megaphones with assets/mega-reader.js and posts them
// to the worker with the admin key in ~/.config/gms-hub/megaphone-token. Only the recognised text leaves the Mac.
// Run (from scripts/scan-tools after npm install):  node mega-collector.mjs          # read and post
//                                                     node mega-collector.mjs --dry  # read and print only
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import Tesseract from 'tesseract.js';
import { findChatBox, findLines, readLine, assemble, repeatFilter, itemFixer, glyphReader, slotAnchor, windowTop } from '../../assets/mega-reader.js';

const API = 'https://gms-hub-votes.kwonth211.workers.dev/internal/megaphone';
const DRY = process.argv.includes('--dry');
const TICK_MS = 1500;
const KINDS = { P: 'super', Y: 'item', C: 'double' };
const shot = path.join(os.tmpdir(), 'gms-mega-shot.png');
// Every 80 ticks (about 2 minutes) the chat crop and what was read from it are kept for `./mega.sh check`.
const LIVE = path.join(os.homedir(), 'gms-hub-samples', 'mega-live');
fs.mkdirSync(LIVE, { recursive: true });
const here = path.dirname(new URL(import.meta.url).pathname);
const helper = path.join(os.tmpdir(), 'gms-maple-window');
if (!fs.existsSync(helper)) execFileSync('swiftc', ['-O', path.join(here, 'maple-window.swift'), '-o', helper]);
const windowId = () => { try { return execFileSync(helper, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const token = DRY ? '' : fs.readFileSync(path.join(os.homedir(), '.config', 'gms-hub', 'megaphone-token'), 'utf8').trim();

const text = await Tesseract.createWorker('eng');
// Symbols the game's chat font never draws are ruled out, so Tesseract picks the real letter instead ("£ard" → "Zard").
await text.setParameters({ tessedit_pageseg_mode: '7', preserve_interword_spaces: '1', tessedit_char_blacklist: '£©®°¢¥§«»€¬±™¦' });
const namesFile = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'assets', 'items-names.json');
// The learned chat-font table (assets/mega-glyphs.json) reads most lines exactly; OCR covers the rest.
const glyphFile = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'assets', 'mega-glyphs.json');
const readGlyphs = fs.existsSync(glyphFile) ? glyphReader(JSON.parse(fs.readFileSync(glyphFile, 'utf8'))) : null;
const fixItems = fs.existsSync(namesFile) ? itemFixer(JSON.parse(fs.readFileSync(namesFile, 'utf8'))) : (t) => t;
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const nickWord = await Tesseract.createWorker('eng');
await nickWord.setParameters({ tessedit_pageseg_mode: '8', tessedit_char_whitelist: ALNUM });
const nickLine = await Tesseract.createWorker('eng');
await nickLine.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: ALNUM });
const workers = { text, nick: nickWord, nickline: nickLine };
const cache = new Map();
const ocr = async (bm, kind) => {
  if (!bm.ink) return '';
  const key = `${kind}:${bm.width}:${bm.sig}`;
  if (cache.has(key)) return cache.get(key);
  const png = new PNG({ width: bm.width, height: bm.height });
  png.data = Buffer.from(bm.data.buffer);
  const out = (await (workers[kind] || text).recognize(PNG.sync.write(png))).data.text.trim();
  if (cache.size > 5000) cache.clear();
  cache.set(key, out);
  return out;
};

function crop(img, b) {
  const out = { width: b.w, height: b.h, data: new Uint8ClampedArray(b.w * b.h * 4) };
  for (let y = 0; y < b.h; y++) out.data.set(img.data.subarray(((b.y + y) * img.width + b.x) * 4, ((b.y + y) * img.width + b.x + b.w) * 4), y * b.w * 4);
  return out;
}

const isRepeat = repeatFilter();
let box = null, ticks = 0, empty = 0, queue = [], sent = 0, win = '';
async function flush() {
  if (DRY || !queue.length) return;
  const rows = queue.splice(0, 50);
  try {
    const r = await fetch(API, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }) });
    if (!r.ok) throw new Error(String(r.status));
    sent += (await r.json()).accepted || 0;
  } catch (e) { queue.unshift(...rows); console.error(new Date().toISOString(), 'post failed', e.message); }
}

async function tick() {
  if (!win || ticks % 40 === 0) win = windowId();
  if (!win) { if (ticks++ % 40 === 0) console.error(new Date().toISOString(), 'MapleStory window not found'); return; }
  try { execFileSync('screencapture', ['-x', '-o', '-t', 'png', `-l${win}`, shot]); } catch { win = ''; return; }
  const img = PNG.sync.read(fs.readFileSync(shot));
  if (!box || ticks++ % 40 === 0 || empty > 20) { const found = findChatBox(img); if (found) { box = found; empty = 0; } }
  if (!box) return;
  const part = crop(img, box);
  const lines = findLines(part);
  empty = lines.length ? 0 : empty + 1;
  const read = [];
  const anchor = readGlyphs ? slotAnchor(part, lines) : null;
  for (const l of lines) read.push(await readLine(part, l, ocr, anchor ? { read: readGlyphs, wTop: windowTop(l, anchor) } : null));
  const now = Date.now();
  const all = assemble(read);
  if (ticks % 80 === 1 && lines.length) {
    const name = `${new Date(now).toISOString().replace(/[:.]/g, '-')}.png`;
    const png = new PNG({ width: part.width, height: part.height });
    png.data = Buffer.from(part.data.buffer);
    fs.writeFileSync(path.join(LIVE, name), PNG.sync.write(png));
    fs.appendFileSync(path.join(LIVE, 'reads.jsonl'), `${JSON.stringify({ file: name, megaphones: all })}\n`);
    const kept = fs.readdirSync(LIVE).filter((f) => f.endsWith('.png')).sort();
    for (const f of kept.slice(0, Math.max(0, kept.length - 300))) fs.unlinkSync(path.join(LIVE, f));
  }
  for (const m of all) m.text = fixItems(m.text);
  for (const m of all) {
    if (!m.channel || isRepeat(m, now)) continue;
    const row = { seen: new Date(now).toISOString(), kind: KINDS[m.color] || 'super', color: m.color, channel: m.channel, nick: m.nick, text: m.text };
    queue.push(row);
    console.log(`${row.seen.slice(11, 19)} ${row.kind.padEnd(6)} CH${String(row.channel).padStart(2)} ${row.nick}: ${row.text}`);
  }
}

console.log(DRY ? 'dry run: reading only' : 'collecting and posting');
setInterval(flush, 5000);
for (;;) {
  const t0 = Date.now();
  try { await tick(); } catch (e) { console.error(new Date().toISOString(), e.message); }
  await new Promise((r) => setTimeout(r, Math.max(200, TICK_MS - (Date.now() - t0))));
}
