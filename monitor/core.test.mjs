import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize,transition,normalizePool,alertText} from './core.mjs';
import {scan} from './worker.mjs';
import {TOKENS,USDG} from './config.mjs';
const token=TOKENS[0];
function pool(volume={m5:15000,h1:48000,h6:168000,h24:300000}) {
 return {chainId:'robinhood',pairAddress:'0x'+'a'.repeat(40),volume,liquidity:{usd:30000},txns:{m5:{buys:7,sells:7},h1:{buys:30,sells:30}},baseToken:{address:token.address},quoteToken:{address:USDG},dexId:'uniswap',labels:['v3']};
}
test('match exact token contracts, including reverse pair; exclude ticker impersonation',()=>{
 const p=pool();assert.ok(normalizePool(p,token));
 [p.baseToken,p.quoteToken]=[p.quoteToken,p.baseToken];assert.ok(normalizePool(p,token));
 p.baseToken.address='0x'+'b'.repeat(40);assert.equal(normalizePool(p,token),null);
});
test('sum unique pools and exclude current 5m from baseline',()=>{
 const p=pool(),r=summarize(token,[p,p]);assert.equal(r.pools.length,1);assert.equal(r.baseline5m,3000);assert.equal(r.multiple,5);assert.equal(r.status,'rising');
});
test('low absolute volume and low liquidity cannot alert',()=>{
 const p=pool({m5:500,h1:500,h6:500,h24:500});assert.equal(summarize(token,[p]).status,'normal');
 const q=pool();q.liquidity.usd=500;assert.equal(summarize(token,[q]).status,'normal');
});
test('sustained volume triggers independently of short burst',()=>{
 const r=summarize(token,[pool({m5:1000,h1:200000,h6:300000,h24:400000})]);assert.equal(r.reason,'1h');assert.equal(r.status,'strong');
});
test('missing fields and inconsistent rolling windows cannot produce false alerts',()=>{
 const p=pool();delete p.volume.h1;assert.throws(()=>summarize(token,[p]));
 const r=summarize(token,[pool({m5:50000,h1:10000,h6:100000,h24:200000})]);assert.equal(r.status,'inconsistent');
});
test('cooldown, rearm and stronger escalation',()=>{
 const now=10000000;assert.ok(transition({status:'rising'},{},now).notify);
 const sent={armed:false,lastAlert:now,lastLevel:'rising'};
 assert.equal(transition({status:'rising'},sent,now+7200000).notify,false);
 assert.equal(transition({status:'strong'},sent,now+1000).notify,false);
 assert.ok(transition({status:'strong'},sent,now+3600000).notify);
 let a=transition({status:'normal'},sent,now+10000).state;
 a=transition({status:'normal'},a,now+20000).state;
 assert.ok(a.armed);assert.ok(transition({status:'rising'},a,now+3600000).notify);
 assert.deepEqual(transition({status:'error'},sent,now).state,sent);
});
test('failed notification is not recorded as sent; source failure preserves old timestamp',async()=>{
 let saved;const old={rows:[{...token,status:'normal',updatedAt:'2026-10-01T00:00:00Z',volume:{m5:12}}],signals:{},events:[]};
 const env={MONITOR:{get:async()=>saved||old,put:async(k,v)=>{saved=JSON.parse(v);}},TG_BOT_TOKEN:'test-only',TG_CHANNEL_ID:'test'};
 let telegram=0;
 const fetcher=async url=>{
  if(url.includes('api.telegram.org')){telegram++;return Response.json({ok:false},{status:403});}
  if(!url.includes(token.address))return new Response('',{status:429});
  return Response.json([pool()]);
 };
 await scan(env,fetcher,10000000);assert.equal(telegram,1);assert.equal(saved.events.length,0);assert.equal(saved.signals[token.symbol].lastAlert,undefined);assert.equal(saved.notification,'error');
 const failing=async()=>new Response('',{status:503});
 await scan(env,failing,10003000);assert.equal(saved.rows[0].status,'error');assert.equal(saved.rows[0].updatedAt,new Date(10000000).toISOString());
});
test('unknown pool liquidity preserves complete volume and is explicitly counted',()=>{
 const p=pool(),q=pool();q.pairAddress='0x'+'b'.repeat(40);q.liquidity={};
 const r=summarize(token,[p,q]);assert.equal(r.unknownLiquidity,1);assert.equal(r.liquidity,30000);assert.equal(r.volume.m5,30000);
});
test('private collector failures affect only their own batch; active lease prevents overlap',async()=>{
 let saved,calls=0;
 const env={MONITOR:{get:async()=>saved||{source:'dexscreener',rows:[],events:[],signals:{}},put:async(k,v)=>{saved=JSON.parse(v);}},COLLECTOR:{fetch:async(url,init)=>{
  calls++;const batch=Number(new URL(url).searchParams.get('batch'));
  if(batch===1) return new Response('',{status:503});
  const timestamp=JSON.parse(init.body).timestamp;
  return Response.json(TOKENS.slice(batch*4,batch*4+4).map(t=>({...t,status:'normal',volume:{m5:0,h1:0,h6:0,h24:0},updatedAt:timestamp})));
 }}};
 await scan(env,fetch,10000000);assert.equal(calls,4);assert.equal(saved.rows.length,16);assert.equal(saved.rows.filter(r=>r.status==='error').length,4);
 saved.scanningUntil=10060000;await scan(env,fetch,10000001);assert.equal(calls,4);
});
test('public API never exposes internal state or permits unauthenticated scans',async()=>{
 const worker=(await import('./worker.mjs')).default;
 const env={SITE_ORIGIN:'https://yc-crypto.pages.dev',MONITOR:{get:async()=>({rows:[],events:[],scannedAt:'2026-10-04T00:00:00Z',notification:'ok',signals:{private:true},scanningUntil:999999})}};
 const response=await worker.fetch(new Request('https://example.com/snapshot'),env);const body=await response.json();assert.equal(body.signals,undefined);assert.equal(body.scanningUntil,undefined);
 assert.equal((await worker.fetch(new Request('https://example.com/admin/scan',{method:'POST'}),env)).status,404);
});
test('ingestion requires its own key, rejects wrong contracts and stale replays',async()=>{
 const worker=(await import('./worker.mjs')).default;let saved;
 const env={INGEST_TOKEN:'test-ingestion-only',MONITOR:{get:async()=>saved,put:async(k,v)=>{saved=JSON.parse(v);}}};
 const scannedAt=new Date().toISOString();
 const rows=TOKENS.map(t=>({...t,status:'normal',volume:{m5:0,h1:0,h6:0,h24:0},liquidity:0,multiple:0,pools:[],updatedAt:scannedAt}));
 const send=(payload,key='test-ingestion-only')=>worker.fetch(new Request('https://example.com/admin/ingest',{method:'POST',headers:{'Authorization':'Bearer '+key},body:JSON.stringify(payload)}),env);
 assert.equal((await send({scannedAt,rows},'wrong')).status,404);
 assert.equal((await send({scannedAt,rows:rows.map((r,i)=>i? r:{...r,address:USDG})})).status,400);
 assert.equal((await send({scannedAt,rows})).status,200);assert.equal(saved.rows.length,16);
 const replay=await send({scannedAt,rows});assert.equal((await replay.json()).accepted,false);
});
test('early alerts require absolute volume and trades; strong requires substantial volume',()=>{
 const q=pool({m5:18901,h1:36712,h6:60000,h24:100000});q.liquidity.usd=1280671;q.txns.m5={buys:10,sells:11};
 const row=summarize(token,[q]);assert.equal(row.status,'rising');assert.equal(row.reason,'5m');assert.ok(alertText([row],'test').includes('2.9%'));
 const low=pool({m5:14000,h1:14000,h6:14000,h24:14000});assert.equal(summarize(token,[low]).status,'normal');
 const few=pool();few.txns.m5={buys:4,sells:5};assert.equal(summarize(token,[few]).status,'normal');
 const strong=pool({m5:50000,h1:60000,h6:100000,h24:200000});assert.equal(summarize(token,[strong]).status,'strong');
});

