import assert from 'node:assert/strict';
const base=process.env.CLAN_TEST_URL;
if(!base)throw new Error('CLAN_TEST_URL must explicitly name the authorized destination.');
const clients=[{},{}],samples=[];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function call(c,input,measure=false){const start=performance.now();const r=await fetch(base+'/api/clan',{method:'POST',headers:{'Content-Type':'application/json',...(c.cookie?{cookie:c.cookie}:{})},body:JSON.stringify({roomId:c.roomId,...input})});c.cookies??=new Map();for(const entry of r.headers.getSetCookie()){const pair=entry.split(';')[0],at=pair.indexOf('=');c.cookies.set(pair.slice(0,at),pair.slice(at+1));}c.cookie=[...c.cookies].map(([k,v])=>k+'='+v).join('; ');const value=await r.json();assert.equal(r.status,200,JSON.stringify(value));if(value.roomId)c.roomId=value.roomId;if(measure)samples.push(performance.now()-start);return value;}
try{
 const room=await call(clients[0],{op:'create',name:'연결 점검 1',entryId:crypto.randomUUID()});await call(clients[1],{op:'joinCode',code:room.code,name:'연결 점검 2'});await call(clients[0],{op:'begin'});await sleep(5200);
 let a;for(let i=0;i<6;i++){[a]=await Promise.all(clients.map(c=>call(c,{op:'poll'},true)));await sleep(250);}
 assert.equal(a.status,'playing');const action={op:'action',action:'build',args:['archer',0],sequence:a.nextActionSeq,actionId:crypto.randomUUID()};const built=await call(clients[0],action,true),retry=await call(clients[0],action,true);assert.equal(built.players.find(p=>p.id===built.selfId).s.towers.length,1);assert.equal(retry.players.find(p=>p.id===retry.selfId).s.towers.length,1);
 samples.sort((a,b)=>a-b);console.log(JSON.stringify({transport:room.transport,players:2,samples:samples.length,medianResponseMs:Math.round(samples[Math.floor(samples.length/2)]),p95ResponseMs:Math.round(samples[Math.ceil(samples.length*.95)-1]),maxResponseMs:Math.round(samples.at(-1)),privateMatch:'passed',buildAndRetry:'passed'}));
}finally{for(const c of clients)if(c.roomId)try{await call(c,{op:'leave'});}catch{}}
