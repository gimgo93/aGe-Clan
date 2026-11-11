import {DurableObject} from 'cloudflare:workers';
import {advance} from './match-engine.js';
import {mutateRoom,roomView,roomError,delta} from './room-state.js';
import {RoomDirectory,directoryRecord} from './room-directory.js';
import {saveAccountProgress,stateRecords} from './account-store.js';

export class ClanRoom extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;this.sockets=new Map();this.chain=Promise.resolve();this.timer=null;this.savedAt=0;this.saving=null;this.dirty=false;this.queuedMessages=0;this.directoryAt=0;this.directory=new RoomDirectory(env.DB,p=>ctx.waitUntil(p));}
 serial(fn){const next=this.chain.then(fn);this.chain=next.catch(()=>{});return next;}
 async load(id){if(this.room)return;const saved=await this.ctx.storage.get('room');if(saved){Object.assign(this,saved);return;}const row=await this.env.DB.prepare('SELECT * FROM clan_rooms WHERE id=?').bind(id).first();if(!row)throw roomError('매칭방이 만료되었습니다.',404);const room=JSON.parse(row.state);if(room.directoryOnly)throw roomError('방 저장 상태를 복구할 수 없습니다. 새 방을 만들어 주세요.',503);this.id=id;this.room=room;this.version=row.version;}
 checkpoint(directory=false){this.dirty=true;this.directoryDirty||=directory;if(this.saving)return;this.saving=(async()=>{while(this.dirty){this.dirty=false;const force=this.directoryDirty;this.directoryDirty=false;await this.persist(force);}})().catch(e=>{this.dirty=true;console.error('room checkpoint',e.message);}).finally(()=>{this.saving=null;});this.ctx.waitUntil(this.saving);}
 async alarm(){const saved=await this.ctx.storage.get('room');const id=this.id||saved?.id;if(this.sockets.size){await this.ctx.storage.setAlarm(Date.now()+86400000);return;}if(id)await this.env.DB.prepare('DELETE FROM clan_rooms WHERE id=?').bind(id).run();await this.ctx.storage.deleteAll();}
 async saveRanking(){const p=this.room.solo&&this.room.players[0];if(!p?.accountId||p.s.completed<1||p.s.completed<=(this.rankedWave||0))return;this.rankedWave=p.s.completed;this.ctx.waitUntil(this.env.DB.prepare('INSERT INTO clan_rankings (id,name,avatar,wave,updated,account_id) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM clan_accounts WHERE id=?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,avatar=excluded.avatar,wave=MAX(clan_rankings.wave,excluded.wave),updated=excluded.updated,account_id=excluded.account_id').bind(p.key,p.name,p.avatar||0,p.s.completed,Date.now(),p.accountId,p.accountId).run().catch(e=>{this.rankedWave=0;console.error('ranking save',e.message);}));}
 async persist(directory=false){const now=Date.now();await this.ctx.storage.put('room',structuredClone({id:this.id,room:this.room,version:this.version}),{allowUnconfirmed:true,allowConcurrency:true});await this.ctx.storage.setAlarm(now+86400000,{allowUnconfirmed:true,allowConcurrency:true});this.savedAt=now;if(directory||now-this.directoryAt>=5000){this.directoryAt=now;this.directory.enqueue(directoryRecord(this.id,this.room,this.version,now));this.progressSaved??=new Map();for(const p of this.room.players){if(!p.accountId)continue;const signature=JSON.stringify(stateRecords(p.s));if(this.progressSaved.get(p.id)===signature)continue;this.progressSaved.set(p.id,signature);this.ctx.waitUntil(saveAccountProgress(this.env.DB,p).catch(e=>{this.progressSaved.delete(p.id);console.error('account progress',e.message);}));}}}
 view(key,watch,result){return roomView(this.id,this.version,this.room,key,watch,result);}
 send(ws,force=false){const c=this.sockets.get(ws);if(!c)return;const current=JSON.parse(JSON.stringify(this.view(c.key,c.watch)));let message={type:'snapshot',value:current};if(!force&&c.previous){const patch=delta(c.previous,current);const compact={type:'patch',baseVersion:c.previous.version,version:current.version,patch};if(JSON.stringify(compact).length<JSON.stringify(message).length)message=compact;}ws.send(JSON.stringify(message));c.previous=current;}
 broadcast(){for(const ws of this.sockets.keys())try{this.send(ws);}catch{this.sockets.delete(ws);}}
 schedule(){if(this.timer||!this.sockets.size)return;this.timer=setTimeout(()=>{this.timer=null;this.serial(async()=>{
  const now=Date.now(),status=this.room.status;
  for(const [ws,c] of this.sockets){if(now-c.lastMessage>25000){ws.close(1001,'heartbeat timeout');this.sockets.delete(ws);}else{const p=this.room.players.find(p=>p.key===c.key);if(p&&!p.left)p.seen=now;}}
  advance(this.room,now);this.version++;
  if(now-this.savedAt>=2000||status!==this.room.status)this.checkpoint(status!==this.room.status);this.saveRanking();
  this.broadcast();
 }).catch(e=>console.error('room tick',e.message)).finally(()=>this.schedule());},200);}
 async fetch(req){
  const now=Date.now(),key=req.headers.get('x-clan-key');this.httpWindow??={at:now,hits:0,users:new Map()};if(now-this.httpWindow.at>=1000)this.httpWindow={at:now,hits:0,users:new Map()};
  const perUser=(this.httpWindow.users.get(key)||0)+1;this.httpWindow.users.set(key,perUser);
  if(++this.httpWindow.hits>35||perUser>12||this.queuedMessages>=40)return Response.json({error:'잠시 후 다시 시도하세요.'},{status:429});
  this.queuedMessages++;return this.serial(async()=>{try{
  const id=req.headers.get('x-clan-room'),key=req.headers.get('x-clan-key');if(!id||!key)throw roomError('잘못된 연결입니다.',403);await this.load(id);
  if(req.headers.get('Upgrade')?.toLowerCase()==='websocket'){
   if(!this.room.players.some(p=>p.key===key&&!p.left))throw roomError('이 방의 참가자가 아닙니다.',403);
   const pair=new WebSocketPair(),[client,server]=Object.values(pair);server.accept();
   for(const [ws,c] of this.sockets)if(c.key===key){ws.close(1000,'replaced');this.sockets.delete(ws);}
   this.sockets.set(server,{key,watch:null,lastMessage:Date.now(),lastCommand:0,previous:null});
   server.addEventListener('message',ev=>{
    const c=this.sockets.get(server),now=Date.now();if(!c)return;
    if(now-(c.windowAt||0)>1000){c.windowAt=now;c.windowHits=0;}c.windowHits=(c.windowHits||0)+1;
    if(typeof ev.data!=='string'||ev.data.length>2048||c.windowHits>30||this.queuedMessages>=40){server.close(1008,'request limit');this.sockets.delete(server);return;}
    this.queuedMessages++;this.serial(()=>this.message(server,ev.data)).catch(e=>{try{server.send(JSON.stringify({type:'error',error:e.message,status:e.status||500}));}catch{}}).finally(()=>this.queuedMessages--);
   });
   const closed=()=>{this.sockets.delete(server);if(!this.sockets.size&&this.timer){clearTimeout(this.timer);this.timer=null;}this.ctx.waitUntil(this.serial(()=>this.persist(true)).catch(()=>{}));};server.addEventListener('close',closed);server.addEventListener('error',closed);
   this.send(server,true);this.schedule();return new Response(null,{status:101,webSocket:client});
  }
  const input=await req.json(),status=this.room.status,result=mutateRoom(this.room,key,input);this.version++;
  const membership=['solo','join','create','joinCode','leave'].includes(input.op);if(membership||Date.now()-this.savedAt>=2000||status!==this.room.status)this.checkpoint(membership||status!==this.room.status);this.saveRanking();
  this.broadcast();this.schedule();return Response.json(input.op==='leave'?{ok:true}:this.view(key,input.watchId,result),{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e.message},{status:e.status||500});}}).finally(()=>this.queuedMessages--);}
 async message(ws,raw){const c=this.sockets.get(ws);if(!c)return;if(typeof raw!=='string'||raw.length>2048){ws.close(1009,'message too large');return;}let m;try{m=JSON.parse(raw);}catch{throw roomError('잘못된 메시지입니다.',400);}if(!m||typeof m!=='object')throw roomError('잘못된 메시지입니다.',400);c.lastMessage=Date.now();
  if(m.type==='ping'){ws.send(JSON.stringify({type:'pong',sentAt:m.sentAt}));return;}
  if(['watch','resync'].includes(m.type)&&Date.now()-(c.lastSnapshot||0)<500)return;if(['watch','resync'].includes(m.type))c.lastSnapshot=Date.now();
  if(m.type==='watch'){c.watch=typeof m.id==='string'?m.id:null;this.send(ws,true);return;}
  if(m.type==='resync'){this.send(ws,true);return;}
  if(m.type!=='command'||!['action','begin','leave'].includes(m.input?.op))throw roomError('지원하지 않는 메시지입니다.',400);
  if(Date.now()-c.lastCommand<80)throw roomError('잠시 후 다시 시도하세요.',429);c.lastCommand=Date.now();
  try{const result=mutateRoom(this.room,c.key,m.input);this.version++;if(m.input.op==='leave'||Date.now()-this.savedAt>=2000)this.checkpoint(m.input.op==='leave');this.saveRanking();ws.send(JSON.stringify({type:'ack',actionId:m.input.actionId,requestId:m.requestId,value:this.view(c.key,c.watch,result)}));this.broadcast();}
  catch(e){ws.send(JSON.stringify({type:'ack',actionId:m.input.actionId,requestId:m.requestId,error:e.message,status:e.status||500}));}
 }
}
