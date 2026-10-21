import {accountIdentity} from './account-store.js';
let rankingCache=null;
export const clanIdentity=accountIdentity;
const fail=(error,status)=>Response.json({error},{status});
function stub(env,id){return env.CLAN_ROOMS.get(env.CLAN_ROOMS.idFromName(id));}
function forward(env,id,key,input){return stub(env,id).fetch(new Request('https://clan.internal/room',{method:'POST',headers:{'Content-Type':'application/json','x-clan-room':id,'x-clan-key':key},body:JSON.stringify(input)}));}
export async function realtimeSocket(req,env){
 const url=new URL(req.url);if(req.headers.get('origin')!==url.origin)return fail('허용되지 않은 연결입니다.',403);
 if(!env.CLAN_ROOMS)return fail('실시간 연결을 사용할 수 없습니다.',503);
 const id=url.searchParams.get('roomId');if(!id||id.length>40)return fail('잘못된 방입니다.',400);
 const {key,cookie}=await clanIdentity(req,env);if(cookie)return fail('먼저 방에 입장하세요.',401);
 const headers=new Headers(req.headers);headers.set('x-clan-room',id);headers.set('x-clan-key',key);
 return stub(env,id).fetch(new Request(req,{headers}));
}
export async function realtimeRequest(req,env){try{
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return fail('허용되지 않은 요청입니다.',403);
 const raw=await req.text();if(raw.length>2048)return fail('요청이 너무 큽니다.',413);
 let input;try{input=JSON.parse(raw);}catch{return fail('잘못된 JSON 요청입니다.',400);}
 if(!input||!['solo','leaderboard','join','create','joinCode','begin','poll','action','leave'].includes(input.op))return fail('지원하지 않는 요청입니다.',400);
 const {key,cookie,accountId}=await clanIdentity(req,env),db=env.DB,now=Date.now(),entering=['solo','join','create','joinCode'].includes(input.op);
 delete input.accountId;if(accountId&&entering){input.accountId=accountId;const profile=await db.prepare('SELECT name,avatar FROM clan_accounts WHERE id=?').bind(accountId).first();if(profile){input.name=profile.name;input.avatar=profile.avatar;}}
 const withCookie=response=>{const headers=new Headers(response.headers);if(cookie)headers.set('Set-Cookie',cookie);return new Response(response.body,{status:response.status,headers});};
 if(input.op==='leaderboard'){
  if(!accountId)return withCookie(fail('랭킹은 Google 로그인 후 이용할 수 있습니다.',401));
  if(!rankingCache||rankingCache.expires<now){const rows=await db.prepare('SELECT a.name,a.avatar,r.wave,RANK() OVER (ORDER BY r.wave DESC) AS rank FROM clan_rankings r JOIN clan_accounts a ON a.id=r.account_id ORDER BY r.wave DESC,r.updated ASC LIMIT 20').all();rankingCache={expires:now+5000,items:rows.results||[]};}return withCookie(Response.json({items:rankingCache.items},{headers:{'Cache-Control':'no-store'}}));
 }
 if(!entering){if(typeof input.roomId!=='string'||input.roomId.length>40)return fail('잘못된 방입니다.',400);return withCookie(await forward(env,input.roomId,key,input));}
 const code=typeof input.code==='string'?input.code.toUpperCase().replace(/[\s-]/g,''):'';
 if(input.op==='joinCode'&&!/^[A-HJ-NP-Z2-9]{8}$/.test(code))return fail('초대 코드 8자리를 입력하세요.',400);
 // Hash the trusted ingress IP; no raw IP address is persisted.
 const ip=req.headers.get('x-clan-ingress')||req.headers.get('CF-Connecting-IP')||key;
 const rateKey=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('create:'+ip+':'+Math.floor(now/60000)))),b=>b.toString(16).padStart(2,'0')).join('');
 const allowance=await db.prepare('INSERT INTO clan_limits (id,hits,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET hits=hits+1 RETURNING hits').bind(rateKey,now+120000).first();
 if(allowance.hits>12)return withCookie(fail('방 입장이 너무 잦습니다. 1분 뒤 다시 시도하세요.',429));
 await db.prepare('DELETE FROM clan_limits WHERE expires<?').bind(now).run();
 await db.prepare('DELETE FROM clan_rooms WHERE updated<?').bind(now-86400000).run();
 const old=await db.prepare("SELECT * FROM clan_rooms WHERE status IN ('waiting','countdown','playing') AND updated>? AND EXISTS (SELECT 1 FROM json_each(state,'$.players') p WHERE json_extract(p.value,'$.key')=? AND COALESCE(json_extract(p.value,'$.left'),0)=0 AND COALESCE(json_extract(p.value,'$.s.over'),0)=0) ORDER BY updated DESC LIMIT 1").bind(now-7200000,key).first();
 if(old){const room=JSON.parse(old.state),p=room.players.find(p=>p.key===key);const switching=input.op==='solo'||!!room.solo||(input.op==='joinCode'&&old.id!=='F-'+code)||(input.op==='join'&&room.private)||(input.op==='create'&&(!room.private||(input.entryId&&input.entryId!==p.entryId)));
  if(switching)await forward(env,old.id,key,{op:'leave'});else return withCookie(await forward(env,old.id,key,input));}
 if(input.op==='joinCode')return withCookie(await forward(env,'F-'+code,key,input));
 for(let attempt=0;attempt<5;attempt++){
  let row=input.op==='join'?await db.prepare("SELECT id FROM clan_rooms WHERE status='waiting' AND COALESCE(json_extract(state,'$.private'),0)=0 AND updated>? ORDER BY updated ASC LIMIT 1").bind(Date.now()-30000).first():null;
  if(!row){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',id=input.op==='create'?'F-'+Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>alphabet[n%32]).join(''):crypto.randomUUID(),room={status:'waiting',solo:input.op==='solo',private:input.op!=='join',players:[],tick:Date.now()};
   if(input.op!=='join'){const inserted=await db.prepare('INSERT OR IGNORE INTO clan_rooms (id,status,state,version,updated) VALUES (?,?,?,0,?)').bind(id,'waiting',JSON.stringify(room),Date.now()).run();if(!inserted.meta.changes)continue;row={id};}
   else{await db.prepare("INSERT INTO clan_rooms (id,status,state,version,updated) SELECT ?,?,?,0,? WHERE NOT EXISTS (SELECT 1 FROM clan_rooms WHERE status='waiting' AND COALESCE(json_extract(state,'$.private'),0)=0 AND updated>?)").bind(id,'waiting',JSON.stringify(room),Date.now(),Date.now()-30000).run();row=await db.prepare("SELECT id FROM clan_rooms WHERE status='waiting' AND COALESCE(json_extract(state,'$.private'),0)=0 AND updated>? ORDER BY updated ASC LIMIT 1").bind(Date.now()-30000).first();}
  }
  if(row){const response=await forward(env,row.id,key,input);if(response.status!==409||input.op!=='join')return withCookie(response);}
 }
 return withCookie(fail('새 매칭방을 준비하고 있습니다. 다시 참가해 주세요.',409));
}catch(e){console.error('realtime request',e.message);return fail('대전 서버에 연결하지 못했습니다.',503);}}
