import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import reader from './extension/reader-core.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/shop.json',import.meta.url)));
const catalog={2040801:'Gloves Attack Scroll: Intermediate',2044701:'Claw Attack Scroll: Intermediate'};
function mock(itemCount=2, listDelay=0) {
 const catalogue=JSON.parse(fs.readFileSync(new URL('../../data/items.json',import.meta.url)));
 const extra=catalogue.items.filter(x=>x.id!==2040801&&x.id!==2044701).slice(0,Math.max(0,itemCount-2));
 const selectedIds=[2040801,2044701,...extra.map(x=>x.id)];
 const localCatalog={...catalog,...Object.fromEntries(extra.map(x=>[x.id,x.en]))};
 const dom=new JSDOM('<title>MesoWatch</title><span id="world">Windia</span><table><tbody></tbody></table><div id="detail"></div><div id="sv-back" hidden></div>',{runScripts:'outside-only',url:'https://meso.watch/?gms-batch=1'});
 const w=dom.window,d=w.document;let n=1,selected=2040801;
 const captured=Date.parse(fixture.capturedAt);w.Date=class extends Date{constructor(...a){super(...(a.length?a:[captured]));}static now(){return captured;}};
 w.setTimeout=(fn)=>setTimeout(fn,1); w.fetch=()=>{throw Error('Collector must not use a network or AI API');};
 const seed=reader.readShop(new JSDOM(fixture.html).window.document,fixture.capturedAt), stamp=seed.listingRows.find(x=>x.index===String(Number(/^Shop (\d+)/.exec(seed.step)[1])-1)).title;
 function el(tag,text='',attrs={}){const e=d.createElement(tag);e.textContent=text;for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;}
 function modal(){
  const m=el('div','',{id:'sv-modal'});m.append(el('span',`Shop ${n} of 20 selling ${localCatalog[selected]}`,{class:'sv-count'}),el('b',`Seller${n}`,{class:'sv-tag'}),el('span','CH 1',{class:'sv-ch'}),el('span','FM1',{class:'sv-fm'}));
  const item=el('li','',{class:'sv-item sv-here'});item.append(el('b',localCatalog[selected]),el('img','',{src:`data/icons/${String(selected).padStart(8,'0')}.png`}),el('small','1 for 1,000'));m.append(item);
  const close=el('button','Close',{'aria-label':'Close'});close.onclick=()=>d.querySelector('#sv-back').hidden=true;
  const next=el('button','Next shop',{'aria-label':'Next shop'});next.onclick=()=>{n++;modal();};m.append(close,next);
  const back=d.querySelector('#sv-back');back.replaceChildren(m);back.hidden=false;
 }
 for(const id of selectedIds){
  const tr=el('tr','',{'data-id':`basil:${String(id).padStart(8,'0')}`}), b=el('button',localCatalog[id],{class:'item-select',title:localCatalog[id]});tr.append(b);d.querySelector('tbody').append(tr);
  b.onclick=()=>{
   selected=id;const body=el('div','',{id:'detail-body'});d.querySelector('#detail').replaceChildren(el('h2','Item Info',{style:'display:none'}),body);body.append(el('h2',localCatalog[id]));
   const loadList=()=>{ body.append(el('button','Newest'));
   for(let i=1;i<=20;i++){
    const row=el('li','',{class:'buy-row','data-sv':String(i-1),title:stamp});
    row.append(el('span','CH 1',{class:'ch-chip'}),el('span','FM1',{class:'buy-where'}),el('span','Likely still up',{class:'visually-hidden'}),el('span','',{class:'meso',title:'1,000 mesos'}));
    const view=el('button','View shop',{'data-sv-btn':String(i-1),'aria-label':`View shop: Seller${i}`});view.onclick=()=>{n=i;modal();};row.append(view);body.append(row);
   }
   };
   if(listDelay)setTimeout(loadList,listDelay);else loadList();
  };
 }
 w.GmsBatchCatalog=localCatalog;for(const file of ['reader-core.js','collector.js'])w.eval(fs.readFileSync(new URL('./extension/'+file,import.meta.url),'utf8'));
 return {dom,w,d};
}
test('three complete 40-shop DOM runs handle hidden headings and retained closed modals without AI',async()=>{
 const {dom,w}=mock();let previous;
 for(let i=0;i<3;i++){
  const r=await w.GmsCollector.collect({mode:'test',runId:crypto.randomUUID()});assert.equal(r.status,'completed',r.error);assert.equal(r.shops,40);assert.equal(r.rows.length,40);assert.equal(r.aiCalls,0);
  const rows=JSON.parse(JSON.stringify(r.rows));if(previous)assert.deepEqual(rows,previous);previous=rows;
 }
 dom.window.close();
});
test('cancel and verification interstitial leave no partially uploadable batch',async()=>{
 const {dom,w,d}=mock();let cancel=false;
 const r=await w.GmsCollector.collect({mode:'test',runId:crypto.randomUUID()},async p=>{if(p.shops>=5)cancel=true;},()=>cancel);
 assert.equal(r.status,'cancelled');assert.equal(r.rows.length,0);assert.equal(d.querySelector('#sv-back').hidden,true);
 d.title='Just a moment…';const blocked=await w.GmsCollector.collect({mode:'test',runId:crypto.randomUUID()});assert.equal(blocked.status,'failed');assert.equal(blocked.shops,0);dom.window.close();
});
test('waits for asynchronous shop controls after the item heading becomes visible',async()=>{
 const {dom,w}=mock(2,30);
 const r=await w.GmsCollector.collect({mode:'test',runId:crypto.randomUUID()});
 assert.equal(r.status,'completed',r.error);assert.equal(r.shops,40);assert.equal(r.rows.length,40);dom.window.close();
});
test('production collection stops at 500 unique rows and the next run rotates its starting item',async()=>{
 const {dom,w}=mock(30);
 const first=await w.GmsCollector.collect({mode:'production',runId:crypto.randomUUID(),cursor:0});
 assert.equal(first.status,'completed',first.error);assert.equal(first.rows.length,500);assert.equal(first.shops,500);assert.equal(first.nextCursor,25);
 const next=await w.GmsCollector.collect({mode:'production',runId:crypto.randomUUID(),cursor:first.nextCursor});
 assert.equal(next.rows.length,500);assert.notEqual(next.queue[0].id,first.queue[0].id);assert.equal(next.nextCursor,20);dom.window.close();
});
test('periodic reader accepts a recent previous-day observation around New Year',()=>{
 const shop=reader.readShop(new JSDOM(fixture.html).window.document,'2027-01-01T15:05:00Z');
 const target=shop.listingRows.find(x=>x.index===String(Number(/^Shop (\d+)/.exec(shop.step)[1])-1));
 shop.capturedAt='2026-12-31T15:05:00Z';target.title='seen 12월 31일 오후 11:59';
 const result=reader.validate(shop,catalog);assert.equal(result.ok,true);assert.equal(result.row.seen,'2026-12-31 14:59:00');
});
