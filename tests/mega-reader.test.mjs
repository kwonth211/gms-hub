import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import { cleanText, assemble, repeatFilter, continuousMessage, bandClass, findChatBox, stableChatBox, findLines, isLineVisible, findBadge, readChannel, slotAnchor, windowTop, glyphs, glyphReader, itemGlyphBounds, lineFingerprint, locateFingerprint, senderFingerprint } from '../assets/mega-reader.js';

test('a real moving Nobi row remains identifiable when the badge icon changes',()=>{
 const load=name=>({width:576,height:180,data:gunzipSync(fs.readFileSync(new URL(`fixtures/mega-badge-animation-${name}.rgba.gz`,import.meta.url)))});
 const before=load('before'),ready=load('ready'),old=findLines(before).find(l=>l.top===104),moved=findLines(ready).find(l=>l.top===88);
 const fingerprint=lineFingerprint(before,old);
 assert.equal(readChannel(before,old,findBadge(before,old)),13);
 assert.equal(lineFingerprint(ready,moved),fingerprint);
 assert.equal(locateFingerprint(ready,fingerprint)?.top,88);
 assert.equal(senderFingerprint(before,old),senderFingerprint(ready,moved));
 assert.notEqual(senderFingerprint(ready,moved),senderFingerprint(ready,findLines(ready).find(l=>l.top===72)));
 // Altering actual nickname text must still break identity.
 const changed={...ready,data:Buffer.from(ready.data)};
 for(let y=moved.top;y<=moved.bottom;y++)for(let x=14;x<21;x++)changed.data.set([...moved.bg,255],(y*changed.width+x)*4);
 assert.notEqual(lineFingerprint(changed,moved),fingerprint);
 assert.notEqual(senderFingerprint(changed,moved),senderFingerprint(ready,moved));
});

test('continuous visibility preserves the original upload timestamp despite pixel fingerprint drift',()=>{
 const row={seen:'2026-11-20T15:42:31.689Z',nick:'sAsHiMe',channel:19,color:'Y',text:'[Work Gloves] PM offers',fingerprint:'old'};
 const previous={row,lastVisible:1000},current={...row,fingerprint:'new'};
 assert.equal(continuousMessage(previous,current,3500),row);
 for(const change of [{nick:'SomeoneElse'},{channel:20},{color:'C'},{text:'[Work Gloves] NEW offer'}])assert.equal(continuousMessage(previous,{...current,...change},3500),null);
 assert.equal(continuousMessage(undefined,current,3500),null); // A disappeared/reposted row has no continuity.
 assert.equal(continuousMessage(previous,current,12000),null);
});

test('occluded chat preserves its known width and rejects the partial row',()=>{
 const previous={x:278,y:358,w:576,h:414},found={x:278,y:550,w:268,h:222};
 assert.equal(stableChatBox(previous,found,{width:1366}).w,576);
 assert.equal(stableChatBox(previous,{...found,x:0},{width:1366}).w,268);
 const img={width:576,height:32,data:new Uint8Array(576*32*4)};
 for(let i=0;i<img.data.length;i+=4)img.data.set([216,168,40,255],i);
 const line={top:2,bottom:15,color:'Y',right:551,bg:[216,168,40]};
 assert.equal(isLineVisible(img,line),true);
 for(let y=2;y<=15;y++)for(let x=240;x<460;x++)img.data.set([40,40,80,255],(y*576+x)*4);
 assert.equal(isLineVisible(img,line),false);
 assert.equal(isLineVisible(img,{...line,right:330}),false);
});

test('a continuation cannot jump across a notice or an unread head row',()=>{
 const head={color:'Y',nick:'Seller',channel:1,text:'[Work Gloves] S> 8 ATT',top:10};
 assert.equal(assemble([head,{color:'Y',cont:true,text:'unrelated',top:42}])[0].text,head.text);
 assert.equal(assemble([head,{top:26,obscured:true},{color:'Y',cont:true,text:'unrelated',top:42}])[0].text,head.text);
 assert.equal(assemble([head,{color:'Y',cont:true,text:'5m',top:26}])[0].text,head.text+' 5m');
});

test('real Olympus row survives a scroll, highlight pixel changes, and a one-pixel height change',()=>{
 const load=name=>({width:576,height:200,data:gunzipSync(fs.readFileSync(new URL(`fixtures/${name}.rgba.gz`,import.meta.url)))});
 const before=load('mega-before-scroll'),after=load('mega-after-scroll');
 const old=findLines(before).find(l=>l.top===130),moved=findLines(after).find(l=>l.top===114);
 assert.equal(old.bottom-old.top,13);assert.equal(moved.bottom-moved.top,13);
 const fingerprint=lineFingerprint(before,old);
 assert.equal(lineFingerprint(after,moved),fingerprint);
 assert.equal(locateFingerprint(after,fingerprint).top,114);
 assert.notEqual(lineFingerprint(after,findLines(after).find(l=>l.top===130)),fingerprint);
});

