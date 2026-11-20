// Megaphone collector for the admin's Mac (macOS only): maple-stream.swift keeps one capture stream open on the
// MapleStory window (works even when other windows cover it) and saves its newest frame; every 1.5 s this reads that
// frame, finds the chat box by its megaphone bands, reads new megaphones with assets/mega-reader.js and posts them
// to the worker with the admin key in ~/.config/gms-hub/megaphone-token. Only recognised text/options leave the Mac.
// Run (from scripts/scan-tools after npm install):  node mega-collector.mjs          # read and post
//                                                     node mega-collector.mjs --dry  # read and print only
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import Tesseract from 'tesseract.js';
import { findChatBox, findLines, readLine, assemble, repeatFilter, itemFixer, glyphReader, slotAnchor, windowTop } from '../../assets/mega-reader.js';
import { OptionReader, nameKey } from './mega-options.mjs';

const API = 'https://gms-hub-votes.kwonth211.workers.dev/internal/megaphone';
const DRY = process.argv.includes('--dry');
const OPTIONS = !process.argv.includes('--no-options') && (!DRY || process.argv.includes('--options'));
const TICK_MS = 1500;
const KINDS = { P: 'super', Y: 'item', C: 'double' };
const shot = path.join(os.tmpdir(), DRY ? `gms-mega-dry-${process.pid}.png` : 'gms-mega-shot.png');
// Every 80 ticks (about 2 minutes) the chat crop and what was read from it are kept for `./mega.sh check`.
const LIVE = path.join(os.homedir(), 'gms-hub-samples', 'mega-live');
fs.mkdirSync(LIVE, { recursive: true });
const here = path.dirname(new URL(import.meta.url).pathname);
const helper = path.join(os.tmpdir(), 'gms-maple-stream');
const source = path.join(here, 'maple-stream.swift');
if (!fs.existsSync(helper) || fs.statSync(helper).mtimeMs < fs.statSync(source).mtimeMs) execFileSync('swiftc', ['-O', source, '-o', helper]);
// The capture helper runs for as long as the game window is there; it ends by itself when this process does (its
// stdin closes). A resize restarts immediately; other stops retry after five seconds.
let cam = null, tried = 0, seen = 0, fresh = 0, stopping = false;
// The OCR worker slowly grows (~1.9GB after two days). Past 1.2GB this process quits; mega.sh's loop starts a fresh one,
// which keeps the Terminal's screen-recording permission (a launchd job would not have it).
setInterval(() => { const rss = process.memoryUsage().rss; if (rss > 1.2e9) { console.log(new Date().toISOString(), `restart: memory ${(rss / 1e9).toFixed(2)}GB`); stopping=true; } }, 60000);
function camera() {
  tried = fresh = Date.now();
  fs.rmSync(shot, { force: true });
  seen = 0;
  cam = spawn(helper, [shot], { stdio: ['pipe', 'ignore', 'pipe'] });
  cam.stderr.on('data', (d) => console.error(new Date().toISOString(), String(d).trim()));
  cam.on('exit', (code) => { cam = null; tried=code===2 ? 0 : Date.now()-55000; });
}
const token = DRY ? '' : fs.readFileSync(path.join(os.homedir(), '.config', 'gms-hub', 'megaphone-token'), 'utf8').trim();
async function readFrame(after=0, timeout=1400) {
  const deadline=Date.now()+timeout;
  do {
    try {if(fs.statSync(shot).mtimeMs>=after)return PNG.sync.read(fs.readFileSync(shot));}catch{}
    await new Promise((r)=>setTimeout(r,80));
  }while(Date.now()<deadline);
  return null;
}
let optionReader=null;
if(OPTIONS) {
  try {
    const catalogPath=path.join(here,'../../assets/items-catalog.json');
    const catalog=fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath,'utf8')) : (()=>{
      const details=JSON.parse(fs.readFileSync(path.join(here,'../../data/item-details.json'),'utf8')).items;
      return JSON.parse(fs.readFileSync(path.join(here,'../../data/items.json'),'utf8')).items.map((i)=>({...i,slots:details[i.id]?.slots}));
    })();
    const binaries={};
    for(const name of ['maple-input','maple-ocr']) {
      const src=path.join(here,`${name}.swift`),bin=path.join(os.tmpdir(),`gms-${name}`);
      if(!fs.existsSync(bin)||fs.statSync(bin).mtimeMs<fs.statSync(src).mtimeMs)execFileSync('swiftc',['-O',src,'-o',bin]);
      binaries[name]=bin;
    }
    optionReader=new OptionReader({shot,input:binaries['maple-input'],ocr:binaries['maple-ocr'],catalog,readFrame});
    process.on('exit',()=>optionReader.close());
  }catch(e){console.error('option reader unavailable; collecting text:',e.message);}
}

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
  if (!cam) { if (Date.now() - tried > 60000) camera(); return; }
  let at = 0;
  try { at = fs.statSync(shot).mtimeMs; } catch { /* no frame yet */ }
  // No new frame: nothing on the window changed. A minute without one means the stream is stuck, so start it over.
  if (at === seen) { if (Date.now() - fresh > 60000) cam.kill(); return; }
  seen = at; fresh = Date.now();
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
  const pending=[];
  for (const m of all) {
    if (!m.channel || isRepeat(m, now)) continue;
    const row = { seen: new Date(now).toISOString(), kind: KINDS[m.color] || 'super', color: m.color, channel: m.channel, nick: m.nick, text: m.text };
    pending.push({row,m});
    console.log(`${new Date(now).toTimeString().slice(0, 8)} ${row.kind.padEnd(6)} CH${String(row.channel).padStart(2)} ${row.nick}: ${row.text}`);
  }
  if(optionReader) for(const {row,m} of [...pending].reverse()) {
    const links=[...row.text.matchAll(/\[([^\]]+)\]/g)];if(links.length!==1)continue;
    const item=optionReader.catalog.find((i)=>nameKey(i.en)===nameKey(links[0][1]));
    if(!item || (item.cat!=='Equip' && !/ Scroll: /i.test(item.en)))continue;
    const i=read.findIndex((r)=>!r.cont&&r.nick===m.nick&&r.channel===m.channel&&fixItems(r.text)===row.text.slice(0,fixItems(r.text).length));
    if(i<0)continue;
    const opts=await optionReader.collect({image:img,box,line:lines[i],message:row,item,glyph:anchor?{read:readGlyphs,wTop:windowTop(lines[i],anchor),expected:item.en}:null});
    if(opts){row.opts=opts;console.log(`options ${row.nick} [${item.en}] ${JSON.stringify(opts)}`);}
    else console.log(`options skipped ${row.nick} [${item.en}]: ${optionReader.lastSkip}`);
    break; // Bounded work; all other megaphones still leave as text immediately.
  }
  queue.push(...pending.map(({row})=>row));
}

console.log(DRY ? `dry run: no uploads${OPTIONS ? ', background option clicks enabled' : ', reading only'}` : 'collecting and posting');
if(DRY){const duration=Number(process.argv.find((a)=>a.startsWith('--duration='))?.split('=')[1]);if(duration>0)setTimeout(()=>{stopping=true;},duration*1000);}
// Finish any click's finally block before exiting so a tooltip cannot obscure the next collector's chat detection.
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;});
process.on('exit',()=>{if(cam)cam.kill();if(DRY)fs.rmSync(shot,{force:true});});
setInterval(flush, 5000);
while (!stopping) {
  const t0 = Date.now();
  try { await tick(); } catch (e) { console.error(new Date().toISOString(), e.message); }
  await new Promise((r) => setTimeout(r, Math.max(200, TICK_MS - (Date.now() - t0))));
}
await flush();
process.exit(0);
