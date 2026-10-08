import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,TOKENS,scanVolume,VOLUME_KEY,publicVolume} from './xlayer-volume.mjs';
const now=Date.parse('2026-10-08T09:00:00Z');
const sample=t=>({chainIndex:'196',tokenContractAddress:t.address,time:String(now),volume5M:'50000',volume1H:'100000',volume4H:'150000',volume24H:'300000',txs5M:'20',txs1H:'40',liquidity:'100000'});
test('X Layer exact contracts, fresh metrics and four-hour baseline guard alerts',()=>{
 const t=TOKENS[0],d=sample(t);assert.equal(normalize(t,d,now).status,'strong');
 for(const patch of [{chainIndex:'1'},{tokenContractAddress:TOKENS[1].address},{time:String(now-13*60000)},{volume5M:''},{volume4H:null}])assert.throws(()=>normalize(t,{...d,...patch},now));
 assert.equal(normalize(t,{...d,volume4H:'10'},now).status,'inconsistent');
 const r=normalize(t,{...d,volume5M:'1000',volume1H:'100000',volume4H:'160000'},now);assert.equal(r.reason,'1h');assert.equal(r.multiple,5);
});
test('X Layer delivery failure retries, successful alerts cool down and errors preserve source time',async()=>{
 let saved,fail=true,sends=0;
 const env={STATE_STORAGE:'durable-object',MONITOR_STATE:{idFromName:()=>0,get:()=>({get:async()=>saved?JSON.stringify(saved):null,put:async(k,v)=>{if(k===VOLUME_KEY)saved=JSON.parse(v);}})},NOTIFIER:{sendVolume:async()=>{sends++;if(fail)throw Error('failed');}}};
 // Store also contains channel controls; default volume setting is enabled.
 const api=async()=>TOKENS.map(sample);
 await scanVolume(env,api,now);assert.equal(saved.notification,'error');assert.equal(saved.events.length,0);
 fail=false;await scanVolume(env,api,now+5*60000);assert.equal(saved.notification,'ok');assert.equal(saved.events.length,4);
 await scanVolume(env,api,now+10*60000);assert.equal(sends,2);
 const updated=saved.rows[0].updatedAt;await scanVolume(env,async()=>{throw Error('offline');},now+15*60000);assert.equal(saved.rows[0].updatedAt,updated);assert.equal(saved.rows[0].status,'error');assert.equal(publicVolume(saved).signals,undefined);
});

test('private X Layer signals keep retry and cooldown behavior',async()=>{
 const values=new Map([['channel-notifications-xlayerVolume-v1','false']]);let sends=0,fail=true;
 const env={STATE_STORAGE:'durable-object',MONITOR_STATE:{idFromName:()=>0,get:()=>({get:async k=>values.get(k)||null,put:async(k,v)=>values.set(k,v)})},NOTIFIER:{sendVolume:async(text,options)=>{assert.equal(options.private,true);sends++;if(fail)throw Error('offline');}}};
 await scanVolume(env,async()=>TOKENS.map(sample),now);
 assert.equal(JSON.parse(values.get(VOLUME_KEY)).notification,'error');
 fail=false;await scanVolume(env,async()=>TOKENS.map(sample),now+5*60000);
 assert.equal(JSON.parse(values.get(VOLUME_KEY)).events.length,4);
 await scanVolume(env,async()=>TOKENS.map(sample),now+10*60000);
 assert.equal(sends,2);
});
