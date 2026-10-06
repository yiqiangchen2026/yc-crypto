import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchUsdgQuote, fetchPendleQuote, parsePendleQuote, runUsdgMonitor, usdgQuoteMessage } from './core.mjs';
const USDC='0xb6ceceab302e2e4948951ee7843fc24e92933061', USDG='0x4ae46a509f6b1d9056937ba4500cb143933d2dc8';
const raw=(units=5001000000)=>[{toTokenAmount:String(units),fromToken:{tokenContractAddress:USDC,decimal:6},toToken:{tokenContractAddress:USDG,decimal:6}}];
const data=()=>({action:'pendle-swap',inputs:[{token:USDC,amount:'5000000000'}],routes:[{outputs:[{token:USDG,amount:'5001000000'}],tx:{to:'0x888888888889758f76e7103c6cbf23abbf58f946'},contractParamInfo:{method:'swapTokensToTokens',contractCallParams:['aggregator',[{tokenIn:USDC,tokenOut:USDG,minOut:'5000499900'}],['5000000000']]}}]});
const verified=()=>parsePendleQuote(data(),5000,Date.now());
function setup(){let state=null,units=5001000000;const alerts=[];return {env:{STATE:{get:async()=>state,put:async(_k,v)=>{state=JSON.parse(v)}}},okx:async()=>raw(units),notify:async m=>alerts.push(m),alerts,units:v=>{units=v}};}
test('exact input and Pendle endpoint validates router and minimum',async()=>{
 let params;await fetchUsdgQuote({},async(_p,o)=>{params=o.params;return raw()});assert.equal(params.amount,'5000000000');
 const q=await fetchPendleQuote({},async(url)=>{assert.match(url,/sdk\/196\/convert/);assert.match(url,/slippage=0.0001/);return {ok:true,json:async()=>data()}});
 assert.equal(q.minOutput,5000.4999);assert.match(usdgQuoteMessage(q,.0001),/pendleswap/);assert.match(usdgQuoteMessage(q,.0001),/自己的 OKX/);
 const bad=data();bad.routes[0].tx.to=USDC;assert.throws(()=>parsePendleQuote(bad,5000,0),/no valid/);
 bad.inputs[0].amount='1';assert.throws(()=>parsePendleQuote(bad,5000,0),/input mismatch/);
});
test('requires repeated candidate, verifies Pendle and preserves cooldown across drops',async()=>{
 const s=setup(),run=t=>runUsdgMonitor(s.env,s.okx,s.notify,t,verified);
 await run(1000);assert.equal(s.alerts.length,0);await run(10000);assert.equal(s.alerts.length,1);
 s.units(4999900000);await run(20000);s.units(5001000000);await run(30000);assert.equal(s.alerts.length,1);
 await run(611000);await run(620000);assert.equal(s.alerts.length,2);
});
test('negative, stale, unsafe minimum and failed Pendle never alert',async()=>{
 for(const change of [{grossEdgeRate:-.001},{checkedAt:0},{minOutput:4999}]){
  const s=setup(),pendle=async()=>({...verified(),...change});await runUsdgMonitor(s.env,s.okx,s.notify,1000,pendle);await runUsdgMonitor(s.env,s.okx,s.notify,10000,pendle);assert.equal(s.alerts.length,0);
 }
 const s=setup();await runUsdgMonitor(s.env,s.okx,s.notify,1000,verified);await assert.rejects(()=>runUsdgMonitor(s.env,s.okx,s.notify,10000,async()=>{throw Error('offline')}));assert.equal(s.alerts.length,0);
});
