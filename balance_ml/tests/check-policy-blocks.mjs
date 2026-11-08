import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import {createHash} from 'node:crypto';
import trees from '../../lib/trees.js';
import {choose,POLICIES} from '../policies.mjs';
import {chooseBlocks,createPolicyChooser,DEFAULT_INVESTMENT_ORDER,POLICY_BLOCKS_VERSION} from '../policy-blocks.mjs';
import {runFrontier} from '../frontier50.mjs';
import {eventDefense} from '../coupled-rng.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const source=read('../../public/game/game.js'),balance=read('../../public/game/balance.js');
const c=vm.createContext({});c.window=c;vm.runInContext(balance,c);vm.runInContext(source,c);const D=c.Defense;
const extra={id:'cap22',economy:true,castleMax:20,research:true,potions:true,repair:true,minerLateCap:22};
const policies=[...POLICIES,extra];
function base() {
  const g=new D.Game(()=>.5);g.setTreeSites(trees);g.start();g.s.gold=10000;
  for(const pad of [3,0,4])assert.equal(g.build('archer',pad).ok,true);
  Object.assign(g.s,{wave:18,time:1200,castle:9,maxHp:164,hp:164,gold:0,crystals:0,wood:0,
    miners:18,population:4,lab:true,labBuild:0});
  g.s.towerLevels.archer=5;g.s.research={ice:-1,lightning:-1,attack:0};return g;
}
function clone(g) {
  const x=new D.Game(()=>{throw Error('Policy consumed live RNG');});
  x.s=structuredClone(g.s);x.id=g.id;x.treeSites=g.treeSites;
  for(const key of ['lastIce','lastLightningWave'])if(Object.hasOwn(g,key))x[key]=g[key];
  return x;
}
let decisions=0;
function compare(g,p) {
  const a=clone(g),b=clone(g),before=structuredClone(g.s);
  const x=choose(a,D,p),y=chooseBlocks(b,D,p);
  assert.deepEqual(y,x);assert.deepEqual(a.s,before);assert.deepEqual(b.s,before);
  for(const key of ['lastIce','lastLightningWave']) {
    assert.equal(b[key],a[key]);assert.equal(Object.hasOwn(b,key),Object.hasOwn(a,key));
  }
  decisions++;return x;
}
const focused=[];
let g=base();g.s.miners=5;g.s.gold=1000;focused.push(['hire',g]);
g=base();g.s.population=0;g.s.gold=1000;focused.push(['hireWoodcutter',g]);
g=base();g.s.lab=false;g.s.wood=200;focused.push(['buildLab',g]);
g=base();g.s.research.ice=0;g.s.crystals=30;focused.push(['researchPotion',g]);
g=base();g.s.crystals=30;focused.push(['upgradeCastle',g]);
g=base();g.s.castle=20;g.s.gold=1000;assert.equal(g.build('ballista',5).ok,true);
g.s.gold=0;g.s.crystals=100;focused.push(['upgradeTower',g]);
g=base();g.s.castle=20;g.s.gold=1000;Object.keys(g.s.towerLevels).forEach(k=>g.s.towerLevels[k]=5);focused.push(['build',g]);
g=base();g.s.hp=40;g.s.wood=100;focused.push(['repairCastle',g]);
g=base();g.s.wave=30;g.s.crystals=100;
g.s.enemies=Array.from({length:8},(_,i)=>({id:i+10,wave:30,d:D.pathLength*.9,hp:2000,frozen:0,x:10,y:10}));
focused.push(['potion',g]);
const ice=compare(g,extra);assert.deepEqual(ice.args,['ice']);
const blocked=clone(g);blocked.s.potionCooldown.ice=1;
assert.deepEqual(compare(blocked,extra).args,['lightning']);
const repeated=clone(g);repeated.lastIce=g.s.time;repeated.lastLightningWave=30;
assert.notEqual(compare(repeated,extra)?.name,'potion');
for(const [expected,state] of focused)assert.equal(compare(state,POLICIES[4]).name,expected);
// Boundaries across resource availability, wave gates, cooldowns and controller variants.
let randomState=20261108;
const pick=values=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return values[randomState%values.length];};
for(let i=0;i<240;i++) {
  const g=base(),s=g.s;
  Object.assign(s,{wave:pick([0,3,7,8,12,14,15,18,25,30,40]),castle:pick([1,5,9,13,17,20]),
    time:pick([0,179.9,180,1799.9,1800]),gold:pick([0,139,600,10000]),crystals:pick([0,7,20,1000]),
    miners:pick([5,12,18,22]),population:pick([0,2,4]),wood:pick([0,199,200,1000]),
    lab:pick([true,false]),labBuild:pick([0,5]),paused:pick([false,false,false,true])});
  s.hp=pick([30,164]);s.research.ice=pick([0,5,-1]);s.research.lightning=pick([0,-1]);
  s.towerLevels.archer=pick([1,3,5]);
  if(i%4===0)s.towers=[];
  for(const p of policies)compare(g,p);
}
for(const bad of [[],['economy'],['bad',...DEFAULT_INVESTMENT_ORDER.slice(1)],
  ['economy','economy',...DEFAULT_INVESTMENT_ORDER.slice(2)],new Array(6),'economy'])
  assert.throws(()=>createPolicyChooser({investmentOrder:bad}));
// Factory takes a snapshot; later caller mutations cannot change an active policy.
const order=[...DEFAULT_INVESTMENT_ORDER],snapshot=createPolicyChooser({investmentOrder:order});
order.reverse();g=base();g.s.research.ice=0;g.s.crystals=30;
assert.deepEqual(snapshot(clone(g),D,extra),choose(clone(g),D,extra));
const castleFirst=createPolicyChooser({investmentOrder:['castle','economy','workforce','research','towerUpgrade','towerBuild']});
assert.equal(choose(clone(g),D,extra).name,'researchPotion');
assert.equal(castleFirst(clone(g),D,extra).name,'upgradeCastle');
g.s.hp=30;g.s.wood=100;assert.equal(castleFirst(clone(g),D,extra).name,'repairCastle');
let shortRuns=0;
for(const seed of [101001,101002])for(const p of [POLICIES[0],POLICIES[4],extra])for(const mode of ['legacy','event']) {
  const a=mode==='event'?eventDefense(D,seed,source).D:D;
  const b=mode==='event'?eventDefense(D,seed,source).D:D;
  const x=runFrontier(a,p,seed,trees,{decisionTicks:2,maxTicks:2000,chooseAction:choose});
  const y=runFrontier(b,p,seed,trees,{decisionTicks:2,maxTicks:2000,chooseAction:chooseBlocks});
  assert.deepEqual(y,x);assert.equal(x.end,'time_limit');assert.equal(x.invalid,0);shortRuns+=2;
}
const sha=text=>createHash('sha256').update(text).digest('hex');
console.log(JSON.stringify({status:'passed',protocol:POLICY_BLOCKS_VERSION,
  decision_comparisons:decisions,short_engine_runs:shortRuns,short_run_max_ticks:2000,
  full_games:0,model_training:false,default_workers_replaced:false,
  source_sha256:{game:sha(source),balance:sha(balance),original_policy:sha(read('../policies.mjs')),
    blocks:sha(read('../policy-blocks.mjs')),test:sha(read('./check-policy-blocks.mjs'))}},null,2));
