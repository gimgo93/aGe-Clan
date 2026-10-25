import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {applyLateHp,runFrontier,FRONTIER_PROFILES} from '../frontier50.mjs';
const c=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../../public/game/balance.js',import.meta.url),'utf8').replace('window.FRONTIER_BALANCE','globalThis.FRONTIER_BALANCE'),c);
vm.runInContext(fs.readFileSync(new URL('../../public/game/game.js',import.meta.url),'utf8'),c);
const D=c.Defense;
for(const wave of [20,35,36,40,50]){
 const a=new D.Game(()=>.5),b=new D.Game(()=>.5);a.start();b.start();applyLateHp(b,{multiplier:1.05});
 const wa={number:wave,spawned:0,hpBoost:1};a.spawn({...wa});b.spawn({...wa});
 const x=a.s.enemies[0],y=b.s.enemies[0];
 assert.equal(y.hp,wave<36?x.hp:Math.round(x.hp*1.05));
 assert.equal(y.max,y.hp);assert.equal(y.speed,x.speed);assert.equal(y.kind,x.kind);
}
assert.throws(()=>applyLateHp(new D.Game(),{multiplier:1.5}));
const p=FRONTIER_PROFILES[0];
const a=runFrontier(D,p,1,[],{maxTicks:10});
const b=runFrontier(D,p,1,[],{maxTicks:10});
assert.deepEqual(a,b);assert.equal(a.target,50);assert.equal(a.end,'time_limit');
assert.equal(a.invalid,0);assert.ok(a.time<1.01);
assert.throws(()=>runFrontier(D,p,1,[],{decisionTicks:0}));
console.log('Frontier50: late-HP boundaries, unchanged kinds/speeds, timing bounds and reproducibility passed. No full simulation batch run.');
