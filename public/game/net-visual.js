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
    const prior=old.get(enemy.id);enemy._net={age:clamp(ageSeconds,0,2),distance:prior?prior._net?.distance??prior.d:distanceAt(enemy,ageSeconds)};
    if(Math.abs(enemy._net.distance-enemy.d)>300)enemy._net.distance=enemy.d;
    if(prior){enemy.x=prior.x;enemy.y=prior.y;}
  }
  const shots=new Map((previous?.shots||[]).map(shot=>[shot.id,shot]));
  for(const shot of state.shots){const prior=shots.get(shot.id);if(prior){shot.x=prior.x;shot.y=prior.y;shot._netHidden=prior._netHidden;}}
  const workers=previous?.workers||[];
  state.workers.forEach((worker,i)=>{const prior=workers[i];worker._net={age:0};if(prior){worker.x=prior.x;worker.y=prior.y;}});
}
function animate(state,dt,elapsed,Defense,trees=[]){
  const blend=1-Math.exp(-dt/.08);
  for(const enemy of state.enemies){
    const net=enemy._net;if(!net)continue;
    // Clamp the horizon instead of resetting to the old packet after 0.8 s.
    const goal=distanceAt(enemy,clamp(elapsed+net.age,0,2));
    net.distance+=(goal-net.distance)*blend;
    const point=Defense.pointAt(Math.min(Defense.pathLength,net.distance));
    enemy.x=point.x;enemy.y=point.y;if(!enemy.siege)enemy.angle=point.angle;
    enemy.hit=Math.max(0,(enemy.hit||0)-dt);
  }
  const enemies=new Map(state.enemies.map(e=>[e.id,e]));
  for(const shot of state.shots){
    shot.delay=Math.max(0,(shot.delay||0)-dt);if(shot.delay>0||shot._netHidden)continue;
    const target=enemies.get(shot.target);if(!target){shot._netHidden=true;continue;}
    const distance=Math.hypot(target.x-shot.x,target.y-shot.y),step=dt*(shot.type==='cannon'?410:650);
    if(distance<=step){shot._netHidden=true;continue;}
    shot.x+=(target.x-shot.x)*step/distance;shot.y+=(target.y-shot.y)*step/distance;
  }
  for(const worker of state.workers.slice(0,7)){
    if(worker.phase!=='walk')continue;const tree=trees[worker.target];if(!tree)continue;
    const x=tree.x+worker.offsetX,y=tree.y+worker.offsetY,d=Math.hypot(x-worker.x,y-worker.y),step=Math.min(d,95*dt);
    if(d>0){worker.x+=(x-worker.x)*step/d;worker.y+=(y-worker.y)*step/d;}
  }
  for(const tower of state.towers){tower.attack=Math.max(0,(tower.attack||0)-dt);tower.buildRemaining=Math.max(tower._pending ? .05 : 0,(tower.buildRemaining||0)-dt);}
  for(const key of ['labBuild','barracksBuild','dispatchCooldown'])state[key]=Math.max(0,(state[key]||0)-dt);
  if(state.waveClock!==null)state.waveClock=Math.max(0,state.waveClock-dt);
  for(const kind of ['lightning','ice','attack']){state.potionCooldown[kind]=Math.max(0,state.potionCooldown[kind]-dt);if(state.research[kind]>0)state.research[kind]=Math.max(.001,state.research[kind]-dt);}
  for(const effect of state.effects)effect.life=Math.max(0,effect.life-dt);state.effects=state.effects.filter(e=>e.life>0);state.shake=Math.max(0,state.shake-dt);
}
function preview(game,command){
  if(command.op!=='action'||typeof game.constructor.prototype[command.action]!=='function')return;
  if(command.action==='sellTower'&&command.args[0]<0)return{error:'서버가 설치를 확인한 후 철거할 수 있습니다.'};
  const id=game.id;if(command.action==='build')game.id=command.previewId-1;
  const result=game.constructor.prototype[command.action].apply(game,command.args);game.id=id;
  if(result?.tower)result.tower._pending=true;
  return result;
}
return{distanceAt,adopt,animate,preview};
});
