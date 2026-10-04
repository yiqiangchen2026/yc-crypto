import {TOKENS} from './config.mjs';
import {collect} from './core.mjs';
// Private service binding only. Each invocation parses at most four token responses.
export default {
  async fetch(request) {
    const url=new URL(request.url),batch=Number(url.searchParams.get('batch'));
    if (request.method!=='POST'||url.pathname!=='/collect'||!Number.isInteger(batch)||batch<0||batch>3) return new Response('Not found',{status:404});
    const body=await request.json();
    if (!Number.isFinite(Date.parse(body.timestamp))) return new Response('Invalid timestamp',{status:400});
    const rows=await collect(TOKENS.slice(batch*4,batch*4+4),fetch,body.timestamp,()=>new Promise(resolve=>setTimeout(resolve,2000)));
    return Response.json(rows);
  }
};
