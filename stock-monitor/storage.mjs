export const STATE_KEY = 'xstock-discount-monitor-v1';
export function monitorStore(env) {
  if (env.STATE_STORAGE !== 'durable-object') return stateStore(env.STOCK_DB);
  const stub = env.MONITOR_STATE.get(env.MONITOR_STATE.idFromName('public-monitors-v1'));
  return {
    async get(key, type = 'text') {
      const value = await stub.get(key);
      return value == null ? null : type === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value) { await stub.put(key, value); }
  };
}
export async function scanRun(env) {
  if (env.STATE_STORAGE === 'durable-object') return await monitorStore(env).get('stock-scan-run-v1','json');
  return await env.STOCK_DB.prepare('SELECT * FROM scan_runs WHERE id=1').first();
}
export async function recordMonitorScan(env, now, success, slot) {
  if (env.STATE_STORAGE !== 'durable-object') return recordScan(env.STOCK_DB, now, success, slot);
  const stub = env.MONITOR_STATE.get(env.MONITOR_STATE.idFromName('public-monitors-v1'));
  return await stub.recordScan(now, success, slot);
}
export function stateStore(db) {
  return {
    async get(key, type = 'text') {
      const row = await db.prepare('SELECT value, expires_at FROM worker_state WHERE key=?').bind(key).first();
      if (!row || row.expires_at !== null && row.expires_at <= Math.floor(Date.now()/1000)) return null;
      return type === 'json' ? JSON.parse(row.value) : row.value;
    },
    async put(key, value) {
      await db.prepare(`INSERT INTO worker_state(key,value,expires_at) VALUES(?,?,NULL)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires_at=NULL`).bind(key,value).run();
    }
  };
}
const fields = ['pair','symbol','stable','yahoo','roughPrice','referencePrice','roughDiscount','marketTime',
  'referenceTime','quote','multiplier','currency','referenceSession','hkdPerUsd','amountUsd','effectivePrice',
  'executableDiscount','priceImpactPercent'];
export function publicSnapshot(state, enabled) {
  if (!state?.updatedAt || !Array.isArray(state.priceRows)) return null;
  const rows = state.priceRows.map(row => Object.fromEntries(fields.filter(key => row[key] !== undefined).map(key => [key,row[key]])));
  return { updatedAt:state.updatedAt,amountUsd:state.amountUsd,referenceCount:state.referenceCount,
    marketPriceCount:state.marketPriceCount,notificationsEnabled:enabled,rows };
}
export async function recordScan(db, now, success, slot) {
  await db.prepare(`INSERT INTO scan_runs(id,last_attempt_at,last_success_at,last_error_at,last_error,run_count,last_slot)
    VALUES(1,?,?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET
    last_attempt_at=excluded.last_attempt_at,
    last_success_at=COALESCE(excluded.last_success_at,scan_runs.last_success_at),
    last_error_at=COALESCE(excluded.last_error_at,scan_runs.last_error_at),
    last_error=excluded.last_error,run_count=scan_runs.run_count+1,
    last_slot=MAX(scan_runs.last_slot,excluded.last_slot)`)
    .bind(now,success?now:null,success?null:now,success?null:'本轮扫描失败，等待下一轮',success?slot:0).run();
}
