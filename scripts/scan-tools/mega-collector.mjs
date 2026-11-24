// Megaphone collector for the admin's Mac (macOS only): maple-stream.swift keeps one capture stream open on the
// MapleStory window (works even when other windows cover it) and saves its newest frame; every 0.5 s this reads that
// frame, finds the chat box by its megaphone bands, reads new megaphones with assets/mega-reader.js and posts them
// to the worker with the admin key in ~/.config/gms-hub/megaphone-token. Only recognised text/options leave the Mac.
// Run (from scripts/scan-tools after npm install):  node mega-collector.mjs          # read and post
//                                                     node mega-collector.mjs --dry  # read and print only
import { execFile, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import Tesseract from 'tesseract.js';
import { findChatBox, stableChatBox, findLines, isLineVisible, readLine, assemble, repeatFilter, continuousMessage, itemFixer, glyphReader, slotAnchor, windowTop, lineFingerprint, bandClass, textLeft, findBadge, similar, shape } from '../../assets/mega-reader.js';
import { OptionReader, nameKey, inputLog, shopButtonVisible } from './mega-options.mjs';

const API = 'https://gms-hub-votes.kwonth211.workers.dev/internal/megaphone';
const DRY = process.argv.includes('--dry');
const OPTIONS = !fs.existsSync(path.join(os.homedir(), '.config', 'gms-hub', 'mega-options-paused')) && !process.argv.includes('--no-options') && (!DRY || process.argv.includes('--options'));
const TICK_MS = 500;
const KINDS = { P: 'super', Y: 'item', C: 'double' };
const shot = path.join(os.tmpdir(), DRY ? `gms-mega-dry-${process.pid}.png` : 'gms-mega-shot.png');
// Every 240 ticks the chat crop and what was read from it are kept for `./mega.sh check`.
const LIVE = path.join(os.homedir(), 'gms-hub-samples', 'mega-live');
fs.mkdirSync(LIVE, { recursive: true });
const here = path.dirname(fileURLToPath(import.meta.url));
// Windows (2026-11-23): helpers live in win/ — capture and OCR in Python, input is borrowed from the shop collector's KMBox.
const WIN = process.platform === 'win32';
const PY = process.env.GMS_PYTHON || 'C:/Users/PC/Desktop/game-automation/venv_gpu/Scripts/python.exe';
// A helper is a path (Mac binaries) or [command, ...leading args] (Windows scripts).
const helperCall = (bin, args) => Array.isArray(bin) ? [bin[0], [...bin.slice(1), ...args]] : [bin, args];
const helper = WIN ? PY : path.join(os.tmpdir(), 'gms-maple-stream');
const source = path.join(here, 'maple-stream.swift');
if (!WIN && (!fs.existsSync(helper) || fs.statSync(helper).mtimeMs < fs.statSync(source).mtimeMs)) execFileSync('swiftc', ['-O', source, '-o', helper]);
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
  cam = spawn(helper, WIN ? [path.join(here, 'win', 'maple_stream.py'), shot] : [shot], { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  cam.stderr.on('data', (d) => console.error(new Date().toISOString(), String(d).trim()));
  cam.on('exit', (code) => { cam = null; tried=code===2 ? 0 : Date.now()-55000;
    // Windows: the game window changed size (monitor switched off and on). The chat area found before is no longer valid;
    // on 2026-11-24 the reader stayed silent after the window came back until it was restarted by hand.
    if (WIN && code === 3) { box = null; tallBox = null; empty = 0; } });
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
const optionReaders=[];
if(OPTIONS) {
  try {
    const catalogPath=path.join(here,'../../assets/items-catalog.json');
    const catalog=fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath,'utf8')) : (()=>{
      const details=JSON.parse(fs.readFileSync(path.join(here,'../../data/item-details.json'),'utf8')).items;
      return JSON.parse(fs.readFileSync(path.join(here,'../../data/items.json'),'utf8')).items.map((i)=>({...i,slots:details[i.id]?.slots,inc:i.cat==='Use'?details[i.id]?.inc:undefined}));
    })();
    const binaries={};
    if(WIN){binaries['maple-input']=[process.execPath,path.join(here,'win','maple-input.mjs')];binaries['maple-ocr']=[PY,path.join(here,'win','maple_ocr.py')];binaries.exact=[PY,path.join(here,'win','maple_tooltip.py')];}
    else for(const name of ['maple-input','maple-ocr']) {
      const src=path.join(here,`${name}.swift`),bin=path.join(os.tmpdir(),`gms-${name}`);
      if(!fs.existsSync(bin)||fs.statSync(bin).mtimeMs<fs.statSync(src).mtimeMs)execFileSync('swiftc',['-O',src,'-o',bin]);
      binaries[name]=bin;
    }
    optionReader=new OptionReader({shot,input:binaries['maple-input'],ocr:binaries['maple-ocr'],catalog,readFrame,exact:binaries.exact});
    optionReaders.push(optionReader,new OptionReader({shot,input:binaries['maple-input'],ocr:binaries['maple-ocr'],catalog,readFrame,exact:binaries.exact}));
    process.on('exit',()=>optionReaders.forEach(r=>r.close()));
  }catch(e){console.error('option reader unavailable; collecting text:',e.message);}
}

const text = await Tesseract.createWorker('eng');
// Symbols the game's chat font never draws are ruled out, so Tesseract picks the real letter instead ("£ard" → "Zard").
await text.setParameters({ tessedit_pageseg_mode: '7', preserve_interword_spaces: '1', tessedit_char_blacklist: '£©®°¢¥§«»€¬±™¦' });
const namesFile = path.join(here, '..', '..', 'assets', 'items-names.json');
// The learned chat-font table (assets/mega-glyphs.json) reads most lines exactly; OCR covers the rest.
const glyphFile = path.join(here, '..', '..', 'assets', 'mega-glyphs.json');
const readGlyphs = fs.existsSync(glyphFile) ? glyphReader(JSON.parse(fs.readFileSync(glyphFile, 'utf8'))) : null;
const fixItems = fs.existsSync(namesFile) ? itemFixer(JSON.parse(fs.readFileSync(namesFile, 'utf8'))) : (t) => t;
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const nickWord = await Tesseract.createWorker('eng');
await nickWord.setParameters({ tessedit_pageseg_mode: '8', tessedit_char_whitelist: ALNUM });
const nickLine = await Tesseract.createWorker('eng');
await nickLine.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: ALNUM });
const workers = { text, nick: nickWord, nickline: nickLine };
const cache = new Map();
let usedOcr=false;
const ocr = async (bm, kind) => {
  if (!bm.ink) return '';
  usedOcr=true;
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
const stateFile=path.join(os.homedir(),'.config/gms-hub/mega-state.json');
let saved={};
if(!DRY)try{const value=JSON.parse(fs.readFileSync(stateFile,'utf8'));if(value.version===1)saved=value;}catch{}
const observations=(saved.observations||[]).filter(r=>Date.now()-Date.parse(r.seen)<15*60000).slice(-1000);
for(const row of observations)isRepeat(row,Date.parse(row.seen));
const optionJobs = new Map((saved.jobs||[]).filter(([,job])=>Date.now()-job.created<120000).map(([key,job])=>[key,{...job,active:false,lastAttempt:0}]));
const optionTasks=new Set();
const messageKey = m => JSON.stringify([m.channel,m.nick,m.text]);
let visibleMessages=new Map([...optionJobs].map(([key,job])=>[key,{row:job.row,lastVisible:job.lastVisible}]));
let box = null, ticks = 0, empty = 0, queue = (saved.queue||[]).filter(r=>Date.now()-Date.parse(r.seen)<3600000), posting=[], sent = 0;
function saveState() {
  if(DRY)return;
  while(observations.length&&Date.now()-Date.parse(observations[0].seen)>15*60000)observations.shift();
  const tmp=stateFile+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify({version:1,observations:observations.slice(-1000),jobs:[...optionJobs].map(([key,job])=>[key,{...job,active:false}]),queue:[...posting,...queue]}));
  fs.renameSync(tmp,stateFile);
}
async function flush() {
  if (DRY || !queue.length) return;
  const rows = queue.splice(0, 50);
  posting.push(...rows);saveState();
  try {
    const r = await fetch(API, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }) });
    if (!r.ok) throw new Error(String(r.status));
    sent += (await r.json()).accepted || 0;
  } catch (e) { queue.unshift(...rows); console.error(new Date().toISOString(), 'post failed', e.message); }
  finally {posting=posting.filter(r=>!rows.includes(r));saveState();}
}