test('real cyan bands remain separate despite ink across row gaps, with item brackets in the right slot',()=>{
 const img={width:576,height:200,data:gunzipSync(fs.readFileSync(new URL('fixtures/mega-blue-bands.rgba.gz',import.meta.url)))};
 const lines=findLines(img),anchor=slotAnchor(img,lines);
 const channels=lines.map(l=>{const badge=findBadge(img,l);return badge&&readChannel(img,l,badge);});
 assert.deepEqual(channels,[null,3,null,19,13,null]);
 assert.deepEqual(lines.map(l=>[l.top,l.bottom]),[[50,63],[66,79],[82,95],[98,111],[114,127],[130,143]]);
 const line=lines[1],badge=findBadge(img,line);
 const read=glyphReader(JSON.parse(fs.readFileSync(new URL('../assets/mega-glyphs.json',import.meta.url))));
 const letters=glyphs(img,line,badge.message,img.width,windowTop(line,anchor));
 const brackets=letters.filter(g=>/^[\[\]]$/.test(read.charOf(g.key)||''));
 assert.deepEqual(brackets.map(g=>[g.x,read.charOf(g.key)]),[[113,'['],[251,']']]);
 assert.equal(locateFingerprint(img,lineFingerprint(img,line)).top,66);
});

test('a real blue Work Gloves link with a touching opening bracket requires the complete name',()=>{
 const img={width:576,height:200,data:gunzipSync(fs.readFileSync(new URL('fixtures/mega-touching-bracket.rgba.gz',import.meta.url)))};
 const lines=findLines(img),line=lines.find(l=>l.top===114),badge=findBadge(img,line);
 const read=glyphReader(JSON.parse(fs.readFileSync(new URL('../assets/mega-glyphs.json',import.meta.url))));
 const gs=glyphs(img,line,badge.message,img.width,windowTop(line,slotAnchor(img,lines)));
 assert.equal(gs.some(g=>(read.charOf(g.key)||'').includes('[')),false);
 assert.deepEqual(itemGlyphBounds(gs,read,'Work Gloves'),{left:108,right:196});
 assert.equal(itemGlyphBounds(gs,read,'Red Sauna Robe'),null);
 assert.equal(itemGlyphBounds(gs,read),null);
 assert.equal(itemGlyphBounds(gs.filter(g=>read.charOf(g.key)!==']'),read,'Work Gloves'),null);
});

test('option target follows the same complete row when chat scrolls; ambiguity is rejected', () => {
  const frame=rows=>{
    const img={width:160,height:90,data:new Uint8Array(160*90*4)};
    for(let y=0;y<90;y++)for(let x=0;x<160;x++)img.data.set([216,168,40,255],(y*160+x)*4);
    for(const [top,mark] of rows)for(let y=top;y<top+8;y++)for(let x=5;x<100;x++)if(x%6<3 || x===mark)img.data.set([24,24,8,255],(y*160+x)*4);
    return img;
  };
  const before=frame([[50,40]]),line=findLines(before)[0];
  const fingerprint=lineFingerprint(before,line);
  assert.equal(locateFingerprint(frame([[10,40],[50,41]]),fingerprint)?.top,10);
  assert.equal(locateFingerprint(frame([[10,41]]),fingerprint),null);
  assert.equal(locateFingerprint(frame([[10,40],[50,40]]),fingerprint),null);
});
test('notices splitting the chat do not discard visible megaphones above or below them',()=>{
 const img={width:576,height:420,data:gunzipSync(fs.readFileSync(new URL('fixtures/mega-separated-bands.rgba.gz',import.meta.url)))};
 const box=findChatBox(img);
 assert.ok(box.y<58);assert.ok(box.y+box.h>362);
});
test('gold scenery outside the chat never becomes nickname ink or breaks row tracking',()=>{
 const load=n=>({width:576,height:414,data:gunzipSync(fs.readFileSync(new URL(`fixtures/mega-scenery-${n}.rgba.gz`,import.meta.url)))});
 const before=load('before'),ready=load('ready'),line=findLines(before).find(l=>l.top===274);
 const fingerprint=lineFingerprint(before,line);
 assert.equal(locateFingerprint(ready,fingerprint)?.top,226);
});
test('repeat detection preserves separate sellers and separate items while ignoring OCR drift in one row',()=>{
 const seen=repeatFilter(),row={nick:'Tanin',channel:1,text:'[Olympus] S> Olympus -1',fingerprint:'row-a'};
 assert.equal(seen(row,100),false);
 assert.equal(seen({...row,text:'[Olympus] S> 0lympus -1'},101),true);
 assert.equal(seen({...row,text:'[Olympus] S> Olympus clean',fingerprint:'row-b'},102),false);
 assert.equal(seen({...row,nick:'OtherSeller'},103),false);
 assert.equal(seen({...row,text:'[Meba] S> PMO'},104),false);
});

