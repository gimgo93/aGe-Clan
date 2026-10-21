import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import WebSocket from 'ws';
const token=crypto.randomBytes(32).toString('hex'),origin='https://loadtest.ageclan.com',results=[];let domainId;
const oauth=fs.readFileSync(path.join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];if(!oauth)throw Error('Wrangler login required');
async function domainApi(method,body){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/461dfd7a5b1c91735bf05dcb6f9ce666/workers/domains'+(method==='DELETE'?'/'+domainId:''),{method,headers:{Authorization:'Bearer '+oauth,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const text=await r.text();if(r.ok&&method==='DELETE'&&!text)return null;const v=JSON.parse(text);if(!r.ok||!v.success)throw Error('Temporary domain operation failed: '+JSON.stringify(v.errors));return v.result;}
const wrangler=['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js'];
function cli(args,input){const r=spawnSync(process.execPath,[...wrangler,...args],{input,encoding:'utf8',timeout:120000,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});if(r.status!==0)throw Error((r.stdout+r.stderr).replaceAll(token,'[redacted]'));console.log('OK: '+args.slice(0,3).join(' '));}
fs.mkdirSync('dist/load',{recursive:true});
const config={name:'age-clan-load-test',main:'../../build/load-worker.js',account_id:'461dfd7a5b1c91735bf05dcb6f9ce666',compatibility_date:'2026-05-15',compatibility_flags:['nodejs_compat'],workers_dev:true,durable_objects:{bindings:[{name:'CLAN_ROOMS',class_name:'LoadRoom'}]},migrations:[{tag:'load-v1',new_sqlite_classes:['LoadRoom']}],d1_databases:[{binding:'DB',database_name:'age-clan-load-db',database_id:'a1bdc654-58a0-4839-b271-0dd5b8f34261',migrations_dir:'../../drizzle'}],observability:{enabled:true}};
fs.writeFileSync('dist/load/wrangler.json',JSON.stringify(config,null,2));
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),percentile=(a,p)=>a.length?[...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*p))]:null;
async function control(path,room,scenario){const r=await fetch(origin+path+'?room='+room+(scenario?'&scenario='+scenario:''),{method:path==='/stats'?'GET':'POST',headers:{'x-load-token':token}});if(!r.ok)throw Error('Control '+path+' '+r.status+' '+(await r.text()).slice(0,200));return r.json();}
function merge(old,p){if(!p)return old;if(Object.hasOwn(p,'set'))return p.set;if(p.order){const map=new Map((old||[]).map(x=>[x.id,x]));return p.order.map(id=>merge(map.get(id),p.entries[id]));}const next={...old};for(const k of p.remove||[])delete next[k];for(const [k,v]of Object.entries(p.changes||{}))next[k]=merge(next[k],v);return next;}
async function client(room,i,metrics){const c={room,i,sequence:1,pending:null,lastFrame:0},ws=new WebSocket(origin.replace('https:','wss:')+'/socket?room='+room+'&player='+i,{headers:{'x-load-token':token}});c.ws=ws;
 ws.on('message',raw=>{metrics.bytes+=raw.length;let m;try{m=JSON.parse(raw);}catch{metrics.errors++;return;}const now=performance.now();if(m.type==='snapshot'||m.type==='patch'){if(c.lastFrame&&metrics.running)metrics.frameGaps.push(now-c.lastFrame);c.lastFrame=now;if(m.type==='snapshot')c.wire=m.value;else{if(c.wire?.version!==m.baseVersion){metrics.errors++;return;}c.wire=merge(c.wire,m.patch);}c.state=c.wire;c.sequence=Math.max(c.sequence,c.state.nextActionSeq);}else if(m.type==='pong'&&metrics.running)metrics.rtt.push(now-m.sentAt);else if(m.type==='ack'){if(c.pending){if(metrics.running)metrics.ack.push(now-c.pending.at);c.pending=null;}if(m.error||m.value?.result?.error)metrics.commandErrors++;else c.sequence=Math.max(c.sequence,m.value.nextActionSeq);if(m.value)c.state=m.value;}else if(m.type==='error')metrics.errors++;});
 ws.on('error',()=>metrics.errors++);ws.on('close',()=>{if(metrics.running)metrics.disconnects++;});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);setTimeout(()=>reject(Error('socket open timeout')),15000).unref();});
 const start=Date.now();while(!c.state){if(Date.now()-start>10000)throw Error('snapshot timeout');await sleep(30);}return c;
}
try{
 cli(['d1','migrations','apply','DB','--config','dist/load/wrangler.json','--remote']);cli(['deploy','--config','dist/load/wrangler.json']);cli(['secret','bulk','--config','dist/load/wrangler.json'],JSON.stringify({LOAD_TEST_TOKEN:token}));
 const attached=await domainApi('PUT',{hostname:'loadtest.ageclan.com',service:'age-clan-load-test',environment:'production',zone_id:'3ba8dbdf1f61337350029d596a532c3d'});domainId=attached.id;
 for(let attempt=0;;attempt++){try{const r=await fetch(origin);if(r.status===403){console.log('Temporary test domain ready via '+r.headers.get('cf-ray'));break;}}catch{}if(attempt>=45)throw Error('Temporary domain TLS/DNS not ready');await sleep(2000);}
 const stages=process.env.CLAN_DIAGNOSTIC==='1'?[['early',5],['early-nostore',5]]:[['early',5],['late',5],['late',10],['late',20]];
 for(const [scenario,players]of stages){
  const rooms=[],clients=[],metrics={rtt:[],ack:[],frameGaps:[],errors:0,commandErrors:0,disconnects:0,bytes:0,running:false};let timer;
  const loop=monitorEventLoopDelay({resolution:10});loop.enable();const baseline=[];const echo=new WebSocket(origin.replace('https:','wss:')+'/echo',{headers:{'x-load-token':token}});echo.on('message',raw=>{const v=JSON.parse(raw);if(metrics.running)baseline.push(performance.now()-v.sentAt);});echo.on('error',()=>{});
  try{
   for(let n=0;n<players/5;n++){const room='load-'+crypto.randomUUID();rooms.push(room);await control('/seed',room,scenario);clients.push(...await Promise.all(Array.from({length:5},(_,i)=>client(room,i,metrics))));}
   await sleep(8000);metrics.running=true;const began=performance.now();let pulse=0;
   timer=setInterval(()=>{pulse++;if(echo.readyState===1)echo.send(JSON.stringify({sentAt:performance.now()}));for(const c of clients){if(c.ws.readyState!==1)continue;const now=performance.now();c.ws.send(JSON.stringify({type:'ping',sentAt:now}));if(c.pending){if(now-c.pending.at>3000)metrics.errors++;continue;}if(pulse%2)continue;const self=c.state.players.find(p=>p.id===c.state.selfId),tower=self.s.towers.find(t=>t.pad===25),input={op:'action',action:tower?'sellTower':'build',args:tower?[tower.id]:['archer',25],sequence:c.sequence,actionId:crypto.randomUUID()};c.pending={at:now};c.ws.send(JSON.stringify({type:'command',requestId:crypto.randomUUID(),input}));}},1000);
   await sleep(30000);clearInterval(timer);const seconds=(performance.now()-began)/1000;metrics.running=false;const stats=await Promise.all(rooms.map(r=>control('/stats',r)));
   const row={scenario,players,rooms:rooms.length,seconds:Math.round(seconds),rttP95Ms:percentile(metrics.rtt,.95),ackP95Ms:percentile(metrics.ack,.95),frameGapP95Ms:percentile(metrics.frameGaps,.95),maxFrameGapMs:percentile(metrics.frameGaps,1),errors:metrics.errors,commandErrors:metrics.commandErrors,disconnects:metrics.disconnects,bytesPerSecond:Math.round(metrics.bytes/seconds),generatorLagP95Ms:loop.percentile(95)/1e6,roomQueueP95MaxMs:Math.max(...stats.map(x=>x.queueP95)),roomWorkP95MaxMs:Math.max(...stats.map(x=>x.workP95)),serverLagMaxMs:Math.max(...stats.map(x=>x.lagMs)),occupancy:stats[0]?.players};
   row.networkBaselineP95Ms=percentile(baseline,.95);row.passed=row.errors===0&&row.commandErrors===0&&row.disconnects===0&&row.ackP95Ms<300&&row.rttP95Ms<200&&row.frameGapP95Ms<350&&row.generatorLagP95Ms<40;
   row.serverPassed=row.errors===0&&row.commandErrors===0&&row.disconnects===0&&row.networkBaselineP95Ms!==null&&row.ackP95Ms<Math.max(300,row.networkBaselineP95Ms+150)&&row.rttP95Ms<Math.max(200,row.networkBaselineP95Ms+150)&&row.frameGapP95Ms<350&&row.generatorLagP95Ms<40;
   row.serverClockNote='Workers timers freeze during CPU execution; roomWork fields are not CPU measurements.';
   results.push(row);console.log(JSON.stringify(row));fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/'+(process.env.CLAN_DIAGNOSTIC==='1'?'capacity-diagnostic-2026-10-20.json':'capacity-2026-10-20.json'),JSON.stringify({origin,at:new Date().toISOString(),results},null,2));if(!row.serverPassed&&process.env.CLAN_DIAGNOSTIC!=='1')break;
  }finally{clearInterval(timer);metrics.running=false;echo.close();for(const c of clients)c.ws.close();await Promise.allSettled(rooms.map(r=>control('/dispose',r)));loop.disable();}
 }
}finally{try{if(domainId)await domainApi('DELETE');}finally{cli(['delete','age-clan-load-test','--force']);}console.log('Test sockets, rooms, temporary domain and Worker cleaned. Token was never written to disk.');}
