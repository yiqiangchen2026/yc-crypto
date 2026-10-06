import { runXStockMonitor } from './core.mjs';
import { createOkxClient } from './okx-client.mjs';
import { STATE_KEY, stateStore, publicSnapshot, recordScan } from './storage.mjs';
export async function processScan(env, requestedAt, now = Date.now(), run = runXStockMonitor) {
  if (env.SCAN_ENABLED !== 'true') return { skipped:'disabled' };
  if (!Number.isFinite(requestedAt) || requestedAt > now + 60000 || now-requestedAt > 6*60000) return { skipped:'expired' };
  const slot = Math.floor(requestedAt / 180000);
  const last = await env.STOCK_DB.prepare('SELECT last_slot FROM scan_runs WHERE id=1').first();
  if (last?.last_slot >= slot) return { skipped:'duplicate' };
  const runtime = { ...env, STATE:stateStore(env.STOCK_DB) };
  const notify = async (text, options) => {
    if (env.XSTOCK_PUBLIC_ALERTS_ENABLED !== 'true') return;
    if (!env.NOTIFIER) throw new Error('Stock notifier unavailable');
    await env.NOTIFIER.send(text, options || {});
  };
  try {
    const result = await run(runtime, createOkxClient(runtime), notify, now);
    await recordScan(env.STOCK_DB,now,true,slot);
    return result;
  } catch (error) {
    await recordScan(env.STOCK_DB,now,false,slot);
    throw error;
  }
}
export default {
  async scheduled(controller, env, ctx) {
    if (env.SCAN_ENABLED !== 'true' || new Date(controller.scheduledTime).getUTCMinutes() % 3 !== 0) return;
    ctx.waitUntil((async () => {
      await env.SCAN_QUEUE.send({ kind:'stock-scan',requestedAt:controller.scheduledTime });
      await stateStore(env.STOCK_DB).put('stock-cron-v1',JSON.stringify({at:Date.now()}));
    })());
  },
  async queue(batch, env) {
    // A dedicated max_concurrency=1 Queue serializes state transitions and notifications.
    for (const message of batch.messages) {
      try {
        if (message.body?.kind === 'stock-scan') await processScan(env,message.body.requestedAt);
      } catch { console.error(JSON.stringify({event:'stock_scan_failed'})); }
      // Next scheduled scan rechecks failed deliveries without replaying stale prices.
      message.ack();
    }
  },
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const headers = { 'Cache-Control':'public, max-age=60','Access-Control-Allow-Origin':env.SITE_ORIGIN,
      'X-Content-Type-Options':'nosniff' };
    if (request.method !== 'GET' || !['/snapshot','/health'].includes(path)) return new Response('Not found',{status:404});
    try {
      if (path === '/health') {
        const row = await env.STOCK_DB.prepare('SELECT * FROM scan_runs WHERE id=1').first();
        const cron = await stateStore(env.STOCK_DB).get('stock-cron-v1','json');
        return Response.json({ enabled:env.SCAN_ENABLED === 'true',notificationsEnabled:env.XSTOCK_PUBLIC_ALERTS_ENABLED === 'true',
          lastCronAt:cron?.at||null,lastAttemptAt:row?.last_attempt_at||null,lastSuccessAt:row?.last_success_at||null,
          lastErrorAt:row?.last_error_at||null,error:row?.last_error||null,runCount:row?.run_count||0 },{headers:{...headers,'Cache-Control':'no-store'}});
      }
      const state = await stateStore(env.STOCK_DB).get(STATE_KEY,'json');
      const snapshot = publicSnapshot(state,env.XSTOCK_PUBLIC_ALERTS_ENABLED === 'true');
      return Response.json(snapshot || {error:'warming-up'},{status:snapshot?200:503,headers});
    } catch { return Response.json({error:'snapshot-unavailable'},{status:503,headers}); }
  }
};
