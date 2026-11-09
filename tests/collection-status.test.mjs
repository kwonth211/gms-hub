import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionStatusView} from '../assets/collection-status.js';
const now=Date.parse('2026-11-10T03:00:00Z');
test('only an actual recent ingest is presented as received, never the page refresh time',()=>{
  assert.equal(collectionStatusView({lastSuccessAt:new Date(now-3600000).toISOString(),intervalSeconds:3600},'ko',now).state,'recent');
  assert.equal(collectionStatusView({state:'recent',lastSuccessAt:new Date(now-7200000).toISOString(),asOf:new Date(now).toISOString(),intervalSeconds:3600},'ko',now).state,'delayed');
  assert.equal(collectionStatusView({lastSuccessAt:null,intervalSeconds:3600},'ko',now).state,'waiting');
});
test('quota waiting and paused collection stay explicit even with a recent receipt',()=>{
  const s={lastSuccessAt:new Date(now-1000).toISOString(),nextEligibleAt:new Date(now+3600000).toISOString(),intervalSeconds:3600};
  const view=collectionStatusView({...s,state:'budget_wait'},'ko',now);
  assert.equal(view.state,'budget_wait');assert.match(view.description,/이후 재개 예정/);
  assert.equal(collectionStatusView({...s,state:'paused'},'en',now).title,'Collection paused');
});
