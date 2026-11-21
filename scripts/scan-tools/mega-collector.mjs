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
import Tesseract from 'tesseract.js';
import { findChatBox, stableChatBox, findLines, isLineVisible, readLine, assemble, repeatFilter, continuousMessage, itemFixer, glyphReader, slotAnchor, windowTop, lineFingerprint } from '../../assets/mega-reader.js';
import { OptionReader, nameKey } from './mega-options.mjs';

const API = 'https://gms-hub-votes.kwonth211.workers.dev/internal/megaphone';
const DRY = process.argv.includes('--dry');
const OPTIONS = !fs.existsSync(path.join(os.homedir(), '.config', 'gms-hub', 'mega-options-paused')) && !process.argv.includes('--no-options') && (!DRY || process.argv.includes('--options'));
const TICK_MS = 500;
const KINDS = { P: 'super', Y: 'item', C: 'double' };
const shot = path.join(os.tmpdir(), DRY ? `gms-mega-dry-${process.pid}.png` : 'gms-mega-shot.png');
// Every 240 ticks the chat crop and what was read from it are kept for `./mega.sh check`.
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
const optionReaders=[];
if(OPTIONS) {
  try {
    const catalogPath=path.join(here,'../../assets/items-catalog.json');
    const catalog=fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath,'utf8')) : (()=>{
      const details=JSON.parse(fs.readFileSync(path.join(here,'../../data/item-details.json'),'utf8')).items;
      return JSON.parse(fs.readFileSync(path.join(here,'../../data/items.json'),'utf8')).items.map((i)=>({...i,slots:details[i.id]?.slots,inc:i.cat==='Use'?details[i.id]?.inc:undefined}));
    })();
    const binaries={};
    for(const name of ['maple-input','maple-ocr']) {
      const src=path.join(here,`${name}.swift`),bin=path.join(os.tmpdir(),`gms-${name}`);
      if(!fs.existsSync(bin)||fs.statSync(bin).mtimeMs<fs.statSync(src).mtimeMs)execFileSync('swiftc',['-O',src,'-o',bin]);
      binaries[name]=bin;
    }
    optionReader=new OptionReader({shot,input:binaries['maple-input'],ocr:binaries['maple-ocr'],catalog,readFrame});
    optionReaders.push(optionReader,new OptionReader({shot,input:binaries['maple-input'],ocr:binaries['maple-ocr'],catalog,readFrame}));
    process.on('exit',()=>optionReaders.forEach(r=>r.close()));
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
async function tick() {
  if (!cam) { if (Date.now() - tried > 60000) camera(); return; }
  if(optionReaders.some(r=>r.interacting))return; // Do not OCR chat through an open tooltip.
  let at = 0;
  try { at = fs.statSync(shot).mtimeMs; } catch { /* no frame yet */ }
  // No new frame: nothing on the window changed. A minute without one means the stream is stuck, so start it over.
  if (at === seen) { if (Date.now() - fresh > 60000) cam.kill(); return; }
  seen = at; fresh = Date.now();
  const img = PNG.sync.read(fs.readFileSync(shot));
  if (!box || ticks++ % 40 === 0 || empty > 20) { const found = findChatBox(img); if (found) { box = stableChatBox(box,found,img); empty = 0; } }
  if (!box) return;
  const part = crop(img, box);
  const lines = findLines(part);
  empty = lines.length ? 0 : empty + 1;
  const read = [];
  const anchor = readGlyphs ? slotAnchor(part, lines) : null;
  for (const l of lines) read.push(isLineVisible(part,l)?{...await readLine(part, l, ocr, anchor ? { read: readGlyphs, wTop: windowTop(l, anchor) } : null),top:l.top}:{top:l.top,obscured:true});
  const now = Date.now();
  // Watchdog: a panel left open over the chat (an interrupted click) hides every line from the reader.
  // If the chat stays covered or unreadable for 15 s, move the game's pointer to a corner to close it.
  const covered=!lines.length||read.some(r=>r.obscured);
  if(!covered)coveredSince=0;else if(!coveredSince)coveredSince=now;
  if(coveredSince&&now-coveredSince>15000&&now-lastUnstick>15000&&optionReader&&!optionReaders.some(r=>r.busy)) {
    lastUnstick=now;
    execFile(optionReader.input,['move',String(img.width-40),'40',String(img.width),String(img.height)],{timeout:3000},(e)=>console.log(`chat covered for ${Math.round((now-coveredSince)/1000)}s: parked the game pointer${e?' (failed: '+(e.code||e.message)+')':''}`));
  }
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
    if (!m.channel || isRepeat(m, now)) continue;
    const row = { seen: new Date(now).toISOString(), kind: KINDS[m.color] || 'super', color: m.color, channel: m.channel, nick: m.nick, text: m.text };
    pending.push({row,m});
    if(counts.get(key)===1&&i>=0)nextVisible.set(key,{row,lastVisible:now});
    if(optionReader && ['Y','C'].includes(row.color)) {
      if(i>=0)optionJobs.set(messageKey(m),{row,m,fingerprint:fingerprints[i],attempts:0,lastAttempt:0,created:now,lastVisible:now});
    }
    console.log(`${new Date(now).toTimeString().slice(0, 8)} ${row.kind.padEnd(6)} CH${String(row.channel).padStart(2)} ${row.nick}: ${row.text}`);
  }
  visibleMessages=nextVisible;
  // Publish text before slow option OCR. Later success enriches this exact row.
  queue.push(...pending.map(({row})=>row));
  observations.push(...pending.map(({row,m})=>({...row,fingerprint:m.fingerprint})));
  if(pending.length)saveState();
  const jobItem=job=>{const links=[...job.row.text.matchAll(/\[([^\]]+)\]/g)];return links.length===1?optionReader?.catalog.find(i=>nameKey(i.en)===nameKey(links[0][1])):null;};
  for(const [key,job] of optionJobs) {
    if(fingerprints.includes(job.fingerprint))job.lastVisible=now;
    if(!job.active&&(now-job.lastVisible>10000||now-job.created>120000)) {
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
  const reader=optionReaders.find(r=>!r.busy);
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
      if(!reader.lastMissing?.length)optionJobs.delete(key);
      // A corrected link name needs the server that understands fixedText; until it is deployed
      // (flag file below), keep such options local so they are never stored under the misread item.
      const serverFixes=fs.existsSync(path.join(os.homedir(),'.config','gms-hub','mega-fixed-text-server'));
      if(reader.correctedItem&&!serverFixes)console.log(`  (held back: server does not take corrected names yet)`);
      else if(!queue.includes(row))queue.push({...row});
      console.log(`options${reader.lastMissing?.length?' partial':''} ${row.nick} [${item.en}] ${JSON.stringify(row.opts)}${reader.lastMissing?.length?' missing='+reader.lastMissing.join(','):''} (${Date.now()-now}ms ix=${reader.timing?.interact??'?'} pre=${reader.timing?.preflight??'?'}) mode=${reader.lastMode||'?'} seen=${row.seen}`);
    }
    else console.log(`options skipped ${row.nick} [${item.en}]: ${reader.lastSkip} (${Date.now()-now}ms) mode=${reader.lastMode||'?'} seen=${row.seen}`);
    job.lastReason=reader.lastSkip||(reader.lastMissing?.length?'missing '+reader.lastMissing.join(','):'');
    if(!/input\/OCR: [45]$|cooldown|paused|moved after click/.test(reader.lastSkip))job.attempts++;
    if(/moved after click/.test(reader.lastSkip))job.lastAttempt=0; // the chat scrolled under the pointer: try again at once
    if(priority(job)>0&&reader.lastSkip==='no trusted numeric options')optionJobs.delete(key);
    })().catch(e=>console.error('option task failed:',e.message)).finally(()=>{job.active=false;reader.busy=false;optionTasks.delete(task);saveState();});
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
while (!stopping) {
  const t0 = Date.now();
  try { await tick(); } catch (e) { console.error(new Date().toISOString(), e.message); }
  await new Promise((r) => setTimeout(r, Math.max(200, TICK_MS - (Date.now() - t0))));
}
await Promise.allSettled(optionTasks);
await flush();
saveState();
process.exit(0);
