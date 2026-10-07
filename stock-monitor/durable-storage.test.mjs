import test from 'node:test';
import assert from 'node:assert/strict';
import { MonitorStateStorage } from './durable-storage.mjs';
import worker, { processScan } from './worker.mjs';
import { processUsdgScan } from '../usdg-monitor/worker.mjs';
import { monitorStore, STATE_KEY } from './storage.mjs';
function setup() {
  const values=new Map();
  const storage={get:async key=>values.get(key),put:async(key,value)=>{
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
