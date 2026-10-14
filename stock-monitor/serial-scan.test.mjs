import test from 'node:test';
import assert from 'node:assert/strict';
import { SerialScan } from './serial-scan.mjs';
import worker from './worker.mjs';

test('stock and USDG runs stay serial across awaits and recover from a failed invocation', async () => {
  const seen = []; let release, active = 0, peak = 0;
  const scans = new SerialScan(async job => {
    active++; peak = Math.max(peak, active); seen.push(job.kind);
    try {
      if (job.kind === 'stock-scan') await new Promise(resolve => { release = resolve; });
      if (job.kind === 'fail') throw Error('failure');
      return job.kind;
    } finally { active--; }
  });
  const first = scans.run({ kind: 'stock-scan' }), next = scans.run({ kind: 'usdg-scan' });
  while (!release) await Promise.resolve();
  assert.deepEqual(seen, ['stock-scan']); release(); await Promise.all([first, next]);
  assert.equal(peak, 1); assert.deepEqual(seen, ['stock-scan', 'usdg-scan']);
  await assert.rejects(scans.run({ kind: 'fail' }), /failure/);
  assert.equal(await scans.run({ kind: 'next' }), 'next');
});

test('durable storage cron sends work to Queue instead of executing scans in DO', async () => {
 const values=new Map(),calls=[],pending=[];
 const object={scan:()=>assert.fail('DO must never execute a scan'),get:async k=>values.get(k),put:async(k,v)=>values.set(k,v),
  claimScan:async()=>({skipped:'duplicate'})};
 const env={STATE_STORAGE:'durable-object',SCAN_ENABLED:'true',USDG_SCAN_ENABLED:'true',MONITOR_STATE:{idFromName:n=>n,get:()=>object},SCAN_QUEUE:{send:async j=>calls.push(j)}};
 for(const minute of [0,1,2,3,4,5]){await worker.scheduled({scheduledTime:Date.parse(`2026-10-08T10:0${minute}:00Z`)},env,{waitUntil:p=>pending.push(p)});await Promise.all(pending);}
 assert.deepEqual(calls.map(j=>j.kind),['stock-scan','usdg-scan','stock-scan','usdg-scan']);
 assert.ok(values.get('stock-cron-v1'));assert.ok(values.get('usdg-cron-v1'));
 let acked=false;await worker.queue({messages:[{body:calls[0],ack:()=>acked=true}]},env);assert.equal(acked,true);
});
test('busy scan lease defers the Queue message without acknowledging it',async()=>{
 let delay;const env={STATE_STORAGE:'durable-object',MONITOR_STATE:{idFromName:n=>n,get:()=>({claimScan:async()=>({skipped:'busy'})})}};
 await worker.queue({messages:[{body:{},ack:()=>assert.fail('busy message ack'),retry:o=>delay=o.delaySeconds}]},env);assert.equal(delay,30);
});
