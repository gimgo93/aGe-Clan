// HTTP regression for early body rejection. Wrangler 4.92 reproduced 503 here;
// the pinned newer preview toolchain must return the original HTTP status.
import assert from 'node:assert/strict';
const base=new URL(process.env.CLAN_TEST_URL||'http://127.0.0.1:8787');
if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname))throw Error('Disposable loopback test only');
async function send(path,body,status,method='POST'){
 const response=await fetch(new URL(path,base),{method,headers:{origin:base.origin,'content-type':'application/json'},body});
 assert.equal(response.status,status,path+': '+await response.text());
}
for(const [path,max] of [['/api/clan',2048],['/api/clan/account',12000],['/api/feedback',8000],['/api/clan/analytics',1200]])await send(path,'x'.repeat(max+1),413);
await send('/api/clan/analytics','x'.repeat(501),413,'DELETE');
await send('/api/clan',new Uint8Array([0xff,0xfe]),400);
await send('/api/clan/account','null',400);await send('/api/clan/account','[]',400);
await send('/api/clan/account',JSON.stringify({op:'status'}),200);
const identity={visitorId:crypto.randomUUID(),sessionId:crypto.randomUUID()};
await send('/api/clan/analytics',JSON.stringify({event:'page_view',analytics:identity}),202);
await send('/api/clan/analytics',JSON.stringify({analytics:identity}),200,'DELETE');
await send('/api/clan/analytics',JSON.stringify({event:'game_start',analytics:identity}),202);
console.log('PASS: built local Worker enforces byte/UTF-8/object boundaries, account status and withdrawal/late-event handling');
