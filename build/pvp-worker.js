import {realtimeRequest,realtimeSocket} from '../lib/realtime-router.js';
export {ClanRoom} from '../lib/clan-room.js';
export default{
 async fetch(request,env){
  const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
  const expected=env.CLAN_BACKEND_TOKEN,provided=request.headers.get('x-clan-backend-token');
  if(typeof expected!=='string'||expected.length<32)return json({error:'대전 서버 인증 설정이 필요합니다.'},503);
  // Compare digests, not the secret string (no early mismatch timing).
  const digest=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
  if(!provided||provided.length>256)return json({error:'인증되지 않은 요청입니다.'},403);
  const a=await digest(expected),b=await digest(provided);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  if(diff)return json({error:'인증되지 않은 요청입니다.'},403);
  if(!env.CLAN_ROOMS||!env.DB)return json({status:'unavailable',error:'DB와 방 서버 바인딩이 필요합니다.'},503);
  const path=new URL(request.url).pathname;
  if(path==='/api/clan/socket')return realtimeSocket(request,env);
  if(path!=='/api/clan')return json({error:'Not found'},404);
  if(request.method==='GET'){
   try{await env.DB.prepare('SELECT 1 AS ok').first();return json({status:'ready',protocol:2,capacity:5,transport:'websocket',storage:'durable-object',directory:'d1'});}
   catch{return json({status:'unavailable'},503);}
  }
  if(request.method==='POST')return realtimeRequest(request,env);
  return json({error:'Method not allowed'},405);
 }
};
