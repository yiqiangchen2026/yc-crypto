import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePools,readPools,WRAPPED,VERIFIED_POOLS} from './xlayer-pools.mjs';
import {TOKENS} from './xlayer-volume.mjs';
const now=Date.now(),t=TOKENS[0];
const pool={poolAddress:'0x'+'1'.repeat(40),pool:'wJNJx/wSPYx',protocolName:'Uniswap V3',liquidityUsd:'10000',liquidityProviderFeePercent:'0.05%',liquidityAmount:[{tokenContractAddress:WRAPPED.JNJx,tokenSymbol:'wJNJx'},{tokenContractAddress:'0xe7e553cd128f0011777323a0b44a7b96ea1cb540',tokenSymbol:'wSPYx'}]};
test('pool data validates wrapped contract identity and deduplicates without invented volume',()=>{
 const rows=normalizePools(t,[pool,pool],now);assert.equal(rows.length,1);assert.equal(rows[0].pair,'wJNJx/wSPYx');assert.equal(rows[0].volume,undefined);
 assert.throws(()=>normalizePools(t,[{...pool,liquidityAmount:[{tokenContractAddress:'0x'+'a'.repeat(40),tokenSymbol:'wJNJx'}]}],now));
 assert.equal(normalizePools(t,[{...pool,liquidityUsd:''}],now)[0].liquidity,null);
});
test('pool failure preserves verified references or last good values, cached reads avoid API calls',async()=>{
 const off=async()=>{throw Error('off');};const fallback=await readPools(t,null,off,now);
 assert.deepEqual(fallback.pools,VERIFIED_POOLS.JNJx);assert.equal(fallback.pools[0].liquidity,null);
 const good=await readPools(t,null,async()=>[pool],now);assert.equal(good.poolsSource,'okx');
 const cached=await readPools(t,good,off,now+60000);assert.equal(cached.poolsStatus,'ok');
 const failure=await readPools(t,good,off,now+16*60000);assert.deepEqual(failure.pools,good.pools);assert.equal(failure.poolsUpdatedAt,good.poolsUpdatedAt);assert.equal(failure.poolsStatus,'unavailable');
});
