import test from 'node:test';
import assert from 'node:assert/strict';
import { sendStockSignal } from './stock-notifier.mjs';
test('internal notifier restricts content and fixes destination, preserves silent summaries',async()=>{
 let calls=[];
 const fetcher=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return Response.json({ok:true});};
 const text='📋 YC 链上信号｜股票价差汇总\n\nAAPLx-USDG +2.1%\nhttps://yc-crypto.pages.dev/monitor/stocks/';
 await sendStockSignal({TG_BOT_TOKEN:'test-secret',TG_CHANNEL_ID:'fixed-channel'},text,{silent:true,chat_id:'other'},fetcher);
 assert.equal(calls[0].body.chat_id,'fixed-channel');assert.equal(calls[0].body.disable_notification,true);
 await assert.rejects(sendStockSignal({},'arbitrary text',{},fetcher),/Invalid stock signal/);
 assert.equal(calls.length,1);
 await assert.rejects(sendStockSignal({TG_BOT_TOKEN:'test',TG_CHANNEL_ID:'channel'},text,{},async()=>Response.json({ok:false},{status:403})),/delivery failed/);
});

test('private stock delivery never sends to the channel or falls back',async()=>{
 const text='📉 YC 链上信号｜股票价差\nhttps://yc-crypto.pages.dev/monitor/stocks/';
 let privateSends=0;
 const env={TG_BOT_TOKEN:'test',TG_CHANNEL_ID:'channel',PRIVATE_NOTIFIER:{send:async(message,options)=>{privateSends++;assert.equal(message,text);assert.equal(options.silent,true);return {delivered:true};}}};
 const fetcher=async()=>{throw Error('channel must not receive private signals');};
 await sendStockSignal(env,text,{private:true,silent:true},fetcher);
 assert.equal(privateSends,1);
 await assert.rejects(sendStockSignal({...env,PRIVATE_NOTIFIER:null},text,{private:true},fetcher),/Private notifier unavailable/);
});
