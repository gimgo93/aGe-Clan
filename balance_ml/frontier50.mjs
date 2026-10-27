// Isolated frontier evaluator. Imported only; never starts a batch or changes live rules.
import {choose} from './policies.mjs';

export function applyLateHp(game, {fromWave=36, multiplier=1}={}) {
  if (!Number.isInteger(fromWave)||fromWave<31||!Number.isFinite(multiplier)||multiplier<1||multiplier>1.1)
    throw Error('Late HP candidate outside experiment bounds');
  const spawn=game.spawn.bind(game);
  game.spawn=w=>{
    const oldLength=game.s.enemies.length;
    spawn(w);
    if(w.number>=fromWave) for(const enemy of game.s.enemies.slice(oldLength)) {
      enemy.hp=Math.round(enemy.hp*multiplier); enemy.max=enemy.hp;
    }
  };
}

export function runFrontier(D, policy, seed, trees=[], {decisionTicks=10,hpMultiplier=1,maxTicks=60000,chooseAction=choose}={}) {
  if(!Number.isInteger(seed)||seed<0||seed>=2**32)throw Error('Invalid seed');
  if(![2,10].includes(decisionTicks)||!Number.isInteger(maxTicks)||maxTicks<1||maxTicks>60000)
    throw Error('Invalid timing or time budget');
  let state=seed;
  const game=new D.Game(()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;});
  game.setTreeSites(trees);game.start();applyLateHp(game,{multiplier:hpMultiplier});
  const actions={};let invalid=0,leaks=0,destroyed=0,damage=0;
  const milestones={};let castle17At=null;
  const resolve=game.resolveEnemy.bind(game);
  game.resolveEnemy=e=>{if(e.hp>0)leaks++;return resolve(e);};
  const destroy=game.destroyEffect.bind(game);
  game.destroyEffect=(t,cause)=>{destroyed++;return destroy(t,cause);};
  let tick=0;
  while(!game.s.over&&game.s.completed<50&&tick<maxTicks){
    if(tick%decisionTicks===0){
      const action=chooseAction(game,D,policy);
      if(action){const result=game[action.name](...action.args);
        if(result.error)invalid++;
        else {const key=action.name+':'+(action.args[0]??'');actions[key]=(actions[key]??0)+1;}
      }
    }
    const hp=game.s.hp;game.tick(.1);tick++;damage+=Math.max(0,hp-game.s.hp);
    if(castle17At===null&&game.s.castle>=17)castle17At={time:game.s.time,wave:game.s.wave,completed:game.s.completed};
    for(const wave of [10,15,20,30,40,50]) if(game.s.completed>=wave&&!milestones[wave])
      milestones[wave]={time:game.s.time,hp:game.s.hp,gold:game.s.gold,crystals:game.s.crystals};
  }
  return {seed,policy:policy.id,decisionTicks,hpMultiplier,cleared:game.s.completed,
    target:50,end:game.s.over?'castle_destroyed':game.s.completed>=50?'target_wave':'time_limit',
    time:game.s.time,hp:game.s.hp,kills:game.s.kills,leaks,destroyed,damage,invalid,actions,milestones,
    castle:game.s.castle,castle17At,miners:game.s.miners,workers:game.s.population,gold:game.s.gold,crystals:game.s.crystals};
}

export const FRONTIER_PROFILES=[
  {id:'mixed-timing-1s',economy:true,castleMax:20,research:true,potions:true,repair:true,decisionTicks:10},
  {id:'mixed-timing-02s',economy:true,castleMax:20,research:true,potions:true,repair:true,decisionTicks:2},
  {id:'mixed-no-potions-02s',economy:true,castleMax:20,research:true,repair:true,decisionTicks:2},
  {id:'mixed-no-economy-02s',economy:false,castleMax:20,research:true,potions:true,repair:true,decisionTicks:2},
];
