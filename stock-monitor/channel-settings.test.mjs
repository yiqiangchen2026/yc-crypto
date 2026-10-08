import test from 'node:test';
import assert from 'node:assert/strict';
import {channelSettings,setChannelNotification} from './channel-settings.mjs';
import {processScan} from './worker.mjs';
function fixture() {
 const values=new Map();
 const stub={get:async key=>values.get(key)??null,put:async(k,v)=>values.set(k,v),recordScan:async()=>{}};
 return {values,env:{STATE_STORAGE:'durable-object',MONITOR_STATE:{idFromName:()=>'',get:()=>stub},SCAN_ENABLED:'true',XSTOCK_PUBLIC_ALERTS_ENABLED:'false'}};
}
test('channel defaults mute stocks; independent switches persist and reject invalid input',async()=>{
 const {env}=fixture();
 assert.deepEqual(await channelSettings(env),{stocks:false,volume:true});
 await setChannelNotification(env,'stocks',true);
 await setChannelNotification(env,'volume',false);
 assert.deepEqual(await channelSettings(env),{stocks:true,volume:false});
 await setChannelNotification(env,'stocks',false);
 assert.deepEqual(await channelSettings(env),{stocks:false,volume:false});
 await assert.rejects(setChannelNotification(env,'usdg',true));
 await assert.rejects(setChannelNotification(env,'stocks','true'));
});
test('muted stocks still scan, re-enable allows delivery, subsequent mute blocks next delivery',async()=>{
 const {env}=fixture(); let scans=0,sends=0;
 env.NOTIFIER={send:async()=>{sends++;}};
 const run=async(runtime,client,notify)=>{scans++;await notify('test');return {};};
 const now=Date.now();await processScan(env,now,now,run);
 assert.equal(scans,1);assert.equal(sends,0);
 await setChannelNotification(env,'stocks',true);
 await processScan(env,now,now,run);assert.equal(sends,1);
 await setChannelNotification(env,'stocks',false);
 await processScan(env,now,now,run);assert.equal(scans,3);assert.equal(sends,1);
});
