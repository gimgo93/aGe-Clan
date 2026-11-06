// Public GETs only. Does not create rooms, log in, mutate storage or probe limits.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
const raw=process.argv[2];if(!raw)throw Error('Pass the exact authorized origin, for example http://127.0.0.1:8787');
const origin=new URL(raw);if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')throw Error('Expected a bare origin without credentials');
const probes=[];
for(const path of ['/api/clan','/game/','/game/privacy.html','/game/game.js','/game/balance.js','/game/fortress-controls.css']){
 let target=new URL(path,origin),response;const redirects=[];
 for(let hop=0;hop<4;hop++){
  response=await fetch(target,{redirect:'manual',signal:AbortSignal.timeout(10000)});
  if(response.status<300||response.status>=400)break;
  const location=response.headers.get('location');if(!location)break;
  const next=new URL(location,target);if(next.origin!==origin.origin)throw Error('Unexpected cross-origin redirect');
  redirects.push(next.pathname);target=next;
 }
 const body=await response.text(),result={path,status:response.status,redirects,contentType:response.headers.get('content-type')};
 if(path==='/api/clan'&&response.ok){const data=JSON.parse(body);result.health=Object.fromEntries(['status','protocol','capacity','transport','storage','directory'].filter(k=>Object.hasOwn(data,k)).map(k=>[k,data[k]]));}
 if(path.endsWith('.js')||path.endsWith('.css')){const hash=text=>createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex');result.canonicalLfSha256=hash(body);result.matchesLocalSource=response.ok&&hash(readFileSync('public'+path,'utf8'))===hash(body);}
 probes.push(result);
}
const report={at:new Date().toISOString(),origin:origin.origin,mode:'read-only-public-GET',probes};
if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');else console.log(JSON.stringify(report,null,2));
if(probes[0].status!==200||probes[1].status!==200)process.exitCode=1;
