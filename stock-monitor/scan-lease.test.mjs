import test from 'node:test';
import assert from 'node:assert/strict';
import {ScanLease} from './scan-lease.mjs';
test('concurrent claims serialize all scan kinds, preserve slots and reject old owners after expiry',async()=>{
 let at=2000000;const data=new Map();const lease=new ScanLease({get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v))},()=>at);
 const job={kind:'stock-scan',requestedAt:at};
 const [first,second]=await Promise.all([lease.claim(job),lease.claim({...job,kind:'usdg-scan'})]);
 assert.ok(first.token);assert.equal(second.skipped,'busy');
 let writes=0;await lease.write(first.token,async()=>writes++);
 at+=17*60000;const next=await lease.claim({...job,requestedAt:at});assert.ok(next.token);
 await assert.rejects(lease.write(first.token,async()=>writes++),/lease lost/);assert.equal(writes,1);
 assert.equal(await lease.finish(first.token,true),false);await lease.assert(next.token);
 await lease.finish(next.token,true);assert.equal((await lease.claim({...job,requestedAt:at})).skipped,'duplicate');
 const other=await lease.claim({kind:'usdg-scan',requestedAt:at});assert.ok(other.token);
 await lease.finish(other.token,false);assert.ok((await lease.claim({kind:'usdg-scan',requestedAt:at})).token);
});
test('expired, future and unknown scans never acquire a lease',async()=>{
 const l=new ScanLease({get:async()=>null,put:()=>assert.fail('unexpected write')},()=>1000000);
 for(const job of [{kind:'stock-scan',requestedAt:0},{kind:'stock-scan',requestedAt:2000000},{kind:'other',requestedAt:1000000}])assert.equal((await l.claim(job)).skipped,'expired');
});
