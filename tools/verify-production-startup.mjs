import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const origin='https://ageclan.com',samples=[];
for(let i=0;i<5;i++)for(const path of ['/game/','/api/clan']){const t=performance.now();const r=await fetch(origin+path);const headers=performance.now()-t;await r.arrayBuffer();samples.push({path,run:i+1,status:r.status,headersMs:Math.round(headers),totalMs:Math.round(performance.now()-t)});}
const files=['public/game/app.js','public/game/renderer.js','public/game/asset-loader.js','public/game/account.js','public/game/title-travelers.js',...(await fs.readdir('public/game/assets')).filter(x=>x.endsWith('-packed.webp')).map(x=>'public/game/assets/'+x)];
const hashes=[];
for(const file of files){const r=await fetch(origin+'/'+file.replace('public/','')+'?v=20261031-perf1');const remote=Buffer.from(await r.arrayBuffer());const local=await fs.readFile(file);hashes.push({file,status:r.status,bytes:remote.length,match:crypto.createHash('sha256').update(local).digest('hex')===crypto.createHash('sha256').update(remote).digest('hex')});}
const a=await fetch(origin+'/api/clan/account',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({op:'status'})});const account={status:a.status,body:await a.json()};
const result={checkedAt:new Date().toISOString(),samples,hashes,account};await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/production-perf-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(hashes.some(x=>!x.match)||samples.some(x=>x.status!==200)||a.status!==200)process.exitCode=1;
