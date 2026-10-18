export async function clanIdentity(req){
 const current=req.headers.get('cookie')?.match(/(?:^|;\s*)clan_session=([a-f0-9]{64})(?:;|$)/)?.[1];
 const token=current||Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
 const key=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),v=>v.toString(16).padStart(2,'0')).join('');
 return{key,cookie:current?null:`clan_session=${token}; HttpOnly; SameSite=Strict; Path=/api/clan; Max-Age=86400${new URL(req.url).protocol==='https:'?'; Secure':''}`};
}
const fail=(error,status)=>Response.json({error},{status});
function stub(env,id){return env.CLAN_ROOMS.get(env.CLAN_ROOMS.idFromName(id));}
function forward(env,id,key,input){return stub(env,id).fetch(new Request('https://clan.internal/room',{method:'POST',headers:{'Content-Type':'application/json','x-clan-room':id,'x-clan-key':key},body:JSON.stringify(input)}));}
export async function realtimeSocket(req,env){
 const url=new URL(req.url);if(req.headers.get('origin')!==url.origin)return fail('허용되지 않은 연결입니다.',403);
 if(!env.CLAN_ROOMS)return fail('실시간 연결을 사용할 수 없습니다.',503);
 const id=url.searchParams.get('roomId');if(!id||id.length>40)return fail('잘못된 방입니다.',400);
 const {key,cookie}=await clanIdentity(req);if(cookie)return fail('먼저 방에 입장하세요.',401);
 const headers=new Headers(req.headers);headers.set('x-clan-room',id);headers.set('x-clan-key',key);
 return stub(env,id).fetch(new Request(req,{headers}));
}
export async function realtimeRequest(req,env){try{
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return fail('허용되지 않은 요청입니다.',403);
 const raw=await req.text();if(raw.length>2048)return fail('요청이 너무 큽니다.',413);
 let input;try{input=JSON.parse(raw);}catch{return fail('잘못된 JSON 요청입니다.',400);}
 if(!input||!['join','create','joinCode','begin','poll','action','leave'].includes(input.op))return fail('지원하지 않는 요청입니다.',400);
 const {key,cookie}=await clanIdentity(req),db=env.DB,now=Date.now(),entering=['join','create','joinCode'].includes(input.op);
 const withCookie=response=>{const headers=new Headers(response.headers);if(cookie)headers.set('Set-Cookie',cookie);return new Response(response.body,{status:response.status,headers});};
 if(!entering){if(typeof input.roomId!=='string'||input.roomId.length>40)return fail('잘못된 방입니다.',400);return withCookie(await forward(env,input.roomId,key,input));}
 const code=typeof input.code==='string'?input.code.toUpperCase().replace(/[\s-]/g,''):'';
 if(input.op==='joinCode'&&!/^[A-HJ-NP-Z2-9]{8}$/.test(code))return fail('초대 코드 8자리를 입력하세요.',400);
 const old=await db.prepare("SELECT * FROM clan_rooms WHERE status IN ('waiting','countdown','playing') AND updated>? AND EXISTS (SELECT 1 FROM json_each(state,'$.players') p WHERE json_extract(p.value,'$.key')=? AND COALESCE(json_extract(p.value,'$.left'),0)=0 AND COALESCE(json_extract(p.value,'$.s.over'),0)=0) ORDER BY updated DESC LIMIT 1").bind(now-7200000,key).first();
 if(old){const room=JSON.parse(old.state),p=room.players.find(p=>p.key===key);const switching=(input.op==='joinCode'&&old.id!=='F-'+code)||(input.op==='join'&&room.private)||(input.op==='create'&&(!room.private||(input.entryId&&input.entryId!==p.entryId)));
  if(switching)await forward(env,old.id,key,{op:'leave'});else return withCookie(await forward(env,old.id,key,input));}
 if(input.op==='joinCode')return withCookie(await forward(env,'F-'+code,key,input));
 for(let attempt=0;attempt<5;attempt++){
  let row=input.op==='join'?await db.prepare("SELECT id FROM clan_rooms WHERE status='waiting' AND COALESCE(json_extract(state,'$.private'),0)=0 AND updated>? ORDER BY updated ASC LIMIT 1").bind(Date.now()-30000).first():null;
  if(!row){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',id=input.op==='create'?'F-'+Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>alphabet[n%32]).join(''):crypto.randomUUID(),room={status:'waiting',private:input.op==='create',players:[],tick:Date.now()};
   if(input.op==='create'){const inserted=await db.prepare('INSERT OR IGNORE INTO clan_rooms (id,status,state,version,updated) VALUES (?,?,?,0,?)').bind(id,'waiting',JSON.stringify(room),Date.now()).run();if(!inserted.meta.changes)continue;row={id};}
   else{await db.prepare("INSERT INTO clan_rooms (id,status,state,version,updated) SELECT ?,?,?,0,? WHERE NOT EXISTS (SELECT 1 FROM clan_rooms WHERE status='waiting' AND COALESCE(json_extract(state,'$.private'),0)=0 AND updated>?)").bind(id,'waiting',JSON.stringify(room),Date.now(),Date.now()-30000).run();row=await db.prepare("SELECT id FROM clan_rooms WHERE status='waiting' AND COALESCE(json_extract(state,'$.private'),0)=0 AND updated>? ORDER BY updated ASC LIMIT 1").bind(Date.now()-30000).first();}
  }
  if(row){const response=await forward(env,row.id,key,input);if(response.status!==409||input.op==='create')return withCookie(response);}
 }
 return withCookie(fail('새 매칭방을 준비하고 있습니다. 다시 참가해 주세요.',409));
}catch(e){console.error('realtime request',e.message);return fail('대전 서버에 연결하지 못했습니다.',503);}}
