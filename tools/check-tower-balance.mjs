import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import D from '../lib/game-engine.js';
const c=vm.createContext({window:{}});
vm.runInContext(fs.readFileSync('public/game/balance.js','utf8'),c);
c.FRONTIER_BALANCE=c.window.FRONTIER_BALANCE;
vm.runInContext(fs.readFileSync('public/game/game.js','utf8'),c);
function hit(Engine,type,level,offsets,multiplayer=false,kind='heavy',wave=20){
  const g=new Engine.Game(()=>.5);g.start();Object.assign(g.s,{active:true,waveClock:null,multiplayer});
  const p=Engine.pointAt(1);
  const enemies=offsets.map((x,i)=>({id:i+1,kind,wave,hp:10000,max:10000,d:1,x:p.x+x,y:p.y,speed:0,slow:0,frozen:0,burn:0,siege:0,hit:0}));
  g.s.enemies=[...enemies.slice(1),enemies[0]];
  g.s.shots=[{id:100,x:p.x,y:p.y,target:1,damage:100,type,level,delay:0}];
  g.tick(.1);return enemies.map(e=>({damage:10000-e.hp,burn:e.burn}));
}
let cases=0;
for(const Engine of [D,c.Defense]){
  assert.equal(Engine.BALANCE.soloArrowResistance,undefined);
  assert.equal(Engine.TYPES.find(t=>t.id==='storm').damage,66);
  assert.equal(Engine.TYPES.find(t=>t.id==='cannon').damage,72);
  assert.equal(Engine.TYPES.find(t=>t.id==='cannon').splash,120);
  for(const mode of [false,true]){
    for(const wave of [1,13,16,20,40])for(const kind of ['raider','runner','heavy','brute','saboteur']){
      assert.equal(hit(Engine,'archer',1,[0],mode,kind,wave)[0].damage,100);cases++;
    }
    assert.deepEqual(hit(Engine,'ballista',4,[0,10,20],mode).map(e=>e.damage),[100,0,0]);
    assert.deepEqual(hit(Engine,'ballista',5,[0,150,10,20,30,40,160],mode).map(e=>e.damage),[100,0,100,100,100,100,0]);
    assert.deepEqual(hit(Engine,'ballista',5,[0,150,160],mode).map(e=>e.damage),[100,100,0]);
    assert.deepEqual(hit(Engine,'cannon',1,[0,110,119,120],mode).map(e=>e.damage),[100,100,100,0]);
    assert.deepEqual(hit(Engine,'cannon',5,[0,110],mode).map(e=>e.burn),[3.9,3.9]);
    assert.deepEqual(hit(Engine,'storm',5,[0,10,20,30,40],mode).map(e=>e.damage),[100,65,65,65,0]);
  }
  const g=new Engine.Game();
  for(const [type,values]of Object.entries({storm:[66,87,108,129,150],cannon:[72,95,118,141,164]}))for(let level=1;level<=5;level++){
    g.s.towerLevels[type]=level;assert.equal(g.stats({type}).damage,values[level-1]);
  }
}
console.log(`PASS: tower buffs, area boundaries/caps/primary inclusion, ${cases} no-armor cases, solo/PvP and browser/server parity`);
