import assert from 'node:assert/strict';
import fs from 'node:fs';
import {advance,newPlayer,startRoom} from '../lib/match-engine.js';
import {mutateRoom,roomView,roomError,delta,normalizeWatch} from '../lib/room-state.js';
import {roomCapacity,FRONTIERS} from '../lib/room-config.js';
import {RoomDirectory,directoryRecord} from '../lib/room-directory.js';

const waiting=(privateRoom=false)=>({status:'waiting',private:privateRoom,capacity:4,players:[],tick:1000});
const publicRoom=waiting();
for(let i=0;i<4;i++)mutateRoom(publicRoom,'public-key-'+i,{op:'join',name:'공개 '+i},1000+i);
assert.equal(publicRoom.players.length,4);
assert.equal(publicRoom.status,'countdown','fourth public player starts countdown');
assert.throws(()=>mutateRoom(publicRoom,'extra',{op:'join'},1010),e=>e.status===409);
advance(publicRoom,publicRoom.readyAt);
assert.deepEqual(publicRoom.players.map(p=>p.frontier),FRONTIERS);
const ids=publicRoom.players.map(p=>[p.id,p.frontier]);
const restored=JSON.parse(JSON.stringify(publicRoom));
advance(restored,restored.tick+100);
assert.deepEqual(restored.players.map(p=>[p.id,p.frontier]),ids,'checkpoint preserves assignment');
mutateRoom(restored,'public-key-2',{op:'poll'},restored.tick+100);
assert.deepEqual(restored.players.map(p=>[p.id,p.frontier]),ids,'rejoin does not reassign territory');

const friendRoom=waiting(true);
for(let i=0;i<4;i++)mutateRoom(friendRoom,'friend-key-'+i,{op:i?'joinCode':'create'},1000+i);
assert.equal(friendRoom.status,'waiting','private room still requires host confirmation');
assert.throws(()=>mutateRoom(friendRoom,'extra',{op:'joinCode'},1010),e=>e.status===409);
mutateRoom(friendRoom,'friend-key-0',{op:'begin'},1100);
advance(friendRoom,6100);
assert.equal(friendRoom.status,'playing');
assert.equal(new Set(friendRoom.players.map(p=>p.frontier)).size,4);

const solo={...waiting(true),solo:true};
mutateRoom(solo,'solo-key',{op:'solo'},1000);
assert.equal(roomCapacity(solo),1);
assert.equal(solo.players[0].frontier,'central');
const legacy={status:'playing',tick:1000,players:Array.from({length:5},(_,i)=>({...newPlayer('legacy-'+i,'기존 '+i,1000),key:'legacy-key-'+i}))};
startRoom(legacy,1000);
assert.equal(roomCapacity(legacy),5,'already persisted five-player room is not evicted');
assert.deepEqual(legacy.players.map(p=>p.frontier),[...FRONTIERS,'central']);
console.log('PASS: public/private four-player capacity, unique stable territories, solo central and legacy-room continuity');

const now=Date.now()-1000,room={...waiting(true),tick:now,players:Array.from({length:4},(_,i)=>({...newPlayer('player-'+i,'참가자 '+i,now),key:'private-key-'+i,accountId:String(i).repeat(64)}))};
startRoom(room,now);
const view=roomView('F-ABCDEFGH',1,room,'private-key-0','player-1');
assert.equal(view.watchedId,'player-1');
assert.equal(view.capacity,4);
for(const p of view.players){
 const rich=p.id==='player-0'||p.id==='player-1';
 assert.equal(Array.isArray(p.s.enemies),rich);
 assert.equal(Array.isArray(p.s.towers),rich);
 if(rich)for(const key of ['workers','miners','population','barracks','lab','wood','crystals','research'])assert.ok(Object.hasOwn(p.s,key),key+' available for spectator scenes');
}
for(const hidden of ['private-key-','"accountId"','"seed"','"receipts"'])assert.equal(JSON.stringify(view).includes(hidden),false,'wire view must omit '+hidden);
assert.equal(roomView('x',1,room,'private-key-0','outsider').watchedId,null);
assert.equal(roomView('x',1,room,'private-key-0','player-0').watchedId,null);
assert.throws(()=>roomView('x',1,room,'outsider','player-1'),e=>e.status===403);
assert.throws(()=>mutateRoom(room,'private-key-0',{op:'action',watchId:'player-1'},now+100),e=>e.status===403);
assert.throws(()=>mutateRoom(room,'private-key-0',{op:'action',playerId:'player-1'},now+100),e=>e.status===403);
const before=room.players[1].s.gold;
room.players[0].s.gold=1000;
mutateRoom(room,'private-key-0',{op:'action',action:'build',args:['archer',0],sequence:1,actionId:crypto.randomUUID()},now+200);
assert.equal(room.players[0].s.towers.length,1);
assert.equal(room.players[1].s.gold,before,'authenticated actor cannot spend watched opponent currency');
assert.equal(room.players[1].s.towers.length,0);
console.log('PASS: only self/selected opponent receive full Game state; other summaries and private fields remain filtered; actions bind to authenticated actor');

