import { canReadSnapshot, claimHttpDriver, timedDatabase } from '../../../lib/http-poll-policy.js';
import { realtimeRequest } from '../../../lib/realtime-router.js';
import { env } from 'cloudflare:workers';
import { newPlayer, advance, startRoom, act, restore } from '../../../lib/match-engine.js';
import { recordAnalyticsEvent,recordGameAction } from '../../../lib/analytics-store.js';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200,cookie?:string)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})}});
async function identity(req:Request){
 const current=req.headers.get('cookie')?.match(/(?:^|;\s*)clan_session=([a-f0-9]{64})(?:;|$)/)?.[1];
 const token=current||Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
 const key=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),v=>v.toString(16).padStart(2,'0')).join('');
 return{key,cookie:current?undefined:`clan_session=${token}; HttpOnly; SameSite=Strict; Path=/api/clan; Max-Age=86400${new URL(req.url).protocol==='https:'?'; Secure':''}`};
}
function view(row:any,room:any,key:string,result?:any,watchId?:string){
 const self=room.players.find((p:any)=>p.key===key);
 return{protocol:2,transport:'http',roomId:row.id,private:!!room.private,code:room.private?row.id.slice(2):null,hostId:room.hostId||null,status:room.status,simulationTime:room.tick,pollAfterMs:room.status==='playing'?(room.httpDriver===self?.id?300:450):1000,version:row.version+1,selfId:self?.id,winner:room.winner||null,result,nextActionSeq:(self?.lastSequence||0)+1,serverTime:Date.now(),readyAt:room.readyAt||null,
 players:room.players.filter((p:any)=>!p.left||room.status==='playing'||room.status==='finished').map((p:any)=>({id:p.id,name:p.name,connected:!p.left&&Date.now()-p.seen<15000,towerCount:p.s.towers.length,s:p.id===self?.id||p.id===watchId?{...p.s,workers:p.s.workers.slice(0,7),events:p.s.events.slice(-24)}:{hp:p.s.hp,maxHp:p.s.maxHp,castle:p.s.castle,wave:p.s.wave,completed:p.s.completed,over:p.s.over,won:p.s.won,gold:p.s.gold,crystals:p.s.crystals,wood:p.s.wood,miners:p.s.miners,population:p.s.population,army:p.s.army}}))};
}
function depart(room:any,key:string,now:number){const p=room.players.find((p:any)=>p.key===key);if(!p)return;if(room.status==='waiting'||room.status==='countdown'){room.players=room.players.filter((x:any)=>x!==p);room.status=room.private&&!room.players.length?'closed':'waiting';room.readyAt=null;if(room.hostId===p.id)room.hostId=room.players[0]?.id||null;}else{if(room.status==='playing'&&!p.s.over)restore(p).finish(false);p.left=true;advance(room,now);}}
export async function POST(req:Request){const began=performance.now(),metrics={queries:0,storageMs:0,retries:0},input=await req.clone().json().catch(()=>null);const response=(env as any).CLAN_ROOMS?await realtimeRequest(req,env):await legacyPOST(req,metrics);const events:any={solo:'pvp_solo_start',create:'pvp_room_create',join:'pvp_room_join',joinCode:'pvp_friend_room_join',begin:'pvp_match_begin',leave:'pvp_leave',leaderboard:'pvp_leaderboard_view'};if(events[input?.op]&&input?.analytics)await recordAnalyticsEvent(env.DB,input.analytics,events[input.op],req,{source:'server',success:response.ok});if(input?.op==='action'&&input?.analytics&&response.ok){const result=await response.clone().json().catch(()=>null);if(!result?.result?.error)await recordGameAction(env.DB,input.analytics,input.action,req);}const headers=new Headers(response.headers);headers.set('Server-Timing',`app;dur=${(performance.now()-began).toFixed(1)}, storage;dur=${metrics.storageMs.toFixed(1)}`);headers.set('X-Clan-Queries',String(metrics.queries));headers.set('X-Clan-Retries',String(metrics.retries));return new Response(response.body,{status:response.status,headers});}
async function legacyPOST(req:Request,metrics:{queries:number,storageMs:number,retries:number}){
 try{
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'허용되지 않은 요청입니다.'},403);
 if(Number(req.headers.get('content-length'))>2048)return json({error:'요청이 너무 큽니다.'},413);
 const raw=await req.text();if(raw.length>2048)return json({error:'요청이 너무 큽니다.'},413);
 let input:any;try{input=JSON.parse(raw);}catch{return json({error:'잘못된 JSON 요청입니다.'},400);}
 if(!input||typeof input!=='object'||Array.isArray(input))return json({error:'잘못된 요청입니다.'},400);
 const {key,cookie}=await identity(req),db=timedDatabase(env.DB!,metrics);
 if(!['join','create','joinCode','begin','poll','action','leave'].includes(input.op))return json({error:'지원하지 않는 요청입니다.'},400,cookie);
 const entering=['join','create','joinCode'].includes(input.op);
 const code=typeof input.code==='string'?input.code.toUpperCase().replace(/[\s-]/g,''):'';
 if(input.op==='joinCode'&&!/^[A-HJ-NP-Z2-9]{8}$/.test(code))return json({error:'영문과 숫자로 된 초대 코드 8자리를 입력하세요.'},400,cookie);
 for(let attempt=0;attempt<(input.op==='poll'?4:8);attempt++){
 const now=Date.now();let row:any;
 if(entering){
   if(attempt===0)await db.prepare('DELETE FROM clan_rooms WHERE id IN (SELECT id FROM clan_rooms WHERE updated<? LIMIT 20)').bind(now-86400000).run();
   row=await db.prepare("SELECT * FROM clan_rooms WHERE status IN ('waiting','countdown','playing') AND updated>? AND EXISTS (SELECT 1 FROM json_each(state,'$.players') p WHERE json_extract(p.value,'$.key')=? AND COALESCE(json_extract(p.value,'$.left'),0)=0 AND COALESCE(json_extract(p.value,'$.s.over'),0)=0) ORDER BY updated DESC LIMIT 1").bind(now-7200000,key).first();
   if(row){const old=JSON.parse(row.state),member=old.players.find((p:any)=>p.key===key);const switching=(input.op==='joinCode'&&row.id!=='F-'+code)||(input.op==='join'&&old.private)||(input.op==='create'&&(!old.private||(input.entryId&&input.entryId!==member.entryId)));
     if(switching){depart(old,key,now);await db.prepare('UPDATE clan_rooms SET state=?,status=?,version=version+1,updated=? WHERE id=? AND version=?').bind(JSON.stringify(old),old.status,now,row.id,row.version).run();continue;}}
   if(!row&&input.op==='joinCode'){
     row=await db.prepare('SELECT * FROM clan_rooms WHERE id=? AND updated>?').bind('F-'+code,now-30000).first();
     if(!row||!JSON.parse(row.state).private)return json({error:'코드에 해당하는 방이 없거나 만료되었습니다.'},404,cookie);
   }
   if(!row&&input.op==='create'){
     const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',bytes=crypto.getRandomValues(new Uint8Array(8));
     const id='F-'+Array.from(bytes,n=>alphabet[n%32]).join(''),room={status:'waiting',private:true,players:[],tick:now};
     const inserted=await db.prepare('INSERT OR IGNORE INTO clan_rooms (id,status,state,version,updated) VALUES (?,?,?,0,?)').bind(id,'waiting',JSON.stringify(room),now).run();
     if(!inserted.meta.changes)continue;row={id,status:'waiting',state:JSON.stringify(room),version:0};
   }
   if(!row)row=await db.prepare("SELECT * FROM clan_rooms WHERE status='waiting' AND COALESCE(json_extract(state,'$.private'),0)=0 AND updated>? ORDER BY updated ASC LIMIT 1").bind(now-30000).first();
   if(!row){const id=crypto.randomUUID(),room={status:'waiting',players:[],tick:now};await db.prepare("INSERT INTO clan_rooms (id,status,state,version,updated) SELECT ?,?,?,0,? WHERE NOT EXISTS (SELECT 1 FROM clan_rooms WHERE status='waiting' AND COALESCE(json_extract(state,'$.private'),0)=0 AND updated>?)").bind(id,'waiting',JSON.stringify(room),now,now-30000).run();row=await db.prepare("SELECT * FROM clan_rooms WHERE status='waiting' AND COALESCE(json_extract(state,'$.private'),0)=0 AND updated>? ORDER BY updated ASC LIMIT 1").bind(now-30000).first();if(!row)continue;}
 }else{
   if(typeof input.roomId!=='string'||input.roomId.length>40)return json({error:'매칭방을 찾을 수 없습니다.'},400,cookie);
   row=await db.prepare('SELECT * FROM clan_rooms WHERE id=?').bind(input.roomId).first();
 }
 if(!row)return json({error:'매칭방이 만료되었습니다.'},404,cookie);
 const room=JSON.parse(row.state);
 if(room.status==='waiting'||room.status==='countdown'){room.players=room.players.filter((p:any)=>now-p.seen<30000);if(room.players.length<(room.private?2:5)){room.status='waiting';room.readyAt=null;}if(room.private&&!room.players.some((p:any)=>p.id===room.hostId))room.hostId=room.players[0]?.id||null;}
 let player=room.players.find((p:any)=>p.key===key&&!p.left);
 if(!player&&entering&&room.status==='waiting'&&room.players.length<5){
   const name=typeof input.name==='string'?input.name.trim().replace(/[\u0000-\u001f<>]/g,'').slice(0,16):'';
   player={...newPlayer(crypto.randomUUID(),name||'군주 '+(room.players.length+1),now),key,entryId:typeof input.entryId==='string'?input.entryId.slice(0,64):null};room.players.push(player);if(room.private&&!room.hostId)room.hostId=player.id;
 }
 if(!player){if(input.op==='leave')return json({ok:true},200,cookie);if(entering&&room.private)return json({error:room.status==='waiting'?'방이 가득 찼습니다. 최대 5명까지 참가할 수 있습니다.':'이미 시작했거나 종료된 방입니다.'},409,cookie);if(input.op==='join')continue;return json({error:'이 방의 참가자가 아닙니다. 다시 매칭해 주세요.'},403,cookie);}
 // Concurrent viewers reuse a recent committed snapshot without replaying physics or writing it again.
 if(input.op==='poll'&&canReadSnapshot(room,player,row.updated,now))return json(view({...row,version:row.version-1},room,key,undefined,input.watchId),200,cookie);
 // A forfeited player cannot resurrect by polling after the reconnect grace period.
 claimHttpDriver(room,player,now);advance(room,now);player.seen=now;
 let result:any;
 if(input.op==='leave'){
   depart(room,key,now);
 }else if(input.op==='begin'){
   if(!room.private||room.hostId!==player.id)return json({error:'방장만 친구 대전을 시작할 수 있습니다.'},403,cookie);
   if(room.status==='waiting'){if(room.players.length<2)return json({error:'최소 2명이 참가해야 시작할 수 있습니다.'},409,cookie);room.status='countdown';room.readyAt=now+5000;}
 }else if(input.op==='action'){
   if(typeof input.actionId!=='string'||!/^[a-zA-Z0-9-]{8,64}$/.test(input.actionId)||!Array.isArray(input.args)||input.args.length>2||!Number.isSafeInteger(input.sequence)||input.sequence<1)return json({error:'잘못된 명령입니다.'},400,cookie);
   const receipt=player.receipts.find((r:any)=>r.id===input.actionId);
   if(receipt)result=receipt.result;
   else if(input.sequence!==(player.lastSequence||0)+1)result={error:'이미 처리했거나 순서가 지난 명령입니다. 다시 선택해 주세요.'};
   else if(now-(player.lastAction||0)<100)return json({error:'잠시 후 다시 시도하세요.'},429,cookie);
   else{result=act(room,player,input.action,input.args);player.lastAction=now;player.lastSequence=input.sequence;player.receipts.push({id:input.actionId,result:{ok:result.ok,error:result.error}});player.receipts=player.receipts.slice(-40);}
 }
 if(!room.private&&room.status==='waiting'&&room.players.length===5){room.status='countdown';room.readyAt=now+5000;}
 const updated=await db.prepare('UPDATE clan_rooms SET state=?,status=?,version=version+1,updated=? WHERE id=? AND version=?').bind(JSON.stringify(room),room.status,now,row.id,row.version).run();
 if(updated.meta.changes)return json(input.op==='leave'?{ok:true}:view(row,room,key,result,input.watchId),200,cookie);
 metrics.retries++;await new Promise(resolve=>setTimeout(resolve,10+Math.random()*30));
 }
 return json({error:'다른 명령을 처리 중입니다. 잠시 후 다시 시도하세요.'},409);
 }catch(error){console.error('clan request failed',error instanceof Error?error.message:'error');return json({error:'대전 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.'},503);}
}
export async function GET(){try{await env.DB!.prepare('SELECT 1 AS ok').first();return json({status:'ready',capacity:5,protocol:2,transport:(env as any).CLAN_ROOMS?'websocket':'http'});}catch{return json({status:'unavailable'},503);}}
