import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { handleMarketBatch } from '../worker/src/market-batch.js';
const iso = t => new Date(t).toISOString();
const seen = t => iso(t).slice(0,19).replace('T',' ');
function environment() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['schema.sql','migrations/0001_market_batch.sql','migrations/0002_listing_history.sql']) sqlite.exec(fs.readFileSync(new URL('../worker/'+file,import.meta.url),'utf8'));
  const DB = { failAt: null, prepare(sql,args=[]) { return { bind(...a) { return DB.prepare(sql,a); }, async first() { return sqlite.prepare(sql).get(...args)||null; }, async all() { return {results:sqlite.prepare(sql).all(...args)}; }, async run() { if (DB.failAt && sql.includes(DB.failAt)) throw Error('test failure'); return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}; } }; }, async batch(stmts) {
    sqlite.exec('BEGIN'); try { const out=[]; for (const s of stmts) out.push(await s.run()); sqlite.exec('COMMIT'); return out; } catch(e) { sqlite.exec('ROLLBACK'); throw e; }
  }};
  return {DB,sqlite,MARKET_BATCH_TOKEN:'test-token',MARKET_BATCH_MIN_INTERVAL_SECONDS:'0'};
}
const known = async()=>new Set([2040801]);
const batch = (count=1) => { const now=Date.now()-1000; return {runId:crypto.randomUUID(),world:'Windia',startedAt:iso(now-60000),finishedAt:iso(now),shops:count,rows:Array.from({length:count},(_,i)=>({item:2040801,price:1000+i,qty:1,sold:false,seller:'Seller',channel:1,room:1,seen:seen(now-120000)}))}; };
async function post(env,body,token='test-token') { const r=await handleMarketBatch(new Request('https://test/internal/market-batch',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(body)}),env,known); return {status:r.status,data:await r.json()}; }
const count = (e,t)=>e.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
test('500-row transaction, exact replay and later run do not inflate listings or observations',async()=>{
 const e=environment(), b=batch(500);
 assert.equal((await post(e,b,'bad')).status,401); assert.equal(count(e,'listings'),0);
 const first=await post(e,b); assert.equal(first.status,200); assert.equal(first.data.observationsAdded,500);
 const replay=await post(e,b); assert.equal(replay.data.duplicate,true); assert.equal(replay.data.listingsChanged,0);
 const again=await post(e,{...b,runId:crypto.randomUUID()}); assert.equal(again.data.observationsAdded,0); assert.equal(again.data.listingsChanged,0);
 assert.equal(count(e,'listings'),500); assert.equal(count(e,'listing_history'),500); assert.equal(count(e,'market_observations'),0); assert.equal(count(e,'market_batch_runs'),2);
 const mutated=structuredClone(b); mutated.rows[0].price++; assert.equal((await post(e,mutated)).status,409);
});
test('new observations advance last_seen, preserve first_seen and sold state; old observations cannot regress',async()=>{
 const e=environment(), b=batch(); await post(e,b); const original=b.rows[0].seen;
 e.sqlite.exec('UPDATE listings SET sold=1,qty=7');
 const newer=structuredClone(b); newer.runId=crypto.randomUUID(); newer.rows[0].seen=seen(Date.parse(b.finishedAt)-1000);
 await post(e,newer); let row=e.sqlite.prepare('SELECT * FROM listings').get();
 assert.equal(row.first_seen,original); assert.equal(row.last_seen,newer.rows[0].seen); assert.equal(row.sold,1); assert.equal(row.qty,7);
 await post(e,{...b,runId:crypto.randomUUID()}); row=e.sqlite.prepare('SELECT * FROM listings').get(); assert.equal(row.last_seen,newer.rows[0].seen);
 assert.equal(count(e,'market_observations'),0); assert.equal(count(e,'listing_history'),3);
});
test('invalid, stale, future, duplicated rows and malformed dates reject the entire batch',async()=>{
 const e=environment(); const changes=[b=>b.rows[0].item=9999999,b=>b.rows[0].qty=2,b=>b.rows[0].sold=true,b=>b.rows[0].room=0,b=>b.rows[0].seen='2026-02-30 00:00:00',b=>b.rows[0].seen=seen(Date.now()+3600000),b=>b.rows[0].seen=seen(Date.now()-4*3600000),b=>{b.rows.push({...b.rows[0]});b.shops=2;}];
 for(const change of changes){ const b=batch();change(b);assert.equal((await post(e,b)).status,400); }
 assert.equal(count(e,'listings'),0);assert.equal(count(e,'market_batch_runs'),0);
});
test('mid-transaction database failure rolls back receipt and listings, then a retry succeeds',async()=>{
 const e=environment(), b=batch(10); e.DB.failAt='INTO listings';
 assert.equal((await post(e,b)).status,503); for(const t of ['listings','listing_history','market_observations','market_batch_runs'])assert.equal(count(e,t),0);
 e.DB.failAt=null; assert.equal((await post(e,b)).data.observationsAdded,10);
});

