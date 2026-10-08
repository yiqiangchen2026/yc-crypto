// Discovered on the official OKX token pages on 2026-10-08.
// V3 token0/token1/fee and wrapped asset() mappings independently checked via X Layer RPC.
export const WRAPPED={JNJx:'0xb509eb6a307b3603450e7d4446bb0866f3cae38a',MSx:'0x2874a11805783324c54562edb1a641c5d1d077a5',ASMLx:'0x9147b03c16b18fc4f686f610f189f91ddf4347b4',TSMx:'0x27d62249488fc66ecbb92c8da3f56f700b8e8501'};
const entries={
 JNJx:[['0x26383c9770c146bff5c9c5bcc5ce3f325fefb072','wJNJx/wSPYx','Uniswap V3','0.05%']],
 MSx:[['0x13ad37f6139fa25472562d8c43a9274e5a44776a','wMSx/wSPYx','Uniswap V3','0.05%']],
 ASMLx:[['0x6e69d254dc91a0123580286533bac6828fcf74ac','wQQQx/wASMLx','Uniswap V3','0.05%'],['0xb3ec594be8b5caf80aeb6cce8709c832b24c101642066527f056475e2fe8fe8e','USDG/wASMLx','Uniswap V4',null]],
 TSMx:[['0x6102c466f271974adabf03a4e7d990ee312b09fc','wTSMx/wQQQx','Uniswap V3','0.05%'],['0x405cc444041becefe271e872b1c19d73400abba5f55fe3c354f4e085c130e51c','wTSMx/USDG','Uniswap V4',null]]
};
export const VERIFIED_POOLS=Object.fromEntries(Object.entries(entries).map(([symbol,pools])=>[symbol,pools.map(([id,pair,dex,fee])=>({id,pair,dex,fee,liquidity:null,verifiedAt:'2026-10-08',source:'verified-reference'}))]));
export function normalizePools(token,raw,now) {
 if(!Array.isArray(raw))throw Error('invalid pools');
 const address=WRAPPED[token.symbol];
 const pools=raw.map(p=>{
   if(!/^0x[0-9a-f]{40}([0-9a-f]{24})?$/i.test(p.poolAddress||''))return null;
   const assets=p.liquidityAmount;
   if(!Array.isArray(assets)||!assets.some(a=>[token.address,address].includes(a.tokenContractAddress?.toLowerCase())))return null;
   const n=p.liquidityUsd;
   return {id:p.poolAddress.toLowerCase(),pair:String(p.pool||''),dex:String(p.protocolName||''),fee:p.liquidityProviderFeePercent||null,liquidity:n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n))&&Number(n)>=0?Number(n):null,updatedAt:new Date(now).toISOString(),source:'okx',assets:assets.map(a=>({symbol:String(a.tokenSymbol||''),address:a.tokenContractAddress?.toLowerCase()||null}))};
 }).filter(Boolean);
 if(raw.length&&!pools.length)throw Error('pool contracts unavailable');
 return [...new Map(pools.map(p=>[p.id,p])).values()].sort((a,b)=>(b.liquidity||0)-(a.liquidity||0));
}
export async function readPools(token,previous,okx,now) {
 if(previous?.poolsCheckedAt&&now-Date.parse(previous.poolsCheckedAt)<15*60000)return {pools:previous.pools,poolsUpdatedAt:previous.poolsUpdatedAt,poolsCheckedAt:previous.poolsCheckedAt,poolsSource:previous.poolsSource,poolsStatus:previous.poolsStatus};
 try {
   const raw=await okx('/api/v6/dex/market/token/top-liquidity',{params:{chainIndex:'196',tokenContractAddress:token.address}});
   return {poolsCheckedAt:new Date(now).toISOString(),pools:normalizePools(token,raw,now),poolsUpdatedAt:new Date(now).toISOString(),poolsSource:'okx',poolsStatus:'ok'};
 }catch{return {poolsCheckedAt:new Date(now).toISOString(),pools:previous?.pools?.length?previous.pools:VERIFIED_POOLS[token.symbol],poolsUpdatedAt:previous?.poolsUpdatedAt||null,poolsSource:previous?.poolsSource||'verified-reference',poolsStatus:'unavailable'};}
}
