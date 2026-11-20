// Pure tooltip parsing; only validated fields are returned.
const LABELS = { 'weapon attack': 'PAD', 'magic attack': 'MAD', str: 'STR', dex: 'DEX', int: 'INT', luk: 'LUK', accuracy: 'ACC', avoidability: 'EVA', evasion: 'EVA', 'max hp': 'MHP', 'max mp': 'MMP', 'weapon defense': 'PDD', 'magic defense': 'MDD', speed: 'Speed', jump: 'Jump', 'critical rate': 'CRT', 'critical damage': 'CRD' };
export const nameKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
// A rare stat label can lower Vision's confidence for an otherwise clear sum.
// Recover only an isolated numeric expression independently agreed by both OCR
// engines, with a valid total = base +/- roll; never complete digits by guessing.
const arithmeticValue=r=>{
    const text=r.text.replace(/\s+/g,'').replace(/^\+/,'');
    const m=/^(-?(?:0|[1-9]\d{0,3}))\((0|[1-9]\d{0,3})([+-])(0|[1-9]\d{0,3})\)$/.exec(text);
    return m&&Number(m[1])===Number(m[2])+(m[3]==='-'?-1:1)*Number(m[4])?text:null;
};
export function agreeArithmetic(primary,secondary) {
  const a=primary.filter(r=>r.confidence>=.3).map(arithmeticValue).filter(Boolean),b=secondary.filter(r=>r.confidence>=.6).map(arithmeticValue).filter(Boolean);
  return a.length===1&&b.length===1&&a[0]===b[0]?a[0]:null;
}
export function agreeTooltipNumber(primary,secondary) {
  const arithmetic=agreeArithmetic(primary,secondary);if(arithmetic)return arithmetic;
  const value=r=>/^[+-]?(?:0|[1-9]\d{0,3})$/.test(r.text.trim())?String(Number(r.text.trim())):null;
  const a=primary.filter(r=>r.confidence>=.5).map(value).filter(v=>v!==null),b=secondary.filter(r=>r.confidence>=.6).map(value).filter(v=>v!==null);
  return a.length===1&&b.length===1&&a[0]===b[0]?a[0]:null;
}
export function agreeLabeledNumber(field,secondary,primary=[]) {
  if(!field||field.confidence<.3||!tooltipField(field.text))return null;
  const value=field.text.split(':').slice(1).join(':').trim();
  // A valid full sum, read identically in both the labelled row and numeric
  // crop by Vision and independently by Tesseract, supplies three checks.
  const verified=arithmeticValue({text:value}),a=primary.filter(r=>r.confidence>=.3).map(arithmeticValue).filter(Boolean),b=secondary.filter(r=>r.confidence>=.4).map(arithmeticValue).filter(Boolean);
  if(verified&&a.length===1&&b.length===1&&a[0]===verified&&b[0]===verified)return verified;
  if(!/^[+-]?(?:0|[1-9]\d{0,3})$/.test(value))return null;
  // Vision often misses a crop containing just '+5'. Its full labelled row
  // still supplies an independent reading; require a strong numeric-only read.
  const matches=secondary.filter(r=>r.confidence>=.9&&/^[+-]?(?:0|[1-9]\d{0,3})$/.test(r.text.trim()));
  return matches.length===1&&Number(matches[0].text)===Number(value)?String(Number(value)):null;
}
// Tooltip blue is translucent: subtract the pre-click background contribution
// before thresholding its colour. Connected boxes keep the equipped comparison
// panel separate instead of treating every nearby item name as another panel.
export function colorTooltipBoxes(image,before,point,relaxed=false) {
  if(!before||image.width!==before.width||image.height!==before.height)return [];
  const {width,height}=image,left=Math.max(0,Math.floor(Math.min(point.x-40,width-600))),right=Math.min(width,Math.ceil(point.x+550)),top=28;
  const mask=new Uint8Array(width*height),changed=new Uint8Array(width*height);
  for(let y=top;y<height;y++)for(let x=left;x<right;x++) {
    const i=(y*width+x)*4,r=image.data[i]-.25*before.data[i],g=image.data[i+1]-.25*before.data[i+1],b=image.data[i+2]-.25*before.data[i+2];
    const change=Math.abs(image.data[i]-before.data[i])+Math.abs(image.data[i+1]-before.data[i+1])+Math.abs(image.data[i+2]-before.data[i+2]);
    const residual=r>-12&&r<45&&g>-12&&g<48&&b>28&&b<95&&b-r>20&&b-g>18;
    const blue=image.data[i]<150&&image.data[i+1]<150&&image.data[i+2]<180&&image.data[i+2]-image.data[i]>20&&image.data[i+2]-image.data[i+1]>18;
    if(relaxed?(residual||blue):(residual&&change>20)){mask[y*width+x]=1;changed[y*width+x]=Number(change>20);}
  }
  const boxes=[],queue=new Int32Array(width*height);
  for(let y=top;y<height;y++)for(let x=left;x<right;x++) {
    const start=y*width+x;if(!mask[start])continue;
    let head=0,tail=1,minX=x,maxX=x,minY=y,maxY=y,changeCount=0;queue[0]=start;mask[start]=0;
    while(head<tail) {
      const p=queue[head++],px=p%width,py=Math.floor(p/width);
      changeCount+=changed[p];
      minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);
      for(const n of [px>left?p-1:-1,px+1<right?p+1:-1,py>top?p-width:-1,py+1<height?p+width:-1])if(n>=0&&mask[n]){mask[n]=0;queue[tail++]=n;}
    }
    let w=maxX-minX+1,h=maxY-minY+1,count=tail;
    // When the previous tooltip was still visible, its unchanged overlap also
    // carries the blue colour. Remove thin HUD protrusions from that component.
    if(relaxed&&h>=90&&w>170) {
      const columns=new Uint16Array(width);
      for(let k=0;k<tail;k++)columns[queue[k]%width]++;
      const groups=[];let start=-1;
      for(let px=minX;px<=maxX+1;px++) {
        if(px<=maxX&&columns[px]>=h*.4){if(start<0)start=px;}
        else if(start>=0){if(px-start>=170&&px-start<=480)groups.push([start,px-1]);start=-1;}
      }
      if(!groups.length)continue;
      const group=groups.sort((a,b)=>Math.abs(a[0]-point.x-12)-Math.abs(b[0]-point.x-12))[0];
      minX=group[0];maxX=group[1];w=maxX-minX+1;
      const rows=new Uint16Array(height);
      for(let k=0;k<tail;k++){const px=queue[k]%width;if(px>=minX&&px<=maxX)rows[Math.floor(queue[k]/width)]++;}
      while(minY<maxY&&rows[minY]<w*.4)minY++;
      while(maxY>minY&&rows[maxY]<w*.4)maxY--;
      h=maxY-minY+1;
      count=0;changeCount=0;
      for(let k=0;k<tail;k++){const p=queue[k],px=p%width,py=Math.floor(p/width);if(px>=minX&&px<=maxX&&py>=minY&&py<=maxY){count++;changeCount+=changed[p];}}
    }
    if(w>=170&&w<=480&&h>=90&&count/(w*h)>.35&&changeCount/count>.1) {
      const bx=Math.max(0,minX-2),by=Math.max(top,minY-2);
      boxes.push({x:bx,y:by,w:Math.min(width-bx,w+4),h:Math.min(height-by,h+4),coverage:count/(w*h)});
    }
  }
  return boxes.length||relaxed?boxes.sort((a,b)=>a.x-b.x):colorTooltipBoxes(image,before,point,true);
}
export function selectTooltipBox(boxes,point,width) {
  return boxes.filter(b=>b.x>=Math.min(point.x-40,width-480)&&b.x<=point.x+80&&b.y<point.y+60)
    .sort((a,b)=>Math.abs(a.x-point.x-12)-Math.abs(b.x-point.x-12))[0]||null;
}
// Bounds come from this row's highlighted link, after its channel/whisper badge.
// A fixed 180px nickname fence excluded short links such as Sai and Work Gloves.
export function safeItemClickX(left,right,messageLeft) {
  if(![left,right,messageLeft].every(Number.isFinite)||left<messageLeft||right-left<10)return null;
  return Math.floor(right-5);
}
export function whisperDialog(rows) {
  const prompt=rows.find((r)=>r.confidence>=0.5&&/Please enter the person you want to/i.test(r.text));
  return prompt&&rows.find((r)=>r.confidence>=0.5&&/^CANCEL$/i.test(r.text.trim())&&r.y>prompt.y&&r.y<prompt.y+160&&Math.abs(r.x-prompt.x)<350);
}
const clean = (s) => s.replace(/^[|«•·*\s]+/, '').replace(/^[+-](?!\s*\d)\s*/, '').replace(/^[^a-z0-9]*([TIl]ype\s*:)/i,'$1').replace(/\b(?:aftack|altack|atack|ahack|attacke)\b/gi, 'Attack').replace(/\b(?:Wagic|Manic)\s+(Attack|Def(?:ense|[.])?)/gi,'Magic $1').replace(/Tуpe/g,'Type').replace(/\bMax\s*w\s*P\s*:/gi,'MaxMP:').replace(/\bCrit\.\s*(Rate|Damage)\b/gi,'Critical $1').replace(/^(?:LUI|LUE|LUIK)\s*:/i,'LUK:').replace(/^(Remaining Enhancements)\.\s*(?=\d)/i,'$1: ').trim();
export function tooltipField(text) {
  const label=/^([A-Za-z .]+):/.exec(clean(text))?.[1]?.trim().toLowerCase().replace(/\./g,'');
  return label==='remaining enhancements'?'slots':LABELS[label]||{'weapon def':'PDD','magic def':'MDD','weapon det':'PDD','magic det':'MDD',maxhp:'MHP',maxmp:'MMP'}[label]||null;
}
export function missingTooltipFields(rows,opts,item) {
  const expected=new Set(rows.map(r=>tooltipField(typeof r==='string'?r:r.text)).filter(Boolean));
  if(item.cat==='Equip'&&Number.isInteger(item.slots))expected.add('slots');
  return [...expected].filter(key=>key==='slots'?opts?.slots===undefined:opts?.stats?.[key]===undefined);
}
export function tooltipStatRows(rows) {
  const type=rows.find(r=>/^[TIl]ype\s*:/i.test(clean(r.text)));
  const end=type&&rows.find(r=>r.y>type.y&&/^Remaining Enhancements\b/i.test(clean(r.text)));
  if(!end)return [];
  const pitch=16,count=Math.round((end.y-type.y)/pitch)-1;
  return count>0&&count<=16?Array.from({length:count},(_,i)=>Math.round(type.y)+(i+1)*pitch):[];
}
export function tooltipTitle(text, expected) {
  const s = clean(text).replace(/\s*\((?:M|F|Male|Female)\)\s*/gi, ' ');
  if (s.includes('[')||s.includes(']')||s.endsWith(':')) return null; // A chat link is not a tooltip title.
  const match = /\s*[({i]?\s*\+\s*(\d{1,2})\s*[^a-z0-9]*$/i.exec(s);
  const title = match ? s.slice(0, match.index) : s;
  if (nameKey(title) !== nameKey(clean(expected))) return null;
  return { ups: match ? Number(match[1]) : undefined };
}
export function emptyUpgradeSuffix(image,title) {
  const left=Math.ceil(title.x+title.w+4),right=image.width-18;
  if(right-left<24)return false;
  let ink=0;
  for(let y=Math.max(0,Math.floor(title.y)-2);y<Math.min(image.height,Math.ceil(title.y+title.h)+2);y++)for(let x=left;x<right;x++) {
    const i=(y*image.width+x)*4;
    if(Math.min(image.data[i],image.data[i+1],image.data[i+2])<100&&++ink>=9)return false;
  }
  return true;
}
export function findTooltipPanel(observations, item, catalog, image, point=null) {
  const minX=point?Math.min(point.x-30,image.width-(item.cat==='Equip'?540:450)):-Infinity;
  const titles = observations.filter((o) => o.confidence >= 0.5 && o.x>=minX && (!point||o.x<point.x+120) && tooltipTitle(o.text, item.en)).sort((a,b) => a.x-b.x);
  const first = titles[0];
  const title = first && (titles.find(o=>Math.abs(o.x-first.x)<20&&Math.abs(o.y-first.y)<20&&tooltipTitle(o.text,item.en).ups!==undefined)||first);
  if (!title) return null;
  // A shop's item list can show through the translucent tooltip. Only a second
  // equipment panel aligned with this title can truncate its right edge.
  const other = item.cat==='Equip'&&observations.filter((o) => o.x >= title.x+200 && Math.abs(o.y-title.y)<32 && catalog.some((i) => i.cat==='Equip'&&tooltipTitle(o.text, i.en))).sort((a,b)=>a.x-b.x)[0];
  const x = Math.max(0, Math.floor(title.x-8)), y = Math.max(0, Math.floor(title.y-4));
  const right = Math.min(image.width, x+(item.cat==='Equip' ? 270 : 420), other ? other.x-10 : image.width);
  return { x, y, w: Math.floor(right-x), h: Math.min(image.height-y, 600), title };
}
export function tooltipBody(panel,rows,item) {
  if(item.cat!=='Equip')return panel;
  const inside=r=>r.x>=panel.x&&r.x<panel.x+35&&r.y>panel.y&&r.y<panel.y+panel.h;
  const type=rows.find(r=>inside(r)&&/^[TIl]ype\s*:/i.test(clean(r.text)));
  if(!type)return panel;
  const end=rows.find(r=>inside(r)&&r.y>type.y&&/^Remaining Enhancements/i.test(clean(r.text)));
  const y=Math.max(panel.y,Math.floor(type.y-3));
  const bottom=end?Math.min(panel.y+panel.h,Math.ceil(end.y+end.h+4)):panel.y+panel.h;
  // Equipment panels are 235px wide; do not include neighbouring chat to the right.
  return {x:panel.x+6,y,w:Math.min(panel.w-6,226),h:bottom-y};
}
// Remove the translucent panel's underlying chat using its pre-click frame.
// Fit only dark background pixels, robustly; reject a poor fit rather than inventing text.
export function subtractTooltipBackground(image,before,box) {
  if(!before||image.width!==before.width||image.height!==before.height||box.x<0||box.y<0||box.x+box.w>image.width||box.y+box.h>image.height)return null;
  const median=values=>{values.sort((a,b)=>a-b);return values[values.length>>1];};
  const models=[];
  for(let c=0;c<3;c++) {
    const pairs=[];
    for(let y=2;y<box.h-2;y+=3)for(let x=2;x<box.w-2;x+=4) {
      const i=((box.y+y)*image.width+box.x+x)*4;
      if(Math.max(image.data[i],image.data[i+1],image.data[i+2])<170)pairs.push([before.data[i+c],image.data[i+c]]);
    }
    if(pairs.length<30)return null;
    let best=null;
    for(let step=4;step<=24;step++) {
      const alpha=step*.025,residual=pairs.map(([b,a])=>a-alpha*b),offset=median([...residual]);
      const errors=residual.map(v=>Math.abs(v-offset)).sort((a,b)=>a-b),error=errors[errors.length>>1],p80=errors[Math.floor(errors.length*.8)];
      if(error<=4&&p80<=12&&alpha>.1&&alpha<.6&&(!best||error<best.error))best={alpha,offset,error,p80};
    }
    if(!best)return null;
    models.push(best);
  }
  const data=new Uint8ClampedArray(box.w*box.h*4);
  for(let y=0;y<box.h;y++)for(let x=0;x<box.w;x++) {
    const i=((box.y+y)*image.width+box.x+x)*4,j=(y*box.w+x)*4;
    const residual=Math.max(...models.map((m,c)=>image.data[i+c]-m.alpha*before.data[i+c]-m.offset));
    const v=255-Math.max(0,Math.min(255,residual*1.5));
    data[j]=data[j+1]=data[j+2]=v;data[j+3]=255;
  }
  return {width:box.w,height:box.h,data,models};
}
export function parseTooltipLines(lines, item) {
  const texts=lines.filter((r)=>typeof r==='string'||r.confidence>=0.5).map((r)=>clean(typeof r==='string'?r:r.text));
  const titles=texts.map((s)=>tooltipTitle(s,item.en)).filter(Boolean);
  if(!titles.length) return null;
  const upgrades=[...new Set(titles.map(t=>t.ups).filter(Number.isInteger))];
  const ups=upgrades.length===1?upgrades[0]:undefined;
  const stats={}, seen=new Map(); let slots, chance, attackSpeed, knockback;
  const put=(key,value)=>{if(seen.has(key)&&seen.get(key)!==value) seen.set(key,null);else if(!seen.has(key)) seen.set(key,value);};
  for(const s of texts) {
    if(/^REQ\b/i.test(s)) continue;
    const speed=/^Attack Speed:\s*(Very Fast|Fast|Average|Normal|Slow|Very Slow)$/i.exec(s);
    if(speed) attackSpeed=speed[1].toLowerCase();
    const knock=/^Knockback Chance:\s*(\d{1,3})%$/.exec(s);
    if(knock && Number(knock[1])<=100) knockback=Number(knock[1]);
    const m=/^([A-Za-z .]+):\s*\+?(-?\d{1,4})(?:\s*\(\s*(\d+)\s*([+-])\s*(\d+)\s*\))?\s*%?$/.exec(s);
    if(m&&!/^-?0\d/.test(m[2])) {
      const label=m[1].trim().toLowerCase().replace(/\./g,'');
      const key=LABELS[label] || {maxhp:'MHP',maxmp:'MMP','weapon def':'PDD','magic def':'MDD','weapon det':'PDD','magic det':'MDD',weapondef:'PDD',magicdef:'MDD'}[label];const v=Number(m[2]);
      if(key && (m[3]===undefined || Number(m[3])+(m[4]==='-'?-1:1)*Number(m[5])===v) && v>=-99 && v<=(['MHP','MMP'].includes(key)?5000:['PDD','MDD'].includes(key)?999:255)) put(key,v);
      if(/^Remaining Enhancements$/i.test(m[1]) && v>=0 && v<=20) put('slots',v);
    }
  }
  for(const [key,value] of seen) if(value!==null) {if(key==='slots') slots=value;else stats[key]=value;}
  if(item.cat!=='Equip') {
    // Scroll description can wrap between "Weapon" and "Attack +2".
    const desc=texts.slice(1).join(' ').replace(/\b(Weapon|Magic)\s+Def\./gi,'$1 Defense'), rate=/Success rate:\s*(100|60|10)\s*%/i.exec(desc);
    if(!rate) return null;
    chance=Number(rate[1]);const gains={};
    for(const [label,key] of Object.entries(LABELS)) {
      const match=new RegExp(`(?:^|[^a-z])${label.replace(/ /g,'\\s+')}\\s*\\+\\s*(\\d{1,3})(?!\\d)`,'i').exec(desc);
      if(match && !/^0\d/.test(match[1]) && Number(match[1])<=255) gains[key]=Number(match[1]);
    }
    // Scroll gains are fixed, unlike rolled equipment stats. Catalogue values
    // only reject a corrupt OCR reading; they must never supply unread values.
    if(item.inc&&Object.entries(item.inc).some(([key,value])=>gains[key]!==value))return null;
    return Object.keys(gains).length?{scroll:{chance,stats:gains}}:null;
  }
  // A title alone is not useful evidence of options.
  if(!Object.keys(stats).length && slots===undefined) return null;
  const out={};if(Object.keys(stats).length) out.stats=stats;
  if(slots!==undefined) out.slots=slots;
  if(attackSpeed) out.attackSpeed=attackSpeed;
  if(knockback!==undefined) out.knockback=knockback;
  if(ups!==undefined&&ups<=20) out.ups=ups;
  if(Number.isInteger(item.slots)&&slots!==undefined&&item.slots>=slots&&(ups===undefined||ups<=item.slots-slots)) {
    out.used=item.slots-slots;out.clean=out.used===0;
    // A missing OCR suffix is not evidence of zero successes. Only all original slots prove zero.
    if(out.used===0&&upgrades.length===0)out.ups=0;
  } else if(ups>0) out.clean=false;
  return out;
}
export function agreeOptions(...readings) {
  const inputs=readings.filter(Boolean);if(!inputs.length)return null;
  const out={};
  for(const key of ['slots','ups','used','clean','attackSpeed','knockback']) {const values=[...new Set(inputs.map(r=>r[key]).filter(v=>v!==undefined))];if(values.length===1)out[key]=values[0];}
  const stats={};for(const key of new Set(inputs.flatMap(r=>Object.keys(r.stats||{})))) {const values=[...new Set(inputs.map(r=>r.stats?.[key]).filter(v=>v!==undefined))];if(values.length===1)stats[key]=values[0];}
  if(Object.keys(stats).length)out.stats=stats;
  const scrolls=inputs.flatMap(r=>r.scroll?[r.scroll]:[]),chances=[...new Set(scrolls.map(s=>s.chance))];
  if(chances.length===1) {
    const gains={};let conflict=false;
    for(const scroll of scrolls)for(const [key,value] of Object.entries(scroll.stats)){if(gains[key]!==undefined&&gains[key]!==value)conflict=true;gains[key]=value;}
    if(!conflict&&Object.keys(gains).length)out.scroll={chance:chances[0],stats:gains};
  }
  return Object.keys(out).length?out:null;
}
