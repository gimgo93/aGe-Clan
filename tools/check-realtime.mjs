import assert from 'node:assert/strict';
import WebSocket from 'ws';
const base=process.env.CLAN_TEST_URL||'http://127.0.0.1:8787',users=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(c,input){const r=await fetch(base+'/api/clan',{method:'POST',headers:{'Content-Type':'application/json',cookie:c.cookie||''},body:JSON.stringify({roomId:c.id,...input})});if(r.headers.get('set-cookie'))c.cookie=r.headers.get('set-cookie').split(';')[0];const value=await r.json();assert.equal(r.status,200,JSON.stringify(value));if(value.roomId)c.id=value.roomId;return value;}
function merge(v,p){if(!p)return v;if(Object.hasOwn(p,'set'))return p.set;if(p.order){const old=new Map((v||[]).map(x=>[x.id,x]));return p.order.map(id=>merge(old.get(id),p.entries[id]));}const n={...v};for(const k of p.remove||[])delete n[k];for(const [k,d] of Object.entries(p.changes||{}))n[k]=merge(n[k],d);return n;}
async function connect(c){const url=base.replace(/^http/,'ws')+'/api/clan/socket?roomId='+encodeURIComponent(c.id),ws=new WebSocket(url,{headers:{cookie:c.cookie,origin:base}});c.ws=ws;c.messages=[];c.patches=0;c.bytes=0;
 ws.on('message',raw=>{c.bytes+=raw.length;const m=JSON.parse(raw);c.messages.push(m);if(m.type==='snapshot')c.state=m.value;if(m.type==='patch'){assert.equal(c.state.version,m.baseVersion);c.state=merge(c.state,m.patch);c.patches++;}});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});await until(()=>c.state,3000);return ws;
}
async function until(fn,ms=4000){const start=Date.now();while(!fn()){assert.ok(Date.now()-start<ms,'timed out');await sleep(25);}}
async function command(c,input){const requestId=crypto.randomUUID();c.ws.send(JSON.stringify({type:'command',requestId,input}));await until(()=>c.messages.some(m=>m.type==='ack'&&m.requestId===requestId));const ack=c.messages.find(m=>m.type==='ack'&&m.requestId===requestId);assert.equal(ack.error,undefined,JSON.stringify(ack));return ack.value;}
try{
 for(const count of [2,5]){
  const group=Array.from({length:count},()=>({}));users.push(...group);const host=group[0],created=await api(host,{op:'create',name:'실시간 검증 '+count,entryId:crypto.randomUUID()});assert.equal(created.transport,'websocket');
  await Promise.all(group.slice(1).map((c,i)=>api(c,{op:'joinCode',code:created.code,name:'참가자 '+i})));
  await Promise.all(group.map(connect));await until(()=>group.every(c=>c.state.players.length===count));
  await command(host,{op:'begin'});await until(()=>group.every(c=>c.state.status==='playing'),7000);
  const self=()=>host.state.players.find(p=>p.id===host.state.selfId).s;
  const input={op:'action',action:'build',args:['archer',0],actionId:crypto.randomUUID(),sequence:host.state.nextActionSeq};
  let value=await command(host,input);assert.equal(value.players.find(p=>p.id===value.selfId).s.towers.length,1);
  await sleep(110);value=await command(host,input);assert.equal(value.players.find(p=>p.id===value.selfId).s.towers.length,1,'duplicate command is idempotent');
  const next=value.nextActionSeq;await sleep(110);await command(host,{op:'action',action:'startWave',args:[2],actionId:crypto.randomUUID(),sequence:next});await until(()=>self().wave===2);
  assert.equal(group[1].state.players.find(p=>p.id===group[1].state.selfId).s.wave,0);
  const other=host.state.players.find(p=>p.id!==host.state.selfId);assert.equal(other.s.enemies,undefined);host.ws.send(JSON.stringify({type:'watch',id:other.id}));await until(()=>host.state.players.find(p=>p.id===other.id).s.enemies);
  const times=[];for(let i=0;i<6;i++){const sentAt=performance.now();host.ws.send(JSON.stringify({type:'ping',sentAt}));await until(()=>host.messages.some(m=>m.type==='pong'&&m.sentAt===sentAt));times.push(performance.now()-sentAt);}
  const id=host.state.selfId;host.ws.close();await sleep(100);host.state=null;await connect(host);assert.equal(host.state.selfId,id);assert.equal(self().towers.length,1);
  await sleep(500);assert.ok(group[1].patches>0,'delta frames used');assert.equal(JSON.stringify(host.state).includes('"key"'),false,'private session hashes never broadcast');
  console.log(JSON.stringify({players:count,transport:'websocket',reconnected:true,idempotent:true,deltaFrames:group[1].patches,localPingSampleMs:Math.round(times.sort((a,b)=>a-b)[3])}));
  for(const c of group){c.ws.close();await api(c,{op:'leave'});c.id=null;}
 }
 console.log('PASS: 2/5 player WebSockets, countdown, simultaneous joins, action acknowledgments, retries, delta patches, independent waves, spectator scope and reconnection');
}finally{for(const c of users){c.ws?.close();if(c.id)try{await api(c,{op:'leave'});}catch{}}}
