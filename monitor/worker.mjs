import {TOKENS,RULES} from './config.mjs';
import {collect,transition,alertText} from './core.mjs';
export async function scan(env, fetcher=fetch, now=Date.now(), pause=async()=>{}) {
  let old=await env.MONITOR.get('state','json')||{rows:[],signals:{},events:[]};
  if (old.source!=='dexscreener') old={rows:[],signals:{},events:[],source:'dexscreener'};
  if ((old.scanningUntil||0)>now) return old;
  // Best-effort lease avoids a manual scan overlapping the next scheduled run.
  await env.MONITOR.put('state',JSON.stringify({...old,scanningUntil:now+5*60000}));
  const timestamp=new Date(now).toISOString();
  const fresh=[];
  if (env.COLLECTOR) {
    // Keep global upstream concurrency at two, not eight across service calls.
    for (let batch=0;batch<4;batch++) {
      try {
        const response=await env.COLLECTOR.fetch(`https://collector.internal/collect?batch=${batch}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({timestamp})});
        if (!response.ok) throw new Error('collector unavailable');
        const rows=await response.json();
        if (!Array.isArray(rows)||rows.length!==4) throw new Error('collector invalid');
        fresh.push(...rows);
      } catch { fresh.push(...TOKENS.slice(batch*4,batch*4+4).map(token=>({...token,status:'error',updatedAt:null,errorCode:'collector-unavailable'}))); }
    }
  } else fresh.push(...await collect(TOKENS,fetcher,timestamp,pause));
  const signals={...old.signals},alerts=[];
  const rows=fresh.map(row=>{
    const prev=old.rows.find(p=>p.symbol===row.symbol);
    if (row.status==='error') return {...(prev||row),status:'error',stale:true,errorCode:row.errorCode};
    const step=transition(row,signals[row.symbol],now);
    signals[row.symbol]=step.state;
    if (step.notify) alerts.push(row);
    const history=[...(prev?.source==='dexscreener'?prev.history||[]:[]),{at:timestamp,v:row.volume.m5}].slice(-72);
    return {...row,history,source:'dexscreener'};
  });
  const state={source:'dexscreener',rows,signals,events:old.events||[],scannedAt:timestamp,notification:old.notification||'not-configured'};
  await env.MONITOR.put('state',JSON.stringify(state));
  if (!alerts.length) return state;
  if (!env.TG_BOT_TOKEN||!env.TG_CHANNEL_ID) return state;
  try {
    const response=await fetcher(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`,{
      method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(12000),
      body:JSON.stringify({chat_id:env.TG_CHANNEL_ID,text:alertText(alerts,timestamp),link_preview_options:{is_disabled:true}})
    });
    const result=await response.json();
    if (!response.ok||!result.ok) throw new Error('notification rejected');
    for (const row of alerts) {
      signals[row.symbol]={...signals[row.symbol],lastAlert:now,lastLevel:row.status,armed:false};
      state.events.unshift({symbol:row.symbol,at:timestamp,level:row.status,multiple:row.multiple,volume5m:row.volume.m5});
    }
    state.events=state.events.slice(0,40);
    state.notification='ok';
  } catch { state.notification='error'; }
  await env.MONITOR.put('state',JSON.stringify(state));
  return state;
}
export default {
  async scheduled(event,env,ctx) { ctx.waitUntil(scan(env)); },
  async fetch(request,env) {
    const url=new URL(request.url);
    if (request.method==='POST'&&url.pathname==='/admin/scan') {
      if (!env.ADMIN_TOKEN||request.headers.get('Authorization')!==`Bearer ${env.ADMIN_TOKEN}`) return new Response('Not found',{status:404});
      const state=await scan(env);
      return Response.json({scannedAt:state.scannedAt,valid:state.rows.filter(r=>r.status!=='error').length,notification:state.notification},{headers:{'Cache-Control':'no-store'}});
    }
    if (request.method!=='GET'||url.pathname!=='/snapshot') return new Response('Not found',{status:404});
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=60','Access-Control-Allow-Origin':env.SITE_ORIGIN,'X-Content-Type-Options':'nosniff'};
    const state=await env.MONITOR.get('state','json');
    if (!state) return Response.json({error:'warming-up'},{status:503,headers});
    return Response.json({rows:state.rows,events:state.events,scannedAt:state.scannedAt,rules:RULES,notification:state.notification},{headers});
  }
};
