import assert from 'node:assert/strict';
import D from '../lib/game-engine.js';
import trees from '../lib/trees.js';
import {newPlayer,startRoom} from '../lib/match-engine.js';
const g=new D.Game(()=>.4);g.setTreeSites(trees);g.start();g.s.gold=100000;
for(let i=0;i<7;i++)assert.ok(g.hireWoodcutter().ok);
const sites=g.s.workers.map(w=>g.treeSites[w.target]);assert.equal(sites.filter(p=>p.y<440).length,4);assert.equal(sites.filter(p=>p.y>=440).length,3);assert.equal(new Set(g.s.workers.map(w=>w.target)).size,7);assert.ok(Math.max(...sites.map(p=>p.x))-Math.min(...sites.map(p=>p.x))>650);assert.ok(Math.max(...sites.map(p=>p.y))-Math.min(...sites.map(p=>p.y))>500);
for(let round=0;round<50;round++)for(const w of g.s.workers){g.chooseNextTree(w);const site=g.treeSites[w.target];assert.ok(g.woodSites(w.homeSlot).some(p=>p.index===w.target));assert.equal(site.y<440,w.homeSlot%2===0);w.x=site.x+w.offsetX;w.y=site.y+w.offsetY;}
const solo=new D.Game(()=>1);solo.start();solo.s.scene='mine';for(let i=0;i<299;i++)solo.tick(.1);assert.equal(solo.s.wave,0);solo.tick(.1);solo.tick(.1);assert.equal(solo.s.wave,1);assert.ok(solo.s.gold>D.BALANCE.startGold);
const early=new D.Game();early.start();assert.ok(early.startWave(2).ok);assert.deepEqual(early.s.waves.map(w=>w.hpBoost),[1.2,1.2]);
const room={status:'waiting',players:[newPlayer('a','A',0),newPlayer('b','B',0)]};startRoom(room,0);assert.ok(room.players.every(p=>p.s.waveClock===30));
const migrated=new D.Game();migrated.s.workers=[{target:999,x:800,y:400,offsetX:45,offsetY:20,phase:'chop',hits:3,clock:0}];migrated.setTreeSites(trees);assert.ok(migrated.treeSites[migrated.s.workers[0].target]);assert.equal(migrated.s.workers[0].homeSlot,0);
console.log('PASS: 4 upper / 3 lower workers, seven distinct areas, persistent zones, 30-second first wave in the mine and PvP, double-wave HP unchanged');
