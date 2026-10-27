import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';
import {blocksPotionForCastle,chooseReserved} from '../reserve-policy.mjs';
import {choose} from '../policies.mjs';
const c=vm.createContext({});c.window=c;
vm.runInContext(fs.readFileSync(new URL('../../public/game/balance.js',import.meta.url),'utf8'),c);
vm.runInContext(fs.readFileSync(new URL('../../public/game/game.js',import.meta.url),'utf8'),c);
const D=c.Defense,g=new D.Game(()=>.5);g.start();
const s=g.s;Object.assign(s,{wave:30,castle:16,crystals:D.castleCost(16)+6});
assert.equal(blocksPotionForCastle(s,D),true);
s.crystals++;assert.equal(blocksPotionForCastle(s,D),false);
s.castle=17;s.crystals=0;assert.equal(blocksPotionForCastle(s,D),false);
s.castle=16;s.wave=17;assert.equal(blocksPotionForCastle(s,D),false);
// Prepare an affordable emergency ice potion on the actual engine validator.
Object.assign(s,{wave:30,castle:16,crystals:7,gold:0,hp:s.maxHp,lab:true,labBuild:0,population:4,miners:18});
s.towerLevels.archer=5;s.research.ice=-1;s.research.lightning=-1;
s.towers=[{type:'archer'},{type:'archer'},{type:'archer'}];
s.enemies=[{id:1,d:D.pathLength*.9,hp:100,frozen:0}];
const p={id:'test',economy:true,castleMax:20,research:true,potions:true,repair:true};
const baseline=chooseReserved(g,D,p);assert.equal(baseline.name,'potion');
g.lastIce=undefined;
const reserved=chooseReserved(g,D,{...p,castlePotionReserve:true});
assert.notEqual(reserved?.name,'potion');assert.equal(g.lastIce,undefined);
s.castle=17;const unblocked=chooseReserved(g,D,{...p,castlePotionReserve:true});
assert.equal(unblocked.name,'potion');
// Disabled rule keeps baseline behavior in a normal initial game.
const a=new D.Game(()=>.5),b=new D.Game(()=>.5);a.start();b.start();
assert.deepEqual(chooseReserved(a,D,p),choose(b,D,p));
console.log('Castle reserve boundaries, actual potion eligibility, cooldown bookkeeping and control parity passed.');
