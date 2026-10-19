import {newPlayer, advance, act, restore} from './match-engine.js';

export function roomError(message,status=409){return Object.assign(new Error(message),{status});}
export function depart(room,key,now){
 const p=room.players.find(p=>p.key===key);if(!p)return;
 if(['waiting','countdown'].includes(room.status)){room.players=room.players.filter(x=>x!==p);room.status=room.private&&!room.players.length?'closed':'waiting';room.readyAt=null;if(room.hostId===p.id)room.hostId=room.players[0]?.id||null;}
 else{if(room.status==='playing'&&!p.s.over)restore(p).finish(false);p.left=true;advance(room,now);}
}
export function mutateRoom(room,key,input,now=Date.now()){
 const entering=['solo','join','create','joinCode'].includes(input.op);
 if(['waiting','countdown'].includes(room.status)){
  room.players=room.players.filter(p=>now-p.seen<30000);
  if(room.players.length<(room.private?2:5)){room.status='waiting';room.readyAt=null;}
  if(room.private&&!room.players.some(p=>p.id===room.hostId))room.hostId=room.players[0]?.id||null;
 }
 let player=room.players.find(p=>p.key===key&&!p.left);
 if(!player&&entering&&room.status==='waiting'&&room.players.length<5){
  const name=typeof input.name==='string'?input.name.trim().replace(/[\u0000-\u001f<>]/g,'').slice(0,16):'';
  player={...newPlayer(crypto.randomUUID(),name||'군주 '+(room.players.length+1),now),key,avatar:Number.isInteger(input.avatar)&&input.avatar>=0&&input.avatar<8?input.avatar:0,entryId:typeof input.entryId==='string'?input.entryId.slice(0,64):null};room.players.push(player);if(room.private&&!room.hostId)room.hostId=player.id;
 }
 if(!player){if(input.op==='leave')return{ok:true};throw roomError(entering?'방이 가득 찼거나 이미 시작되었습니다.':'이 방의 참가자가 아닙니다.',entering?409:403);}
 if(room.solo&&entering&&!player.s.started){player.s.multiplayer=false;restore(player).start();room.status='playing';room.tick=now;}
 advance(room,now);player.seen=now;let result;
 if(input.op==='leave')depart(room,key,now);
 else if(input.op==='begin'){
  if(!room.private||room.hostId!==player.id)throw roomError('방장만 친구 대전을 시작할 수 있습니다.',403);
  if(room.status==='waiting'){if(room.players.length<2)throw roomError('최소 2명이 참가해야 시작할 수 있습니다.');room.status='countdown';room.readyAt=now+5000;}
 }else if(input.op==='action'){
  if(typeof input.actionId!=='string'||!/^[a-zA-Z0-9-]{8,64}$/.test(input.actionId)||!Array.isArray(input.args)||input.args.length>2||!Number.isSafeInteger(input.sequence)||input.sequence<1)throw roomError('잘못된 명령입니다.',400);
  const receipt=player.receipts.find(r=>r.id===input.actionId);
  if(receipt)result=receipt.result;
  else if(input.sequence!==(player.lastSequence||0)+1)result={error:'이미 처리했거나 순서가 지난 명령입니다. 다시 선택해 주세요.'};
  else if(now-(player.lastAction||0)<100)throw roomError('잠시 후 다시 시도하세요.',429);
  else{result=act(room,player,input.action,input.args);player.lastAction=now;player.lastSequence=input.sequence;player.receipts.push({id:input.actionId,result:{ok:result.ok,error:result.error}});player.receipts=player.receipts.slice(-40);}
 }
 if(!room.private&&room.status==='waiting'&&room.players.length===5){room.status='countdown';room.readyAt=now+5000;}
 return result;
}
export function roomView(id,version,room,key,watchId,result,transport='websocket'){
 const self=room.players.find(p=>p.key===key);
 return{solo:!!room.solo,protocol:2,transport,roomId:id,private:!!room.private,code:room.private?id.slice(2):null,hostId:room.hostId||null,status:room.status,version,simulationTime:room.tick,selfId:self?.id,winner:room.winner||null,result,nextActionSeq:(self?.lastSequence||0)+1,serverTime:Date.now(),readyAt:room.readyAt||null,
 players:room.players.filter(p=>!p.left||['playing','finished'].includes(room.status)).map(p=>({id:p.id,name:p.name,avatar:p.avatar||0,connected:!p.left&&Date.now()-p.seen<15000,towerCount:p.s.towers.length,s:p.id===self?.id||p.id===watchId?{...p.s,workers:p.s.workers.slice(0,7),events:p.s.events.slice(-24)}:{hp:p.s.hp,maxHp:p.s.maxHp,castle:p.s.castle,wave:p.s.wave,completed:p.s.completed,over:p.s.over,won:p.s.won,gold:p.s.gold,crystals:p.s.crystals,wood:p.s.wood,miners:p.s.miners,population:p.s.population,army:p.s.army}}))};
}
// Arrays are replaced atomically; missing keys are explicit tombstones.
export function delta(before,after){
 if(JSON.stringify(before)===JSON.stringify(after))return undefined;
 if(Array.isArray(before)&&Array.isArray(after)&&after.every(x=>x&&typeof x==='object'&&typeof x.id==='string')&&before.every(x=>x&&typeof x==='object'&&typeof x.id==='string')){const old=new Map(before.map(x=>[x.id,x]));return{order:after.map(x=>x.id),entries:Object.fromEntries(after.map(x=>[x.id,delta(old.get(x.id),x)]).filter(([,d])=>d))};}
 if(!before||!after||typeof before!=='object'||typeof after!=='object'||Array.isArray(before)||Array.isArray(after))return{set:after};
 const changes={},remove=Object.keys(before).filter(k=>!(k in after));
 for(const k of Object.keys(after)){const d=delta(before[k],after[k]);if(d)changes[k]=d;}
 return{changes,remove};
}
