// Text only: caller escapes these labels before inserting HTML.
const LABELS={PAD:['공격력','ATT'],MAD:['마력','M.ATT'],STR:['힘','STR'],DEX:['덱','DEX'],INT:['인','INT'],LUK:['럭','LUK'],ACC:['명중','ACC'],EVA:['회피','AVOID'],MHP:['HP','HP'],MMP:['MP','MP'],PDD:['물방','DEF'],MDD:['마방','M.DEF'],Speed:['이속','SPEED'],Jump:['점프','JUMP'],CRT:['크확','CRIT'],CRD:['크뎀','C.DMG']};
export function optionParts(opts,ko=false){
  if(!opts||typeof opts!=='object')return [];
  const parts=[];
  const stats=opts.scroll?.stats||opts.stats||{};
  if([10,60,100].includes(opts.scroll?.chance))parts.push(`${ko?'성공률':'Success'} ${opts.scroll.chance}%`);
  for(const [key,labels] of Object.entries(LABELS))if(Number.isInteger(stats[key]))parts.push(`${labels[ko?0:1]} ${opts.scroll&&stats[key]>0?'+':''}${stats[key]}`);
  if(Number.isInteger(opts.slots)&&opts.slots>=0&&opts.slots<=20)parts.push(`${ko?'남은 강화':'Slots left'} ${opts.slots}`);
  const speeds={'very fast':'매우 빠름',fast:'빠름',average:'보통',normal:'보통',slow:'느림','very slow':'매우 느림'};
  if(Object.hasOwn(speeds,opts.attackSpeed))parts.push(`${ko?'공속':'Speed'} ${ko?speeds[opts.attackSpeed]:opts.attackSpeed}`);
  if(Number.isInteger(opts.knockback)&&opts.knockback>=0&&opts.knockback<=100)parts.push(`${ko?'넉백':'Knockback'} ${opts.knockback}%`);
  return parts;
}

export function optionSummary(opts,ko=false){
  const parts=optionParts(opts,ko);
  if(Number.isInteger(opts?.ups)&&opts.ups>0&&opts.ups<=20)parts.unshift(`+${opts.ups}`);
  return parts.join(' · ');
}

// Keep the source even when collection failed: a megaphone must never fall back to catalogue rolls.
// Used by both the item name and the option summary, so hovering either shows the same piece.
export function megaphoneItemAttrs(id,opts){
  if(!Number.isInteger(id)||id<=0)return '';
  const esc=(s)=>s.replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return ` data-item-id="${id}" data-option-source="megaphone"${opts ? ` data-opts="${esc(JSON.stringify(opts))}"` : ''}`;
}

// The one stat a captured piece is priced by: attack (magic for wands and staves), else its highest main stat,
// else whatever was read. Shared by the hover card and the megaphone list so both quote the same price.
export function priceStat(opts,sub=''){
  const st=opts?.stats;if(!st||opts.scroll)return null;
  const has=k=>Number.isInteger(st[k]);
  const order=sub==='Wand'||sub==='Staff'?['MAD','PAD']:['PAD','MAD'];
  let k=order.find(has)||['STR','DEX','INT','LUK'].filter(has).sort((a,b)=>st[b]-st[a])[0]||Object.keys(st).find(has);
  return k?{stat:k,value:st[k]}:null;
}
