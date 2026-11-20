import test from 'node:test';
import assert from 'node:assert/strict';
import { tooltipTitle, findTooltipPanel, parseTooltipLines, agreeOptions, safeItemClickX, whisperDialog } from '../assets/mega-tooltip.js';
import { optionParts } from '../assets/mega-option-text.js';
const bow={en:'Vaulter 2000',cat:'Equip',slots:7};
const dagger={en:'Bazlud',cat:'Equip',slots:7};
const scroll={en:'Claw Attack Scroll: Intermediate',cat:'Use'};
test('item clicks stay beyond any nickname; short unsafe links are skipped',()=>{
 assert.equal(safeItemClickX(110,150,13),null);
 assert.equal(safeItemClickX(110,240,13),193);
 assert.equal(safeItemClickX(210,300,13),255);
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
