import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionStatusView} from '../assets/collection-status.js';
const now=Date.parse('2026-11-10T03:00:00Z');
test('ten-minute ingest limit is not rounded to an hour or used as a ninety-minute freshness window',()=>{
  const s={lastSuccessAt:new Date(now-14*60000).toISOString(),intervalSeconds:600};
  const recent=collectionStatusView(s,'ko',now);
  assert.equal(recent.state,'recent');assert.match(recent.description,/최소 10분 간격/);
  const delayed=collectionStatusView(s,'ko',now+2*60000);
  assert.equal(delayed.state,'delayed');assert.equal(delayed.title,'정기 시세 수집 지연');
  assert.match(collectionStatusView(s,'en',now).description,/Minimum interval 10m/);
  assert.match(collectionStatusView({...s,intervalSeconds:5400},'ko',now).description,/최소 90분 간격/);
  assert.match(collectionStatusView({...s,intervalSeconds:-1},'ko',now).description,/최소 1시간 간격/);
});
test('only an actual recent ingest is presented as received, never the page refresh time',()=>{
  assert.equal(collectionStatusView({lastSuccessAt:new Date(now-3600000).toISOString(),intervalSeconds:3600},'ko',now).state,'recent');
  assert.equal(collectionStatusView({state:'recent',lastSuccessAt:new Date(now-7200000).toISOString(),asOf:new Date(now).toISOString(),intervalSeconds:3600},'ko',now).state,'delayed');
  assert.equal(collectionStatusView({lastSuccessAt:null,intervalSeconds:3600},'ko',now).state,'waiting');
});
test('quota waiting and paused collection stay explicit even with a recent receipt',()=>{
  const s={lastSuccessAt:new Date(now-1000).toISOString(),nextEligibleAt:new Date(now+3600000).toISOString(),intervalSeconds:3600};
  const view=collectionStatusView({...s,state:'budget_wait'},'ko',now);
  assert.equal(view.state,'budget_wait');assert.match(view.description,/이후 수집 가능/);
  assert.equal(collectionStatusView({...s,state:'paused'},'en',now).title,'Collection paused');
});
