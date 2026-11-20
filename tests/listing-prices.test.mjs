import test from 'node:test';
import assert from 'node:assert/strict';
import { listingPriceBand, priceBadge, refreshListingPriceBadges } from '../assets/listing-price.js';
import { bindListingClicks } from '../assets/listing-clicks.js';
const now = Date.parse('2026-11-20T05:00:00Z');
const row = { item: 2040801, price: 900, seen: '2026-11-20 04:50:00' };
const ref = { asOf: '2026-11-20T04:40:00Z', items: [{ item: 2040801, median: 1000, open: 5, shops: 2 }] };
test('price labels use inclusive 10% boundaries and omit normal prices', () => {
  for (const [price, band] of [[899,'cheap'],[900,'cheap'],[901,'typical'],[1099,'typical'],[1100,'expensive']]) assert.equal(listingPriceBand({...row,price},ref,now),band);
  assert.equal(priceBadge('typical'), ''); assert.equal(priceBadge('unrated'), '');
  assert.match(priceBadge('cheap'), /낮음/); assert.match(priceBadge('expensive'), /높음/);
  assert.match(priceBadge('expensive',false), /High price/);
});
test('fresh references update existing listing badges and tracking without replacing row contents', () => {
  const seen = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const rows = [{...row, seen}, {...row, seen, price: 1100}, {...row, seen, item:1472001}];
  const fresh = {...ref, asOf: new Date().toISOString()};
  const elements = rows.map(() => {
    let html = '';
    const slot = {
      querySelector: () => html ? {remove: () => { html = ''; }} : null,
      insertAdjacentHTML: (where, badge) => { assert.equal(where, 'beforeend'); html += badge; },
    };
    return {dataset:{}, querySelector: () => slot, html: () => html};
  });
  const root = {querySelectorAll: () => elements};
  refreshListingPriceBadges(root, rows, null);
  assert.deepEqual(elements.map(e => e.html()), ['', '', '']);
  refreshListingPriceBadges(root, rows, fresh);
  assert.deepEqual(elements.map(e => e.dataset.priceBand), ['cheap', 'expensive', 'unrated']);
  assert.match(elements[0].html(), /낮음/); assert.match(elements[1].html(), /높음/);
  assert.equal(elements[2].html(), '', 'never add a placeholder for excluded gear');
  refreshListingPriceBadges(root, rows, fresh);
  assert.equal((elements[0].html().match(/<span/g) || []).length, 1);
  refreshListingPriceBadges(root, rows, {...fresh, asOf:'2000-01-01T00:00:00Z'});
  assert.deepEqual(elements.map(e => e.html()), ['', '', ''], 'expired comparisons disappear');
});
test('unsafe comparisons are unrated instead of misleading bargains', () => {
  for (const change of [{sold:1},{goneN:1},{opts:{}},{item:1472001},{price:0},{price:NaN},{seen:'invalid'},{seen:'2026-11-19 04:59:59'},{seen:'2026-11-20 05:01:00'}]) assert.equal(listingPriceBand({...row,...change},ref,now),'unrated');
  for(const change of [{open:4},{shops:1},{median:0},{median:null},{item:2040802}]) assert.equal(listingPriceBand(row,{...ref,items:[{...ref.items[0],...change}]},now),'unrated');
  for(const asOf of ['invalid','2026-11-20T04:34:59Z','2026-11-20T05:02:00Z']) assert.equal(listingPriceBand(row,{...ref,asOf},now),'unrated');
  assert.equal(listingPriceBand(row,null,now),'unrated');
});
test('real item clicks count once each, including repeats and middle/modifier clicks; controls and renders do not', () => {
  const callbacks={}, events=[];
  const metadata={dataset:{priceBand:'cheap',itemList:'market_listings'}};
  const a={dataset:{item:'2040801'},matches:s=>s==='a[data-item]',closest:()=>metadata};
  const tr={querySelector:()=>a};
  const target={closest:s=>s==='a,button,input,select,label,summary'?a:tr};
  const root={contains:el=>el===a,addEventListener:(type,fn)=>callbacks[type]=fn};
  bindListingClicks(root,{selector:'a[data-item]',rowSelector:'tr',idKey:'item',name:()=> '장갑 공격력 주문서 60%',list:'market_catalog'},(name,p)=>events.push({name,...p}));
  assert.equal(events.length,0);
  callbacks.click({type:'click',button:0,target});
  callbacks.click({type:'click',button:0,target,ctrlKey:true});
  callbacks.auxclick({type:'auxclick',button:1,target});
  callbacks.auxclick({type:'auxclick',button:2,target});
  callbacks.click({type:'click',button:0,target:{closest:()=>({matches:()=>false})}});
  assert.equal(events.length,3);
  assert.equal(events[0].name,'select_item'); assert.equal(events[0].items.length,1);
  assert.equal(events[0].items[0].quantity,1); assert.equal(events[0].items[0].item_id,'2040801');
  assert.equal(events[0].items[0].item_category,'cheap');
  assert.equal(events[0].item_list_id,'market_listings');
  callbacks.click({type:'click',button:0,target:{closest:s=>s==='tr'?tr:null}});
  assert.equal(events.length,4,'row click opens and counts the item');
  callbacks.auxclick({type:'auxclick',button:1,target:{closest:s=>s==='tr'?tr:null}});
  callbacks.click({type:'click',button:0,ctrlKey:true,target:{closest:s=>s==='tr'?tr:null}});
  assert.equal(events.length,4,'modified clicks on row whitespace do not navigate');
});
