// Pure tooltip parsing; only validated fields are returned.
const LABELS = { 'weapon attack': 'PAD', 'magic attack': 'MAD', str: 'STR', dex: 'DEX', int: 'INT', luk: 'LUK', accuracy: 'ACC', avoidability: 'EVA', evasion: 'EVA', 'max hp': 'MHP', 'max mp': 'MMP', 'weapon defense': 'PDD', 'magic defense': 'MDD', speed: 'Speed', jump: 'Jump', 'critical rate': 'CRT', 'critical damage': 'CRD' };
export const nameKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
// Leave room for the longest nickname, channel badge and whisper icon even during a chat scroll race.
export function safeItemClickX(left,right,chatLeft) {
  const x=Math.max(chatLeft+180,Math.floor((left+right)/2));
  return x<right-2 ? x : null;
}
export function whisperDialog(rows) {
  const prompt=rows.find((r)=>r.confidence>=0.5&&/Please enter the person you want to/i.test(r.text));
  return prompt&&rows.find((r)=>r.confidence>=0.5&&/^CANCEL$/i.test(r.text.trim())&&r.y>prompt.y&&r.y<prompt.y+160&&Math.abs(r.x-prompt.x)<350);
}
const clean = (s) => s.replace(/^[•·*+\s-]+/, '').replace(/\b(?:aftack|altack|atack|ahack|attacke)\b/gi, 'Attack').trim();
export function tooltipTitle(text, expected) {
  const s = clean(text).replace(/\s*\((?:M|F|Male|Female)\)\s*/gi, ' ');
  if (s.startsWith('[')) return null; // A chat link is not a tooltip title.
  const match = /\s*[({i]?\s*\+\s*(\d{1,2})\s*[^a-z0-9]*$/i.exec(s);
  const title = match ? s.slice(0, match.index) : s;
  if (nameKey(title) !== nameKey(expected)) return null;
  return { ups: match ? Number(match[1]) : 0 };
}
export function findTooltipPanel(observations, item, catalog, image) {
  const title = observations.filter((o) => o.confidence >= 0.5 && tooltipTitle(o.text, item.en)).sort((a,b) => a.x-b.x)[0];
  if (!title) return null;
  const other = observations.filter((o) => o.x > title.x+120 && Math.abs(o.y-title.y)<60 && catalog.some((i) => tooltipTitle(o.text, i.en))).sort((a,b)=>a.x-b.x)[0];
  const x = Math.max(0, Math.floor(title.x-8)), y = Math.max(0, Math.floor(title.y-4));
  const right = Math.min(image.width, other ? other.x-10 : x+(item.cat==='Equip' ? 270 : 420));
  return { x, y, w: Math.floor(right-x), h: Math.min(image.height-y, 600), title };
}
export function parseTooltipLines(lines, item) {
  const texts=lines.filter((r)=>typeof r==='string'||r.confidence>=0.5).map((r)=>clean(typeof r==='string'?r:r.text));
  const title=texts.map((s)=>tooltipTitle(s,item.en)).find(Boolean);
  if(!title) return null;
  const stats={}, seen=new Map(); let slots, chance, attackSpeed, knockback;
  const put=(key,value)=>{if(seen.has(key)&&seen.get(key)!==value) seen.set(key,null);else if(!seen.has(key)) seen.set(key,value);};
  for(const s of texts) {
    if(/^REQ\b/i.test(s)) continue;
    const speed=/^Attack Speed:\s*(Very Fast|Fast|Average|Normal|Slow|Very Slow)$/i.exec(s);
    if(speed) attackSpeed=speed[1].toLowerCase();
    const knock=/^Knockback Chance:\s*(\d{1,3})%$/.exec(s);
    if(knock && Number(knock[1])<=100) knockback=Number(knock[1]);
    const m=/^([A-Za-z .]+):\s*\+?(-?\d{1,4})(?:\s*\(\s*(\d+)\s*([+-])\s*(\d+)\s*\))?\s*%?$/.exec(s);
    if(m) {
      const label=m[1].trim().toLowerCase().replace(/\./g,'');
      const key=LABELS[label] || {maxhp:'MHP',maxmp:'MMP','weapon def':'PDD','magic def':'MDD','weapon det':'PDD','magic det':'MDD',weapondef:'PDD',magicdef:'MDD'}[label];const v=Number(m[2]);
      if(key && (m[3]===undefined || Number(m[3])+(m[4]==='-'?-1:1)*Number(m[5])===v) && v>=-99 && v<=(['MHP','MMP'].includes(key)?5000:['PDD','MDD'].includes(key)?999:255)) put(key,v);
      if(/^Remaining Enhancements$/i.test(m[1]) && v>=0 && v<=20) put('slots',v);
    }
  }
  for(const [key,value] of seen) if(value!==null) {if(key==='slots') slots=value;else stats[key]=value;}
  if(item.cat!=='Equip') {
    // Scroll description can wrap between "Weapon" and "Attack +2".
    const desc=texts.slice(1).join(' '), rate=/Success rate:\s*(100|60|10)\s*%/i.exec(desc);
    if(!rate) return null;
    chance=Number(rate[1]);const gains={};
    for(const [label,key] of Object.entries(LABELS)) {
      const match=new RegExp(`(?:^|[^a-z])${label.replace(/ /g,'\\s+')}\\s*\\+\\s*(\\d{1,3})(?!\\d)`,'i').exec(desc);
      if(match && Number(match[1])<=255) gains[key]=Number(match[1]);
    }
    return Object.keys(gains).length?{scroll:{chance,stats:gains}}:null;
  }
  // A title alone is not useful evidence of options.
  if(!Object.keys(stats).length && slots===undefined) return null;
  const out={};if(Object.keys(stats).length) out.stats=stats;
  if(slots!==undefined) out.slots=slots;
  if(attackSpeed) out.attackSpeed=attackSpeed;
  if(knockback!==undefined) out.knockback=knockback;
  if(title.ups<=20) out.ups=title.ups;
  if(Number.isInteger(item.slots)&&slots!==undefined&&item.slots>=slots&&title.ups<=item.slots-slots) {out.used=item.slots-slots;out.clean=out.used===0;}
  else if(title.ups>0) out.clean=false;
  return out;
}
export function agreeOptions(a,b) {
  if(!a||!b) return a||b;
  const out={};
  for(const key of ['slots','ups','used','clean','attackSpeed','knockback']) {if(a[key]!==undefined&&b[key]!==undefined&&a[key]!==b[key])continue;if(a[key]!==undefined||b[key]!==undefined)out[key]=a[key]??b[key];}
  const stats={};for(const key of new Set([...Object.keys(a.stats||{}),...Object.keys(b.stats||{})])) {if(a.stats?.[key]!==undefined&&b.stats?.[key]!==undefined&&a.stats[key]!==b.stats[key])continue;stats[key]=a.stats?.[key]??b.stats?.[key];}
  if(Object.keys(stats).length)out.stats=stats;
  if(a.scroll&&b.scroll&&JSON.stringify(a.scroll)===JSON.stringify(b.scroll))out.scroll=a.scroll;
  if(!a.scroll||!b.scroll) {if(a.scroll||b.scroll)out.scroll=a.scroll||b.scroll;}
  return Object.keys(out).length?out:null;
}