test('paused ingestion preserves exact replays but rejects any new run without writing',async()=>{
 const e=environment(),b=batch();await post(e,b);e.MARKET_BATCH_PAUSED='true';
 assert.equal((await post(e,b)).data.duplicate,true);
 const before=e.sqlite.prepare('SELECT total_changes() AS n').get().n;
 assert.equal((await post(e,{...b,runId:crypto.randomUUID()})).status,423);
 assert.equal(e.sqlite.prepare('SELECT total_changes() AS n').get().n,before);
});
test('daily batch row budget rejects overflow atomically and resets on the next UTC day',async()=>{
 const e=environment();e.MARKET_BATCH_DAILY_ROWS='500';const b=batch(500);
 assert.equal((await post(e,b)).status,200);
 const before=e.sqlite.prepare('SELECT total_changes() AS n').get().n;
 assert.equal((await post(e,batch())).status,429);assert.equal(e.sqlite.prepare('SELECT total_changes() AS n').get().n,before);
 e.sqlite.exec("UPDATE market_batch_runs SET received_at=datetime('now','-1 day')");
 assert.equal((await post(e,batch())).status,200);
});
test('six-hour server interval is enforced even if a client still uses a 15-minute alarm',async()=>{
 const e=environment();delete e.MARKET_BATCH_MIN_INTERVAL_SECONDS;
 assert.equal((await post(e,batch())).status,200);assert.equal((await post(e,batch())).status,429);
 e.sqlite.exec("UPDATE market_batch_runs SET received_at=datetime('now','-6 hours','-1 second')");
 assert.equal((await post(e,batch())).status,200);
});
test('transaction guard denies a concurrent run that filled the budget after the preliminary read',async()=>{
 const e=environment();e.MARKET_BATCH_DAILY_ROWS='1';const original=e.DB.batch;
 e.DB.batch=async stmts=>{e.sqlite.exec("INSERT INTO market_batch_runs(run_id,payload_hash,started_at,finished_at,shops,accepted) VALUES('concurrent','hash','start','finish',1,1)");return original(stmts);};
 assert.equal((await post(e,batch())).status,429);assert.equal(count(e,'listings'),0);assert.equal(count(e,'listing_history'),0);assert.equal(count(e,'market_batch_runs'),1);
});
test('duplicate observations do not write the legacy archive or the autoincrement sequence',async()=>{
 const e=environment(),b=batch(10);await post(e,b);
 const sequence=e.sqlite.prepare("SELECT seq FROM sqlite_sequence WHERE name='listings'").get().seq;
 const result=await post(e,{...b,runId:crypto.randomUUID()});
 assert.equal(result.data.historyStorage,'listing_history');assert.equal(result.data.observationsAdded,0);
 assert.equal(e.sqlite.prepare("SELECT seq FROM sqlite_sequence WHERE name='listings'").get().seq,sequence);
 assert.equal(count(e,'market_observations'),0);assert.equal(count(e,'listing_history'),10);
});
