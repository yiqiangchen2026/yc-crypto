import { DurableObject } from 'cloudflare:workers';
import { MonitorStateStorage } from './durable-storage.mjs';
import { ScanLease } from './scan-lease.mjs';
export class MonitorState extends DurableObject {
 constructor(ctx,env) { super(ctx,env); this.store=new MonitorStateStorage(ctx.storage); this.lease=new ScanLease(ctx.storage); }
 async get(key) { return this.store.get(key); }
 async put(key,value) { return this.store.put(key,value); }
 async recordScan(now,success,slot) { return this.store.recordScan(now,success,slot); }
 async claimScan(job) { await this.store.ready(); return this.lease.claim(job); }
 async assertScan(token) { await this.lease.assert(token); return true; }
 async finishScan(token,success) { return this.lease.finish(token,success); }
 async putFenced(token,key,value) { return this.lease.write(token,()=>this.store.put(key,value)); }
 async recordScanFenced(token,now,success,slot) { return this.lease.write(token,()=>this.store.recordScan(now,success,slot)); }
}
