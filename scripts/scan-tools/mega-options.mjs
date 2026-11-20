// Conservative tooltip reader. Unreadable/conflicting values are omitted, never guessed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PNG } from 'pngjs';
import Tesseract from 'tesseract.js';
import { findBadge, lineBitmap, lineFingerprint, locateFingerprint, glyphs, itemGlyphBounds } from '../../assets/mega-reader.js';
const exec = promisify(execFile);
import { colorTooltipBoxes, selectTooltipBox, agreeTooltipNumber, agreeLabeledNumber, tooltipBody, tooltipField, tooltipStatRows, missingTooltipFields, subtractTooltipBackground, emptyUpgradeSuffix, parseTooltipLines, agreeOptions, safeItemClickX, whisperDialog, nameKey, tooltipTitle } from '../../assets/mega-tooltip.js';
export { nameKey } from '../../assets/mega-tooltip.js';
export function cropImage(img, b, mask = false, scale = 1) {
  const out = new PNG({ width:b.w*scale, height:b.h*scale });
  for(let y=0;y<b.h;y++) for(let x=0;x<b.w;x++) {
    const i=((b.y+y)*img.width+b.x+x)*4;
    let rgb=[img.data[i],img.data[i+1],img.data[i+2]];
    // Below-base rolls have a red negative delta. Dropping it turns (42 -1) into
    // an invalid expression and discards an otherwise readable total of 41.
    if(mask) rgb=(Math.min(...rgb)>(typeof mask==='number'?mask:130) || (rgb[0]>230 && rgb[1]>140 && rgb[2]<120) || (rgb[0]>180&&rgb[0]>rgb[1]*1.7&&rgb[0]>rgb[2]*1.7)) ? [0,0,0] : [255,255,255];
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
    const bounds=itemGlyphBounds(gs,glyph.read,glyph.expected);
    if(bounds)return point(bounds.left,bounds.right);
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
  async recognizeFallback(img,psm='6') {
    this.fallback ||= Tesseract.createWorker('eng').then(async w=>{await w.setParameters({tessedit_pageseg_mode:'6'});return w;});
    const worker=await this.fallback;await worker.setParameters({tessedit_pageseg_mode:psm});
    const {data}=await worker.recognize(PNG.sync.write(img));
    return data.lines.map(l=>({text:l.text.trim(),confidence:l.confidence/100,x:l.bbox.x0,y:l.bbox.y0,w:l.bbox.x1-l.bbox.x0,h:l.bbox.y1-l.bbox.y0}));
  }
  async linkFromOCR(img,line,item) {
    const badge=findBadge(img,line);if(!badge)return null;
    const box={x:badge.message,y:Math.max(0,line.top-1),w:Math.min(line.right-badge.message,item.en.length*12+40),h:16};
    if(box.w<10||box.y+box.h>img.height)return null;
    for(const scale of [2,3]) {
      const rows=await this.recognize(cropImage(img,box),item.en,'link.png',scale).catch(()=>[]);
      const matches=rows.filter(r=>r.confidence>=.5&&r.itemInBrackets&&r.itemBounds);
      if(matches.length!==1)continue;
      const bounds=matches[0].itemBounds,left=box.x+bounds.x/scale,right=left+bounds.w/scale;
      const x=safeItemClickX(left,right,badge.message);
      if(x!==null&&right<line.right)return {x,y:Math.floor((line.top+line.bottom)/2),badge};
    }
    return null;
  }
  async readColorPanel(image,before,item,point,boxes=colorTooltipBoxes(image,before,point)) {
    // The clicked link's panel starts beside the pointer. The equipped panel to
    // its right must never be tried just because it has the same item name.
    const box=selectTooltipBox(boxes,point,image.width);
    this.lastBoxes=boxes;
    if(!box)return null;
    const imageBox={x:box.x,y:box.y,w:box.w,h:box.h};
    const cropped=cropImage(image,imageBox);
    fs.writeFileSync(path.join(this.dir,'tooltip-only.png'),PNG.sync.write(cropped));
    const place=(r,scale)=>({...r,x:box.x+r.x/scale,y:box.y+r.y/scale,w:r.w/scale,h:r.h/scale,
      ...(r.valueBounds?{valueBounds:{x:box.x+r.valueBounds.x/scale,y:box.y+r.valueBounds.y/scale,w:r.valueBounds.w/scale,h:r.valueBounds.h/scale}}:{})});
    let rows=(await this.recognize(cropped,item.en,'tooltip-only.png',2)).map(r=>place(r,2));
    const title=()=>rows.find(r=>r.confidence>=.5&&r.y<box.y+65&&tooltipTitle(r.text,item.en));
    if(!title()) {
      const header={...imageBox,h:Math.min(72,box.h)},foreground=subtractTooltipBackground(image,before,header);
      const pixels=foreground?cropImage(foreground,{x:0,y:0,w:header.w,h:header.h},false,3):cropImage(image,header,false,3);
      rows.push(...(await this.recognize(pixels,item.en,'header.png')).map(r=>place(r,3)));
      if(!title())rows.push(...(await this.recognizeFallback(pixels)).map(r=>place(r,3)));
    }
    const found=title();
    return found?{panel:{...imageBox,title:found},rows}:null;
  }
  async readPanel(image,rows,panel,item,background=null) {
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
    const foreground=subtractTooltipBackground(image,background,body);
    const separated=foreground?await this.recognize(cropImage(foreground,{x:0,y:0,w:body.w,h:body.h},false,3),item.en,'separated.png'):[];
    if(separated.length)readings.push(parseTooltipLines([panel.title,...separated],item));
    let opts=agreeOptions(...readings);
    this.lastReading={body,raw,enlarged,masked,separated,backgroundModel:foreground?.models,readings};
    const observed=[...raw,...enlarged,...masked,...separated];
    const place=(r,scale)=>({...r,x:body.x+r.x/scale,y:body.y+r.y/scale,w:r.w/scale,h:r.h/scale,...(r.valueBounds?{valueBounds:{x:body.x+r.valueBounds.x/scale,y:body.y+r.valueBounds.y/scale,w:r.valueBounds.w/scale,h:r.valueBounds.h/scale}}:{})});
    const placed=[...raw,...enlarged.map(r=>place(r,2)),...[...masked,...separated].map(r=>place(r,3))].filter(r=>r.x>=body.x-4&&r.x<body.x+35);
    const statRows=item.cat==='Equip'?tooltipStatRows(placed):[];
    const statCount=value=>Object.keys(value?.stats||{}).length+Number(value?.attackSpeed!==undefined)+Number(value?.knockback!==undefined);
    // A completely missed OCR line never enters missingTooltipFields. Count the
    // actual font rows between Type and Remaining Enhancements to detect that loss.
    if(statRows.length>statCount(opts))for(const y of statRows) {
      const known=placed.find(r=>Math.abs(r.y-y)<5&&tooltipField(r.text));
      if(known&&opts?.stats?.[tooltipField(known.text)]!==undefined)continue;
      const box={x:body.x,y:Math.max(body.y,y-3),w:body.w,h:Math.min(22,image.height-Math.max(body.y,y-3))};
      const input=foreground&&box.y+box.h<=body.y+body.h?cropImage(foreground,{x:0,y:box.y-body.y,w:box.w,h:box.h},false,3):cropImage(image,box,170,3);
      const isolated=await this.recognize(input,item.en,'unread-row.png');
      readings.push(parseTooltipLines([panel.title,...isolated],item));
      opts=agreeOptions(...readings);
    }
    let missing=missingTooltipFields(observed,opts,item);
    if(item.cat==='Equip'&&missing.length) {
      // Retry only unread lines, on the saved image, rather than clicking the game again for every OCR pass.
      for(const key of missing.slice(0,6)) {
        const candidate=placed.find(r=>tooltipField(r.text)===key);
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
        if(missingTooltipFields([candidate],agreeOptions(...readings),{cat:item.cat}).includes(key)) {
          const tightY=Math.max(body.y,Math.floor(candidate.y-4));
          const tight={x:body.x,y:tightY,w:Math.min(body.w,Math.max(75,Math.ceil(candidate.x+candidate.w-body.x+12))),h:Math.min(image.height-tightY,Math.ceil(candidate.h+10))};
          const contrast=await this.recognize(cropImage(image,tight,170,3),item.en,'line-contrast.png');
          readings.push(parseTooltipLines([panel.title,...contrast],item));
        }
        if(missingTooltipFields([candidate],agreeOptions(...readings),{cat:item.cat}).includes(key)) {
          const local=isolated.find(r=>tooltipField(r.text)===key&&r.valueBounds);
          const field=local||placed.find(r=>tooltipField(r.text)===key&&r.valueBounds);
          if(field) {
            const q=field.valueBounds,scale=local?3:1,origin=local?lineBox:{x:0,y:0};
            const x=Math.max(body.x,Math.floor(origin.x+q.x/scale)-2),y=Math.max(body.y,Math.floor(origin.y+q.y/scale)-2);
            const numericBox={x,y,w:Math.min(Math.ceil(q.w/scale)+4,body.x+body.w-x),h:Math.min(Math.ceil(q.h/scale)+4,18,body.y+body.h-y)};
            if(numericBox.w>5&&numericBox.w<=150&&numericBox.h>5&&numericBox.h<=26) {
              const pixels=foreground?cropImage(foreground,{x:x-body.x,y:y-body.y,w:numericBox.w,h:numericBox.h},false,3):cropImage(image,numericBox,true,3);
              const primary=await this.recognize(pixels,item.en,'number.png'),secondary=await this.recognizeFallback(pixels,'7');
              // Vision's substring bounds occasionally include the label. Treat
              // that as a normal labelled row, rather than losing a clear value.
              readings.push(parseTooltipLines([panel.title,...primary.filter(r=>tooltipField(r.text)===key)],item));
              let expression=agreeTooltipNumber(primary,secondary)||agreeLabeledNumber(field,secondary,primary);
              if(!expression){const original=cropImage(image,numericBox,false,3),a=await this.recognize(original,item.en,'number-original.png'),b=await this.recognizeFallback(original,'7');readings.push(parseTooltipLines([panel.title,...a.filter(r=>tooltipField(r.text)===key)],item));expression=agreeTooltipNumber(a,b)||agreeLabeledNumber(field,b,a);(this.lastReading.numericChecks||=[]).push({key,box:numericBox,primary:a,secondary:b,expression,original:true});}
              (this.lastReading.numericChecks||=[]).push({key,box:numericBox,primary,secondary,expression});
              if(expression)readings.push(parseTooltipLines([panel.title,`${field.text.split(':')[0]}: ${expression}`],item));
            }
          }
        }
      }
      opts=agreeOptions(...readings);
      missing=missingTooltipFields(observed,opts,item);
    }
    // The shop reader retries only when the primary read is incomplete. Do not run a slower
    // fallback over a complete, consistent crop and let its weaker digit guess discard that read.
    if(item.cat==='Equip'&&(!opts?.stats||missing.length)) {
      const fallback=await this.recognizeFallback(foreground?cropImage(foreground,{x:0,y:0,w:body.w,h:body.h},false,3):bodyImage);
      this.lastReading.fallback=fallback;
      opts=agreeOptions(...readings,parseTooltipLines([panel.title,...fallback.filter(r=>r.y+r.h<body.h*3-5)],item));
    }
    this.lastMissing=missingTooltipFields(observed,opts,item);
    this.lastStatCount=statRows.length;
    if(statRows.length>statCount(opts))this.lastMissing.push('unread_rows');
    return opts;
  }
  async collect({image,box,line,message,item,glyph}) {
    const skip=(reason)=>{this.lastSkip=reason;return null;};this.lastSkip='';
    const paused=()=>fs.existsSync(path.join(os.homedir(),'.config','gms-hub','mega-options-paused'));
    if(paused())return skip('option input paused');
    if(Date.now()-this.last<500)return skip('cooldown');this.last=Date.now();
    const part=cropImage(image,box);let link=itemLink(part,line,glyph);
    if(!link){this.interacting=true;try{link=await this.linkFromOCR(part,line,item);}finally{this.interacting=false;}}
    if(!link){
      fs.writeFileSync(path.join(this.dir,'link-failure.png'),PNG.sync.write(image));
      fs.writeFileSync(path.join(this.dir,'link-failure.json'),JSON.stringify({box,line,message,item:item.en,wTop:glyph?.wTop}));
      return skip('no safe item-link point');
    }
    const signature=(im,edge)=>lineBitmap(cropImage(im,box),line,{x0:0,x1:edge}).sig;
    const fingerprint=lineFingerprint(part,line);
    const park=[Math.min(image.width-40,box.x+box.w+35),35];
    const inputAudit=[];
    const input=async(action,x,y,capture=false,cleanup=false)=>{
      if(paused()&&!cleanup)throw Error('option input paused');
      const run=exec(this.input,[action,String(x),String(y),String(image.width),String(image.height)],{timeout:2000,maxBuffer:16000});
      let snapshot=null,output='';
      if(capture)run.child.stdout.on('data',chunk=>{
        output+=chunk;let end;
        // Give the game one 8fps frame to draw the panel. A PNG whose write finishes
        // just after mouse-up may still contain the frame captured before the click.
        while((end=output.indexOf('\n'))>=0){const line=output.slice(0,end);output=output.slice(end+1);try{const event=JSON.parse(line);if(event.phase==='clicked'&&!snapshot)snapshot=this.readFrame(event.at+125,1400).catch(()=>null);}catch{}}
      });
      const result=await run.catch(e=>{fs.writeFileSync(path.join(this.dir,'input-failure.json'),JSON.stringify({message,action,x,y,code:e.code,events:e.stdout}));throw e;}); // A capture never overrides a focus/cursor failure.
      const events=result.stdout.trim().split('\n').flatMap(s=>{try{return [JSON.parse(s)];}catch{return [];}});
      inputAudit.push({action,point:{x,y},before:events.find(e=>e.phase==='before')?.state,after:events.filter(e=>e.phase==='after').map(e=>e.state),restores:events.filter(e=>e.phase==='restore').map(e=>e.state)});
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
      if(!relocated){
        fs.writeFileSync(path.join(this.dir,'target-before.png'),PNG.sync.write(image));
        fs.writeFileSync(path.join(this.dir,'target-ready.png'),PNG.sync.write(ready));
        fs.writeFileSync(path.join(this.dir,'target-failure.json'),JSON.stringify({message,box,line,fingerprint}));
        return skip('target row no longer visible or ambiguous');
      }
      line=relocated;link.y=Math.floor((line.top+line.bottom)/2);
      moved=true;const after=await input('click',box.x+link.x,box.y+link.y,true);if(!after)return skip('no fresh tooltip frame');
      const point={x:box.x+link.x,y:box.y+link.y};
      const boxes=colorTooltipBoxes(after,ready,point);
      if(!boxes.length) {
        const dialog=whisperDialog(await this.recognize(after,item.en));
        if(dialog){await input('click',Math.round(dialog.x+dialog.w/2),Math.round(dialog.y+dialog.h/2));return skip('chat moved; closed newly opened whisper dialog');}
        return skip('tooltip colour box not found');
      }
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
      const isolated=await this.readColorPanel(after,ready,item,point,boxes),panel=isolated?.panel,rows=isolated?.rows||[];
      if(!panel||panel.w<120||panel.title.x>box.x+link.x+100){
        fs.writeFileSync(path.join(this.dir,'panel-failure.png'),PNG.sync.write(after));
        fs.writeFileSync(path.join(this.dir,'panel-before.png'),PNG.sync.write(ready));
        fs.writeFileSync(path.join(this.dir,'panel-failure.json'),JSON.stringify({message,item:item.en,box,line,link,boxes,rows}));
        return skip('target tooltip title missing');
      }
      let opts=await this.readPanel(after,rows,panel,item,ready);
      if(item.cat==='Equip'&&opts&&opts.ups===undefined&&opts.used!==0) {
        // Clean items have no (+N) suffix. Only retry an unread suffix after checking the slots.
        const header={x:panel.x,y:panel.y,w:Math.min(panel.w,235),h:Math.min(panel.h,Math.ceil(panel.title.h+12))};
        const titles=await this.recognize(cropImage(after,header),item.en,'title.png',2);
        let counts=[...new Set(titles.filter(r=>r.confidence>=0.5).map(r=>tooltipTitle(r.text,item.en)?.ups).filter(Number.isInteger))];
        if(!counts.length){const extra=await this.recognizeFallback(cropImage(after,header,false,3));counts=[...new Set(extra.filter(r=>r.confidence>=0.5).map(r=>tooltipTitle(r.text,item.en)?.ups).filter(Number.isInteger))];}
        if(!counts.length) {
          const foreground=subtractTooltipBackground(after,ready,header);
          if(foreground) {
            const clean=cropImage(foreground,{x:0,y:0,w:header.w,h:header.h},false,3);
            const primary=await this.recognize(clean,item.en,'clean-title.png'),secondary=await this.recognizeFallback(clean);
            counts=[...new Set([...primary,...secondary].filter(r=>r.confidence>=.5).map(r=>tooltipTitle(r.text,item.en)?.ups).filter(Number.isInteger))];
            const plain=r=>r.confidence>=.5&&tooltipTitle(r.text,item.en)?.ups===undefined&&tooltipTitle(r.text,item.en)!==null;
            // Zero successes after a failed scroll has no (+N) suffix. Require both
            // OCR engines to read the complete plain title and verify its right side is empty.
            if(!counts.length&&secondary.some(plain)&&primary.some(r=>plain(r)&&emptyUpgradeSuffix(clean,r)))counts=[0];
          }
        }
        if(counts.length===1&&counts[0]<=20&&(opts.used===undefined||counts[0]<=opts.used))opts={...opts,ups:counts[0]};
        if(opts.ups===undefined)this.lastMissing.push('ups');
      }
      const sample=`sample-${Date.now()}`;
      fs.writeFileSync(path.join(this.dir,`${sample}.png`),PNG.sync.write(after));
      fs.writeFileSync(path.join(this.dir,`${sample}-before.png`),PNG.sync.write(ready));
      fs.copyFileSync(path.join(this.dir,'tooltip-only.png'),path.join(this.dir,`${sample}-tooltip.png`));
      fs.writeFileSync(path.join(this.dir,`${sample}.json`),JSON.stringify({message,item,opts,panel,reading:this.lastReading,inputAudit,frame:{width:image.width,height:image.height,box}}));
      for(const old of fs.readdirSync(this.dir).filter(f=>/^sample-.*\.json$/.test(f)).sort().slice(0,-24)) {
        fs.rmSync(path.join(this.dir,old),{force:true});fs.rmSync(path.join(this.dir,old.replace(/\.json$/,'.png')),{force:true});fs.rmSync(path.join(this.dir,old.replace(/\.json$/,'-before.png')),{force:true});fs.rmSync(path.join(this.dir,old.replace(/\.json$/,'-tooltip.png')),{force:true});
      }
      if(!opts||(!opts.stats&&!opts.scroll&&opts.slots===undefined))return skip('no trusted numeric options');
      // Keep a bounded local diagnostic sample; no screenshots leave this Mac.
      fs.writeFileSync(path.join(this.dir,'last.json'),JSON.stringify({message,item:item.en,opts}));
      fs.copyFileSync(path.join(this.dir,'tooltip-only.png'),path.join(this.dir,'last-success.png'));
      return opts;
    } catch(e) {if(e.code===6)fs.writeFileSync(path.join(os.homedir(),'.config','gms-hub','mega-options-paused'),'cursor visibility changed\n');if(![4,5].includes(e.code)) console.error('options skipped:',e.message.split('\n')[0]);return skip(`input/OCR: ${e.code||e.message}`);}
    finally {if(moved){await input('move',...park,false,true).catch(()=>{});await this.readFrame(Date.now(),1100).catch(()=>null);}this.interacting=false;}
  }
  close(){this.fallback?.then(w=>w.terminate()).catch(()=>{});fs.rmSync(this.dir,{recursive:true,force:true});}
}
