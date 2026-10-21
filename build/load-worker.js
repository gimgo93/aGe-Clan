// Isolated, authenticated test deployment only. Never imported by production.
import {ClanRoom} from '../lib/clan-room.js';
import {newPlayer,startRoom,restore} from '../lib/match-engine.js';
import Defense from '../lib/game-engine.js';
export class LoadRoom extends ClanRoom{
 async persist(directory=false){if(this.storageDisabled){this.savedAt=Date.now();return;}return super.persist(directory);}
 serial(fn){const queued=performance.now();return super.serial(async()=>{const began=performance.now();try{return await fn();}finally{this.samples??=[];this.samples.push({queueMs:began-queued,workMs:performance.now()-began});if(this.samples.length>2000)this.samples.shift();}});}
 async fetch(req){const path=new URL(req.url).pathname;
  if(path==='/seed'){
   const {id,scenario}=await req.json();this.storageDisabled=scenario==='early-nostore';this.id=id;this.version=0;this.samples=[];const now=Date.now();this.room={private:true,solo:false,status:'waiting',tick:now,players:Array.from({length:5},(_,i)=>({...newPlayer('p'+i,'load-'+i,now),key:'load-'+i}))};this.room.hostId='p0';startRoom(this.room,now);
   for(const p of this.room.players)p.s.gold=1e8;
   if(scenario==='late')for(const p of this.room.players){const g=restore(p);Object.assign(p.s,{gold:1e8,crystals:1e6,castle:20,hp:1e8,maxHp:1e8,miners:30,wave:24,completed:24});for(let i=0;i<50;i++)g.hireWoodcutter();for(let pad=0;pad<22;pad++)g.build(Defense.TYPES[pad%Defense.TYPES.length].id,pad);for(const tower of p.s.towers)tower.buildRemaining=0;g.startWave(2);p.nextId=g.id;}
   await this.persist();return Response.json({ok:true});
  }
  if(path==='/stats'){const pct=(key,p)=>{const a=(this.samples||[]).map(x=>x[key]).sort((a,b)=>a-b);return a[Math.min(a.length-1,Math.floor(a.length*p))]||0;};return Response.json({queueP95:pct('queueMs',.95),workP95:pct('workMs',.95),workMax:pct('workMs',1),samples:this.samples?.length||0,players:this.room?.players.map(p=>({enemies:p.s.enemies.length,towers:p.s.towers.length,workers:p.s.workers.length,wave:p.s.wave})),lagMs:Math.max(0,Date.now()-(this.room?.tick||Date.now()))});}
  if(path==='/dispose'){if(this.timer){clearTimeout(this.timer);this.timer=null;}for(const ws of this.sockets.keys())ws.close(1000,'test complete');this.sockets.clear();await this.env.DB.prepare('DELETE FROM clan_rooms WHERE id=?').bind(this.id).run();await this.ctx.storage.deleteAll();return Response.json({ok:true});}
  return super.fetch(req);
 }
}
export default{async fetch(req,env){
 if(!env.LOAD_TEST_TOKEN||req.headers.get('x-load-token')!==env.LOAD_TEST_TOKEN)return new Response('Forbidden',{status:403});
 if(new URL(req.url).pathname==='/echo'){const pair=new WebSocketPair(),[client,server]=Object.values(pair);server.accept();server.addEventListener('message',e=>server.send(e.data));return new Response(null,{status:101,webSocket:client});}
 const url=new URL(req.url),id=url.searchParams.get('room');if(!/^load-[a-z0-9-]{1,70}$/.test(id||''))return new Response('Bad room',{status:400});
 const stub=env.CLAN_ROOMS.get(env.CLAN_ROOMS.idFromName(id));
 if(url.pathname==='/seed'||url.pathname==='/stats'||url.pathname==='/dispose')return stub.fetch(new Request('https://internal'+url.pathname,{method:req.method,headers:{'Content-Type':'application/json'},body:req.method==='POST'?JSON.stringify({id,scenario:url.searchParams.get('scenario')}):undefined}));
 if(url.pathname!=='/socket')return new Response('Not found',{status:404});
 const p=url.searchParams.get('player');if(!/^[0-4]$/.test(p||''))return new Response('Bad player',{status:400});
 const h=new Headers(req.headers);h.set('x-clan-room',id);h.set('x-clan-key','load-'+p);return stub.fetch(new Request(req,{headers:h}));
}};
