// This small state store has its own Durable Objects free allowance.
// No timers or external I/O keep the object alive between state operations.
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
