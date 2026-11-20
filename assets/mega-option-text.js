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
