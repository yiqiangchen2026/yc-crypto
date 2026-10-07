import { runXStockMonitor } from './core.mjs';
import { createOkxClient } from './okx-client.mjs';
import { STATE_KEY, monitorStore, publicSnapshot, scanRun, recordMonitorScan } from './storage.mjs';
import { processUsdgScan, usdgResponse } from '../usdg-monitor/worker.mjs';
export async function processScan(env, requestedAt, now = Date.now(), run = runXStockMonitor) {
  if (env.SCAN_ENABLED !== 'true') return { skipped:'disabled' };
  if (!Number.isFinite(requestedAt) || requestedAt > now + 60000 || now-requestedAt > 6*60000) return { skipped:'expired' };
  const slot = Math.floor(requestedAt / 180000);
  const last = await scanRun(env);
  if (last?.last_slot >= slot) return { skipped:'duplicate' };
  const runtime = { ...env, STATE:monitorStore(env) };
  const notify = async (text, options) => {
    if (env.XSTOCK_PUBLIC_ALERTS_ENABLED !== 'true') return;
    if (!env.NOTIFIER) throw new Error('Stock notifier unavailable');
    await env.NOTIFIER.send(text, options || {});
  };
  try {
    const result = await run(runtime, createOkxClient(runtime), notify, now);
    await recordMonitorScan(env,now,true,slot);
    return result;
  } catch (error) {
    await recordMonitorScan(env,now,false,slot);
    throw error;
  }
}
export default {
  async scheduled(controller, env, ctx) {
    if (env.USDG_SCAN_ENABLED === 'true' && new Date(controller.scheduledTime).getUTCMinutes() % 3 === 1) {
      ctx.waitUntil((async () => {
        await env.SCAN_QUEUE.send({ kind:'usdg-scan',requestedAt:controller.scheduledTime });
        await monitorStore(env).put('usdg-cron-v1',JSON.stringify({at:Date.now()}));
      })());
    }
    if (env.SCAN_ENABLED !== 'true' || new Date(controller.scheduledTime).getUTCMinutes() % 3 !== 0) return;
    ctx.waitUntil((async () => {
      await env.SCAN_QUEUE.send({ kind:'stock-scan',requestedAt:controller.scheduledTime });
      await monitorStore(env).put('stock-cron-v1',JSON.stringify({at:Date.now()}));
    })());
  },
  async queue(batch, env) {
    // A dedicated max_concurrency=1 Queue serializes state transitions and notifications.
    for (const message of batch.messages) {
      try {
        if (message.body?.kind === 'stock-scan') await processScan(env,message.body.requestedAt);
        if (message.body?.kind === 'usdg-scan') await processUsdgScan(env,message.body.requestedAt);
      } catch { console.error(JSON.stringify({event:'stock_scan_failed'})); }
      // Next scheduled scan rechecks failed deliveries without replaying stale prices.
      message.ack();
    }
  },
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const headers = { 'Cache-Control':'public, max-age=60','Access-Control-Allow-Origin':env.SITE_ORIGIN,
      'X-Content-Type-Options':'nosniff' };
    if (request.method !== 'GET' || !['/snapshot','/health','/usdg/snapshot','/usdg/health'].includes(path)) return new Response('Not found',{status:404});
    try {
      if (path.startsWith('/usdg/')) return await usdgResponse(path,env,headers);
      if (path === '/health') {
        const row = await scanRun(env);
        const cron = await monitorStore(env).get('stock-cron-v1','json');
        return Response.json({ enabled:env.SCAN_ENABLED === 'true',notificationsEnabled:env.XSTOCK_PUBLIC_ALERTS_ENABLED === 'true',
          lastCronAt:cron?.at||null,lastAttemptAt:row?.last_attempt_at||null,lastSuccessAt:row?.last_success_at||null,
          lastErrorAt:row?.last_error_at||null,error:row?.last_error||null,runCount:row?.run_count||0 },{headers:{...headers,'Cache-Control':'no-store'}});
      }
      const state = await monitorStore(env).get(STATE_KEY,'json');
      const snapshot = publicSnapshot(state,env.XSTOCK_PUBLIC_ALERTS_ENABLED === 'true');
      return Response.json(snapshot || {error:'warming-up'},{status:snapshot?200:503,headers});
    } catch { return Response.json({error:'snapshot-unavailable'},{status:503,headers}); }
  }
};
