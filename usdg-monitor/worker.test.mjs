import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../stock-monitor/worker.mjs';
import { stateStore } from '../stock-monitor/storage.mjs';
import { STATE_KEY } from './core.mjs';
import { processUsdgScan, SNAPSHOT_KEY } from './worker.mjs';
import { sendUsdgSignal } from '../monitor/stock-notifier.mjs';
function setup(){
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../stock-monitor/migrations/0001_state.sql',import.meta.url),'utf8'));
  const adapter={prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return db.prepare(sql).run(...args);}};}};
  return {db,env:{STOCK_DB:adapter,USDG_SCAN_ENABLED:'true',SITE_ORIGIN:'https://yc-crypto.pages.dev'}};
}
test('USDG migration preserves active and cooldown state; snapshots omit internal fields',async()=>{
  const {db,env}=setup();const store=stateStore(env.STOCK_DB),old={active:true,alertedAt:Date.now(),confirmingAt:123};
  await store.put(STATE_KEY,JSON.stringify(old));assert.deepEqual(await store.get(STATE_KEY,'json'),old);
  const now=Date.now();let runs=0;
  const run=async()=>{runs++;return {checkedAt:now,input:5000,output:5001,grossEdge:1,grossEdgeRate:.0002,secret:'hidden'};};
  await processUsdgScan(env,now,now,run);
  assert.equal((await processUsdgScan(env,now,now,run)).skipped,'duplicate');assert.equal(runs,1);
  assert.equal((await processUsdgScan(env,now-400000,now,run)).skipped,'expired');
  assert.equal((await processUsdgScan({...env,USDG_SCAN_ENABLED:'false'},now,now,run)).skipped,'disabled');
  const response=await worker.fetch(new Request('https://test/usdg/snapshot'),env);assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.quote.secret,undefined);assert.equal(data.active,undefined);assert.equal(data.quote.input,5000);
  assert.equal((await worker.fetch(new Request('https://test/usdg/snapshot',{method:'POST'}),env)).status,404);
  assert.deepEqual(await store.get(STATE_KEY,'json'),old);db.close();
});
test('failed USDG scan preserves last quote and sanitizes errors; retry succeeds',async()=>{
  const {db,env}=setup();const now=Date.now();await stateStore(env.STOCK_DB).put(SNAPSHOT_KEY,JSON.stringify({updatedAt:now-180000,quote:{input:5000,output:4999},threshold:.0001}));
  await assert.rejects(processUsdgScan(env,now,now,async()=>{throw Error('credential secret');}));
  const health=await (await worker.fetch(new Request('https://test/usdg/health'),env)).json();assert.ok(health.error);assert.ok(!JSON.stringify(health).includes('credential'));
  const snapshot=await (await worker.fetch(new Request('https://test/usdg/snapshot'),env)).json();assert.equal(snapshot.updatedAt,now-180000);assert.ok(snapshot.error);
  await processUsdgScan(env,now,now,async()=>({checkedAt:now,input:5000,output:5000,grossEdge:0,grossEdgeRate:0}));
  assert.equal((await (await worker.fetch(new Request('https://test/usdg/health'),env)).json()).error,null);db.close();
});
test('USDG scheduling uses offset minute slots without affecting stock cadence',async()=>{
  const {db,env}=setup();const jobs=[],pending=[];env.SCAN_QUEUE={send:async j=>jobs.push(j)};
  const ctx={waitUntil:p=>pending.push(p)};
  await worker.scheduled({scheduledTime:Date.parse('2026-10-06T10:22:00Z')},env,ctx);await Promise.all(pending);
  assert.deepEqual(jobs.map(j=>j.kind),['usdg-scan']);
  await worker.scheduled({scheduledTime:Date.parse('2026-10-06T10:23:00Z')},env,ctx);assert.equal(jobs.length,1);db.close();
});
test('USDG notifier has fixed destination, validates signal and rejects delivery failure',async()=>{
  const text='🔎 YC 链上信号｜USDG-USDC 候选价差\n测试\nhttps://yc-crypto.pages.dev/monitor/usdg/';
  const env={TG_BOT_TOKEN:'test',TG_CHANNEL_ID:'channel'};
  await sendUsdgSignal(env,text,async(_url,options)=>{assert.equal(JSON.parse(options.body).chat_id,'channel');return {ok:true,json:async()=>({ok:true})};});
  await assert.rejects(sendUsdgSignal(env,'arbitrary'),/Invalid/);
  await assert.rejects(sendUsdgSignal(env,text,async()=>({ok:false,json:async()=>({ok:false})})),/delivery failed/);
});
