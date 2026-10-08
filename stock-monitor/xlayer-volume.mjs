import { RULES } from '../monitor/config.mjs';
import { transition, money } from '../monitor/core.mjs';
import { monitorStore } from './storage.mjs';
import { channelSettings } from './channel-settings.mjs';
export const VOLUME_KEY='xlayer-volume-v1';
export const TOKENS=Object.entries({JNJx:'0xdb0482cfad4789798623e64b15eeba01b16e917c',MSx:'0xd8cd1c1ff337b2d4dc61b70aa8006e0eba401f58',ASMLx:'0xc0b417e7f83db438631eb5e096684dd742e5294f',TSMx:'0x9e3bf4ecfc44eedd624f26656b6736a3f093b073'}).map(([symbol,address])=>({symbol,address}));
export function normalize(token,data,now) {
  if(data?.chainIndex!=='196'||data.tokenContractAddress?.toLowerCase()!==token.address) throw Error('wrong token');
  const n=k=>{if(data[k]===undefined||data[k]===null||data[k]===''||!Number.isFinite(Number(data[k]))||Number(data[k])<0)throw Error('missing metrics');return Number(data[k]);};
  const time=n('time');if(Math.abs(now-time)>12*60000)throw Error('stale source');
  const volume={m5:n('volume5M'),h1:n('volume1H'),h4:n('volume4H'),h24:n('volume24H')};
  const trades5m=n('txs5M'),trades1h=n('txs1H'),liquidity=n('liquidity');
  const valid=volume.h1>=volume.m5&&volume.h4>=volume.h1&&volume.h24>=volume.h4;
  const burst=volume.m5/Math.max((volume.h1-volume.m5)/11,RULES.baselineFloor5m);
  const sustained=volume.h1/Math.max((volume.h4-volume.h1)/3,RULES.baselineFloor5m*12);
  const short=burst>=3&&volume.m5>=RULES.min5m&&trades5m>=RULES.minTrades5m;
  const long=sustained>=3&&volume.h1>=RULES.min1h&&trades1h>=RULES.minTrades1h;
  const rising=valid&&liquidity>=RULES.minLiquidity&&(short||long),multiple=short?burst:long?sustained:Math.max(burst,sustained);
  return {...token,volume,trades5m,trades1h,liquidity,multiple,pools:[],source:'okx',sourceAt:new Date(time).toISOString(),updatedAt:new Date(now).toISOString(),reason:rising?(short?'5m':'1h'):null,status:!valid?'inconsistent':rising?(multiple>=5&&(volume.m5>=50000||volume.h1>=200000)?'strong':'rising'):'normal'};
}
export async function scanVolume(env,okx,now=Date.now()) {
  const store=monitorStore(env),old=await store.get(VOLUME_KEY,'json')||{rows:[],signals:{},events:[]};
  if(now-Date.parse(old.scannedAt)<5*60000)return {skipped:'duplicate'};
  let data=[];try{data=await okx('/api/v6/dex/market/price-info',{payload:TOKENS.map(t=>({chainIndex:'196',tokenContractAddress:t.address}))});if(!Array.isArray(data))throw Error('invalid');}catch{data=[];}
  const signals={...old.signals},alerts=[],events=[...(old.events||[])];
  const rows=TOKENS.map(token=>{
    const prev=old.rows.find(r=>r.address===token.address);
    try{
      const row=normalize(token,data.find(d=>d.tokenContractAddress?.toLowerCase()===token.address),now),step=transition(row,signals[token.symbol],now);
      signals[token.symbol]=step.state;if(step.notify)alerts.push(row);
      return {...row,history:[...(prev?.history||[]),{at:row.updatedAt,v:row.volume.m5}].slice(-72)};
    }catch{return {...(prev||token),status:'error',stale:true,errorCode:'invalid-or-unavailable'};}
  });
  let notification=old.notification||'not-configured',enabled=false;
  try{enabled=(await channelSettings(env)).volume;}catch{notification='settings-unavailable';}
  if(!enabled&&notification!=='settings-unavailable')notification='disabled';
  if(alerts.length&&enabled){try{
    const text=['📈 YC 链上信号｜X Layer 美股交易量放量',...alerts.map(r=>`${r.symbol} · ${r.status==='strong'?'强放量':'开始放量'}\n5m ${money(r.volume.m5)} · 1h ${money(r.volume.h1)} · ${r.multiple.toFixed(1)}×\n5m ${r.trades5m} 笔 · 流动性 ${money(r.liquidity)}\n基准：${r.reason==='5m'?'前55m每5m':'前3h每小时'}均值`),`采集时间 ${new Date(now).toISOString()}（UTC）`,'X Layer · OKX 收录代币成交量，未按比赛允许的报价币或路由过滤，不等于活动计分量。','https://yc-crypto.pages.dev/monitor/xlayer-volume/'].join('\n\n');
    await env.NOTIFIER.sendVolume(text);
    for(const r of alerts){signals[r.symbol]={...signals[r.symbol],lastAlert:now,lastLevel:r.status,armed:false};events.unshift({symbol:r.symbol,at:r.updatedAt,level:r.status,multiple:r.multiple,volume5m:r.volume.m5});}notification='ok';
  }catch{notification='error';}}
  const state={rows,signals,events:events.slice(0,40),scannedAt:new Date(now).toISOString(),notification,source:'okx',network:'x-layer',rules:RULES};
  await store.put(VOLUME_KEY,JSON.stringify(state));return {valid:rows.filter(r=>r.status!=='error').length};
}
export function publicVolume(state){if(!state)return null;const {signals,...publicState}=state;return publicState;}