test('volume signals route exclusively to private or public destinations',async()=>{
 let saved,enabled=false,sends=0,privateSends=0;const now=10000000;
 const env={TG_BOT_TOKEN:'test',TG_CHANNEL_ID:'test',PRIVATE_NOTIFIER:{send:async()=>{privateSends++;}},CHANNEL_CONTROLS:{getSettings:async()=>({volume:enabled})},MONITOR:{get:async()=>saved,put:async(k,v)=>{saved=JSON.parse(v);}}};
 const rows=at=>[{...summarize(token,[pool()]),updatedAt:new Date(at).toISOString()}];
 const fetcher=async()=>{sends++;return Response.json({ok:true});};
 await scan(env,fetcher,now,async()=>{},rows(now));
 assert.equal(sends,0);assert.equal(privateSends,1);assert.equal(saved.notification,'ok');assert.equal(saved.rows.length,1);assert.equal(saved.events.length,1);
 saved.signals={};
 enabled=true;
 await scan(env,fetcher,now+300000,async()=>{},rows(now+300000));
 assert.equal(sends,1);assert.equal(privateSends,1);assert.equal(saved.notification,'ok');
});
test('volume settings outage fails closed without marking an alert delivered',async()=>{
 let saved,sends=0;const now=10000000;
 const env={TG_BOT_TOKEN:'test',TG_CHANNEL_ID:'test',CHANNEL_CONTROLS:{getSettings:async()=>{throw Error('offline');}},MONITOR:{get:async()=>saved,put:async(k,v)=>{saved=JSON.parse(v);}}};
 await scan(env,async()=>{sends++;return Response.json({ok:true});},now,async()=>{},[{...summarize(token,[pool()]),updatedAt:new Date(now).toISOString()}]);
 assert.equal(sends,0);assert.equal(saved.notification,'settings-unavailable');assert.equal(saved.events.length,0);
});

test('legacy ranking settings and state cannot send periodic channel messages',async()=>{
 let saved={source:'dexscreener',rows:[],signals:{},events:[],lastSummaryAt:1,summaryNotification:'error'},writes=0;
 const now=Date.parse('2026-10-09T00:00:00Z');
 const env={SUMMARY_INTERVAL_HOURS:'6',SUMMARY_WINDOW:'h1',TG_BOT_TOKEN:'test',TG_CHANNEL_ID:'test',MONITOR:{get:async()=>saved,put:async(k,v)=>{writes++;saved=JSON.parse(v);}}};
 for(const at of [now,now+6*3600000]) {
  writes=0;
  const rows=TOKENS.map(t=>({...t,status:'normal',volume:{m5:0,h1:100,h6:100,h24:100},liquidity:10000,updatedAt:new Date(at).toISOString()}));
  await scan(env,async()=>{throw Error('unexpected notification');},at,async()=>{},rows);
  assert.equal(writes,2);assert.equal(saved.rows.length,16);assert.equal(saved.lastSummaryAt,undefined);assert.equal(saved.summaryNotification,undefined);
 }
});
