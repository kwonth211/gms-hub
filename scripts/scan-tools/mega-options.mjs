// Conservative tooltip reader. Unreadable/conflicting values are omitted, never guessed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PNG } from 'pngjs';
import { findBadge, lineBitmap, glyphs } from '../../assets/mega-reader.js';
const exec = promisify(execFile);
import { nameKey, findTooltipPanel, parseTooltipLines, agreeOptions } from '../../assets/mega-tooltip.js';
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
export function itemLink(img,line,glyph=null,startsWithLink=false) {
  const badge=findBadge(img,line);if(!badge)return null;
  if(glyph) {
    const gs=glyphs(img,line,badge.message,img.width,glyph.wTop);
    const start=gs.findIndex((g)=>(glyph.read.charOf(g.key)||'').includes('['));
    const end=gs.findIndex((g,i)=>i>=start&&(glyph.read.charOf(g.key)||'').includes(']'));
    if(start>=0&&end>=start&&nameKey(glyph.read(gs.slice(start,end+1)))===nameKey(glyph.expected))return {x:gs[start].x+12,y:Math.floor((line.top+line.bottom)/2),badge};
  }
  // Cyan links use dark text, and the glyph font can confuse I/l. The parsed row and the tooltip title
  // independently establish the name; its first linked character still has a stable position after the badge.
  if(startsWithLink)return {x:badge.message+12,y:Math.floor((line.top+line.bottom)/2),badge};
  const columns=[];
  for(let x=badge.message;x<Math.min(line.right??img.width,img.width);x++) {
    let n=0;for(let y=line.top;y<=line.bottom;y++){const i=(y*img.width+x)*4;const [r,g,b]=img.data.subarray(i,i+3);if(r>240&&g>225&&b>100&&b<200)n++;}
    if(n) columns.push(x);
  }
  if(columns.length<10)return null;
  // First contiguous highlighted item only; the caller rejects multiple linked items.
  const group=[columns[0]];for(const x of columns.slice(1)){if(x-group.at(-1)>10)break;group.push(x);}
  if(group.at(-1)-group[0]<20)return null;
  return {x:group[0]+Math.min(12,Math.floor((group.at(-1)-group[0])/2)),y:Math.floor((line.top+line.bottom)/2),badge};
}

export class OptionReader {
  constructor({shot,input,ocr,catalog,readFrame}) {Object.assign(this,{shot,input,ocr,catalog,readFrame});this.last=0;this.dir=fs.mkdtempSync(path.join(os.tmpdir(),'gms-mega-options-'));}
  async recognize(img,name,file='ocr.png') {const p=path.join(this.dir,file);fs.writeFileSync(p,PNG.sync.write(img));const {stdout}=await exec(this.ocr,[p,name],{timeout:4000,maxBuffer:2e6});return JSON.parse(stdout);}
  async collect({image,box,line,message,item,glyph}) {
    const skip=(reason)=>{this.lastSkip=reason;return null;};this.lastSkip='';
    if(Date.now()-this.last<2500)return skip('cooldown');this.last=Date.now();
    const part=cropImage(image,box),link=itemLink(part,line,glyph,message.text.trimStart().startsWith('['));if(!link)return skip('no highlighted link');
    const signature=(im,edge)=>lineBitmap(cropImage(im,box),line,{x0:0,x1:edge}).sig;
    const original=signature(image,line.right);
    const park=[Math.min(image.width-40,box.x+box.w+35),35];
    const input=async(action,x,y)=>exec(this.input,[action,String(x),String(y),String(image.width),String(image.height)],{timeout:2000,maxBuffer:16000});
    let moved=false;
    try {
      const before=await this.readFrame(Date.now()-500,1400);if(!before||before.width!==image.width||before.height!==image.height||signature(before,line.right)!==original)return skip('line changed before click');
      moved=true;await input('click',box.x+link.x,box.y+link.y);
      const after=await this.readFrame(Date.now(),1400);if(!after)return skip('no fresh tooltip frame');
      // Nick + channel must still belong to the clicked row; reject chat scroll races.
      if(signature(after,link.badge.message-4)!==signature(before,link.badge.message-4))return skip('nick/channel moved after click');
      const rows=await this.recognize(after,item.en),panel=findTooltipPanel(rows,item,this.catalog,after);if(!panel||panel.w<120||panel.title.x>box.x+link.x+100)return skip('target tooltip title missing');
      const raw=rows.filter((r)=>r.x>=panel.x&&r.x+r.w<=panel.x+panel.w+3&&r.y>=panel.y&&r.y+r.h<after.height-2);
      const masked=await this.recognize(cropImage(after,panel,true,3),item.en,'mask.png');
      // The full-frame title already proves this crop's identity; masking can erase the colored title itself.
      const opts=agreeOptions(parseTooltipLines(raw,item),parseTooltipLines([panel.title,...masked.filter((r)=>r.y+r.h<panel.h*3-5)],item));
      if(!opts||(!opts.stats&&!opts.scroll&&opts.slots===undefined))return skip('no trusted numeric options');
      // Keep a bounded local diagnostic sample; no screenshots leave this Mac.
      fs.writeFileSync(path.join(this.dir,'last.json'),JSON.stringify({message,item:item.en,opts}));
      return opts;
    } catch(e) {if(![4,5].includes(e.code)) console.error('options skipped:',e.message.split('\n')[0]);return skip(`input/OCR: ${e.code||e.message}`);}
    finally {if(moved){await input('move',...park).catch(()=>{});await this.readFrame(Date.now(),1100).catch(()=>null);}}
  }
  close(){fs.rmSync(this.dir,{recursive:true,force:true});}
}
