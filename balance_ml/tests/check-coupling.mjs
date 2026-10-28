import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {eventDefense,eventUniform,validateRngSites,RNG_PROTOCOL} from '../coupled-rng.mjs';
import {runFrontier} from '../frontier50.mjs';
const source=fs.readFileSync(new URL('../../public/game/game.js',import.meta.url),'utf8');
const c=vm.createContext({});c.window=c;
vm.runInContext(fs.readFileSync(new URL('../../public/game/balance.js',import.meta.url),'utf8'),c);
vm.runInContext(source,c);const D=c.Defense;
validateRngSites(D,source);
assert.throws(()=>validateRngSites(D,source+'\nthis.rng();'));
assert.throws(()=>eventUniform(-1,'mine',[0],0));
for(let i=0;i<500;i++) {const v=eventUniform(123,'mine',[i],0);assert.ok(v>=0&&v<1);}
assert.equal(eventUniform(123,'spawn',[20,4],0),eventUniform(123,'spawn',[20,4],0));
assert.notEqual(eventUniform(123,'spawn',[20,4],0),eventUniform(123,'mine',[20,4],0));
const ca=eventDefense(D,123,source),cb=eventDefense(D,123,source);
const a=new ca.D.Game(),b=new cb.D.Game();a.start();b.start();a.s.miners=18;b.s.miners=22;
const as=[],bs=[];
for(let i=0;i<20;i++) {a.mine();b.mine();}
const bm=new Map(cb.trace().samples.filter(x=>x.stream==='mine').map(x=>[JSON.stringify([x.event,x.draw]),x.value]));
let shared=0;
for(const x of ca.trace().samples.filter(x=>x.stream==='mine')) {
 const key=JSON.stringify([x.event,x.draw]);
 if(bm.has(key)){assert.equal(x.value,bm.get(key));shared++;}
}
assert.ok(shared>=28);
// Force a saboteur with a valid target after different mining draw counts.
a.s.towers=[{id:1,x:20,y:20}];b.s.towers=[{id:1,x:20,y:20}];
for(let i=0;i<20;i++) {a.spawn({number:20,spawned:4+5*i,hpBoost:1});b.spawn({number:20,spawned:4+5*i,hpBoost:1});}
assert.deepEqual(ca.trace().samples.filter(x=>x.stream==='spawn'),cb.trace().samples.filter(x=>x.stream==='spawn'));
assert.deepEqual(a.s.effects,b.s.effects);
assert.equal(ca.trace().counts.mine,360);assert.equal(cb.trace().counts.mine,440);
assert.throws(()=>a.rng());assert.throws(()=>a.reset());
const trees=[{x:100,y:100},{x:200,y:100},{x:300,y:800}];
for(const game of [a,b]) {game.setTreeSites(trees);game.s.gold=1000;game.hireWoodcutter();}
assert.deepEqual(ca.trace().samples.filter(x=>x.stream==='hireWoodcutter'),cb.trace().samples.filter(x=>x.stream==='hireWoodcutter'));
a.chooseNextTree(a.s.workers[0]);b.chooseNextTree(b.s.workers[0]);
assert.deepEqual(ca.trace().samples.filter(x=>x.stream==='chooseNextTree'),cb.trace().samples.filter(x=>x.stream==='chooseNextTree'));
const p={id:'control',economy:true,castleMax:20,research:true,potions:true,repair:true};
const first=eventDefense(D,456,source),second=eventDefense(D,456,source);
assert.deepEqual(runFrontier(first.D,p,456,trees,{decisionTicks:2,maxTicks:1000}),
                 runFrontier(second.D,p,456,trees,{decisionTicks:2,maxTicks:1000}));
assert.equal(first.trace().protocol,RNG_PROTOCOL);
console.log('Event-key mining/spawn/worker isolation, engine call-site guards and short replay passed.');
