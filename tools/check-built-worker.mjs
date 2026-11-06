// Runs the exact built Worker in disposable workerd/Miniflare, without the
// Wrangler development proxy. No configured or remote DB is opened.
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const builtRoot=resolve('dist/server');
const modulePaths=['index.js',...readdirSync(builtRoot,{recursive:true}).filter(p=>p!=='index.js'&&/\.m?js$/.test(p))];
const mf=new Miniflare(convertV4MiniflareOptions({modules:modulePaths.map(p=>({type:'ESModule',path:resolve(builtRoot,p)})),modulesRoot:builtRoot,
 compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],
 durableObjects:{CLAN_ROOMS:{className:'ClanRoom',useSQLite:true}},d1Databases:['DB'],host:'127.0.0.1',port:0}));
try{
 await mf.ready;
 const db=await mf.getD1Database('DB');
 for(const file of readdirSync('drizzle').filter(p=>p.endsWith('.sql')).sort())for(const statement of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.exec(statement.replace(/\r?\n/g,' '));
 const origin='http://local.test';
 async function send(path,body,status,method='POST'){
  const r=await mf.dispatchFetch(origin+path,{method,headers:{origin,'content-type':'application/json'},body});
  assert.equal(r.status,status,path+': '+await r.text());
 }
 for(let round=0;round<3;round++)for(const [path,max] of [['/api/clan',2048],['/api/clan/account',12000],['/api/feedback',8000],['/api/clan/analytics',1200]])await send(path,'x'.repeat(max+1),413);
 await send('/api/clan/analytics','x'.repeat(501),413,'DELETE');
 await send('/api/clan',new Uint8Array([0xff,0xfe]),400);
 await send('/api/clan/account','null',400);await send('/api/clan/account','[]',400);
 await send('/api/clan/account',JSON.stringify({op:'status'}),200);
 const analytics={visitorId:crypto.randomUUID(),sessionId:crypto.randomUUID()};
 await send('/api/clan/analytics',JSON.stringify({event:'page_view',analytics}),202);
 await send('/api/clan/analytics',JSON.stringify({analytics}),200,'DELETE');
 await send('/api/clan/analytics',JSON.stringify({event:'game_start',analytics}),202);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM clan_analytics_events').first()).n,0);
 console.log('PASS: built Worker in disposable workerd: repeated 413, UTF-8/object rejection, status, transactional withdrawal and late-event suppression');
}finally{await mf.dispose();}
