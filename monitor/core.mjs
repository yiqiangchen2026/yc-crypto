import { NETWORK, USDG, RULES, SOURCE } from './config.mjs';
const number = v => v!==null && v!==undefined && v!=='' && Number.isFinite(Number(v)) && Number(v)>=0 ? Number(v) : null;
export function normalizePool(pool, token) {
  if (pool.chainId!==NETWORK) return null;
  const ids=[pool.baseToken?.address?.toLowerCase(),pool.quoteToken?.address?.toLowerCase()];
  if (!ids.includes(token.address)||!ids.includes(USDG)) return null;
  if (!/^0x[0-9a-f]{40}([0-9a-f]{24})?$/i.test(pool.pairAddress||'')) return null;
  const v=Object.fromEntries(['m5','h1','h6','h24'].map(k=>[k,number(pool.volume?.[k])]));
  const tx={};
  for (const k of ['m5','h1']) {
    const b=number(pool.txns?.[k]?.buys), s=number(pool.txns?.[k]?.sells);
    tx[k]=b===null||s===null?null:b+s;
  }
  return {id:pool.pairAddress.toLowerCase(),dex:[pool.dexId,...(pool.labels||[])].join(' / '),liquidity:number(pool.liquidity?.usd),volume:v,transactions:tx,
    url:`https://dexscreener.com/${NETWORK}/${pool.pairAddress}`};
}
export function summarize(token, raw, now=new Date().toISOString()) {
  const pools=[...new Map(raw.map(p=>normalizePool(p,token)).filter(Boolean).map(p=>[p.id,p])).values()];
  const complete=pools.every(p=>Object.values(p.volume).every(v=>v!==null)&&Object.values(p.transactions).every(v=>v!==null));
  if (!complete) throw new Error('incomplete pool metrics');
  const sum=fn=>pools.reduce((n,p)=>n+fn(p),0);
  const volume=Object.fromEntries(['m5','h1','h6','h24'].map(k=>[k,sum(p=>p.volume[k])]));
  const trades5m=sum(p=>p.transactions.m5),trades1h=sum(p=>p.transactions.h1),liquidity=sum(p=>p.liquidity??0);
  const unknownLiquidity=pools.filter(p=>p.liquidity===null).length;
  const validWindows=volume.h1>=volume.m5&&volume.h6>=volume.h1&&volume.h24>=volume.h6;
  const baseline5m=Math.max(0,(volume.h1-volume.m5)/11);
  const baseline1h=Math.max(0,(volume.h6-volume.h1)/5);
  const burst=volume.m5/Math.max(baseline5m,RULES.baselineFloor5m);
  const sustained=volume.h1/Math.max(baseline1h,RULES.baselineFloor5m*12);
  const short=volume.m5>=RULES.min5m&&trades5m>=RULES.minTrades5m&&burst>=RULES.multiple;
  const long=volume.h1>=RULES.min1h&&trades1h>=RULES.minTrades1h&&sustained>=RULES.multiple;
  const rising=validWindows&&liquidity>=RULES.minLiquidity&&(short||long);
  const multiple=short?burst:long?sustained:Math.max(burst,sustained);
  return {...token,pools,volume,trades5m,trades1h,liquidity,unknownLiquidity,baseline5m,baseline1h,burst,sustained,multiple,
    status:!pools.length?'no-pool':!validWindows?'inconsistent':rising?((multiple>=RULES.strongMultiple&&(volume.m5>=RULES.strongMin5m||volume.h1>=RULES.strongMin1h))?'strong':'rising'):'normal',
    reason:rising?(short?'5m':'1h'):null,updatedAt:now,coverageLimited:raw.length>=100};
}
export async function collect(tokens, fetcher=fetch, now=new Date().toISOString(), pause=async()=>{}) {
  const results=[];
  // Two concurrent requests, 16 calls per scan; no browser-triggered upstream requests.
  for (let i=0;i<tokens.length;i+=2) {
    if (i) await pause();
    results.push(...await Promise.all(tokens.slice(i,i+2).map(async token=>{
      try {
        const response=await fetcher(`${SOURCE}/token-pairs/v1/${NETWORK}/${token.address}`,{headers:{Accept:'application/json','User-Agent':'YC-Volume-Monitor/1.0 (+https://yc-crypto.pages.dev/monitor/volume/)'},cf:{cacheEverything:true,cacheTtlByStatus:{'200-299':240,'400-599':0}},signal:AbortSignal.timeout(12000)});
        if (!response.ok) {
          throw new Error(`upstream ${response.status}`);
        }
        const json=await response.json();
        if (!Array.isArray(json)) throw new Error('invalid response');
        return summarize(token,json,now);
      } catch (e) { return {...token,status:'error',updatedAt:null,errorCode:/^upstream [0-9]{3}$/.test(e.message)?e.message:'invalid-or-unavailable'}; }
    })));
  }
  return results;
}
export function transition(row, previous={}, now=Date.now()) {
  if (['error','inconsistent'].includes(row.status)) return {state:previous,notify:false};
  const rising=['rising','strong'].includes(row.status);
  const quiet=rising?0:(previous.quiet||0)+1;
  const armed=previous.armed!==false||quiet>=RULES.rearmPolls;
  const cooldown=now-(previous.lastAlert||0)>=RULES.cooldownMinutes*60000;
  const stronger=row.status==='strong'&&previous.lastLevel==='rising';
  const notify=rising&&cooldown&&(armed||stronger);
  return {state:{...previous,quiet,armed},notify};
}
export const money=n=>'$'+Math.round(n).toLocaleString('en-US');
export const turnover=r=>r.liquidity>0?`${(r.volume.h1/r.liquidity*100).toFixed(1)}%${r.unknownLiquidity?'（流动性不完整）':''}`:'未知';
export function alertText(rows, now) {
  return ['📈 YC 链上信号｜Robinhood Chain 美股交易量放量',...rows.map(r=>`${r.symbol}/USDG · ${r.status==='strong'?'强放量':r.reason==='1h'?'持续放量':'开始放量'}\n5m ${money(r.volume.m5)} · 1h ${money(r.volume.h1)} · ${r.multiple.toFixed(1)}×（${r.reason==='5m'?'前55m均值':'前5h均值'}）\n5m ${r.trades5m} 笔 · 流动性 ${money(r.liquidity)}\n1h 成交量 / 已知流动性 ${turnover(r)}`),
    `采集时间 ${now}（UTC）`,'Robinhood Chain · 已发现 USDG 池成交量合计；请核实实际路由和 LP 风险。','https://yc-crypto.pages.dev/monitor/volume/'].join('\n\n');
}

export function summaryText(rows, now, window='h1') {
  const top=[...rows].sort((a,b)=>b.volume[window]-a.volume[window]||a.symbol.localeCompare(b.symbol)).slice(0,3);
  return ['📋 YC 链上信号｜Robinhood Chain 美股交易量 Top 3',`按过去${window==='h24'?'24':'1'}小时成交量排名（USD）`,
    ...top.map((r,i)=>`${i+1}. ${r.symbol}/USDG${['rising','strong'].includes(r.status)?' · 放量中':''}\n5m ${money(r.volume.m5)} · 1h ${money(r.volume.h1)} · 24h ${money(r.volume.h24)}\n已知流动性 ${money(r.liquidity)}\n1h 成交量 / 已知流动性 ${turnover(r)}`),
    `采集时间 ${now}（UTC）`,'Robinhood Chain · 已发现 USDG 池成交量合计。','https://yc-crypto.pages.dev/monitor/volume/'].join('\n\n');
}
