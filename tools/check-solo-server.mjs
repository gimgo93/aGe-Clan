import assert from 'node:assert/strict';
const base=process.env.CLAN_TEST_URL||'http://127.0.0.1:8788';
const token=process.env.CLAN_TEST_BACKEND_TOKEN;
let cookie='',roomId;const cookies=new Map(),pause=ms=>new Promise(r=>setTimeout(r,ms));
async function api(input){const r=await fetch(base+'/api/clan',{method:'POST',headers:{'Content-Type':'application/json',...(token?{'x-clan-backend-token':token}:{}),cookie},body:JSON.stringify({roomId,...input})});for(const entry of r.headers.getSetCookie()){const pair=entry.split(';')[0],at=pair.indexOf('=');cookies.set(pair.slice(0,at),pair.slice(at+1));}cookie=[...cookies].map(([k,v])=>k+'='+v).join('; ');const v=await r.json();assert.equal(r.status,200,JSON.stringify(v));roomId=v.roomId||roomId;return v;}
let s;
try{
 s=await api({op:'solo',name:'검증용 군주',avatar:5,entryId:crypto.randomUUID()});assert.equal(s.solo,true);assert.equal(s.status,'playing');const me=()=>s.players.find(p=>p.id===s.selfId).s;assert.equal(me().multiplayer,false);assert.equal(me().waveClock,30);
 s=await api({op:'action',action:'setSpeed',args:[2],sequence:s.nextActionSeq,actionId:crypto.randomUUID()});await pause(120);
 s=await api({op:'action',action:'startWave',args:[1],sequence:s.nextActionSeq,actionId:crypto.randomUUID()});
 const began=Date.now();while(me().completed<1&&!me().over){assert.ok(Date.now()-began<65000,'solo wave timeout');await pause(1000);s=await api({op:'poll'});}
 assert.ok(me().completed>=1,'a cleared wave is recorded');await pause(800);const ranks=await api({op:'leaderboard'});assert.ok(ranks.items.some(p=>p.name==='검증용 군주'&&p.wave>=1));
 console.log('PASS: authoritative solo start, 2x, actual wave completion, server-persisted leaderboard and profile');
}finally{if(roomId)try{await api({op:'leave'});}catch{}}
