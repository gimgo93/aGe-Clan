(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ClanVisual=api;})(globalThis,function(){
'use strict';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
function distanceAt(enemy,seconds){
  if(enemy.siege)return enemy.d;
  const moving=Math.max(0,seconds-Math.max(0,enemy.frozen||0));
  const slowed=Math.min(moving,Math.max(0,(enemy.slow||0)-(enemy.frozen||0)));
  return enemy.d+enemy.speed*(slowed*(enemy.slowFactor??1)+moving-slowed);
}
function adopt(state,previous,ageSeconds=0){
  const old=new Map((previous?.enemies||[]).map(e=>[e.id,e]));
  for(const enemy of state.enemies){
    const prior=old.get(enemy.id);enemy._net={age:clamp(ageSeconds,0,4),elapsedSim:0,elapsedWall:0,distance:prior?prior._net?.distance??prior.d:distanceAt(enemy,ageSeconds)};
    if(Math.abs(enemy._net.distance-enemy.d)>300)enemy._net.distance=enemy.d;
    if(prior){enemy.x=prior.x;enemy.y=prior.y;}
  }
  const shots=new Map((previous?.shots||[]).map(shot=>[shot.id,shot]));
  for(const shot of state.shots){const prior=shots.get(shot.id);if(prior){shot.x=prior.x;shot.y=prior.y;shot._netHidden=prior._netHidden;}}
  const workers=previous?.workers||[];
  state.workers.forEach((worker,i)=>{const prior=workers[i];worker._net={age:0};if(prior){worker.x=prior.x;worker.y=prior.y;}});
}
function animate(state,dt,elapsed,Defense,trees=[]){
  const blend=1-Math.exp(-dt/.08),rate=state.speed===2?2:1,simDt=dt*rate;
  for(const enemy of state.enemies){
    const net=enemy._net;if(!net)continue;
    // Integrate each frame at its actual rate; changing speed must not rewrite past time.
    const predictionStep=Math.min(dt,Math.max(0,2-(net.elapsedWall||0)));
    net.elapsedWall=Math.min(2,(net.elapsedWall||0)+dt);net.elapsedSim=Math.min(4,(net.elapsedSim||0)+predictionStep*rate);
    const goal=distanceAt(enemy,clamp(net.elapsedSim+net.age,0,4));
    // Forward-moving enemies never visibly walk backwards while a fresh packet catches up.
    // A genuine large correction still resets in adopt(), instead of drifting indefinitely.
    const forward=Math.max(net.distance,goal);
    net.distance+=(forward-net.distance)*blend;
    const point=Defense.pointAt(Math.min(Defense.pathLength,net.distance));
    enemy.x=point.x;enemy.y=point.y;if(!enemy.siege)enemy.angle=point.angle;
    enemy.hit=Math.max(0,(enemy.hit||0)-simDt);
  }
  const enemies=new Map(state.enemies.map(e=>[e.id,e]));
  for(const shot of state.shots){
    shot.delay=Math.max(0,(shot.delay||0)-simDt);if(shot.delay>0||shot._netHidden)continue;
    const target=enemies.get(shot.target);if(!target){shot._netHidden=true;continue;}
    const distance=Math.hypot(target.x-shot.x,target.y-shot.y),step=simDt*(shot.type==='cannon'?410:650);
    if(distance<=step){shot._netHidden=true;continue;}
    shot.x+=(target.x-shot.x)*step/distance;shot.y+=(target.y-shot.y)*step/distance;
  }
  for(const worker of state.workers.slice(0,7)){
    if(worker.phase!=='walk')continue;const tree=trees[worker.target];if(!tree)continue;
    const x=tree.x+worker.offsetX,y=tree.y+worker.offsetY,d=Math.hypot(x-worker.x,y-worker.y),step=Math.min(d,95*simDt);
    if(d>0){worker.x+=(x-worker.x)*step/d;worker.y+=(y-worker.y)*step/d;}
  }
  for(const tower of state.towers){tower.attack=Math.max(0,(tower.attack||0)-simDt);tower.buildRemaining=Math.max(tower._pending ? .05 : 0,(tower.buildRemaining||0)-simDt);}
  for(const key of ['labBuild','barracksBuild','dispatchCooldown'])state[key]=Math.max(0,(state[key]||0)-simDt);
  if(state.waveClock!==null)state.waveClock=Math.max(0,state.waveClock-simDt);
  for(const kind of ['lightning','ice','attack']){state.potionCooldown[kind]=Math.max(0,state.potionCooldown[kind]-simDt);if(state.research[kind]>0)state.research[kind]=Math.max(.001,state.research[kind]-simDt);}
  for(const effect of state.effects)effect.life=Math.max(0,effect.life-simDt);state.effects=state.effects.filter(e=>e.life>0);state.shake=Math.max(0,state.shake-simDt);
}
function preview(game,command){
  if(command.op!=='action'||typeof game.constructor.prototype[command.action]!=='function')return;
  if(command.action==='sellTower'&&command.args[0]<0)return{error:'서버가 설치를 확인한 후 철거할 수 있습니다.'};
  if(command.action==='setSpeed')return{ok:true};
  const id=game.id;if(command.action==='build')game.id=command.previewId-1;
  const result=game.constructor.prototype[command.action].apply(game,command.args);game.id=id;
  if(result?.tower)result.tower._pending=true;
  return result;
}
return{distanceAt,adopt,animate,preview};
});
