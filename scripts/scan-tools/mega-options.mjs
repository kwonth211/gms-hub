// Conservative tooltip reader. Unreadable/conflicting values are omitted, never guessed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PNG } from 'pngjs';
import Tesseract from 'tesseract.js';
import { findBadge, lineBitmap, glyphs } from '../../assets/mega-reader.js';
const exec = promisify(execFile);
import { findTooltipPanel, parseTooltipLines, agreeOptions, safeItemClickX, whisperDialog, nameKey, tooltipTitle } from '../../assets/mega-tooltip.js';
export { nameKey } from '../../assets/mega-tooltip.js';
export function cropImage(img, b, mask = false, scale = 1) {
  const out = new PNG({ width:b.w*scale, height:b.h*scale });
  for(let y=0;y<b.h;y++) for(let x=0;x<b.w;x++) {
    const i=((b.y+y)*img.width+b.x+x)*4;
    let rgb=[img.data[i],img.data[i+1],img.data[i+2]];
    if(mask) rgb=(Math.min(...rgb)>130 || (rgb[0]>230 && rgb[1]>140 && rgb[2]<120)) ? [0,0,0] : [255,255,255];
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
  async recognize(img,name,file='ocr.png') {const p=path.join(this.dir,file);fs.writeFileSync(p,PNG.sync.write(img));const {stdout}=await exec(this.ocr,[p,name],{timeout:4000,maxBuffer:2e6});return JSON.parse(stdout);}
  async recoverTitle(image, rows, item, point) {
    // Vision can merge a translucent tooltip title with text behind it. A second engine reads a bounded crop;
    // approximate words only choose where to look. findTooltipPanel still requires the exact catalogue title.
    const words=item.en.toLowerCase().split(/\W+/).filter(w=>w.length>2);
    const candidates=rows.filter(r=>!/[\[\]]/.test(r.text)&&r.x>point.x-300&&r.x<point.x+120&&r.y<point.y+70&&
      words.filter(w=>nameKey(r.text).includes(w)).length>=Math.max(1,words.length-1)).slice(0,2);
    if(!candidates.length)return null;
    this.fallback ||= Tesseract.createWorker('eng').then(async w=>{await w.setParameters({tessedit_pageseg_mode:'6'});return w;});
    const worker=await this.fallback;
    for(const r of candidates){
      const x=Math.max(0,Math.floor(r.x-10)),y=Math.max(28,Math.floor(r.y-8));
      const b={x,y,w:Math.min(image.width-x,item.cat==='Equip'?240:420),h:Math.min(image.height-y,600)};
      const {data}=await worker.recognize(PNG.sync.write(cropImage(image,b,false,3)));
      const extra=data.lines.map(l=>({text:l.text.trim(),confidence:l.confidence/100,x:x+l.bbox.x0/3,y:y+l.bbox.y0/3,w:(l.bbox.x1-l.bbox.x0)/3,h:(l.bbox.y1-l.bbox.y0)/3}));
      if(!extra.some(r=>r.confidence>=0.5&&tooltipTitle(r.text,item.en)))continue;
      const panel=findTooltipPanel([...rows,...extra],item,this.catalog,image);
      if(panel)return panel;
    }
    return null;
  }
  async collect({image,box,line,message,item,glyph}) {
    const skip=(reason)=>{this.lastSkip=reason;return null;};this.lastSkip='';
    const paused=()=>fs.existsSync(path.join(os.homedir(),'.config','gms-hub','mega-options-paused'));
    if(paused())return skip('option input paused');
    if(Date.now()-this.last<2500)return skip('cooldown');this.last=Date.now();
    const part=cropImage(image,box),link=itemLink(part,line,glyph);if(!link)return skip('no safe item-link point');
    const signature=(im,edge)=>lineBitmap(cropImage(im,box),line,{x0:0,x1:edge}).sig;
    const original=signature(image,line.right);
    const park=[Math.min(image.width-40,box.x+box.w+35),35];
    const input=async(action,x,y)=>{if(paused())throw Error('option input paused');return exec(this.input,[action,String(x),String(y),String(image.width),String(image.height)],{timeout:2000,maxBuffer:16000});};
    let moved=false;
    try {
      const before=await this.readFrame(Date.now(),1400);if(!before||before.width!==image.width||before.height!==image.height||signature(before,line.right)!==original)return skip('line changed before click');
      if(whisperDialog(await this.recognize(before,item.en,'before.png')))return skip('existing whisper dialog');
      const ready=await this.readFrame(Date.now(),1400);if(!ready||ready.width!==image.width||ready.height!==image.height||signature(ready,line.right)!==original)return skip('line changed during preflight');
      moved=true;await input('click',box.x+link.x,box.y+link.y);
      const after=await this.readFrame(Date.now(),1400);if(!after)return skip('no fresh tooltip frame');
      const rows=await this.recognize(after,item.en),dialog=whisperDialog(rows);
      if(dialog){await input('click',Math.round(dialog.x+dialog.w/2),Math.round(dialog.y+dialog.h/2));return skip('chat moved; closed newly opened whisper dialog');}
      // Nick + channel must still belong to the clicked row; reject chat scroll races.
      if(signature(after,link.badge.message-4)!==signature(before,link.badge.message-4))return skip('nick/channel moved after click');
      let panel=findTooltipPanel(rows,item,this.catalog,after);
      if(!panel||tooltipTitle(panel.title.text,item.en)?.ups===undefined) panel=await this.recoverTitle(after,rows,item,{x:box.x+link.x,y:box.y+link.y})||panel;
      if(!panel||panel.w<120||panel.title.x>box.x+link.x+100)return skip('target tooltip title missing');
      const raw=rows.filter((r)=>r.x>=panel.x&&r.x+r.w<=panel.x+panel.w+3&&r.y>=panel.y&&r.y+r.h<after.height-2);
      const masked=await this.recognize(cropImage(after,panel,true,3),item.en,'mask.png');
      // The full-frame title already proves this crop's identity; masking can erase the colored title itself.
      const opts=agreeOptions(parseTooltipLines([panel.title,...raw],item),parseTooltipLines([panel.title,...masked.filter((r)=>r.y+r.h<panel.h*3-5)],item));
      if(!opts||(!opts.stats&&!opts.scroll&&opts.slots===undefined))return skip('no trusted numeric options');
      // Keep a bounded local diagnostic sample; no screenshots leave this Mac.
      fs.writeFileSync(path.join(this.dir,'last.json'),JSON.stringify({message,item:item.en,opts}));
      fs.copyFileSync(path.join(this.dir,'ocr.png'),path.join(this.dir,'last-success.png'));
      return opts;
    } catch(e) {if(e.code===6)fs.writeFileSync(path.join(os.homedir(),'.config','gms-hub','mega-options-paused'),'cursor visibility changed\n');if(![4,5].includes(e.code)) console.error('options skipped:',e.message.split('\n')[0]);return skip(`input/OCR: ${e.code||e.message}`);}
    finally {if(moved){await input('move',...park).catch(()=>{});await this.readFrame(Date.now(),1100).catch(()=>null);}}
  }
  close(){this.fallback?.then(w=>w.terminate()).catch(()=>{});fs.rmSync(this.dir,{recursive:true,force:true});}
}
