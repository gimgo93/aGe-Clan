import assert from 'node:assert/strict';
const endpoint='http://127.0.0.1:8787/api/clan',clients=[];
const client=()=>{const c={cookie:'',roomId:null};clients.push(c);return c;};
async function call(c,body,status=200){const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(c.cookie?{cookie:c.cookie}:{})},body:JSON.stringify({roomId:c.roomId,...body})});const cookie=r.headers.get('set-cookie');if(cookie)c.cookie=cookie.split(';')[0];const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));if(d.roomId)c.roomId=d.roomId;return d;}
try{
 const host=client(),friend=client();const created=await call(host,{op:'create',name:'방장'});assert.equal(created.private,true);assert.match(created.code,/^[A-HJ-NP-Z2-9]{8}$/);assert.equal(created.hostId,created.selfId);
 await call(host,{op:'begin'},409);
 const joined=await call(friend,{op:'joinCode',code:created.code.toLowerCase(),name:'친구'});assert.equal(joined.roomId,created.roomId);assert.equal(joined.players.length,2);assert.equal(joined.status,'waiting');
 const again=await call(friend,{op:'joinCode',code:created.code});assert.equal(again.players.length,2);
 await call(friend,{op:'begin'},403);
 const publicPlayer=client(),publicRoom=await call(publicPlayer,{op:'join',name:'일반 매칭'});assert.notEqual(publicRoom.roomId,created.roomId);assert.equal(publicRoom.private,false);assert.equal(publicRoom.players.length,1);
 const invalid=client();await call(invalid,{op:'joinCode',code:'NOT!CODE'},400);await call(invalid,{op:'joinCode',code:'ZZZZZZZZ'},404);
 const others=[];for(let i=0;i<3;i++){const c=client();others.push(c);await call(c,{op:'joinCode',code:created.code,name:'친구'+i});}
 assert.equal((await call(host,{op:'poll'})).status,'waiting','private rooms never auto-start at five');
 await call(invalid,{op:'joinCode',code:created.code},409);
 await call(host,{op:'leave'});const transferred=await call(friend,{op:'poll'});assert.equal(transferred.hostId,transferred.selfId);
 for(const c of others)await call(c,{op:'leave'});await call(friend,{op:'begin'},409);
 await call(host,{op:'joinCode',code:created.code,name:'다시 입장'});
 const preparing=await call(friend,{op:'begin'});assert.equal(preparing.status,'countdown');const repeated=await call(friend,{op:'begin'});assert.equal(repeated.readyAt,preparing.readyAt);
 await new Promise(r=>setTimeout(r,5100));const playing=await call(friend,{op:'poll'});assert.equal(playing.status,'playing');assert.equal(playing.players.length,2);
 await call(invalid,{op:'joinCode',code:created.code},409);await call(host,{op:'leave'});const finished=await call(friend,{op:'poll'});assert.equal(finished.winner,finished.selfId);
 const closing=client(),empty=await call(closing,{op:'create',name:'닫을 방'});await call(closing,{op:'leave'});await call(invalid,{op:'joinCode',code:empty.code},409);
 console.log('PASS: invite codes, public/private isolation, duplicate join, 5-player capacity, host-only start, host transfer, two-player match, closed/started room rejection');
}finally{for(const c of clients)if(c.roomId)try{await call(c,{op:'leave'});}catch{}}