const source=fs.readFileSync('lib/clan-room.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export class ClanRoom','class ClanRoom');
const ClanRoom=Function('DurableObject','advance','mutateRoom','roomView','roomError','delta','normalizeWatch','RoomDirectory','directoryRecord',source+';return ClanRoom;')(class{},advance,mutateRoom,roomView,roomError,delta,normalizeWatch,RoomDirectory,directoryRecord);
const instance=new ClanRoom({waitUntil(){},storage:{}},{DB:{}}),frames=[];
instance.id='F-ABCDEFGH';instance.version=1;instance.room=room;instance.checkpoint=()=>{};instance.saveRanking=()=>{};
const ws={send:raw=>frames.push(JSON.parse(raw)),close(){}};
instance.sockets.set(ws,{key:'private-key-0',watch:null,lastCommand:0});
await instance.message(ws,JSON.stringify({type:'watch',id:'player-1'}));
assert.equal(frames.at(-1).value.watchedId,'player-1');
const ownTowers=room.players[0].s.towers.length;
await instance.message(ws,JSON.stringify({type:'command',requestId:'blocked',input:{op:'action',action:'build',args:['archer',1],sequence:2,actionId:crypto.randomUUID()}}));
assert.equal(frames.at(-1).status,403);
assert.equal(room.players[0].s.towers.length,ownTowers);
const denied=await instance.fetch(new Request('https://internal/room',{method:'POST',headers:{'x-clan-room':instance.id,'x-clan-key':'private-key-0'},body:JSON.stringify({op:'action',action:'build',args:['archer',1],sequence:2,actionId:crypto.randomUUID()})}));
assert.equal(denied.status,403,'HTTP cannot bypass a socket watch lock');
await instance.message(ws,JSON.stringify({type:'watch',id:'player-2'}));
assert.equal(instance.sockets.get(ws).watch,'player-2','rapid selection updates server target even when frame is coalesced');
await instance.message(ws,JSON.stringify({type:'watch',id:null}));
assert.equal(instance.sockets.get(ws).watch,null,'return to own territory is never rate-limited away');
assert.equal(frames.at(-1).value.watchedId,null);
await instance.message(ws,JSON.stringify({type:'command',requestId:'allowed',input:{op:'action',action:'build',args:['archer',1],sequence:2,actionId:crypto.randomUUID()}}));
assert.equal(frames.find(m=>m.requestId==='allowed').error,undefined);
assert.equal(room.players[0].s.towers.length,ownTowers+1);
console.log('PASS: socket and HTTP spectator mutation rejection, coalesced target changes, immediate return and resumed own control');

function merge(old,patch){if(!patch)return old;if(Object.hasOwn(patch,'set'))return patch.set;if(patch.order){const byId=new Map((old||[]).map(x=>[x.id,x]));return patch.order.map(id=>merge(byId.get(id),patch.entries[id]));}const next={...old};for(const key of patch.remove||[])delete next[key];for(const [key,p]of Object.entries(patch.changes||{}))next[key]=merge(next[key],p);return next;}
const clean=x=>JSON.parse(JSON.stringify(x));
let previous=clean(roomView('F-ABCDEFGH',1,room,'private-key-0','player-1'));
for(let i=0;i<20;i++){
 room.players[1].s.gold+=7;room.players[1].s.events.push({id:i,text:'test'});
 const next=clean(roomView('F-ABCDEFGH',i+2,room,'private-key-0',i%3===0?'player-2':i%3===1?'player-1':null));
 assert.deepEqual(merge(previous,delta(previous,next)),next,'delta applies through selected/full-state add/remove transitions');
 assert.equal(delta(next,clean(next)),undefined,'unchanged state emits no patch');previous=next;
}
for(const [a,b]of [[{items:[1,2]},{items:[1,3]}],[{items:[{id:'a',n:1},{id:'b',n:2}]},{items:[{id:'b',n:3}]}],[{gone:true},{new:true}],[{},{}]])assert.deepEqual(merge(a,delta(a,b)),b);
console.log('PASS: optimized delta preserves ID-array reorder/deletion, atomic arrays, tombstones and spectator projection changes');
