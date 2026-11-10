import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { monsterDetail, monsterIndex } from '../scripts/monster-pages.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../data/monsters.json',import.meta.url)));
const evidence=JSON.parse(fs.readFileSync(new URL('../data/editorial/monsters.json',import.meta.url)));
const url=p=>p;
const render=m=>monsterDetail({lang:'ko',m,data,url,itemUrl:d=>`/ko/tools/market/?item=${d.itemId}`});

test('every existing monster has a unique reviewed detail record and sprite',()=>{
  const old=JSON.parse(fs.readFileSync(new URL('../data/mobs.json',import.meta.url))).mobs;
  assert.deepEqual(data.monsters.map(m=>m.id).sort((a,b)=>a-b),old.map(m=>m.id).sort((a,b)=>a-b));
  assert.equal(new Set(data.monsters.map(m=>m.id)).size,78);
  for(const m of data.monsters){
    assert.ok(evidence.monsters.some(e=>e.id===m.id),m.en);
    assert.ok(fs.statSync(new URL(`../assets/monsters/${m.id}.gif`,import.meta.url)).size>0);
    for(const k of ['lv','hp','mp','watk','matk','wdef','mdef','acc','eva','exp'])assert.ok(Number.isFinite(m[k])&&m[k]>=0,`${m.en} ${k}`);
    assert.equal(m.status==='active',m.locations.some(l=>l.availability==='open'));
    assert.equal(new Set(m.locations.map(l=>l.id)).size,m.locations.length);
    for(const l of m.locations){assert.ok(l.count>0&&l.count<=l.total);assert.ok(l.types>0);if(l.availability==='upcoming')assert.equal(l.opensOn,'2026-11-18');}
  }
});
test('Curse Eye uses Classic World stats, current reports and accessible map counts',()=>{
  const m=data.monsters.find(m=>m.id===31);
  assert.deepEqual([m.lv,m.hp,m.exp,m.wdef,m.mdef,m.eva,m.el],[33,1001,63,30,0,22,'S2']);
  assert.equal(m.locations.length,15);assert.equal(m.locations.filter(l=>l.availability==='open').length,13);
  const north=m.locations.find(l=>l.id===10002083);assert.deepEqual([north.count,north.total],[20,20]);
  assert.ok(m.drops.some(d=>d.itemId===2000001),'Orange Potion is reported');
  assert.ok(!m.drops.some(d=>d.itemId===2000002),'Do not import White Potion from historic v83 table');
  assert.ok(!m.drops.some(d=>d.en==='Titan'),'Net-negative report excluded');
  const quest=m.drops.find(d=>d.itemId===4001006);assert.equal(quest.cat,'Quest');
  const html=render(m);assert.match(html,/독 저항/);assert.match(html,/드롭 확률은 확인되지/);assert.match(html,/입장 가능 13 \/ 전체 15맵/);
  assert.ok(!html.includes('?item=4001006'),'Quest drops do not link to trading');
});
test('drop labels are traceable observations, never invented probabilities or voter counts',()=>{
  for(const m of data.monsters){
    const source=evidence.monsters.find(e=>e.id===m.id);
    assert.equal(new Set(m.drops.map(d=>d.itemId)).size,m.drops.length);
    for(const d of m.drops){
      const vote=source.drops.find(x=>x.itemId===d.itemId);assert.ok(vote.up>vote.down);
      assert.equal(d.confidence,vote.up>=10&&vote.up>=3*vote.down?'repeated':'limited');
      assert.ok(!('rate' in d));assert.ok(!('probability' in d));
    }
    const html=render(m);assert.ok(!html.includes('meowdb.com'));assert.ok(!html.includes('MSEA'));
    assert.ok(!html.includes('data-api='));assert.ok(!html.includes('undefined'));assert.ok(!html.includes('NaN'));
  }
});
test('unmapped and unreleased monsters are not described as currently huntable',()=>{
  const faust=data.monsters.find(m=>m.id===700008);assert.equal(faust.status,'unplaced');
  assert.match(render(faust),/아이템을 드롭하지 않는다는 뜻은 아닙니다/);
  assert.match(render(faust),/출현 위치가 확인되지 않았습니다/);
  const glow=data.monsters.find(m=>m.id===54);assert.equal(glow.status,'upcoming');assert.match(render(glow),/현재 사냥 가능하다는 뜻이 아닙니다/);
});
test('renderers escape source strings and expose filters without backend scripts',()=>{
  const m=structuredClone(data.monsters[0]);m.ko='<img src=x onerror=alert(1)>';
  assert.ok(render(m).includes('&lt;img src=x onerror=alert(1)&gt;'));
  const html=monsterIndex({lang:'ko',data,url});
  assert.equal((html.match(/data-monster data-level=/g)||[]).length,78);
  for(const id of ['monster-query','monster-level','monster-type','monster-sort','monster-unavailable'])assert.ok(html.includes(`id="${id}"`));
  const js=fs.readFileSync(new URL('../assets/monsters.js',import.meta.url),'utf8');
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|location\.(href\s*=|assign|replace)/.test(js));
});

test('hunting notes resolve to real monsters, recorded sources and reported drops; accuracy table matches community figures',async()=>{
  const notes=JSON.parse(fs.readFileSync(new URL('../data/monster-notes.json',import.meta.url))).notes;
  const guides=JSON.parse(fs.readFileSync(new URL('../data/editorial/korean-guides.json',import.meta.url)));
  const {accuracyNeeded}=await import('../assets/damage-calc.js');
  assert.ok(Object.keys(notes).length>=30);
  for(const [id,n] of Object.entries(notes)){
    const m=data.monsters.find(m=>m.id===Number(id)); assert.ok(m,`note for unknown monster ${id}`);
    assert.ok(n.summary?.ko&&n.summary?.en,`summary ${id}`);
    for(const t of n.tips||[]) assert.ok(t.ko&&t.en,`tip ${id}`);
    assert.ok(n.evidence?.length,`evidence ${id}`);
    for(const e of n.evidence) assert.ok(guides.sources.some(s=>s.id===e&&/^https:\/\//.test(s.url)),`source ${e}`);
    for(const d of n.drops||[]) assert.ok(m.drops.some(x=>x.itemId===d),`drop ${d} not reported for ${m.en}`);
    if(n.band) assert.ok(n.band[0]>=1&&n.band[0]<=n.band[1]&&n.band[1]<=100,`band ${id}`);
    const html=render(m); for(const k of ['summary','ko']) assert.ok(html.includes('monster-hunting'));
    assert.ok(!html.includes('youtube.com'),'no source URLs in HTML');
  }
  // The community-quoted accuracy cut-offs (NiaDB figures read out in a video) must come out of our formula.
  const mob=n=>data.monsters.find(m=>m.en===n);
  assert.equal(accuracyNeeded(37,mob('Lupin')),89); assert.equal(accuracyNeeded(32,mob('Lupin')),106); assert.equal(accuracyNeeded(48,mob('Wraith')),104);
  // Notable drops are rendered first and tagged.
  const lupin=monsterDetail({lang:'ko',m:mob('Lupin'),data,url,itemUrl:d=>`/x/${d.itemId}`,notes:notes[35],routes:[],accuracy:l=>accuracyNeeded(l,mob('Lupin'))});
  assert.ok(lupin.indexOf('파밍 목적 드롭')<lupin.indexOf('제보 적음'));
  assert.ok(lupin.includes('Lv. 37 <small>동일 레벨</small></th><td>89'));
});
