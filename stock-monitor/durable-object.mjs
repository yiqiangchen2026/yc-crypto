import { DurableObject } from 'cloudflare:workers';
import { MonitorStateStorage } from './durable-storage.mjs';
export class MonitorState extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);
    this.store = new MonitorStateStorage(ctx.storage);
  }
  async get(key) { return await this.store.get(key); }
  async put(key,value) { return await this.store.put(key,value); }
  async recordScan(now,success,slot) { return await this.store.recordScan(now,success,slot); }
}
