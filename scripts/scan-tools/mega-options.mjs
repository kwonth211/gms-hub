// Conservative tooltip reader. Unreadable/conflicting values are omitted, never guessed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PNG } from 'pngjs';
import Tesseract from 'tesseract.js';
import { findBadge, lineBitmap, lineFingerprint, locateFingerprint, glyphs } from '../../assets/mega-reader.js';
const exec = promisify(execFile);
import { findTooltipPanel, tooltipBody, tooltipField, missingTooltipFields, parseTooltipLines, agreeOptions, safeItemClickX, whisperDialog, nameKey, tooltipTitle } from '../../assets/mega-tooltip.js';
export { nameKey } from '../../assets/mega-tooltip.js';
export function cropImage(img, b, mask = false, scale = 1) {
  const out = new PNG({ width:b.w*scale, height:b.h*scale });
  for(let y=0;y<b.h;y++) for(let x=0;x<b.w;x++) {
    const i=((b.y+y)*img.width+b.x+x)*4;
    let rgb=[img.data[i],img.data[i+1],img.data[i+2]];
    // Below-base rolls have a red negative delta. Dropping it turns (42 -1) into
    // an invalid expression and discards an otherwise readable total of 41.
    if(mask) rgb=(Math.min(...rgb)>130 || (rgb[0]>230 && rgb[1]>140 && rgb[2]<120) || (rgb[0]>180&&rgb[0]>rgb[1]*1.7&&rgb[0]>rgb[2]*1.7)) ? [0,0,0] : [255,255,255];
    for(let dy=0;dy<scale;dy++) for(let dx=0;dx<scale;dx++) {const j=((y*scale+dy)*out.width+x*scale+dx)*4;out.data[j]=rgb[0];out.data[j+1]=rgb[1];out.data[j+2]=rgb[2];out.data[j+3]=255;}
  }
  return out;
}
export function itemLink(img,line,glyph=null) {
  const badge=findBadge(img,line);if(!badge)return null;
  // Click inside the observed item, never its nickname/badge. collect() rechecks the complete row before input.
  const point=(left,right)=>{const x=safeItemClickX(left,right,badge.message);return x!==null?{x,y:Math.floor((line.top+line.bottom)/2),badge}:null;};
  if(glyph) {
    const gs=glyphs(img,line,badge.message,img.width,glyph.wTop);
    const start=gs.findIndex((g)=>(glyph.read.charOf(g.key)||'').includes('['));
    const end=gs.findIndex((g,i)=>i>=start&&(glyph.read.charOf(g.key)||'').includes(']'));
    if(start>=0&&end>=start)return point(gs[start].x,gs[end].x+gs[end].w);
  }
  const columns=[];
  for(let x=badge.message;x<Math.min(line.right??img.width,img.width);x++) {
    let n=0;for(let y=line.top;y<=line.bottom;y++){const i=(y*img.width+x)*4;const [r,g,b]=img.data.subarray(i,i+3);if(r>240&&g>225&&b>100&&b<200)n++;}
    if(n) columns.push(x);
  }
  if(columns.length<10)return null;
  // First contiguous highlighted item only; the caller rejects multiple linked items.
  const group=[columns[0]];for(const x of columns.slice(1)){if(x-group.at(-1)>10)break;group.push(x);}
  if(group.at(-1)-group[0]<20)return null;
  return point(group[0],group.at(-1));
}

