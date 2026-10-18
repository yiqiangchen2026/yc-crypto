// Persistent scan baselines stay here; external I/O runs in Queue Workers.
// These storage-only RPCs do not keep the object alive for the scan duration.
export class MonitorStateStorage {
  constructor(storage) { this.storage = storage; }
  async initialize(seed) {
    if (await this.storage.get('migration-version')) return false;
    if (!seed || typeof seed !== 'object' || !seed['xstock-discount-monitor-v1']) throw Error('Monitor state requires migration');
    await this.storage.put({...seed,'migration-version':1});
    return true;
  }
  async ready() {
    if (!await this.storage.get('migration-version')) throw Error('Monitor state requires migration');
  }
  async get(key) { await this.ready(); return await this.storage.get(key) ?? null; }
  async getMany(keys) {
    if (!Array.isArray(keys) || !keys.length || keys.length>32 || keys.some(k=>typeof k!=='string')) throw Error('Invalid state keys');
    await this.ready(); const values=await this.storage.get(keys);
    return keys.map(key=>values.get(key)??null);
  }
  async putMany(values) {
    if (!values || typeof values!=='object' || Array.isArray(values) || !Object.keys(values).length || Object.keys(values).length>32) throw Error('Invalid state values');
    await this.ready(); await this.storage.put(values);
  }
  async put(key,value) { await this.ready(); await this.storage.put(key,value); }
  async recordScan(now,success,slot) {
    await this.ready();
    const previous = JSON.parse(await this.storage.get('stock-scan-run-v1') || '{}');
    const row = {id:1,last_attempt_at:now,last_success_at:success?now:previous.last_success_at??null,
      last_error_at:success?previous.last_error_at??null:now,last_error:success?null:'本轮扫描失败，等待下一轮',
      run_count:(previous.run_count || 0)+1,last_slot:Math.max(previous.last_slot || 0,success?slot:0)};
    await this.storage.put('stock-scan-run-v1',JSON.stringify(row));
    return row;
  }
}