test('a near-identical resend from the same seller within 2 minutes is kept once',()=>{
 const seen=repeatFilter(),row={nick:'DarkLife',channel:19,text:'[Steel Slain] S> 47 at slain 16.2m l 14 luk napoleon 14.5m',fingerprint:'a'};
 assert.equal(seen(row,0),false);
 assert.equal(seen({...row,text:'[Steel Slain] S> 47 at slain 16.2m 14 luk napoleon 14.5m',fingerprint:'b'},8000),true);
 assert.equal(seen({...row,text:'[Steel Slain] S> 46 at slain 15m',fingerprint:'c'},9000),false);
});

test('band colours: gold, dithered pink and teal are megaphones; the dark chat background is not', () => {
  assert.equal(bandClass(216, 168, 40), 'Y');
  assert.equal(bandClass(200, 152, 168), 'P');
  assert.equal(bandClass(184, 152, 168), 'P');
  assert.equal(bandClass(110, 200, 200), 'C');
  assert.equal(bandClass(24, 24, 8), null);
});

test('trade shorthand misreads are put back to S> and B>', () => {
  assert.equal(cleanText('[Arc Staff] 5» 95 MAG'), '[Arc Staff] S> 95 MAG');
  assert.equal(cleanText('S=kumbi 480K'), 'S> kumbi 480K');
  assert.equal(cleanText('Bxkumbi 460k'), 'B> kumbi 460k');
  assert.equal(cleanText('Sell meba PMO'), 'Sell meba PMO');
});

test('a wrapped second line joins the megaphone above it on the same colour only', () => {
  const out = assemble([
    { color: 'Y', nick: 'Armindz', channel: 1, text: '[Gloves Attack Scroll: Intermediate] S> Glove ATT 60% Scroll 1.5' },
    { color: 'Y', cont: true, text: 'M (Firm Price)' },
    { color: 'P', cont: true, text: 'stray line' },
    { color: 'P', nick: 'lord0', channel: 1, text: 'S> Teddy Bear 105k' }
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].text, '[Gloves Attack Scroll: Intermediate] S> Glove ATT 60% Scroll 1.5 M (Firm Price)');
  assert.equal(out[1].nick, 'lord0');
});

test('misread bracketed item names snap to the catalogue only when clearly the same item', async () => {
  const { itemFixer } = await import('../assets/mega-reader.js');
  const fix = itemFixer(['Sapphire Earrings', 'White Choco Bunny', 'Zard', 'Work Gloves']);
  assert.equal(fix('[Sapphire Earmings] S> 1m'), '[Sapphire Earrings] S> 1m');
  assert.equal(fix('[white Choco Bunry] S> 850k'), '[White Choco Bunny] S> 850k');
  assert.equal(fix('[work gloves] PMO'), '[Work Gloves] PMO');
  assert.equal(fix('[Totally Unknown Thing] hi'), '[Totally Unknown Thing] hi');
  assert.equal(fix('work Gloves] PMO',true),'[Work Gloves] PMO');
  assert.equal(fix('work Gloves] PMO'),'work Gloves] PMO');
  assert.equal(fix('Totally Unknown Thing] hi',true),'Totally Unknown Thing] hi');
});

test('a partly known line keeps the table words and fills only the unknown letters from OCR', async () => {
  const { mergeReading } = await import('../assets/mega-reader.js');
  assert.equal(mergeReading([['P', 'i', 'n', 'k'], ['R', 'a', null, 'b', 'i', 't']], 'Pink Rabhit'), 'Pink Rabbit');
  assert.equal(mergeReading([['S', '>'], [null], ['k']], 'S> 850 k'), 'S> 850 k');
  assert.equal(mergeReading([['a'], ['b']], 'one'), null);
});

test('a small l inside a word of capitals is the capital I', async () => {
  const { capsI } = await import('../assets/mega-reader.js');
  assert.equal(capsI('SELLlNG GLOVE MAGlC ATK'), 'SELLING GLOVE MAGIC ATK');
  assert.equal(capsI('Sell meba lol'), 'Sell meba lol');
});
