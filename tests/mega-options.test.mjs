import test from 'node:test';
import assert from 'node:assert/strict';
import { tooltipTitle, emptyUpgradeSuffix, findTooltipPanel, tooltipBody, tooltipStatRows, subtractTooltipBackground, missingTooltipFields, parseTooltipLines, agreeOptions, safeItemClickX, whisperDialog } from '../assets/mega-tooltip.js';
import { optionParts, optionSummary } from '../assets/mega-option-text.js';
const bow={en:'Vaulter 2000',cat:'Equip',slots:7};
const dagger={en:'Bazlud',cat:'Equip',slots:7};
const scroll={en:'Claw Attack Scroll: Intermediate',cat:'Use'};
test('an unread stat line marks a partial capture even when other stats were read',()=>{
 assert.deepEqual(missingTooltipFields([{text:'Weapon Attack: +8',confidence:0.3},{text:'Critical Rate: +2',confidence:1},{text:'REQ STR: 40',confidence:1}],{stats:{CRT:2},slots:0},bow),['PAD']);
 assert.deepEqual(missingTooltipFields(['Weapon Attack: +8'],{stats:{PAD:8}},bow),['slots']);
 assert.deepEqual(missingTooltipFields(['Weapon Attack: +8'],{stats:{PAD:8},slots:0},bow),[]);
});
test('short item links remain clickable while nickname, badge and clipped links are excluded',()=>{
 assert.equal(safeItemClickX(110,150,108),145);
 assert.equal(safeItemClickX(110,240,108),235);
 assert.equal(safeItemClickX(210,300,195),295);
 assert.equal(safeItemClickX(110,150,152),null);
 assert.equal(safeItemClickX(110,116,108),null);
});
test('scroll gains wrapped onto their own line retain the numeric plus sign',()=>{
 const item={en:'Shield Accuracy Scroll: Chaos',cat:'Use'};
 assert.deepEqual(parseTooltipLines(['Shield Accuracy Scroll: Chaos','Improves Accuracy on shields.','Success rate: 10%, Accuracy','+4','Upon failure, the item has a','50% chance to be destroyed.'],item),{scroll:{chance:10,stats:{ACC:4}}});
 assert.deepEqual(parseTooltipLines(['Gloves Crit. Rate Scroll: Chaos','Success rate: 10%, Crit. Rate','+4'],{en:'Gloves Crit. Rate Scroll: Chaos',cat:'Use'}),{scroll:{chance:10,stats:{CRT:4}}});
});
test('tooltip selection excludes a chat link misread as a title left of the clicked item',()=>{
 const observations=[{text:scroll.en,confidence:1,x:380,y:670,w:220,h:12},{text:scroll.en,confidence:1,x:610,y:684,w:220,h:12}];
 assert.equal(findTooltipPanel(observations,scroll,[],{width:1366,height:796},{x:598,y:672}).title.x,610);
 assert.equal(tooltipTitle(scroll.en+':',scroll.en),null);
 assert.equal(tooltipTitle(scroll.en+']',scroll.en),null);
});
test('background subtraction removes translucent scenery while preserving bright glyph pixels',()=>{
 const width=100,height=60,before={width,height,data:new Uint8Array(width*height*4)},after={width,height,data:new Uint8Array(width*height*4)};
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;for(let c=0;c<3;c++){before.data[i+c]=(x*17+y*29+c*61)%256;after.data[i+c]=Math.round(before.data[i+c]*.25+[15,17,53][c]);}before.data[i+3]=after.data[i+3]=255;}
 for(let y=20;y<30;y++)for(let x=30;x<35;x++){const i=(y*width+x)*4;after.data[i]=after.data[i+1]=after.data[i+2]=255;}
 const out=subtractTooltipBackground(after,before,{x:0,y:0,w:width,h:height});
 assert.ok(out);assert.ok(out.data[(22*width+32)*4]<60);assert.ok(out.data[(12*width+12)*4]>250);
 assert.equal(subtractTooltipBackground(after,{...before,width:99},{x:0,y:0,w:width,h:height}),null);
});
test('physical stat rows expose options whose labels were completely missed by OCR',()=>{
 assert.deepEqual(tooltipStatRows([{text:'Type: Gloves',y:600},{text:'INT: +4',y:616},{text:'Remaining Enhancements: 0',y:696}]),[616,632,648,664,680]);
 assert.deepEqual(tooltipStatRows([{text:'Type: Gloves',y:600}]),[]);
});
test('zero upgrades require empty visible space after the title, not just an unread suffix',()=>{
 const im={width:300,height:50,data:new Uint8Array(300*50*4).fill(255)},title={x:10,y:10,w:100,h:15};
 assert.equal(emptyUpgradeSuffix(im,title),true);
 for(let y=12;y<17;y++)for(let x=130;x<134;x++)im.data[(y*im.width+x)*4]=0;
 assert.equal(emptyUpgradeSuffix(im,title),false);
 assert.equal(emptyUpgradeSuffix(im,{...title,w:260}),false);
});
test('a clear isolated slot count accepts the OCR period separator but rejects attached HUD digits',()=>{
 assert.equal(parseTooltipLines(['Vaulter 2000 (+2)','Remaining Enhancements. 0'],bow).slots,0);
 assert.equal(parseTooltipLines(['Vaulter 2000 (+2)','Remaining Enhancements: 04821'],bow),null);
 assert.equal(parseTooltipLines(['Vaulter 2000 (+2)','Remaining Enhancements: 0*32.'],bow),null);
});
test('whisper recovery identifies only the specific dialog cancel button',()=>{
 const prompt={text:'Please enter the person you want to',confidence:1,x:568,y:365};
 const cancel={text:'CANCEL',confidence:1,x:764,y:453,w:39,h:12};
 assert.equal(whisperDialog([prompt,cancel]),cancel);
 assert.equal(whisperDialog([cancel]),undefined);
 assert.equal(whisperDialog([prompt,{...cancel,y:700}]),undefined);
});
test('real tooltip readings: totals, upgrades and zero remaining slots',()=>{
 assert.deepEqual(parseTooltipLines(['• Vaulter 2000 (+2)','REQ DEX: 85','Type: Bow','• Weapon Aftack: +68 (60 +8)','Attack Speed: Average','Knockback Chance: 20%','+ Remaining Enhancements: 0'],bow),{stats:{PAD:68},slots:0,attackSpeed:'average',knockback:20,ups:2,used:7,clean:false});
 assert.deepEqual(parseTooltipLines(['Bazlud i+7!','Type: Dagger','Weapon Attack: +72 (62+10)','Remaining Enhancements: 0'],dagger),{stats:{PAD:72},slots:0,ups:7,used:7,clean:false});
});
test('never turn requirements, clipped digits or inconsistent sums into stats',()=>{
 assert.equal(parseTooltipLines(['Vaulter 2000 (+2)','REQ STR: 40','Weapon Attack: +6B','Weapon Attack: +68 (60+9)'],bow),null);
 assert.equal(parseTooltipLines(['Steel Titans','Weapon Attack: +13'],bow),null);
 assert.equal(tooltipTitle('[Vaulter 2000] S> 1m',bow.en),null);
 assert.equal(parseTooltipLines(['Bazlud (+7)','Weapon Attack: +72','Weapon Attack: +12'],dagger),null);
 assert.deepEqual(parseTooltipLines(['Bazlud','STR: +3','DEX: +2','Remaining Enhancements: 7'],dagger),{stats:{STR:3,DEX:2},slots:7,ups:0,used:0,clean:true});
});
test('raw/masked OCR disagreement omits the field instead of choosing a number',()=>{
 assert.deepEqual(agreeOptions({stats:{PAD:68,LUK:2},slots:0},{stats:{PAD:88},slots:0}),{stats:{LUK:2},slots:0});
 assert.deepEqual(agreeOptions({stats:{PAD:68,LUK:2}},{stats:{PAD:88}},{stats:{PAD:88}}),{stats:{LUK:2}});
});
test('tooltip body excludes requirements, neighbouring chat and bottom HUD',()=>{
 const panel={x:510,y:540,w:270,h:256};
 const body=tooltipBody(panel,[{text:'Type: Earrings',x:518,y:670,h:12},{text:'Remaining Enhancements: 0',x:520,y:734,h:12}],{cat:'Equip'});
 assert.deepEqual(body,{x:516,y:667,w:226,h:83});
 assert.deepEqual(tooltipBody(panel,[{text:'lype: Shield',x:518,y:670,h:12},{text:'Remaining Enhancements: 7',x:520,y:734,h:12}],{cat:'Equip'}),body);
 assert.equal(tooltipBody(panel,[],{cat:'Equip'}),panel);
});
test('a lost enhancement suffix never becomes zero successful upgrades',()=>{
 const item={en:'Emerald Earrings',cat:'Equip',slots:5};
 assert.deepEqual(parseTooltipLines(['Emerald Earrings','STR: +3','Remaining Enhancements: 0'],item),{stats:{STR:3},slots:0,used:5,clean:false});
 assert.equal(parseTooltipLines(['Emerald Earrings','Emerald Earrings (+2)','STR: +3','Remaining Enhancements: 0'],item).ups,2);
 assert.equal(parseTooltipLines(['Emerald Earrings (+2)','Emerald Earrings (+3)','STR: +3'],item).ups,undefined);
 const panel=findTooltipPanel([{x:510,y:540,w:120,h:14,confidence:1,text:'Emerald Earrings'},{x:938,y:544,w:120,h:14,confidence:1,text:'Bazlud'}],item,[item,dagger],{width:1366,height:796});
 assert.equal(panel.w,270);
});
test('scroll gains are separate from equipment totals and support wrapped OCR',()=>{
 assert.deepEqual(parseTooltipLines(['Claw Attack Scroll: Intermediate','Improves Weapon Attack on','claws.','Success rate: 60%, Weapon','AHack +2'],scroll),{scroll:{chance:60,stats:{PAD:2}}});
 assert.equal(parseTooltipLines(['Claw Attack Scroll: Intermediate','Success rate: 6O%, Weapon','Attack +2'],scroll),null);
});
test('gender suffixes and negative base-roll deltas in armor tooltips',()=>{
 assert.deepEqual(parseTooltipLines(['Dark Avenger (F)','LUK: +6','MaxHP: +6 (5+1)','Weapon Def: +80 (83-3)','Remaining Enhancements: 7'],{en:'Dark Avenger',cat:'Equip',slots:7}),{stats:{LUK:6,MHP:6,PDD:80},slots:7,ups:0,used:0,clean:true});
 assert.deepEqual(parseTooltipLines(['• Blue Starlight (M) (+8','-INT: +26 (8 +18)','• Weapon Def.: +57','+ Magic Def.: +65 (66-1)','+ Remaining Enhancements: 0'],{en:'Blue Starlight',cat:'Equip',slots:10}),{stats:{INT:26,PDD:57,MDD:65},slots:0,ups:8,used:10,clean:false});
});
test('select the linked tooltip and stop before the equipped comparison panel',()=>{
 const rows=[{x:434,y:580,w:126,h:12,confidence:1,text:'• Vaulter 2000 (+2)'},{x:672,y:558,w:92,h:12,confidence:1,text:'• Steel Titans'}];
 const panel=findTooltipPanel(rows,bow,[bow,{en:'Steel Titans',cat:'Equip'}],{width:1366,height:796});
 assert.equal(panel.x,426);assert.equal(panel.x+panel.w,662);assert.equal(panel.title.text,rows[0].text);
});
test('option summaries show actual stats and zero slots on desktop and mobile',()=>{
 assert.deepEqual(optionParts({stats:{PAD:68,UNKNOWN:999},slots:0,attackSpeed:'average'},true),['공격력 68','남은 강화 0','공속 보통']);
 assert.deepEqual(optionParts({scroll:{chance:60,stats:{PAD:2}}},false),['Success 60%','ATT +2']);
 assert.deepEqual(optionParts({stats:{PAD:'<script>'},slots:-1}),[]);
});
test('ticker summaries include upgrades and zero slots without inventing missing options',()=>{
 assert.equal(optionSummary({stats:{INT:21,PDD:57},slots:0,ups:6},true),'+6 · 인 21 · 물방 57 · 남은 강화 0');
 assert.equal(optionSummary({scroll:{chance:60,stats:{PAD:2}}}),'Success 60% · ATT +2');
 assert.equal(optionSummary(undefined),'');
 assert.equal(optionSummary({ups:0,stats:{PAD:'<script>'}}),'');
});
