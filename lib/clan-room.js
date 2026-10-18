import {DurableObject} from 'cloudflare:workers';
import {advance} from './match-engine.js';
import {mutateRoom,roomView,roomError,delta} from './room-state.js';

export class ClanRoom extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;this.sockets=new Map();this.chain=Promise.resolve();this.timer=null;this.savedAt=0;this.directoryAt=0;}
 serial(fn){const next=this.chain.then(fn);this.chain=next.catch(()=>{});return next;}
 async load(id){if(this.room)return;const saved=await this.ctx.storage.get('room');if(saved){Object.assign(this,saved);return;}const row=await this.env.DB.prepare('SELECT * FROM clan_rooms WHERE id=?').bind(id).first();if(!row)throw roomError('매칭방이 만료되었습니다.',404);this.id=id;this.room=JSON.parse(row.state);this.version=row.version;}
 async persist(directory=false){const now=Date.now();await this.ctx.storage.put('room',{id:this.id,room:this.room,version:this.version});this.savedAt=now;if(directory||now-this.directoryAt>=5000){await this.env.DB.prepare('UPDATE clan_rooms SET state=?,status=?,version=?,updated=? WHERE id=?').bind(JSON.stringify(this.room),this.room.status,this.version,now,this.id).run();this.directoryAt=now;}}
 view(key,watch,result){return roomView(this.id,this.version,this.room,key,watch,result);}
 send(ws,force=false){const c=this.sockets.get(ws);if(!c)return;const current=JSON.parse(JSON.stringify(this.view(c.key,c.watch)));let message={type:'snapshot',value:current};if(!force&&c.previous){const patch=delta(c.previous,current);const compact={type:'patch',baseVersion:c.previous.version,version:current.version,patch};if(JSON.stringify(compact).length<JSON.stringify(message).length)message=compact;}ws.send(JSON.stringify(message));c.previous=current;}
 broadcast(){for(const ws of this.sockets.keys())try{this.send(ws);}catch{this.sockets.delete(ws);}}
 schedule(){if(this.timer||!this.sockets.size)return;this.timer=setTimeout(()=>{this.timer=null;this.serial(async()=>{
  const now=Date.now(),status=this.room.status;
  for(const [ws,c] of this.sockets){if(now-c.lastMessage>25000){ws.close(1001,'heartbeat timeout');this.sockets.delete(ws);}else{const p=this.room.players.find(p=>p.key===c.key);if(p&&!p.left)p.seen=now;}}
  advance(this.room,now);this.version++;
  if(now-this.savedAt>=2000||status!==this.room.status)await this.persist(status!==this.room.status);
  this.broadcast();
 }).catch(e=>console.error('room tick',e.message)).finally(()=>this.schedule());},200);}
 async fetch(req){return this.serial(async()=>{try{
  const id=req.headers.get('x-clan-room'),key=req.headers.get('x-clan-key');if(!id||!key)throw roomError('잘못된 연결입니다.',403);await this.load(id);
  if(req.headers.get('Upgrade')?.toLowerCase()==='websocket'){
   if(!this.room.players.some(p=>p.key===key&&!p.left))throw roomError('이 방의 참가자가 아닙니다.',403);
   const pair=new WebSocketPair(),[client,server]=Object.values(pair);server.accept();
   for(const [ws,c] of this.sockets)if(c.key===key){ws.close(1000,'replaced');this.sockets.delete(ws);}
   this.sockets.set(server,{key,watch:null,lastMessage:Date.now(),lastCommand:0,previous:null});
   server.addEventListener('message',ev=>this.serial(()=>this.message(server,ev.data)).catch(e=>{try{server.send(JSON.stringify({type:'error',error:e.message,status:e.status||500}));}catch{}}));
   const closed=()=>{this.sockets.delete(server);if(!this.sockets.size&&this.timer){clearTimeout(this.timer);this.timer=null;}this.ctx.waitUntil(this.serial(()=>this.persist()).catch(()=>{}));};server.addEventListener('close',closed);server.addEventListener('error',closed);
   this.send(server,true);this.schedule();return new Response(null,{status:101,webSocket:client});
  }
  const input=await req.json(),status=this.room.status,result=mutateRoom(this.room,key,input);this.version++;await this.persist(input.op!=='poll'||status!==this.room.status);this.broadcast();this.schedule();return Response.json(input.op==='leave'?{ok:true}:this.view(key,input.watchId,result),{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e.message},{status:e.status||500});}});}
 async message(ws,raw){const c=this.sockets.get(ws);if(!c)return;if(typeof raw!=='string'||raw.length>2048){ws.close(1009,'message too large');return;}let m;try{m=JSON.parse(raw);}catch{throw roomError('잘못된 메시지입니다.',400);}if(!m||typeof m!=='object')throw roomError('잘못된 메시지입니다.',400);c.lastMessage=Date.now();
  if(m.type==='ping'){ws.send(JSON.stringify({type:'pong',sentAt:m.sentAt}));return;}
  if(m.type==='watch'){c.watch=typeof m.id==='string'?m.id:null;this.send(ws,true);return;}
  if(m.type==='resync'){this.send(ws,true);return;}
  if(m.type!=='command'||!['action','begin','leave'].includes(m.input?.op))throw roomError('지원하지 않는 메시지입니다.',400);
  if(Date.now()-c.lastCommand<80)throw roomError('잠시 후 다시 시도하세요.',429);c.lastCommand=Date.now();
  try{const result=mutateRoom(this.room,c.key,m.input);this.version++;await this.persist();ws.send(JSON.stringify({type:'ack',actionId:m.input.actionId,requestId:m.requestId,value:this.view(c.key,c.watch,result)}));this.broadcast();}
  catch(e){ws.send(JSON.stringify({type:'ack',actionId:m.input.actionId,requestId:m.requestId,error:e.message,status:e.status||500}));}
 }
}
