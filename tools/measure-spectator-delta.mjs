// Synthetic local CPU microbenchmark, not a claim about edge latency or real
// maximum concurrency. Frame construction/JSON encoding are reported separately.
import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {newPlayer,startRoom} from '../lib/match-engine.js';
import {roomView,delta} from '../lib/room-state.js';
function previousDelta(before,after){
 if(JSON.stringify(before)===JSON.stringify(after))return undefined;
 if(Array.isArray(before)&&Array.isArray(after)&&after.every(x=>x&&typeof x==='object'&&(typeof x.id==='string'||Number.isSafeInteger(x.id)))&&before.every(x=>x&&typeof x==='object'&&(typeof x.id==='string'||Number.isSafeInteger(x.id)))){const old=new Map(before.map(x=>[x.id,x]));return{order:after.map(x=>x.id),entries:Object.fromEntries(after.map(x=>[x.id,previousDelta(old.get(x.id),x)]).filter(([,d])=>d))};}
 if(!before||!after||typeof before!=='object'||typeof after!=='object'||Array.isArray(before)||Array.isArray(after))return{set:after};
 const changes={},remove=Object.keys(before).filter(k=>!(k in after));
 for(const k of Object.keys(after)){const d=previousDelta(before[k],after[k]);if(d)changes[k]=d;}
 return{changes,remove};
}
const now=Date.now(),room={status:'waiting',capacity:4,players:Array.from({length:4},(_,i)=>({...newPlayer('p'+i,'측정 '+i,now),key:'key'+i})),tick:now};
startRoom(room,now);
for(const p of room.players){
 p.s.enemies=Array.from({length:160},(_,id)=>({id,x:id*3,y:id%17,hp:50,max:100,d:id*3,speed:24,kind:'raider',slowed:0,attack:3}));
 p.s.towers=Array.from({length:30},(_,id)=>({id,x:id*40,y:id%5*70,type:'archer',attack:.5,buildRemaining:0}));
}
function measure(fn,before,after){for(let i=0;i<20;i++)fn(before,after);const values=[];for(let i=0;i<60;i++){const t=performance.now();fn(before,after);values.push(performance.now()-t);}values.sort((a,b)=>a-b);return{medianMs:+values[30].toFixed(4),p95Ms:+values[57].toFixed(4)};}
const results=[];
for(const watchId of [null,'p1']){
 const t=performance.now(),before=JSON.parse(JSON.stringify(roomView('bench',1,room,'key0',watchId))),constructionMs=performance.now()-t;
 const after=structuredClone(before);after.version++;
 for(const p of after.players){p.s.gold+=1;if(p.s.enemies)for(const e of p.s.enemies)e.x+=1;}
 const old=measure(previousDelta,before,after),current=measure(delta,before,after);
 results.push({watchId,richStates:after.players.filter(p=>p.s.enemies).length,snapshotBytes:Buffer.byteLength(JSON.stringify(after)),patchBytes:Buffer.byteLength(JSON.stringify(delta(before,after))),constructionAndJsonRoundtripMs:+constructionMs.toFixed(4),previousDelta:old,optimizedDelta:current,medianRatio:+(old.medianMs/current.medianMs).toFixed(2)});
}
const report={at:new Date().toISOString(),scope:'Synthetic local Node CPU microbenchmark; 4 players, 160 enemies and 30 towers each; not production latency, real load capacity or network measurement',node:process.version,iterationsPerCase:60,results};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
