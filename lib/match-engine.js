import Defense from './game-engine.js';
import trees from './trees.js';
const {Game}=Defense;
export function restore(player){const game=Object.create(Game.prototype);game.s=player.s;game.normalize();game.id=player.nextId||0;game.treeSites=trees;game.alignWorkers();let seed=player.seed||1;game.rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;player.seed=seed;return seed/4294967296;};return game;}
export function newPlayer(id,name,now){const game=new Game();game.s.multiplayer=true;return{id,name,seen:now,s:game.s,nextId:0,seed:crypto.getRandomValues(new Uint32Array(1))[0],receipts:[]};}
export function advance(room,now){
 if(room.status==='countdown'){
   room.players=room.players.filter(p=>now-p.seen<30000);
   if(room.players.length<(room.private?2:5)){room.status='waiting';room.readyAt=null;return;}
   if(now<room.readyAt)return;
   const began=room.readyAt;startRoom(room,began);
 }
 if(room.status!=='playing')return;
 const games=room.players.map(restore), elapsed=Math.max(0,Math.min(10,(now-room.tick)/1000));
 // Recompute bounded elapsed server time on each poll; no client clock or resources are trusted.
 const sharedSpeed=room.speed===2?2:1;
 for(const g of games){if(!room.solo)g.s.speed=sharedSpeed;let remaining=elapsed;while(remaining>0){const step=Math.min(.1,remaining);g.tick(step);if(g.s.speed===2)g.tick(step);remaining-=step;}}
 // Preserve simulation backlog instead of silently discarding time after a stall.
 room.tick+=elapsed*1000;
 for(let i=0;i<games.length;i++){const p=room.players[i];p.nextId=games[i].id;if(!p.s.over&&now-p.seen>90000)games[i].finish(false);}
 const alive=room.players.filter(p=>!p.s.over);
 if(room.solo){if(room.players[0].s.over)room.status='finished';return;}
 if(alive.length<=1){room.status='finished';room.winner=alive[0]?.id||null;if(alive[0])restore(alive[0]).finish(true);}
}
export function startRoom(room,now){room.status='playing';room.tick=now;for(const p of room.players){const g=restore(p);g.start();}}
export function act(room,player,action,args=[],now=Date.now()){
 if(room.status!=='playing'||player.s.over)return{error:'진행 중인 대전에서만 사용할 수 있습니다.'};
 const game=restore(player);let result;
 if(action==='setSpeed'&&!room.solo){
   if(args.length!==1||![1,2].includes(args[0]))return{error:'속도는 1배속 또는 2배속만 사용할 수 있습니다.'};
   if(args[0]===(room.speed||1))return{ok:true,speed:room.speed||1};
   if((room.speedLockedUntil||0)>now)return{error:'배속은 변경 후 5초 뒤 다시 바꿀 수 있습니다.',retryAfterMs:room.speedLockedUntil-now};
   room.speedLockedUntil=now+5000;
   room.speed=args[0];
   for(const p of room.players){p.s.speed=room.speed;p.s.speedLockedUntil=room.speedLockedUntil;restore(p).event(player.name+' 님이 공통 속도를 '+room.speed+'배속으로 변경했습니다. · 재변경 5초 대기','speed');}
   result={ok:true,speed:room.speed};
 }else if(action==='attackPotion'){
   if(room.solo)return{error:'대전 전용입니다.'};
   const target=room.players.find(p=>p.id===args[0]),s=player.s;
   if(!target||target===player||target.s.over)return{error:'생존한 상대를 지정하세요.'};
   if(s.research.attack!==-1)return{error:'연구소에서 공격 포션 연구를 완료하세요.'};
   if(s.potionCooldown.attack>0)return{error:'공격 포션 재사용 대기 중입니다.'};
   if(s.crystals<10)return{error:'사용에 크리스탈 10개가 필요합니다.'};
   restore(target);s.crystals-=10;s.potionCooldown.attack=5;target.s.debuffs.push(15);
   for(const observer of room.players)restore(observer).event(player.name+' → '+target.name+' · 약화 물약','attackPotion',{from:player.id,to:target.id,fromName:player.name,toName:target.name});game.event(target.name+'의 공격력 15초간 40% 감소','potion');result={ok:true};
 }else if(action==='dispatch'){
   if(room.solo)return{error:'대전 전용입니다.'};
   const [targetId,count]=args,target=room.players.find(p=>p.id===targetId);
   if(player.s.completed<20||player.s.waves.some(w=>w.number<=20))return{error:'20웨이브까지 방어를 마쳐야 출병할 수 있습니다.'};
   if(!player.s.barracks)return{error:'훈련소를 먼저 건설하세요.'};
   if(!target||target===player||target.s.over)return{error:'생존한 상대를 선택하세요.'};
   if(!Number.isInteger(count)||count<1||count>10||count>player.s.army)return{error:'보유 군사 중 1~10명을 선택하세요.'};
   if(player.s.dispatchCooldown>0)return{error:'출병 재사용 대기 중입니다.'};
   // A bounded army prevents unbounded room state growth under coordinated attacks.
   if(target.s.enemies.filter(e=>e.invader).length+count>60)return{error:'상대 전장에 침공군이 너무 많습니다. 잠시 후 다시 시도하세요.'};
   player.s.army-=count;player.s.dispatchCooldown=8;
   const defender=restore(target);defender.receiveArmy(count,player.id);target.nextId=defender.id;
   game.event(target.name+'에게 군사 '+count+'명 출병','wave');result={ok:true};
 }else{
   const allowed={setSpeed:1,setPaused:1,build:2,hire:0,hireWoodcutter:0,upgradeCastle:0,upgradeTower:1,startWave:1,sellTower:1,potion:1,buildBarracks:0,recruit:0,buildLab:0,researchPotion:1,repairCastle:0};
   if(!Object.hasOwn(allowed,action)||args.length!==allowed[action])return{error:'지원하지 않는 명령입니다.'};
   if(action==='startWave'&&(![1,2].includes(args[0])||player.s.waves.length+args[0]>2))return{error:'동시 웨이브는 최대 2개입니다.'};
   result=game[action](...args);
 }
 player.nextId=game.id;return result;
}
