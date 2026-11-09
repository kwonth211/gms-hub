import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('./extension/background.js',import.meta.url),'utf8');
function harness(shared={state:undefined,alarms:new Map(),tabs:new Map(),windows:new Map(),updates:[],fetches:[],status:200,now:Date.now()}) {
 const handlers={}; const event=name=>({addListener:fn=>handlers[name]=fn});
 const chrome={runtime:{id:'unit-extension',onMessage:event('message'),onStartup:event('startup'),onInstalled:event('installed')},
  storage:{local:{get:async()=>({state:structuredClone(shared.state)}),set:async({state})=>{shared.state=structuredClone(state);}}},
  alarms:{get:async name=>shared.alarms.get(name),create:async(name,info)=>shared.alarms.set(name,{...info,scheduledTime:info.when || shared.now+(info.delayInMinutes||info.periodInMinutes)*60000}),clear:async name=>shared.alarms.delete(name),onAlarm:event('alarm')},
  windows:{get:async id=>{if(!shared.windows.has(id))throw Error('no window');return shared.windows.get(id);},create:async info=>{const id=shared.windows.size+1,t={id:shared.tabs.size+1,url:info.url,windowId:id,active:true};shared.tabs.set(t.id,t);const win={...info,id,state:'normal',tabs:[t]};shared.windows.set(id,win);return win;}},
  tabs:{get:async id=>{if(!shared.tabs.has(id))throw Error('no tab');return shared.tabs.get(id);},update:async(id,info)=>{shared.updates.push({id,...info});Object.assign(shared.tabs.get(id),info);},reload:async()=>{},sendMessage:async()=>{}}};
 const context=vm.createContext({chrome,GMS_BATCH_CONFIG:{token:'unit-token-never-exposed'},importScripts:()=>{},crypto,Response,AbortSignal,
  setTimeout:fn=>setTimeout(fn,1),Date:class extends Date{static now(){return shared.now;}},fetch:async(url,options)=>{shared.fetches.push({url,options});return Response.json(shared.status===200?{ok:true,accepted:JSON.parse(options.body).rows.length,observationsAdded:1,listingsChanged:1}:{error:'test'}, {status:shared.status});}});
 vm.runInContext(source,context);
 const drain=async()=>{await vm.runInContext('serial',context);};
 const send=async(m,tabId=99)=>new Promise(resolve=>handlers.message(m,{id:'unit-extension',tab:{id:tabId,url:'https://meso.watch/?gms-batch=1'}},resolve));
 const alarm=async name=>{handlers.alarm({name});await drain();};
 return {shared,send,alarm,drain};
}
const report=run=>({runId:run.runId,world:'Windia',status:'completed',startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),shops:40,rows:[{item:2040801,price:1,qty:1,sold:false,seller:'Test',channel:1,room:1,seen:'2026-11-09 14:00:00'}],nextCursor:2});
test('three runs finish independently; overlap is blocked and test mode never uploads',async()=>{
 const h=harness();await h.drain();await h.send({type:'test3'});
 for(let i=0;i<3;i++){
  const run=h.shared.state.run;assert.ok(run);
  assert.equal((await h.send({type:'run'})).value.busy,true);
  assert.equal((await h.send({type:'ready'},run.tabId)).value.runId,run.runId);
  assert.equal((await h.send({type:'pace',runId:run.runId,ms:400},run.tabId)).ok,true);
  assert.equal((await h.send({type:'pace',runId:run.runId,ms:400},999)).ok,false);
  await h.send({type:'finish',report:report(run)},run.tabId);
 }
 assert.equal(h.shared.state.run,null);assert.equal(h.shared.state.history.length,3);assert.equal(h.shared.fetches.length,0);
 assert.equal(new Set(h.shared.state.history.map(x=>x.runId)).size,3);
 assert.equal(h.shared.windows.size,1);assert.equal([...h.shared.windows.values()][0].focused,false);
 assert.ok(h.shared.updates.every(x=>x.id===h.shared.state.workerTabId&&x.autoDiscardable===false));
});
test('15-minute alarm, durable outbox and retry survive a service-worker restart',async()=>{
 let h=harness();await h.drain();await h.send({type:'enable'});
 assert.equal(h.shared.alarms.get('gms-market-15m').periodInMinutes,15);
 await h.alarm('gms-market-15m');const run=h.shared.state.run;
 await h.send({type:'ready'},run.tabId);h.shared.status=503;
 await h.send({type:'finish',report:report(run)},run.tabId);
 assert.ok(h.shared.state.pending);const body=h.shared.state.pending.body;
 assert.equal((await h.send({type:'run'})).value.busy,true);
 h=harness(h.shared);await h.drain();h.shared.status=200;await h.alarm('gms-market-upload');
 assert.equal(h.shared.state.pending,null);assert.equal(h.shared.state.run,null);assert.equal(h.shared.state.lastReceipt.accepted,1);
 assert.equal(h.shared.fetches[1].options.body,body);assert.equal(h.shared.state.cursor,2);
 assert.ok(!JSON.stringify(h.shared.state).includes('unit-token-never-exposed'));
});
test('401 stops schedule without automatic retry; explicit retry recovers stored data',async()=>{
 const h=harness();await h.drain();await h.send({type:'enable'});await h.alarm('gms-market-15m');
 const run=h.shared.state.run;h.shared.status=401;await h.send({type:'finish',report:report(run)},run.tabId);
 assert.equal(h.shared.state.enabled,false);assert.equal(h.shared.state.pending.paused,true);assert.ok(!h.shared.alarms.has('gms-market-15m'));
 await h.alarm('gms-market-watchdog');await h.alarm('gms-market-upload');assert.equal(h.shared.fetches.length,1);
 h.shared.status=200;await h.send({type:'retry'});assert.equal(h.shared.state.pending,null);
});
test('missing collector tab times out, and restored schedule is recreated without overlapping collection',async()=>{
 let h=harness();await h.drain();await h.send({type:'enable'});h.shared.alarms.delete('gms-market-15m');
 h=harness(h.shared);await h.drain();assert.ok(h.shared.alarms.has('gms-market-15m'));
 await h.alarm('gms-market-15m');const id=h.shared.state.run.runId;await h.alarm('gms-market-15m');assert.equal(h.shared.state.run.runId,id);
 h.shared.now+=15*60000;await h.alarm('gms-market-watchdog');assert.equal(h.shared.state.run,null);assert.equal(h.shared.state.enabled,true);assert.ok(h.shared.state.retryAt>h.shared.now);
});
test('a minimized collector window pauses scheduling rather than taking over another window',async()=>{
 const h=harness();await h.drain();await h.send({type:'run'});const run=h.shared.state.run;
 await h.send({type:'ready'},run.tabId);await h.send({type:'finish',report:report(run)},run.tabId);
 h.shared.windows.get(h.shared.state.workerWindowId).state='minimized';await h.send({type:'enable'});await h.alarm('gms-market-15m');
 assert.equal(h.shared.state.enabled,false);assert.equal(h.shared.state.run,null);assert.equal(h.shared.windows.size,1);
});

