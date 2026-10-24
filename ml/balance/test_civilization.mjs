import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import D from '../../lib/game-engine.js';
import {engine, CANDIDATES, POLICIES, run} from './civilization.mjs';

function damage(defense, wave, kind, type, multiplayer) {
  const g=new defense.Game(()=>.5);g.start();Object.assign(g.s,{active:true,waveClock:null,multiplayer});
  const p=defense.pointAt(1);
  const enemy={id:1,wave,kind,hp:1000,max:1000,d:1,...p,speed:0,slow:0,frozen:0,burn:0,siege:0,hit:0};
  g.s.enemies=[enemy];g.s.shots=[{id:2,x:p.x,y:p.y,target:1,damage:100,type,level:1,delay:0}];
  g.tick(.1);return 1000-enemy.hp;
}
const baseline=engine(CANDIDATES[0]),selected=engine(CANDIDATES[1]);
let checks=0;
for(const wave of [1,12,13,14,15,16,17,30,40])for(const kind of ['raider','runner','heavy','brute','saboteur'])
for(const type of ['archer','ballista','cannon','frost','storm'])for(const multiplayer of [false,true]) {
  const actual=damage(D,wave,kind,type,multiplayer);
  assert.ok(Math.abs(actual-damage(selected,wave,kind,type,multiplayer))<1e-7,'sandbox/production projectile parity');
  if(multiplayer||wave<13||type!=='archer'||['raider','runner'].includes(kind)) {
    assert.equal(actual,damage(baseline,wave,kind,type,multiplayer),'unaffected rules');
  }
  checks++;
}
for(const [wave,expected] of [[13,80],[14,60],[15,40],[16,20],[17,10],[100,10]]) {
  assert.ok(Math.abs(damage(D,wave,'heavy','archer',false)-expected)<1e-7);
}
// Original potion effect is unchanged in both modes.
for(const multiplayer of [false,true]) {
  const g=new D.Game();g.start();Object.assign(g.s,{multiplayer,crystals:100});g.s.research.lightning=-1;
  const e={hp:1000};g.s.enemies=[e];assert.ok(g.potion('lightning').ok);assert.equal(e.hp,400);
}
// Browser and generated engine agree on the new config and damage.
const c=vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(new URL('../../public/game/balance.js',import.meta.url),'utf8'),c);
c.FRONTIER_BALANCE=c.window.FRONTIER_BALANCE;
vm.runInContext(fs.readFileSync(new URL('../../public/game/game.js',import.meta.url),'utf8'),c);
assert.equal(damage(c.Defense,16,'heavy','archer',false),damage(D,16,'heavy','archer',false));
for(const id of ['archer-fixed','mixed-potions']) {
  const policy=POLICIES.find(p=>p.id===id);
  assert.deepEqual(run(D,policy,100000),run(selected,policy,100000),'full real-resource trajectory matches selected experiment');
}
console.log(`PASS: ${checks} projectile cases; early/non-archer/PvP isolation, potion unchanged, browser/generated parity, full trajectories`);
