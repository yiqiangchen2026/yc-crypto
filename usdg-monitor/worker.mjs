import { runUsdgMonitor } from './core.mjs';
import { stateStore } from '../stock-monitor/storage.mjs';
import { createOkxClient } from '../stock-monitor/okx-client.mjs';

export const SNAPSHOT_KEY = 'usdg-public-snapshot-v1';
export const RUN_KEY = 'usdg-scan-run-v1';
const fields = ['checkedAt','input','output','grossEdge','grossEdgeRate','minOutput','source','slippagePercent'];
export function publicQuote(quote) {
  return Object.fromEntries(fields.filter(key => quote?.[key] !== undefined).map(key => [key,quote[key]]));
}
export async function processUsdgScan(env, requestedAt, now = Date.now(), run = runUsdgMonitor) {
  if (env.USDG_SCAN_ENABLED !== 'true') return { skipped:'disabled' };
  if (!Number.isFinite(requestedAt) || requestedAt > now+60000 || now-requestedAt > 360000) return { skipped:'expired' };
  const store = stateStore(env.STOCK_DB);
  const previous = await store.get(RUN_KEY,'json') || {};
  const slot = Math.floor(requestedAt/180000);
  if (previous.lastSlot >= slot) return { skipped:'duplicate' };
  const runtime = { ...env, STATE:store };
  try {
    const quote = await run(runtime,createOkxClient(runtime),async text => {
      if (!env.NOTIFIER) throw Error('USDG notifier unavailable');
      await env.NOTIFIER.sendUsdg(text);
    },now);
    await store.put(SNAPSHOT_KEY,JSON.stringify({updatedAt:quote.checkedAt,quote:publicQuote(quote),
      threshold:Number(env.USDG_ALERT_EDGE || .0001)}));
    await store.put(RUN_KEY,JSON.stringify({...previous,lastAttemptAt:now,lastSuccessAt:now,error:null,
      lastSlot:slot,runCount:(previous.runCount || 0)+1}));
    return quote;
  } catch (error) {
    await store.put(RUN_KEY,JSON.stringify({...previous,lastAttemptAt:now,lastErrorAt:now,
      error:'本轮扫描失败，等待下一轮',runCount:(previous.runCount || 0)+1}));
    throw error;
  }
}
export async function usdgResponse(path, env, headers) {
  const store = stateStore(env.STOCK_DB);
  const health = await store.get(RUN_KEY,'json') || {};
  if (path === '/usdg/health') {
    const cron = await store.get('usdg-cron-v1','json');
    return Response.json({enabled:env.USDG_SCAN_ENABLED === 'true',notificationsEnabled:env.USDG_SCAN_ENABLED === 'true',
      lastCronAt:cron?.at || null,lastAttemptAt:health.lastAttemptAt || null,lastSuccessAt:health.lastSuccessAt || null,
      lastErrorAt:health.lastErrorAt || null,error:health.error || null,runCount:health.runCount || 0},
      {headers:{...headers,'Cache-Control':'no-store'}});
  }
  const snapshot = await store.get(SNAPSHOT_KEY,'json');
  return Response.json(snapshot ? {...snapshot,quote:publicQuote(snapshot.quote),
    enabled:env.USDG_SCAN_ENABLED === 'true',notificationsEnabled:env.USDG_SCAN_ENABLED === 'true',
    error:health.error || null} : {error:'warming-up'},{status:snapshot?200:503,headers});
}
