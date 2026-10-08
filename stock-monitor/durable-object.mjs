import { DurableObject } from 'cloudflare:workers';
import { MonitorStateStorage } from './durable-storage.mjs';
import { SerialScan } from './serial-scan.mjs';
import { processQueuedScan } from './worker.mjs';
export class MonitorState extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);
    this.store = new MonitorStateStorage(ctx.storage);
    // Local methods keep scan state in this same object without self-RPC.
    const runtime = { ...env, MONITOR_STATE: { idFromName: () => null, get: () => this } };
    this.scans = new SerialScan(job => processQueuedScan(runtime, job));
  }
  async get(key) { return await this.store.get(key); }
  async put(key,value) { return await this.store.put(key,value); }
  async recordScan(now,success,slot) { return await this.store.recordScan(now,success,slot); }
  async scan(job) { return await this.scans.run(job); }
}
