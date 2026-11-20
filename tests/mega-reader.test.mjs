import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import { cleanText, assemble, bandClass, findLines, findBadge, readChannel, slotAnchor, windowTop, glyphs, glyphReader, lineFingerprint, locateFingerprint } from '../assets/mega-reader.js';

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
