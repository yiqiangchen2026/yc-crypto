import test from 'node:test';
import assert from 'node:assert/strict';
import { MonitorStateStorage } from './durable-storage.mjs';
import worker, { processScan } from './worker.mjs';
import { processUsdgScan } from '../usdg-monitor/worker.mjs';
import { monitorStore, STATE_KEY } from './storage.mjs';
function setup() {
  const values=new Map();
  const storage={get:async key=>Array.isArray(key)?new Map(key.filter(k=>values.has(k)).map(k=>[k,values.get(k)])):values.get(key),put:async(key,value)=>{
    if(typeof key==='object')for(const [k,v] of Object.entries(key))values.set(k,v);
    else values.set(key,value);
  }};
  const object=new MonitorStateStorage(storage);
  const env={STATE_STORAGE:'durable-object',MONITOR_STATE:{idFromName:name=>name,get:()=>object},
    STOCK_DB:{prepare(){throw Error('D1 must not be called');}},SCAN_ENABLED:'true',USDG_SCAN_ENABLED:'true',
    XSTOCK_PUBLIC_ALERTS_ENABLED:'true',SITE_ORIGIN:'https://yc-crypto.pages.dev'};
  return {object,env,values};
}
const seed={ [STATE_KEY]:JSON.stringify({updatedAt:123,priceRows:[{symbol:'AAPLx'}],multipliers:{AAPLx:1},signals:{cooldown:true}}),
  'stock-scan-run-v1':JSON.stringify({last_slot:0,run_count:12,last_success_at:123}),
  'usdg-usdc-quote-alert-v2':JSON.stringify({armed:false,lastAlertAt:123}) };
test('migration is required and repeated initialization cannot overwrite live cooldowns',async()=>{
  const {object,env}=setup();await assert.rejects(object.get(STATE_KEY),/requires migration/);
  await object.initialize(seed);
  const store=monitorStore(env);assert.deepEqual(await store.get(STATE_KEY,'json'),JSON.parse(seed[STATE_KEY]));
  await store.put(STATE_KEY,JSON.stringify({live:true}));
  assert.equal(await object.initialize(seed),false);
  assert.deepEqual(await store.get(STATE_KEY,'json'),{live:true});
  assert.equal(await store.get('missing','json'),null);
});
test('stock and USDG scans, health and snapshots work without any D1 access',async()=>{
  const {object,env}=setup();await object.initialize(seed);const now=Date.now();
  await processScan(env,now,now,async()=>({ok:true}));
  assert.equal((await processScan(env,now,now,async()=>assert.fail('duplicate'))).skipped,'duplicate');
  const health=await (await worker.fetch(new Request('https://test/health'),env)).json();
  assert.equal(health.runCount,13);assert.equal(health.lastSuccessAt,now);
  const snapshot=await (await worker.fetch(new Request('https://test/snapshot'),env)).json();
  assert.deepEqual(snapshot.rows,[{symbol:'AAPLx'}]);assert.equal(snapshot.signals,undefined);
  await processUsdgScan(env,now,now,async()=>({checkedAt:now,grossEdgeRate:0.001,private:'hidden'}));
  const usdg=await (await worker.fetch(new Request('https://test/usdg/snapshot'),env)).json();
  assert.equal(usdg.updatedAt,now);assert.equal(usdg.quote.private,undefined);
  assert.deepEqual(await monitorStore(env).get('usdg-usdc-quote-alert-v2','json'),{armed:false,lastAlertAt:123});
});
test('failed durable scan preserves last success and remains retryable',async()=>{
  const {object,env}=setup();await object.initialize(seed);const now=Date.now();
  await assert.rejects(processScan(env,now,now,async()=>{throw Error('secret');}),/secret/);
  const failed=JSON.parse(await object.get('stock-scan-run-v1'));
  assert.equal(failed.last_success_at,123);assert.equal(failed.last_slot,0);assert.ok(!failed.last_error.includes('secret'));
  await processScan(env,now,now+1,async()=>({ok:true}));
  const success=JSON.parse(await object.get('stock-scan-run-v1'));
  assert.equal(success.last_error,null);assert.equal(success.last_success_at,now+1);
});

test('public requests use one batched RPC and the next request observes changed channel controls',async()=>{
 const {object,env,values}=setup();await object.initialize(seed);
 for(const [k,v]of Object.entries({'channel-notifications-stocks-v1':'true','channel-notifications-volume-v1':'true','channel-notifications-xlayerVolume-v1':'false','usdg-scan-run-v1':'{}','usdg-public-snapshot-v1':'{"updatedAt":123,"quote":{}}','xlayer-volume-v1':'{"rows":[]}'}))values.set(k,v);
 const calls=[];env.MONITOR_STATE.get=()=>new Proxy(object,{get:(target,key)=>typeof target[key]==='function'?(...args)=>{calls.push(key);return target[key](...args)}:target[key]});
 for(const path of ['/health','/snapshot','/usdg/health','/usdg/snapshot','/xlayer-volume/snapshot']){
  calls.length=0;assert.equal((await worker.fetch(new Request('https://test'+path),env)).status,200);assert.deepEqual(calls,['getMany'],path);
 }
 values.set('channel-notifications-stocks-v1','false');
 assert.equal((await(await worker.fetch(new Request('https://test/health'),env)).json()).notificationsEnabled,false);
 assert.equal(env.MONITOR_READS,undefined);
 values.set(STATE_KEY,'corrupt');assert.equal((await worker.fetch(new Request('https://test/snapshot'),env)).status,503);
});
test('USDG final snapshot and run status are committed by one batch; migrated alert state is preserved',async()=>{
 const {object,env,values}=setup();await object.initialize(seed);let batches=0;
 const put=object.putMany.bind(object);object.putMany=async v=>{batches++;assert.deepEqual(Object.keys(v).sort(),['usdg-public-snapshot-v1','usdg-scan-run-v1']);return put(v)};
 const at=Date.now();await processUsdgScan(env,at,at,async()=>({checkedAt:at,grossEdgeRate:.001}));assert.equal(batches,1);
 assert.equal(JSON.parse(values.get('usdg-scan-run-v1')).lastSlot,Math.floor(at/180000));assert.equal(JSON.parse(values.get('usdg-public-snapshot-v1')).updatedAt,at);
 assert.equal(values.get('usdg-usdc-quote-alert-v2'),seed['usdg-usdc-quote-alert-v2']);
});
