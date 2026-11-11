// Megaphone collector for the admin's Mac (macOS only): every 1.5 s it screenshots the screen with `screencapture`,
// finds the MapleStory chat box by its megaphone bands, reads new megaphones with assets/mega-reader.js and posts them
// to the worker with the admin key in ~/.config/gms-hub/megaphone-token. Only the recognised text leaves the Mac.
// Run (from scripts/scan-tools after npm install):  node mega-collector.mjs          # read and post
//                                                     node mega-collector.mjs --dry  # read and print only
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import Tesseract from 'tesseract.js';
import { findChatBox, findLines, readLine, assemble, repeatFilter } from '../../assets/mega-reader.js';

const API = 'https://gms-hub-votes.kwonth211.workers.dev/internal/megaphone';
const DRY = process.argv.includes('--dry');
const TICK_MS = 1500;
const KINDS = { P: 'super', Y: 'item', C: 'double' };
const shot = path.join(os.tmpdir(), 'gms-mega-shot.png');
const token = DRY ? '' : fs.readFileSync(path.join(os.homedir(), '.config', 'gms-hub', 'megaphone-token'), 'utf8').trim();

const text = await Tesseract.createWorker('eng');
await text.setParameters({ tessedit_pageseg_mode: '7', preserve_interword_spaces: '1' });
const cache = new Map();
const ocr = async (bm, kind) => {
  if (!bm.ink) return '';
  const key = `${kind}:${bm.sig}`;
  if (cache.has(key)) return cache.get(key);
  const png = new PNG({ width: bm.width, height: bm.height });
  png.data = Buffer.from(bm.data.buffer);
  const out = (await text.recognize(PNG.sync.write(png))).data.text.trim();
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
let box = null, ticks = 0, empty = 0, queue = [], sent = 0;
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
  execFileSync('screencapture', ['-x', '-t', 'png', shot]);
  const img = PNG.sync.read(fs.readFileSync(shot));
  if (!box || ticks++ % 40 === 0 || empty > 20) { const found = findChatBox(img); if (found) { box = found; empty = 0; } }
  if (!box) return;
  const part = crop(img, box);
  const lines = findLines(part);
  empty = lines.length ? 0 : empty + 1;
  const read = [];
  for (const l of lines) read.push(await readLine(part, l, ocr));
  const now = Date.now();
  for (const m of assemble(read)) {
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
