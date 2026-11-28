import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { recovery, costPer1000, breakEvenMP, saleBands, studies } from '../scripts/economy-studies.mjs';

const read = p => fs.readFileSync(new URL('../'+p, import.meta.url),'utf8');
test('potion recovery caps at missing MP, rounds fractional recovery down and never prices zero recovery',()=>{
  assert.equal(recovery({mpR:35},4000,500),500);
  assert.equal(recovery({mp:200},4000,90),90);
  assert.equal(recovery({mpR:35},2417,2417),845);
  assert.equal(recovery({mpR:100},4000,0),0);
  assert.equal(costPer1000(888,0),null);
  assert.equal(costPer1000(210,200),1050);
});
test('MP crossover is the first integer that is cheaper, including recovery rounding',()=>{
  for(const [price,rate,want] of [[888,35,2418],[1399,50,2666],[2555,100,2434]]) {
    const n=breakEvenMP(price,{mpR:rate},210,200);
    assert.equal(n,want);
    assert.ok(price/recovery({mpR:rate},n,n)<=210/200);
    assert.ok(price/recovery({mpR:rate},n-1,n-1)>210/200);
  }
});
test('sale bands deduplicate daily sightings, preserve sold marks and partition exact boundaries',()=>{
  const rows=[{key:'a',seen:'2026-11-26',price:1599999,sold:true},{key:'a',seen:'2026-11-27',price:1599999,sold:false},
    {key:'b',price:1600000,sold:false},{key:'c',price:1800000,sold:true},{key:'d',price:2000000,sold:false}];
  const bands=saleBands(rows,[0,1600000,1800000,2000000]);
  assert.deepEqual(bands.map(r=>[r.listings,r.sold,r.share]),[[1,1,1],[1,0,0],[1,1,1],[1,0,0]]);
});
test('all published economy tables reproduce frozen inputs and account for every historical listing',()=>{
  const result=studies(JSON.parse(read('data/editorial/economy-2026-11-28.json')));
  for(const [key,report] of Object.entries(result)) assert.deepEqual(report,JSON.parse(read(`assets/research/${key}-2026-11-28.json`)));
  assert.equal(result.stars.mixedBasket.cost,7860000);
  assert.equal(result.stars.upgrades.at(-1).oneSetDifference,15699999);
  assert.equal(result.selling.bands.reduce((s,r)=>s+r.listings,0),3363);
  assert.equal(result.selling.bands.reduce((s,r)=>s+r.sold,0),686);
  assert.equal(result.selling.ranks.at(-1).cheaper-result.selling.ranks[2].cheaper,402);
});
test('both article languages retain the key findings and valid short discovery identifiers',()=>{
  const figures={
    'throwing-star-budget':['7,860,000','15,699,999','78,499,995'],
    'potion-mp-cost':['2,418','2,666','2,434','58,200','1,268'],
    'glove-scroll-selling-price':['3,363','1,154','25.0%','1.4%','434']
  };
  for(const [slug,values] of Object.entries(figures)) for(const lang of ['ko','en']) {
    const body=read(`data/guides/${slug}.${lang}.html`);
    for(const value of values) assert.ok(body.includes(value),`${slug} ${lang}: ${value}`);
    for(const [,feature] of body.matchAll(/data-discover="([^"]+)"/g)) assert.match(feature,/^[a-z_]{1,24}$/);
    assert.ok(!body.includes(`/${lang==='ko'?'en':'ko'}/`));
  }
});