test('collection timeout preserves schedule, backs off across worker restart and resets after a stored run',async()=>{
 let h=harness();await h.drain();await h.send({type:'enable'});await h.alarm('gms-market-15m');
 const fail=async()=>{const run=h.shared.state.run;await h.send({type:'finish',report:{...report(run),status:'failed',rows:[],errorCode:'LOAD_TIMEOUT',error:'Hat Accuracy Scroll: Intermediate 상점 목록'}},run.tabId);};
 await fail();assert.equal(h.shared.state.enabled,true);assert.equal(h.shared.state.retryAt,h.shared.now+5*60000);assert.equal(h.shared.fetches.length,0);
 assert.equal(h.shared.state.history[0].trigger,'alarm');assert.equal(h.shared.state.history[0].status,'retrying');
 await h.alarm('gms-market-15m');assert.equal(h.shared.state.run,null);
 h.shared.alarms.delete('gms-market-collect-retry');h=harness(h.shared);await h.drain();
 assert.equal(h.shared.alarms.get('gms-market-collect-retry').scheduledTime,h.shared.state.retryAt);
 h.shared.now=h.shared.state.retryAt;await h.alarm('gms-market-collect-retry');assert.equal(h.shared.state.run.trigger,'retry');
 await fail();assert.equal(h.shared.state.retryAt,h.shared.now+10*60000);
 h.shared.now=h.shared.state.retryAt;await h.alarm('gms-market-collect-retry');const run=h.shared.state.run;
 await h.send({type:'finish',report:report(run)},run.tabId);
 assert.equal(h.shared.state.collectionFailures,0);assert.equal(h.shared.state.retryAt,null);assert.equal(h.shared.state.enabled,true);assert.equal(h.shared.fetches.length,1);
});
test('access checks and explicit cancellation stop retries; disabling while waiting cannot resume collection',async()=>{
 for(const errorCode of ['ACCESS_REQUIRED','CANCELLED']){
  const h=harness();await h.drain();await h.send({type:'enable'});await h.alarm('gms-market-15m');const run=h.shared.state.run;
  await h.send({type:'finish',report:{...report(run),status:'failed',rows:[],errorCode,error:'stop'}},run.tabId);
  assert.equal(h.shared.state.enabled,false);assert.equal(h.shared.state.retryAt,null);
 }
 const h=harness();await h.drain();await h.send({type:'enable'});await h.alarm('gms-market-15m');h.shared.now+=100000;await h.alarm('gms-market-watchdog');
 await h.send({type:'disable'});h.shared.now+=3600000;await h.alarm('gms-market-collect-retry');await h.alarm('gms-market-15m');
 assert.equal(h.shared.state.run,null);assert.equal(h.shared.state.enabled,false);assert.ok(!h.shared.alarms.has('gms-market-collect-retry'));
});

test('repeated transient failures are capped at one retry per hour; a stale completion cannot upload',async()=>{
 const h=harness();await h.drain();await h.send({type:'enable'});await h.alarm('gms-market-15m');let old;
 for(let i=0;i<7;i++){
  const run=h.shared.state.run;old=run;
  await h.send({type:'finish',report:{...report(run),status:'failed',rows:[],errorCode:'NO_VALID_ROWS'}},run.tabId);
  const delay=(h.shared.state.retryAt-h.shared.now)/60000;assert.equal(delay,Math.min(60,5*2**i));
  h.shared.now=h.shared.state.retryAt;await h.alarm('gms-market-collect-retry');
 }
 assert.equal((await h.send({type:'finish',report:report(old)},old.tabId)).ok,false);assert.equal(h.shared.fetches.length,0);
 await h.send({type:'cancel'});assert.equal(h.shared.state.enabled,false);assert.equal(h.shared.state.retryAt,null);
});
test('a manual-only collection failure does not enable an unrequested schedule',async()=>{
 const h=harness();await h.drain();await h.send({type:'run'});const run=h.shared.state.run;
 await h.send({type:'finish',report:{...report(run),status:'failed',rows:[],errorCode:'LOAD_TIMEOUT'}},run.tabId);
 assert.equal(h.shared.state.enabled,false);assert.ok(!h.shared.alarms.has('gms-market-collect-retry'));
});
