import assert from 'node:assert/strict';
const url='http://127.0.0.1:8787/api/clan',clients=[];
function user(){const c={cookie:'',roomId:null};clients.push(c);return c;}
async function call(c,body,status=200){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(c.cookie?{cookie:c.cookie}:{})},body:JSON.stringify({roomId:c.roomId,...body})});if(r.headers.get('set-cookie'))c.cookie=r.headers.get('set-cookie').split(';')[0];const value=await r.json();assert.equal(r.status,status,JSON.stringify(value));if(value.roomId)c.roomId=value.roomId;return value;}
try{
 const a=user(),b=user();let previous=await call(a,{op:'create',name:'방 이동 검증',entryId:crypto.randomUUID()});const firstId=previous.roomId;
 const next=await call(a,{op:'create',name:'새 방',entryId:crypto.randomUUID()});assert.notEqual(next.roomId,firstId,'creating again releases an abandoned room');
 await call(b,{op:'joinCode',name:'친구',code:next.code});let snapshot=await call(a,{op:'poll'});const other=snapshot.players.find(p=>p.id!==snapshot.selfId);assert.equal(other.s.enemies,undefined,'opponents only send summary data');assert.ok(Array.isArray(snapshot.players.find(p=>p.id===snapshot.selfId).s.enemies));
 snapshot=await call(a,{op:'poll',watchId:other.id});assert.ok(Array.isArray(snapshot.players.find(p=>p.id===other.id).s.enemies));
 await call(a,{op:'begin'});await new Promise(r=>setTimeout(r,5100));snapshot=await call(a,{op:'poll'});const started=await call(a,{op:'action',action:'startWave',args:[2],sequence:1,actionId:crypto.randomUUID()});assert.equal(started.players.find(p=>p.id===started.selfId).s.wave,2);assert.equal(started.players.find(p=>p.id!==started.selfId).s.wave,0);
 const createdB=await call(b,{op:'create',name:'이탈 후 새 방',entryId:crypto.randomUUID()});assert.notEqual(createdB.roomId,next.roomId,'can switch away even without a successful leave request');
 const publicEntry=await call(b,{op:'join',name:'일반 매칭으로'});assert.equal(publicEntry.private,false);
 await call(b,{op:'leave'});await call(b,{op:'leave'});
 const bad=await fetch(url.replace('/clan','/feedback'),{method:'POST',body:JSON.stringify({message:'a'})});assert.equal(bad.status,400);
 const sent=await fetch(url.replace('/clan','/feedback'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'로컬 자동 검사 의견입니다. 실제 운영 데이터가 아닙니다.'})});assert.equal(sent.status,200);const cookie=sent.headers.get('set-cookie').split(';')[0];const repeat=await fetch(url.replace('/clan','/feedback'),{method:'POST',headers:{cookie},body:JSON.stringify({message:'중복 전송 확인'})});assert.equal(repeat.status,429);
 console.log('PASS: abandoned-room cleanup, new room entry after forfeit, idempotent leave, compact snapshots, full spectating, independent/double waves, feedback validation/storage');
}finally{for(const c of clients)if(c.roomId)try{await call(c,{op:'leave'});}catch{}}
