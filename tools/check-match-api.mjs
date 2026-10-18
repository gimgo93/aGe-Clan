import assert from 'node:assert/strict';
const url='http://127.0.0.1:8787/api/clan';
const clients=Array.from({length:5},()=>({cookie:'',roomId:null}));
async function call(client,body){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(client.cookie?{cookie:client.cookie}:{})},body:JSON.stringify({...body,roomId:client.roomId})});const cookie=r.headers.get('set-cookie');if(cookie)client.cookie=cookie.split(';')[0];const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));if(data.roomId)client.roomId=data.roomId;return data;}
try{
 const joined=await Promise.all(clients.map((c,i)=>call(c,{op:'join',name:'검증 군주 '+i})));
 assert.equal(new Set(joined.map(d=>d.roomId)).size,1,'concurrent joins must share one room');
 let state=await call(clients[0],{op:'poll'});assert.equal(state.status,'countdown');assert.equal(state.players.length,5);assert.equal(new Set(state.players.map(p=>p.id)).size,5);
 await new Promise(r=>setTimeout(r,5100));state=await call(clients[0],{op:'poll'});assert.equal(state.status,'playing');
 const command={op:'action',action:'build',args:['archer',0],actionId:crypto.randomUUID(),sequence:1};
 let built=await call(clients[0],command);assert.ok(built.result.ok);assert.equal(built.players.find(p=>p.id===built.selfId).s.towers.length,1);
 built=await call(clients[0],command);assert.equal(built.players.find(p=>p.id===built.selfId).s.towers.length,1,'replayed actions are idempotent');
 const stale=await call(clients[0],{...command,actionId:crypto.randomUUID(),args:['archer',1]});assert.ok(stale.result.error);assert.equal(stale.nextActionSeq,2);
 for(const invalid of ['null','{']){const r=await fetch(url,{method:'POST',body:invalid});assert.equal(r.status,400);}
 const stranger=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'poll',roomId:clients[0].roomId})});assert.equal(stranger.status,403);
 await call(clients[0],{op:'poll'});for(const c of clients.slice(1))await call(c,{op:'leave'});
 const final=await call(clients[0],{op:'poll'});assert.equal(final.status,'finished');assert.equal(final.winner,final.selfId);
 await call(clients[0],{op:'leave'});
 const retained=await call(clients[1],{op:'join',name:'다음 게임'});assert.notEqual(retained.roomId,final.roomId);
 console.log('PASS: five concurrent real HTTP sessions, shared room, authoritative build, replay protection, room authorization, final winner');
}finally{for(const client of clients)if(client.roomId)try{await call(client,{op:'leave'});}catch{}}