export class OptionReader {
  constructor({shot,input,ocr,catalog,readFrame}) {Object.assign(this,{shot,input,ocr,catalog,readFrame});this.last=0;this.dir=fs.mkdtempSync(path.join(os.tmpdir(),'gms-mega-options-'));}
  async recognize(img,name,file='ocr.png',scale=1) {const p=path.join(this.dir,file);fs.writeFileSync(p,PNG.sync.write(img));const {stdout}=await exec(this.ocr,[p,name,String(scale)],{timeout:4000,maxBuffer:2e6});return JSON.parse(stdout);}
  async recognizeFallback(img) {
    this.fallback ||= Tesseract.createWorker('eng').then(async w=>{await w.setParameters({tessedit_pageseg_mode:'6'});return w;});
    const {data}=await (await this.fallback).recognize(PNG.sync.write(img));
    return data.lines.map(l=>({text:l.text.trim(),confidence:l.confidence/100,x:l.bbox.x0,y:l.bbox.y0,w:l.bbox.x1-l.bbox.x0,h:l.bbox.y1-l.bbox.y0}));
  }
  async recoverTitle(image, rows, item, point) {
    // Vision can merge a translucent tooltip title with text behind it. A second engine reads a bounded crop;
    // approximate words only choose where to look. findTooltipPanel still requires the exact catalogue title.
    const words=item.en.toLowerCase().split(/\W+/).filter(w=>w.length>2);
    const candidates=rows.filter(r=>!/[\[\]]/.test(r.text)&&r.x>point.x-300&&r.x<point.x+120&&r.y<point.y+70&&
      words.filter(w=>nameKey(r.text).includes(w)).length>=Math.max(1,words.length-1)).slice(0,2);
    if(!candidates.length)return null;
    for(const r of candidates){
      const x=Math.max(0,Math.floor(r.x-10)),y=Math.max(28,Math.floor(r.y-8));
      const b={x,y,w:Math.min(image.width-x,item.cat==='Equip'?240:420),h:Math.min(image.height-y,600)};
      const extra=(await this.recognizeFallback(cropImage(image,b,false,3))).map(l=>({...l,x:x+l.x/3,y:y+l.y/3,w:l.w/3,h:l.h/3}));
      if(!extra.some(r=>r.confidence>=0.5&&tooltipTitle(r.text,item.en)))continue;
      const panel=findTooltipPanel([...rows,...extra],item,this.catalog,image);
      if(panel)return {...panel,recovered:extra};
    }
    return null;
  }
  async readPanel(image,rows,panel,item) {
    const raw=rows.filter(r=>r.x>=panel.x&&r.x+r.w<=panel.x+panel.w+3&&r.y>=panel.y&&r.y+r.h<image.height-2);
    const body=tooltipBody(panel,[...rows,...(panel.recovered||[])],item);
    const enlarged=await this.recognize(cropImage(image,body),item.en,'body.png',2);
    const bodyImage=cropImage(image,body,true,3);
    const masked=await this.recognize(bodyImage,item.en,'mask.png');
    const readings=[
      parseTooltipLines([panel.title,...raw],item),
      parseTooltipLines([panel.title,...enlarged.filter(r=>r.y+r.h<body.h*2-3)],item),
      parseTooltipLines([panel.title,...masked.filter(r=>r.y+r.h<body.h*3-5)],item)
    ];
    let opts=agreeOptions(...readings);
    this.lastReading={body,raw,enlarged,masked,readings};
    let missing=missingTooltipFields([...raw,...enlarged,...masked],opts,item);
    if(item.cat==='Equip'&&missing.length) {
      // Retry only unread lines, on the saved image, rather than clicking the game again for every OCR pass.
      for(const key of missing.slice(0,6)) {
        const candidate=raw.find(r=>tooltipField(r.text)===key)||enlarged.filter(r=>tooltipField(r.text)===key).map(r=>({...r,x:body.x+r.x/2,y:body.y+r.y/2,w:r.w/2,h:r.h/2}))[0];
        if(!candidate)continue;
        // Extra pixels above a bottom-aligned line pull in the preceding stat and
        // translucent HUD digits. Keep the observed text row and a small bottom margin.
        const y=Math.max(body.y,Math.floor(candidate.y));
        const lineBox={x:body.x,y,w:body.w,h:Math.min(image.height-y,Math.ceil(candidate.h+4))};
        const isolated=await this.recognize(cropImage(image,lineBox),item.en,'line.png',3);
        readings.push(parseTooltipLines([panel.title,...isolated],item));
        if(missingTooltipFields([candidate],agreeOptions(...readings),{cat:item.cat}).includes(key)) {
          const pixels=await this.recognize(cropImage(image,lineBox,false,3),item.en,'line-pixels.png');
          readings.push(parseTooltipLines([panel.title,...pixels],item));
        }
      }
      opts=agreeOptions(...readings);
      missing=missingTooltipFields([...raw,...enlarged,...masked],opts,item);
    }
    // The shop reader retries only when the primary read is incomplete. Do not run a slower
    // fallback over a complete, consistent crop and let its weaker digit guess discard that read.
    if(item.cat==='Equip'&&(!opts?.stats||missing.length)) {
      const fallback=await this.recognizeFallback(bodyImage);
      this.lastReading.fallback=fallback;
      opts=agreeOptions(...readings,parseTooltipLines([panel.title,...fallback.filter(r=>r.y+r.h<body.h*3-5)],item));
    }
    this.lastMissing=missingTooltipFields([...raw,...enlarged,...masked],opts,item);
    return opts;
  }
  async collect({image,box,line,message,item,glyph}) {
    const skip=(reason)=>{this.lastSkip=reason;return null;};this.lastSkip='';
    const paused=()=>fs.existsSync(path.join(os.homedir(),'.config','gms-hub','mega-options-paused'));
    if(paused())return skip('option input paused');
    if(Date.now()-this.last<500)return skip('cooldown');this.last=Date.now();
    const part=cropImage(image,box),link=itemLink(part,line,glyph);
    if(!link){
      fs.writeFileSync(path.join(this.dir,'link-failure.png'),PNG.sync.write(image));
      fs.writeFileSync(path.join(this.dir,'link-failure.json'),JSON.stringify({box,line,message,item:item.en,wTop:glyph?.wTop}));
      return skip('no safe item-link point');
    }
    const signature=(im,edge)=>lineBitmap(cropImage(im,box),line,{x0:0,x1:edge}).sig;
    const fingerprint=lineFingerprint(part,line);
    const park=[Math.min(image.width-40,box.x+box.w+35),35];
    const input=async(action,x,y,capture=false)=>{
      if(paused())throw Error('option input paused');
      const run=exec(this.input,[action,String(x),String(y),String(image.width),String(image.height)],{timeout:2000,maxBuffer:16000});
      let snapshot=null,output='';
      if(capture)run.child.stdout.on('data',chunk=>{
        output+=chunk;let end;
        // Give the game one 8fps frame to draw the panel. A PNG whose write finishes
        // just after mouse-up may still contain the frame captured before the click.
        while((end=output.indexOf('\n'))>=0){const line=output.slice(0,end);output=output.slice(end+1);try{const event=JSON.parse(line);if(event.phase==='clicked'&&!snapshot)snapshot=this.readFrame(event.at+125,1400).catch(()=>null);}catch{}}
      });
      await run; // A captured image never overrides a native focus/cursor safety failure.
      return capture?await(snapshot||this.readFrame(Date.now(),1400)):null;
    };
    let moved=false;
    this.interacting=true;
    try {
      const before=await this.readFrame(Date.now(),1400);if(!before||before.width!==image.width||before.height!==image.height)return skip('window changed before click');
      if(whisperDialog(await this.recognize(before,item.en,'before.png')))return skip('existing whisper dialog');
      const ready=await this.readFrame(Date.now(),1400);if(!ready||ready.width!==image.width||ready.height!==image.height)return skip('window changed during preflight');
      // Text OCR and dialog checks take time. Follow the exact same pixels to their new row before clicking.
      // Never click the stale y-coordinate, or use item name alone to select another seller's item.
      const relocated=locateFingerprint(cropImage(ready,box),fingerprint);
      if(!relocated)return skip('target row no longer visible or ambiguous');
      line=relocated;link.y=Math.floor((line.top+line.bottom)/2);
      moved=true;const after=await input('click',box.x+link.x,box.y+link.y,true);if(!after)return skip('no fresh tooltip frame');
      const rows=await this.recognize(after,item.en),dialog=whisperDialog(rows);
      if(dialog){await input('click',Math.round(dialog.x+dialog.w/2),Math.round(dialog.y+dialog.h/2));return skip('chat moved; closed newly opened whisper dialog');}
      // Nick + channel must still belong to the clicked row; reject chat scroll races.
      if(signature(after,link.badge.message-4)!==signature(ready,link.badge.message-4)) {
        fs.writeFileSync(path.join(this.dir,'race-ready.png'),PNG.sync.write(ready));
        fs.writeFileSync(path.join(this.dir,'race-after.png'),PNG.sync.write(after));
        fs.writeFileSync(path.join(this.dir,'race.json'),JSON.stringify({message,item:item.en,box,line,link}));
        return skip('nick/channel moved after click');
      }
      // The screenshot is immutable. Close the live tooltip now so new text can be collected while
      // slower option OCR runs on this image. Previously the entire collector waited until OCR ended.
      await input('move',...park);moved=false;
      await this.readFrame(Date.now(),1100);this.interacting=false;
      let panel=findTooltipPanel(rows,item,this.catalog,after);
      if(!panel) panel=await this.recoverTitle(after,rows,item,{x:box.x+link.x,y:box.y+link.y});
      if(!panel||panel.w<120||panel.title.x>box.x+link.x+100){
        fs.writeFileSync(path.join(this.dir,'panel-failure.png'),PNG.sync.write(after));
        fs.writeFileSync(path.join(this.dir,'panel-failure.json'),JSON.stringify({message,item:item.en,box,line,link,rows}));
        return skip('target tooltip title missing');
      }
      let opts=await this.readPanel(after,rows,panel,item);
      if(item.cat==='Equip'&&opts&&opts.ups===undefined&&opts.used!==0) {
        // Clean items have no (+N) suffix. Only retry an unread suffix after checking the slots.
        const header={x:panel.x,y:panel.y,w:panel.w,h:Math.min(panel.h,Math.ceil(panel.title.h+12))};
        const titles=await this.recognize(cropImage(after,header),item.en,'title.png',2);
        let counts=[...new Set(titles.filter(r=>r.confidence>=0.5).map(r=>tooltipTitle(r.text,item.en)?.ups).filter(Number.isInteger))];
        if(!counts.length){const extra=await this.recognizeFallback(cropImage(after,header,false,3));counts=[...new Set(extra.filter(r=>r.confidence>=0.5).map(r=>tooltipTitle(r.text,item.en)?.ups).filter(Number.isInteger))];}
        if(counts.length===1&&counts[0]<=20&&(opts.used===undefined||counts[0]<=opts.used))opts={...opts,ups:counts[0]};
        if(opts.used>0&&opts.ups===undefined)this.lastMissing.push('ups');
      }
      const sample=`sample-${Date.now()}`;
      fs.writeFileSync(path.join(this.dir,`${sample}.png`),PNG.sync.write(after));
      fs.writeFileSync(path.join(this.dir,`${sample}.json`),JSON.stringify({message,item,opts,panel,reading:this.lastReading}));
      for(const old of fs.readdirSync(this.dir).filter(f=>/^sample-.*\.json$/.test(f)).sort().slice(0,-24)) {
        fs.rmSync(path.join(this.dir,old),{force:true});fs.rmSync(path.join(this.dir,old.replace(/\.json$/,'.png')),{force:true});
      }
      if(!opts||(!opts.stats&&!opts.scroll&&opts.slots===undefined))return skip('no trusted numeric options');
      // Keep a bounded local diagnostic sample; no screenshots leave this Mac.
      fs.writeFileSync(path.join(this.dir,'last.json'),JSON.stringify({message,item:item.en,opts}));
      fs.copyFileSync(path.join(this.dir,'ocr.png'),path.join(this.dir,'last-success.png'));
      return opts;
    } catch(e) {if(e.code===6)fs.writeFileSync(path.join(os.homedir(),'.config','gms-hub','mega-options-paused'),'cursor visibility changed\n');if(![4,5].includes(e.code)) console.error('options skipped:',e.message.split('\n')[0]);return skip(`input/OCR: ${e.code||e.message}`);}
    finally {if(moved){await input('move',...park).catch(()=>{});await this.readFrame(Date.now(),1100).catch(()=>null);}this.interacting=false;}
  }
  close(){this.fallback?.then(w=>w.terminate()).catch(()=>{});fs.rmSync(this.dir,{recursive:true,force:true});}
}
