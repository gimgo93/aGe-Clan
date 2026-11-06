import {newPlayer, advance, act, restore} from './match-engine.js';
import {hasAdminBadge} from './account-badges.js';
import {assignFrontiers,ensureRoomCapacity,roomCapacity} from './room-config.js';

export function roomError(message,status=409){return Object.assign(new Error(message),{status});}
export function depart(room,key,now){
 const p=room.players.find(p=>p.key===key);if(!p)return;
 if(['waiting','countdown'].includes(room.status)){room.players=room.players.filter(x=>x!==p);room.status=room.private&&!room.players.length?'closed':'waiting';room.readyAt=null;if(room.hostId===p.id)room.hostId=room.players[0]?.id||null;}
 else{if(room.status==='playing'&&!p.s.over)restore(p).finish(false);p.left=true;advance(room,now);}
}
export function mutateRoom(room,key,input,now=Date.now()){
 const capacity=ensureRoomCapacity(room);
 const entering=['solo','join','create','joinCode'].includes(input.op);
 if(['waiting','countdown'].includes(room.status)){
  room.players=room.players.filter(p=>now-p.seen<30000);
  if(room.players.length<(room.private?2:capacity)){room.status='waiting';room.readyAt=null;}
  if(room.private&&!room.players.some(p=>p.id===room.hostId))room.hostId=room.players[0]?.id||null;
 }
 let player=room.players.find(p=>p.key===key&&!p.left);
 if(!player&&entering&&room.status==='waiting'&&room.players.length<capacity){
  const name=typeof input.name==='string'?input.name.trim().replace(/[\u0000-\u001f<>]/g,'').slice(0,16):'';
  player={...newPlayer(crypto.randomUUID(),name||'군주 '+(room.players.length+1),now),key,accountId:typeof input.accountId==='string'&&/^[a-f0-9]{64}$/.test(input.accountId)?input.accountId:null,avatar:Number.isInteger(input.avatar)&&input.avatar>=0&&input.avatar<8?input.avatar:0,entryId:typeof input.entryId==='string'?input.entryId.slice(0,64):null};room.players.push(player);if(room.private&&!room.hostId)room.hostId=player.id;
 }
 if(!player){if(input.op==='leave')return{ok:true};throw roomError(entering?'방이 가득 찼거나 이미 시작되었습니다.':'이 방의 참가자가 아닙니다.',entering?409:403);}
 if(room.solo&&entering&&!player.s.started){assignFrontiers(room);player.s.multiplayer=false;restore(player).start();room.status='playing';room.tick=now;}
 advance(room,now);player.seen=now;let result;
 if(input.op==='leave')depart(room,key,now);
 else if(input.op==='begin'){
  if(!room.private||room.hostId!==player.id)throw roomError('방장만 친구 대전을 시작할 수 있습니다.',403);
  if(room.status==='waiting'){if(room.players.length<2)throw roomError('최소 2명이 참가해야 시작할 수 있습니다.');room.status='countdown';room.readyAt=now+5000;}
 }else if(input.op==='action'){
  if(normalizeWatch(room,key,input.watchId))throw roomError('관전 중에는 조작할 수 없습니다. 내 영지로 돌아가세요.',403);
  if(['playerId','selfId','actorId','targetPlayerId'].some(field=>Object.hasOwn(input,field)))throw roomError('다른 참가자의 상태를 변경할 수 없습니다.',403);
  if(typeof input.actionId!=='string'||!/^[a-zA-Z0-9-]{8,64}$/.test(input.actionId)||!Array.isArray(input.args)||input.args.length>2||!Number.isSafeInteger(input.sequence)||input.sequence<1)throw roomError('잘못된 명령입니다.',400);
  const receipt=player.receipts.find(r=>r.id===input.actionId);
  if(receipt)result=receipt.result;
  else if(input.sequence!==(player.lastSequence||0)+1)result={error:'이미 처리했거나 순서가 지난 명령입니다. 다시 선택해 주세요.'};
  else if(now-(player.lastAction||0)<100)throw roomError('잠시 후 다시 시도하세요.',429);
  else{result=act(room,player,input.action,input.args,now);player.lastAction=now;player.lastSequence=input.sequence;player.receipts.push({id:input.actionId,result:{ok:result.ok,error:result.error}});player.receipts=player.receipts.slice(-40);}
 }
 if(!room.private&&room.status==='waiting'&&room.players.length>=capacity){room.status='countdown';room.readyAt=now+5000;}
 return result;
}
export function normalizeWatch(room,key,watchId){
 const self=room.players.find(p=>p.key===key&&!p.left);
 if(!self||!['playing','finished'].includes(room.status)||typeof watchId!=='string')return null;
 return room.players.find(p=>p.id===watchId&&p!==self)?.id||null;
}
export function roomView(id,version,room,key,watchId,result,transport='websocket',badgeEnv){
 const self=room.players.find(p=>p.key===key);
 if(!self)throw roomError('이 방의 참가자가 아닙니다.',403);
 const watchedId=normalizeWatch(room,key,watchId);
 return{solo:!!room.solo,protocol:2,transport,capacity:roomCapacity(room),watchedId,roomId:id,private:!!room.private,code:room.private?id.slice(2):null,hostId:room.hostId||null,status:room.status,version,simulationTime:room.tick,selfId:self.id,winner:room.winner||null,result,nextActionSeq:(self.lastSequence||0)+1,serverTime:Date.now(),readyAt:room.readyAt||null,
 players:room.players.filter(p=>!p.left||['playing','finished'].includes(room.status)).map(p=>({id:p.id,name:p.name,avatar:p.avatar||0,frontier:p.frontier||null,admin:hasAdminBadge(p.accountId,badgeEnv),connected:!p.left&&Date.now()-p.seen<15000,towerCount:p.s.towers.length,s:p.id===self.id||p.id===watchedId?{...p.s,workers:p.s.workers.slice(0,7),events:p.s.events.slice(-24)}:{hp:p.s.hp,maxHp:p.s.maxHp,castle:p.s.castle,wave:p.s.wave,completed:p.s.completed,over:p.s.over,won:p.s.won,gold:p.s.gold,crystals:p.s.crystals,wood:p.s.wood,miners:p.s.miners,population:p.s.population,army:p.s.army}}))};
}
// Arrays are replaced atomically; missing keys are explicit tombstones.
export function delta(before,after){
 if(Object.is(before,after))return undefined;
 const identified=x=>x&&typeof x==='object'&&(typeof x.id==='string'||Number.isSafeInteger(x.id));
 if(Array.isArray(before)&&Array.isArray(after)&&after.every(identified)&&before.every(identified)){
  const old=new Map(before.map(x=>[x.id,x])),entries={};
  for(const value of after){const change=delta(old.get(value.id),value);if(change)entries[value.id]=change;}
  const order=after.map(x=>x.id);
  if(!Object.keys(entries).length&&before.length===after.length&&before.every((x,i)=>x.id===order[i]))return undefined;
  return{order,entries};
 }
 if(Array.isArray(before)&&Array.isArray(after)&&sameValue(before,after))return undefined;
 if(!before||!after||typeof before!=='object'||typeof after!=='object'||Array.isArray(before)||Array.isArray(after))return{set:after};
 const changes={},remove=Object.keys(before).filter(k=>!(k in after));
 for(const k of Object.keys(after)){const d=delta(before[k],after[k]);if(d)changes[k]=d;}
 if(!remove.length&&!Object.keys(changes).length)return undefined;
 return{changes,remove};
}
// Do not stringify the complete snapshot again at each recursive node. A
// selected opponent adds a second live Game tree and amplified that old cost.
function sameValue(a,b){
 if(Object.is(a,b))return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const keys=Object.keys(a);if(keys.length!==Object.keys(b).length)return false;
 return keys.every(key=>Object.hasOwn(b,key)&&sameValue(a[key],b[key]));
}