let coveredSince=0,lastUnstick=0;
// Windows (2026-11-23): the shop collector's item tooltips keep covering the chat. When a megaphone line shows up
// that has not been read yet and is covered, ask the shop collector to move the pointer away and wait ('hold'),
// so the line can be read and its item link pressed at once; 'release' hands the mouse back early.
let step='start',testTicks=0,tallAt=0;
let tallBox=null,lastOptionEnd=0,lastFree=Date.now(),lastAccept=Date.now(),lastStatus=0;
const optionCache=new Map();
const cacheKey=row=>[row.channel,row.nick.toLowerCase(),shape(row.text)].join('|');
const CHAT_X=Number(process.env.GMS_CHAT_X||278);
const PEEK_COLORS=(process.env.GMS_PEEK_COLORS||'').split('');
// A line read while a shop tooltip fades over it comes out as garbage, different each time. On Windows a new
// message is accepted only when the very same reading (channel, nick, text) is seen a second time within 30 s.
const seenOnce=[],accepted=[];
const alike=(a,b)=>a===b||similar(shape(a),shape(b));
const knownStrips=new Map();let lastHold=0,holdOpen=false;
const lend=(action)=>new Promise(done=>{if(!optionReader)return done();execFile(...helperCall(optionReader.input,[action,'0','0']),{timeout:13000,windowsHide:true},(e)=>done(e?(e.code??-1):0));});
// Identity of a line from its nickname and first message letters (left of where tooltips reach); null if that part is covered.
function stripKey(part,l) {
  const badge=findBadge(part,l);if(!badge)return null;
  const left=textLeft(part,l);let hash=2166136261;
  for(const [a,z] of [[left,badge.left],[badge.message,Math.min(165,part.width)]])for(let x=a;x<z;x++) {
    let bg=0,col=0;
    for(let y=l.top;y<=l.bottom;y++){const i=(y*part.width+x)*4;if(bandClass(part.data[i],part.data[i+1],part.data[i+2])===l.color)bg++;else col|=1<<(y-l.top);}
    if(bg<2)return null;
    hash=Math.imul(hash^col,16777619)>>>0;
  }
  return l.color+hash;
}
// Shop black box (owner 2026-11-22: the shop kept closing and nobody could say why). Keep the last frames; when the
// CLOSE STORE button that was on screen stays gone for 3 s, save those frames with our recent inputs and owner idle times.
const shopFrames=[];let shopGoneSince=0,shopWasVisible=false;
function shopWatch(img,raw) {
  if(WIN)return; // no owner shop on the Windows PC (HANDOFF-WINDOWS.md 3)
  shopFrames.push({t:Date.now(),raw});while(shopFrames.length&&Date.now()-shopFrames[0].t>15000)shopFrames.shift();
  const visible=shopButtonVisible(img,OptionReader.shopButton);
  if(visible===null)return;
  if(visible){shopWasVisible=true;shopGoneSince=0;return;}
  if(!shopWasVisible)return;
  if(!shopGoneSince){shopGoneSince=Date.now();return;}
  if(Date.now()-shopGoneSince<3000)return;
  shopWasVisible=false;const ref=OptionReader.shopButton;OptionReader.shopButton=null;
  const dir=path.join(os.homedir(),'gms-hub-samples','shop-closed',new Date().toISOString().replace(/[:.]/g,'-'));
  try {
    fs.mkdirSync(dir,{recursive:true});
    for(const f of shopFrames)fs.writeFileSync(path.join(dir,`${new Date(f.t).toISOString().replace(/[:.]/g,'-')}.png`),f.raw);
    let idle='';try{idle=execFileSync('ioreg',['-c','IOHIDSystem']).toString().match(/HIDIdleTime" = (\d+)/)?.[1];}catch{}
    let front='';try{front=execFileSync('osascript',['-e','tell application "System Events" to get name of first process whose frontmost is true'],{timeout:2000}).toString().trim();}catch{}
    fs.writeFileSync(path.join(dir,'info.json'),JSON.stringify({goneSince:new Date(shopGoneSince).toISOString(),detected:new Date().toISOString(),ownerIdleSeconds:idle?Number(idle)/1e9:null,front,button:ref.box,recentInputs:inputLog.filter(e=>e.start>shopGoneSince-20000)},null,1));
    const near=inputLog.filter(e=>e.start>shopGoneSince-5000&&e.start<shopGoneSince+500);
    console.log(`SHOP CLOSED at ${new Date(shopGoneSince).toISOString()}: our inputs in the 5 s before: ${near.map(e=>`${e.action}@${e.x},${e.y} ${new Date(e.start).toISOString().slice(11,23)} code=${e.code}`).join(' | ')||'none'}; owner idle ${idle?(Number(idle)/1e9).toFixed(1):'?'}s; front=${front}; saved ${dir}`);
  } catch(e){console.log('SHOP CLOSED (save failed: '+e.message+')');}
}
let shopWatchAt=0;
setInterval(()=>{ // its own timer: the main tick pauses during clicks, which is exactly when we must watch
  try{const at=fs.statSync(shot).mtimeMs;if(at===shopWatchAt)return;shopWatchAt=at;const raw=fs.readFileSync(shot);shopWatch(PNG.sync.read(raw),raw);}catch{}
},400).unref();
async function tick() {
  if (!cam) { if (Date.now() - tried > 60000) camera(); return; }
  if(optionReaders.some(r=>r.interacting))return; // Do not OCR chat through an open tooltip.
  lastFree=Date.now();step='frame';
  let at = 0;
  try { at = fs.statSync(shot).mtimeMs; } catch { /* no frame yet */ }
  // No new frame: nothing on the window changed. A minute without one means the stream is stuck, so start it over.
  if (at === seen) { if (Date.now() - fresh > 60000) cam.kill(); return; }
  seen = at; fresh = Date.now();
  const img = PNG.sync.read(fs.readFileSync(shot));
  const now0 = Date.now();
  if (!box || ticks++ % 40 === 0 || empty > 20) { let found = findChatBox(img);
    // Windows: the chat sits at a fixed place (left edge x≈278, bottom above the status bar); shop signs and stalls in
    // the Free Market carry the same band colours, so a box found anywhere else is scenery and is ignored.
    if (WIN && found && (Math.abs(found.x - CHAT_X) > 16 || found.y + found.h < img.height - 110)) found = null;
    if (found) { box = stableChatBox(box,found,img); empty = 0; } }
    // Windows: a look that catches one megaphone gives a one-line box. The chat does not move, so keep the tallest
    // area ever seen (all rows from the highest band to the lowest), not just this look's.
    if (WIN && now0-tallAt>300000) { tallBox=null; tallAt=now0; } // start the tall area over every 5 minutes
    if (WIN && box) { const y0=Math.min(tallBox?.y??box.y,box.y), y1=Math.max(tallBox?(tallBox.y+tallBox.h):0,box.y+box.h); tallBox={x:box.x,w:box.w,y:y0,h:Math.min(320,y1-y0)}; box={...tallBox}; }
  if (!box) return;
  const part = crop(img, box);
  step='lines';
  const lines = findLines(part);
  empty = lines.length ? 0 : empty + 1;
  const read = [];
  const anchor = readGlyphs ? slotAnchor(part, lines) : null;
  for (const l of lines) { step='read row '+l.color+l.top; usedOcr=false; read.push(isLineVisible(part,l)?{...await readLine(part, l, ocr, anchor ? { read: readGlyphs, wTop: windowTop(l, anchor) } : null),top:l.top}:{top:l.top,obscured:true}); if(!read.at(-1).obscured)read.at(-1).sure=!usedOcr; }
  const now = Date.now();
  // Watchdog: a panel left open over the chat (an interrupted click) hides every line from the reader.
  // If the chat stays covered or unreadable for 15 s, move the game's pointer to a corner to close it.
  const covered=!lines.length||read.some(r=>r.obscured);
  if(!covered)coveredSince=0;else if(!coveredSince)coveredSince=now;
  if(!WIN&&coveredSince&&now-coveredSince>15000&&now-lastUnstick>15000&&optionReader&&!optionReaders.some(r=>r.busy)) {
    lastUnstick=now;
    execFile(...helperCall(optionReader.input,['move',String(img.width-40),'40',String(img.width),String(img.height)]),{timeout:WIN?8000:3000,windowsHide:true},(e)=>console.log(`chat covered for ${Math.round((now-coveredSince)/1000)}s: parked the game pointer${e?' (failed: '+(e.code||e.message)+')':''}`));
  }
  if(WIN&&optionReader) {
    let need=false;
    lines.forEach((l,i)=>{const k=stripKey(part,l);if(!k)return;const e=knownStrips.get(k);if(!read[i].obscured)knownStrips.set(k,{t:now,n:(e?.n||0)+1});else if((e?.n||0)<2&&PEEK_COLORS.includes(l.color))need=true;});
    if(knownStrips.size>400)for(const [k,e] of knownStrips)if(now-e.t>600000)knownStrips.delete(k);
    if(need&&now-lastHold>2500){lastHold=now;holdOpen=true;lend('hold');console.log('hold: new covered megaphone line');}
    else if(holdOpen&&!need&&!optionReaders.some(r=>r.busy)&&now-lastHold>800){holdOpen=false;lend('release');}
  }
  const sureOf=[];{let cur=null;for(const l of read){if(!l.cont&&l.nick){cur={nick:l.nick,channel:l.channel,text:String(l.text||''),sure:!!l.sure};sureOf.push(cur);}else if(l.cont&&cur)cur.sure=cur.sure&&!!l.sure;else cur=null;}}
  if(process.env.GMS_DEBUG&&lines.length)console.log('dbg '+new Date().toTimeString().slice(0,8)+' '+read.map((r,i)=>`${lines[i].color}${lines[i].top}${r.obscured?' OBS':r.cont?' +'+String(r.text).slice(0,14):' '+r.nick+'/'+r.channel+(r.sure?'!':'?')+' '+String(r.text).slice(0,18)}`).join(' | '));
  step='assemble';
  const all = assemble(read);
  if (ticks % 240 === 1 && lines.length) {
    const name = `${new Date(now).toISOString().replace(/[:.]/g, '-')}.png`;
    const png = new PNG({ width: part.width, height: part.height });
    png.data = Buffer.from(part.data.buffer);
    fs.writeFileSync(path.join(LIVE, name), PNG.sync.write(png));
    fs.appendFileSync(path.join(LIVE, 'reads.jsonl'), `${JSON.stringify({ file: name, megaphones: all })}\n`);
    const kept = fs.readdirSync(LIVE).filter((f) => f.endsWith('.png')).sort();
    for (const f of kept.slice(0, Math.max(0, kept.length - 300))) fs.unlinkSync(path.join(LIVE, f));
  }
  for (const m of all) m.text = fixItems(m.text,['Y','C'].includes(m.color));
  const fingerprints=lines.map(l=>lineFingerprint(part,l));
  const pending=[];
  const nextVisible=new Map(),counts=new Map();
  for(const m of all){const key=messageKey(m);counts.set(key,(counts.get(key)||0)+1);}
  for (const m of all) {
    const i=read.findIndex(r=>!r.cont&&r.nick===m.nick&&r.channel===m.channel&&m.text.startsWith(fixItems(r.text,true)));
    if(i>=0)m.fingerprint=fingerprints[i];
    const key=messageKey(m),original=counts.get(key)===1&&i>=0?continuousMessage(visibleMessages.get(key),m,now):null;
    if(original) {
      nextVisible.set(key,{row:original,lastVisible:now});
      const job=optionJobs.get(key);
      if(job&&job.row.seen===original.seen){job.fingerprint=fingerprints[i];job.lastVisible=now;}
      continue;
    }
    if (WIN && m.channel) { // accepted when an earlier look (another tick, within 30 s) read about the same thing: item names and long texts go through OCR and differ by a letter between looks
      while(seenOnce.length&&now-seenOnce[0].t>30000)seenOnce.shift();
      const again=sureOf.some(s=>s.sure&&s.nick===m.nick&&s.channel===m.channel&&shape(s.text).length>=2&&shape(m.text).startsWith(shape(fixItems(s.text,['Y','C'].includes(m.color)))))||seenOnce.some(o=>o.t<=now-1200&&o.channel===m.channel&&alike(o.nick,m.nick)&&alike(o.text,m.text));
      seenOnce.push({t:now,channel:m.channel,nick:m.nick,text:m.text});if(seenOnce.length>400)seenOnce.shift();
      if(!again)continue;
      // An item megaphone read without its "[item]" link: the link was under the pointer or a panel at that moment, and
      // accepting it made the full reading that followed look like a repeat (15:26-15:34: every item megaphone went up
      // link-less). Wait until the same link-less reading has stood for 3 s and no look in the last 12 s showed a link.
      if(['Y','C'].includes(m.color)&&!m.text.includes('[')) {
        const mine=o=>o.channel===m.channel&&alike(o.nick,m.nick);
        if(!seenOnce.some(o=>o.t<=now-3000&&mine(o)&&alike(o.text,m.text))||seenOnce.some(o=>now-o.t<12000&&mine(o)&&o.text.includes('[')))continue;
      }
      // Half-covered rows come out with a cut nick ("epyks" for "Xepyks"), an open "[" or OCR dashes. Such a reading is
      // not accepted, and a reading that is the same ad as one accepted in the last 3 minutes (same channel and band,
      // nick within two letters, text alike or the same start) is that ad again, not a new one.
      const open=m.text.split('[').length!==m.text.split(']').length;
      if(open||['——','===','___'].some(x=>m.text.includes(x))||['—','–','|','~'].some(x=>m.text.trimEnd().endsWith(x)))continue;
      // A reading that needed OCR, from someone whose megaphone on the same channel and band was accepted in the last
      // 90 s, is that megaphone seen half-covered ("CB TurkEy CR po EET" after "B> Turkey Eggs 600 each"), not a new one.
      // Double megaphones are two rows from one sender at once, so they are left out of this rule. Two letters are no text.
      const certain=sureOf.some(s=>s.sure&&s.nick===m.nick&&s.channel===m.channel);
      if(shape(m.text).length<3)continue;
      if(!certain&&m.color!=='C'&&accepted.some(o=>now-o.t<90000&&o.channel===m.channel&&o.color===m.color&&o.nick===m.nick&&o.text!==m.text))continue;
      const T=shape(m.text),nickNear=(a,b)=>{a=a.toLowerCase().replace(/l/g,'i');b=b.toLowerCase().replace(/l/g,'i');if(a===b||a.endsWith(b)&&b.length>=3||b.endsWith(a)&&a.length>=3)return true;if(Math.abs(a.length-b.length)>2)return false;let p=Array.from({length:b.length+1},(_,k)=>k);for(let x=1;x<=a.length;x++){const c=[x];for(let y=1;y<=b.length;y++)c[y]=Math.min(p[y]+1,c[y-1]+1,p[y-1]+(a[x-1]===b[y-1]?0:1));p=c;}return p[b.length]<=2;};
      if(accepted.some(o=>now-o.t<180000&&o.channel===m.channel&&o.color===m.color&&nickNear(o.nick,m.nick)&&(o.nick!==m.nick||o.text!==m.text)&&(alike(o.text,m.text)||shape(o.text).slice(0,6)===T.slice(0,6)||o.text.includes('[')&&!m.text.includes('[')&&shape(o.text).endsWith(T))))continue;
      accepted.push({t:now,channel:m.channel,color:m.color,nick:m.nick,text:m.text});if(accepted.length>200)accepted.shift(); }
    if (!m.channel || isRepeat(m, now)) continue;
    const row = { seen: new Date(now).toISOString(), kind: KINDS[m.color] || 'super', color: m.color, channel: m.channel, nick: m.nick, text: m.text };
    pending.push({row,m});
    if(counts.get(key)===1&&i>=0)nextVisible.set(key,{row,lastVisible:now});
    if(optionReader && ['Y','C'].includes(row.color)) {
      // A scroll's effect is fixed game data (catalog `inc`; Lesser 100%, Intermediate 60%, Greater 10%): its link need not be
      // pressed. Tesseract kept failing on scroll panels (four tries each, ~25 s of the shared mouse, and no result).
      const linked=row.text.split('[').slice(1).map(s=>s.split(']')[0]),linkName=linked.length===1?linked[0]:'';
      const scrollItem=WIN&&linkName?optionReader.catalog.find(c=>nameKey(c.en)===nameKey(linkName)):null;
      const tier=scrollItem&&/ Scroll: (Lesser|Intermediate|Greater)$/.exec(scrollItem.en)?.[1];
      const known=WIN&&optionCache.get(cacheKey(row));
      if(tier&&scrollItem.inc&&Object.keys(scrollItem.inc).length){row.opts={scroll:{chance:{Lesser:100,Intermediate:60,Greater:10}[tier],stats:scrollItem.inc}};console.log(`options ${row.nick} [${scrollItem.en}] ${JSON.stringify(row.opts)} (0ms ix=0 pre=0) mode=catalog seen=${row.seen}`);}
      else if(known&&now-known.t<15*60000){row.opts=known.opts;console.log(`options reused ${row.nick} [${linkName}] ${JSON.stringify(row.opts)} seen=${row.seen}`);}
      else if(i>=0)optionJobs.set(messageKey(m),{row,m,fingerprint:fingerprints[i],attempts:0,lastAttempt:0,created:now,lastVisible:now});
    }
    console.log(`${new Date(now).toTimeString().slice(0, 8)} ${row.kind.padEnd(6)} CH${String(row.channel).padStart(2)} ${row.nick}: ${row.text}`);
  }
  visibleMessages=nextVisible;
  // Publish text before slow option OCR. Later success enriches this exact row.
  // Windows: megaphone rows are on screen and read, but none has been accepted for 5 minutes (2026-11-24 10:50: the
  // process kept ticking and read rows, yet logged nothing for 7 minutes; cause unknown). Print what the reader sees
  // once a minute while that lasts, and restart after 5 minutes.
  if(pending.length)lastAccept=now;
  if(WIN&&lines.length&&now-lastAccept>60000&&now-lastStatus>60000){lastStatus=now;console.error(new Date().toISOString(),`quiet ${Math.round((now-lastAccept)/1000)} s: rows ${lines.length}, covered ${read.filter(r=>r.obscured).length}, messages ${all.length} [${all.slice(0,3).map(m=>`${m.nick}/${m.channel}:${String(m.text).slice(0,18)}`).join(' | ')}], seenOnce ${seenOnce.length}, accepted ${accepted.length}, visible ${visibleMessages.size}, jobs ${optionJobs.size}, area ${JSON.stringify(box)}`);box=null;tallBox=null;tallAt=now;}
  if(WIN&&lines.length&&now-lastAccept>300000){console.error(new Date().toISOString(),'no megaphone accepted for 5 minutes while rows are on screen, restarting');process.exit(1);}
  queue.push(...pending.map(({row})=>row));
  observations.push(...pending.map(({row,m})=>({...row,fingerprint:m.fingerprint})));
  if(pending.length)saveState();
  const jobItem=job=>{const links=[...job.row.text.matchAll(/\[([^\]]+)\]/g)];return links.length===1?optionReader?.catalog.find(i=>nameKey(i.en)===nameKey(links[0][1])):null;};
  for(const [key,job] of optionJobs) {
    if(fingerprints.includes(job.fingerprint))job.lastVisible=now;
    if(!job.active&&(now-job.lastVisible>(WIN?25000:10000)||now-job.created>120000)) {
      const item=jobItem(job);
      if(item&&!item.cash&&(item.cat==='Equip'||/ Scroll: /i.test(item.en)))console.log(`options unfinished ${job.row.nick} [${item.en}]: ${job.lastReason||'row disappeared before capture'}; attempts=${job.attempts}; seen=${job.row.seen}`);
      const recorded=observations.find(r=>r.seen===job.row.seen&&r.channel===job.row.channel&&r.nick===job.row.nick&&r.text===job.row.text);
      if(recorded){recorded.capture=recorded.opts?'partial':'failed';recorded.reason=job.lastReason||'row disappeared before capture';}
      optionJobs.delete(key);
    }
  }
  // Known scrollable equipment/scrolls first. Entries without equipment details can still be read,
  // but must not consume four retries while stat-bearing equipment scrolls off the chat.
  const priority=job=>{const item=jobItem(job);return item&&(Number.isInteger(item.slots)||/ Scroll: /i.test(item.en))?0:1;};
  // Windows: one option read at a time, and at least 1.5 s of plain chat reading between two of them — while a link is
  // being pressed the chat is not read (the panel covers it), and back-to-back presses made new megaphones go unseen.
  step='options';
  const reader=WIN?(!optionReaders.some(r=>r.busy)&&now-lastOptionEnd>=600?optionReaders[0]:null):optionReaders.find(r=>!r.busy);
  if(reader) for(const [key,job] of [...optionJobs].sort((a,b)=>Math.min(a[1].attempts,2)-Math.min(b[1].attempts,2)||priority(a[1])-priority(b[1])||a[1].created-b[1].created||a[1].lastAttempt-b[1].lastAttempt)) {
    const {row,m}=job;
    if(job.active||now-job.lastAttempt<1000)continue;
    const item=jobItem(job);
    if(!item || item.cash || (item.cat!=='Equip' && !/ Scroll: /i.test(item.en))){optionJobs.delete(key);continue;}
    const matches=fingerprints.flatMap((f,i)=>f===job.fingerprint&&!read[i].obscured?[i]:[]);
    if(!matches.length)continue;
    // a repeated identical ad: take the copy nearest to where this job's row was last seen
    const i=matches.reduce((a,b)=>Math.abs(lines[b].top-(job.top??lines[b].top))<Math.abs(lines[a].top-(job.top??lines[a].top))?b:a);
    job.top=lines[i].top;
    job.lastAttempt=now;
    job.active=true;reader.busy=true;
    const task=(async()=>{
    if(WIN){lastHold=Date.now();holdOpen=true;const t=Date.now(),code=await lend('hold');if(code)console.log(`hold failed (code ${code}, ${Date.now()-t}ms) before ${row.nick}`);} // pointer away first: the shop tooltip must not cover the row while it is found and pressed
    const opts=await reader.collect({image:img,box:{...box},line:lines[i],message:row,item,glyph:anchor?{read:readGlyphs,wTop:windowTop(lines[i],anchor),expected:item.en}:null});
    if(opts){
      // Preserve earlier verified values; a retry only adds previously missing fields.
      row.opts={...opts,...row.opts,stats:{...opts.stats,...row.opts?.stats}};
      if(!Object.keys(row.opts.stats).length)delete row.opts.stats;
      reader.lastMissing=(reader.lastMissing||[]).filter(k=>k==='unread_rows'?Object.keys(row.opts.stats||{}).length+Number(row.opts.attackSpeed!==undefined)+Number(row.opts.knockback!==undefined)<reader.lastStatCount:['slots','ups'].includes(k)?row.opts[k]===undefined:row.opts.stats?.[k]===undefined);
      const recorded=observations.find(r=>r.seen===row.seen&&r.channel===row.channel&&r.nick===row.nick&&r.text===row.text);
      if(reader.correctedItem) {
        // the tooltip showed the real item: fix the misread link name in the message we upload
        // keep row.text (the server finds the uploaded row by it); send the corrected text alongside
        row.fixedText=row.text.replace(`[${item.en}]`,`[${reader.correctedItem.en}]`);
        console.log(`link name corrected by tooltip: [${item.en}] -> [${reader.correctedItem.en}] (${row.nick})`);
        if(recorded)recorded.fixedText=row.fixedText;
      }
      if(recorded){recorded.opts=row.opts;recorded.capture=reader.lastMissing.length?'partial':'complete';recorded.missing=reader.lastMissing;}
      if(!reader.lastMissing?.length){optionJobs.delete(key);if(WIN&&!reader.correctedItem){optionCache.set(cacheKey(row),{opts:row.opts,t:Date.now()});if(optionCache.size>500)optionCache.delete(optionCache.keys().next().value);}}
      // A corrected link name needs the server that understands fixedText; until it is deployed
      // (flag file below), keep such options local so they are never stored under the misread item.
      const serverFixes=fs.existsSync(path.join(os.homedir(),'.config','gms-hub','mega-fixed-text-server'));
      if(reader.correctedItem&&!serverFixes)console.log(`  (held back: server does not take corrected names yet)`);
      else if(!queue.includes(row))queue.push({...row});
      console.log(`options${reader.lastMissing?.length?' partial':''} ${row.nick} [${item.en}] ${JSON.stringify(row.opts)}${reader.lastMissing?.length?' missing='+reader.lastMissing.join(','):''} (${Date.now()-now}ms ix=${reader.timing?.interact??'?'} pre=${reader.timing?.preflight??'?'}) mode=${reader.lastMode||'?'} seen=${row.seen}`);
    }
    else { if(WIN&&/title missing|colour box|no trusted|target row/.test(reader.lastSkip||''))try{const d=path.join(os.homedir(),'gms-hub-samples','opt-fail',new Date().toISOString().replace(/[:.]/g,'-')+'-'+item.en.replace(/[^A-Za-z0-9]+/g,'_'));fs.cpSync(reader.dir,d,{recursive:true});}catch{}
    console.log(`options skipped ${row.nick} [${item.en}]: ${reader.lastSkip} (${Date.now()-now}ms) mode=${reader.lastMode||'?'} seen=${row.seen}`); }
    job.lastReason=reader.lastSkip||(reader.lastMissing?.length?'missing '+reader.lastMissing.join(','):'');
    if(!/input\/OCR: [45]$|cooldown|paused|moved after click/.test(reader.lastSkip))job.attempts++;
    if(job.attempts>=4)job.created=0; // owner 2026-11-22: no long click series on one link (one got 18 clicks); expire next tick
    if(/moved after click/.test(reader.lastSkip))job.lastAttempt=0; // the chat scrolled under the pointer: try again at once
    if(priority(job)>0&&reader.lastSkip==='no trusted numeric options')optionJobs.delete(key);
    })().catch(e=>console.error('option task failed:',e.message)).finally(()=>{lastOptionEnd=Date.now();job.active=false;reader.busy=false;optionTasks.delete(task);saveState();if(WIN&&!optionReaders.some(r=>r.busy)){holdOpen=false;lend('release');}});
    optionTasks.add(task);
    break; // One attempt per tick, rotating fairly; text uploads are never held for OCR.
  }
}

console.log(DRY ? `dry run: no uploads${OPTIONS ? ', background option clicks enabled' : ', reading only'}` : `collecting and posting${OPTIONS ? '' : ' (text only; option input disabled)'}`);
if(DRY){const duration=Number(process.argv.find((a)=>a.startsWith('--duration='))?.split('=')[1]);if(duration>0)setTimeout(()=>{stopping=true;},duration*1000);}
// Finish any click's finally block before exiting so a tooltip cannot obscure the next collector's chat detection.
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;});
process.on('exit',()=>{if(cam)cam.kill();if(DRY)fs.rmSync(shot,{force:true});});
setInterval(flush, 5000);
// Watchdog (2026-11-23: a bad glyph-table entry sent the reader into an endless loop and nothing was collected for
// 11 minutes). A second thread ends the process when the main loop has not finished a tick for 60 s; the run loop
// (mega.sh / mega-loop.cmd) starts it again.
const beat=new Int32Array(new SharedArrayBuffer(4));
new Worker("const {workerData:b}=require('node:worker_threads');let last=-1,since=Date.now();setInterval(()=>{const v=Atomics.load(b,0);if(v!==last){last=v;since=Date.now();}else if(Date.now()-since>60000){require('node:fs').writeSync(2,new Date().toISOString()+' watchdog: main loop stuck for 60 s, restarting'+String.fromCharCode(10));process.kill(process.pid);}},5000);",{eval:true,workerData:beat}).unref();
while (!stopping) {
  const t0 = Date.now();
  Atomics.add(beat,0,1);
  // 2026-11-23 17:43: after one option read the chat was never read again for 43 minutes — the loop kept running but an
  // option reader stayed marked as pressing a link. No chat reading for 90 s ends the process; the run loop restarts it.
  if(Date.now()-lastFree>90000){console.error(new Date().toISOString(),`stuck: chat not read for ${Math.round((Date.now()-lastFree)/1000)} s (option reader busy=${optionReaders.map(r=>`${!!r.busy}/${!!r.interacting}`).join(',')}), restarting`);process.exit(1);}
  try {
    // A tick that never finishes (an awaited helper or OCR worker that never answers) left the collector alive but
    // silent. 45 s without finishing ends the process, naming the step it stopped at; the run loop restarts it.
    step='start';
    if(process.env.GMS_TEST_HANG==='await'&&++testTicks>6)await new Promise(()=>{});
    if(process.env.GMS_TEST_HANG==='spin'&&++testTicks>6)for(;;){}
    const done=await Promise.race([tick().then(()=>true),new Promise(r=>setTimeout(()=>r(false),45000).unref())]);
    if(!done){console.error(new Date().toISOString(),`tick did not finish in 45 s (step: ${step}), restarting`);process.exit(1);}
  } catch (e) { console.error(new Date().toISOString(), e.message, String(e.stack).split(String.fromCharCode(10)).slice(1,4).join(' | ')); }
  await new Promise((r) => setTimeout(r, Math.max(200, TICK_MS - (Date.now() - t0))));
}
await Promise.allSettled(optionTasks);
await flush();
saveState();
process.exit(0);
