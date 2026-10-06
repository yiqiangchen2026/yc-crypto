import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, { processScan } from './worker.mjs';
import { STATE_KEY,stateStore,publicSnapshot } from './storage.mjs';
import { XSTOCKS, nextSignalState } from './core.mjs';
function setup() {
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('./migrations/0001_state.sql',import.meta.url),'utf8'));
 const adapter={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return db.prepare(sql).run(...args);}};}};
 return {db,env:{STOCK_DB:adapter,SCAN_ENABLED:'true',XSTOCK_PUBLIC_ALERTS_ENABLED:'true',SITE_ORIGIN:'https://yc-crypto.pages.dev'}};
}
test('stock state migration preserves multipliers, confirmations and hard cooldown',async()=>{
 const {db,env}=setup();const now=Date.now();const pair=XSTOCKS[0].pair;
 const old={updatedAt:now,referenceSource:'yahoo',multipliers:{HKEXCx:{value:1,updatedAt:now}},signals:{[pair]:{streak:4,confirmedSince:now-540000,lastAlertAt:now-180000,lastAlertDiscount:.025,lastDiscount:.025,active:true,armed:false}},priceRows:[{pair,symbol:'HKEXCx',roughDiscount:.028}]};
 await stateStore(env.STOCK_DB).put(STATE_KEY,JSON.stringify(old));
 const restored=await stateStore(env.STOCK_DB).get(STATE_KEY,'json');assert.deepEqual(restored,old);
 const next=nextSignalState(restored,[{pair,executableDiscount:.033,effectivePrice:10}],now,{confirmations:2,confirmationMs:180000,alertCooldownMs:5400000,alertThreshold:.02,resetThreshold:.018});
 assert.equal(next.alerts.length,0);assert.equal(next.signals[pair].streak,5);
 const data=publicSnapshot(restored,true);assert.equal(data.rows.length,1);assert.equal(data.signals,undefined);assert.equal(data.multipliers,undefined);db.close();
});
test('serial scan rejects disabled, expired and duplicate cron slots without API calls',async()=>{
 const {db,env}=setup();const now=Date.now();let runs=0;
 const run=async()=>{runs++;return {ok:true};};
 assert.equal((await processScan({...env,SCAN_ENABLED:'false'},now,now,run)).skipped,'disabled');
 assert.equal((await processScan(env,now-400000,now,run)).skipped,'expired');
 assert.equal((await processScan(env,now+120000,now,run)).skipped,'expired');
 await processScan(env,now,now,run);assert.equal(runs,1);
 assert.equal((await processScan(env,now,now+1000,run)).skipped,'duplicate');assert.equal(runs,1);
 const response=await worker.fetch(new Request('https://stock.test/health'),env);
 const health=await response.json();assert.equal(health.runCount,1);assert.equal(health.lastSuccessAt,now);db.close();
});
test('failed delivery remains retryable and never exposes raw errors through health',async()=>{
 const {db,env}=setup();const now=Date.now();let sends=0;
 env.NOTIFIER={send:async()=>{sends++;throw Error('private credential');}};
 await assert.rejects(processScan(env,now,now,async(_,__,notify)=>{await notify('test');}),/private credential/);
 assert.equal(sends,1);
 const health=await (await worker.fetch(new Request('https://stock.test/health'),env)).json();
 assert.ok(health.error);assert.equal(health.lastSuccessAt,null);assert.ok(!JSON.stringify(health).includes('private'));
 await processScan(env,now,now+1,async()=>({ok:true}));
 const row=await env.STOCK_DB.prepare('SELECT * FROM scan_runs WHERE id=1').first();assert.equal(row.last_error,null);db.close();
});
test('public stock API is read-only and omits migrated internal state',async()=>{
 const {db,env}=setup();const store=stateStore(env.STOCK_DB);
 assert.equal((await worker.fetch(new Request('https://stock.test/snapshot'),env)).status,503);
 await store.put(STATE_KEY,JSON.stringify({updatedAt:123,amountUsd:500,priceRows:[{symbol:'AAPLx',secret:'hidden'}],signals:{private:true}}));
 const r=await worker.fetch(new Request('https://stock.test/snapshot'),env);assert.equal(r.status,200);
 assert.deepEqual((await r.json()).rows,[{symbol:'AAPLx'}]);
 assert.equal((await worker.fetch(new Request('https://stock.test/admin/scan',{method:'POST'}),env)).status,404);db.close();
});

test('minute heartbeat schedules scans only every three minutes and reports successful cron delivery',async()=>{
 const {db,env}=setup();let sent=[],pending=[];
 env.SCAN_QUEUE={send:async job=>sent.push(job)};
 const ctx={waitUntil:promise=>pending.push(promise)};
 await worker.scheduled({scheduledTime:Date.parse('2026-10-06T10:21:00Z')},env,ctx);
 await Promise.all(pending);assert.equal(sent.length,1);
 await worker.scheduled({scheduledTime:Date.parse('2026-10-06T10:22:00Z')},env,ctx);
 assert.equal(sent.length,1);
 const health=await (await worker.fetch(new Request('https://stock.test/health'),env)).json();
 assert.ok(health.lastCronAt);db.close();
});
