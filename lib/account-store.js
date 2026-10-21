import {createRemoteJWKSet,jwtVerify} from 'jose';
const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export const recordKeys=['wave','kills','castle','miners','wood','tower','crystals','research'];
export const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const cookie=(token,account=false)=>[`clan_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api/clan; Max-Age=2592000`,`clan_account=${account?'1':''}; HttpOnly; Secure; SameSite=Strict; Path=/api/clan; Max-Age=${account?2592000:0}`];
export async function accountIdentity(req,env){
 const current=req.headers.get('cookie')?.match(/(?:^|;\s*)clan_session=([a-f0-9]{64})(?:;|$)/)?.[1],token=current||random(),sessionKey=await sha(token);
 let accountId=null;
 if(env?.DB&&/(?:^|;\s*)clan_account=1(?:;|$)/.test(req.headers.get('cookie')||''))accountId=(await env.DB.prepare('SELECT account_id FROM clan_account_sessions WHERE id=? AND expires>?').bind(sessionKey,Date.now()).first())?.account_id||null;
 return{key:accountId?await sha('account:'+accountId):sessionKey,sessionKey,accountId,cookie:current?null:`clan_session=${token}; HttpOnly; SameSite=Strict; Path=/api/clan; Max-Age=31536000${new URL(req.url).protocol==='https:'?'; Secure':''}`};
}
export function cleanProfile(v){const name=typeof v?.name==='string'?v.name.trim().replace(/[<>\u0000-\u001f]/g,'').slice(0,16):'';return{name:name||'개척 군주',avatar:Number.isInteger(v?.avatar)&&v.avatar>=0&&v.avatar<8?v.avatar:0};}
export function cleanRecords(v){return Object.fromEntries(recordKeys.map(k=>[k,Number.isSafeInteger(v?.[k])&&v[k]>=0?Math.min(v[k],1000000000):0]));}
export function cleanSettings(v){const out={};for(const k of ['music','effects','edgePan','shake','reducedMotion'])if(typeof v?.[k]==='boolean')out[k]=v[k];for(const [k,min,max]of [['volume',0,100],['panSpeed',5,20]])if(Number.isFinite(v?.[k]))out[k]=Math.min(max,Math.max(min,v[k]));if(['fade','slide'].includes(v?.transition))out.transition=v.transition;return out;}
export async function verifyGoogle(token,clientId,nonce,keys=googleKeys){const {payload}=await jwtVerify(token,keys,{algorithms:['RS256'],audience:clientId,issuer:['https://accounts.google.com','accounts.google.com'],maxTokenAge:'10m',clockTolerance:10});if(typeof payload.sub!=='string'||!payload.sub||payload.sub.length>255||payload.nonce!==nonce)throw error('로그인 인증을 다시 시작하세요.',401);return payload.sub;}
async function accountView(db,id){const a=await db.prepare('SELECT * FROM clan_accounts WHERE id=?').bind(id).first();if(!a)throw error('계정을 찾을 수 없습니다.',401);const rankKey=await sha('account:'+id);await db.prepare('UPDATE clan_rankings SET account_id=? WHERE id=? AND account_id IS NULL').bind(id,rankKey).run();const p=await db.prepare('SELECT * FROM clan_account_progress WHERE id=?').bind(id).first();const ranking=await db.prepare('SELECT wave FROM clan_rankings WHERE id=?').bind(rankKey).first();const records=cleanRecords(p);records.wave=Math.max(records.wave,ranking?.wave||0);return{profile:{name:a.name,avatar:a.avatar},settings:JSON.parse(a.settings),legacy:cleanRecords(JSON.parse(a.legacy)),records,revision:a.revision};}
let cleanedAt=0;
async function quota(db,key,max=20){const now=Date.now(),id='account:'+key+':'+Math.floor(now/60000);const r=await db.prepare('INSERT INTO clan_limits(id,hits,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET hits=hits+1 RETURNING hits').bind(id,now+120000).first();if(r.hits>max)throw error('잠시 후 다시 시도하세요.',429);if(now-cleanedAt>60000){cleanedAt=now;await db.batch([db.prepare('DELETE FROM clan_limits WHERE expires<?').bind(now),db.prepare('DELETE FROM clan_account_challenges WHERE expires<?').bind(now),db.prepare('DELETE FROM clan_account_sessions WHERE expires<?').bind(now)]);}}
async function activeRoom(db,key,env){const row=await db.prepare("SELECT id FROM clan_rooms WHERE status IN ('waiting','countdown','playing') AND updated>? AND EXISTS(SELECT 1 FROM json_each(state,'$.players') p WHERE json_extract(p.value,'$.key')=? AND COALESCE(json_extract(p.value,'$.left'),0)=0 AND COALESCE(json_extract(p.value,'$.s.over'),0)=0) ORDER BY updated DESC LIMIT 1").bind(Date.now()-7200000,key).first();if(!row||!env?.CLAN_ROOMS)return row;const stub=env.CLAN_ROOMS.get(env.CLAN_ROOMS.idFromName(row.id));const response=await stub.fetch(new Request('https://internal/room',{method:'POST',headers:{'Content-Type':'application/json','x-clan-room':row.id,'x-clan-key':key},body:JSON.stringify({op:'poll'})}));if([403,404].includes(response.status))return null;if(!response.ok)throw error('진행 중인 방 상태를 확인하지 못했습니다. 잠시 후 시도하세요.',503);const state=await response.json();return ['waiting','countdown','playing'].includes(state.status)&&state.players.some(p=>p.id===state.selfId&&!p.s.over)?row:null;}
export async function accountRequest(req,env,verify=verifyGoogle){
 const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store'});const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers});
 try{
  if(req.method!=='POST')return json({error:'허용되지 않은 요청입니다.'},405);
  if(req.headers.get('origin')!==new URL(req.url).origin)return json({error:'허용되지 않은 요청입니다.'},403);
  const raw=await req.text();if(raw.length>12000)return json({error:'요청이 너무 큽니다.'},413);let v;try{v=JSON.parse(raw);}catch{throw error('잘못된 요청입니다.');}
  const identity=await accountIdentity(req,env),db=env.DB; if(identity.cookie)headers.append('Set-Cookie',identity.cookie);
  await quota(db,identity.sessionKey);
  const ingress=req.headers.get('x-clan-ingress')||req.headers.get('CF-Connecting-IP');if(ingress)await quota(db,'ingress:'+await sha(ingress),120);
  if(v.op==='status')return json({configured:!!env.GOOGLE_CLIENT_ID,account:identity.accountId?await accountView(db,identity.accountId):null});
  if(v.op==='challenge'){
   if(!env.GOOGLE_CLIENT_ID)throw error('Google 로그인 연결 준비 중입니다.',503);
   const nonce=random();await db.batch([db.prepare('DELETE FROM clan_account_challenges WHERE expires<?').bind(Date.now()),db.prepare('INSERT INTO clan_account_challenges(id,nonce,expires) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET nonce=excluded.nonce,expires=excluded.expires').bind(identity.sessionKey,await sha(nonce),Date.now()+600000)]);
   return json({clientId:env.GOOGLE_CLIENT_ID,nonce});
  }
  if(v.op==='login'){
   if(identity.accountId)throw error('현재 계정에서 로그아웃한 뒤 다시 로그인하세요.',409);
   if(!env.GOOGLE_CLIENT_ID)throw error('Google 로그인 연결 준비 중입니다.',503);
   if(await activeRoom(db,identity.key,env))throw error('진행 중인 게임에서 나간 뒤 로그인하세요.',409);
   if(typeof v.nonce!=='string'||v.nonce.length!==64||typeof v.credential!=='string'||v.credential.length>8000)throw error('잘못된 인증 요청입니다.');
   const challenge=await db.prepare('SELECT nonce FROM clan_account_challenges WHERE id=? AND expires>?').bind(identity.sessionKey,Date.now()).first();
   if(!challenge||challenge.nonce!==await sha(v.nonce))throw error('로그인 요청이 만료되었습니다.',401);
   let sub;try{sub=await verify(v.credential,env.GOOGLE_CLIENT_ID,v.nonce);}catch{throw error('Google 인증이 유효하지 않습니다. 다시 로그인하세요.',401);}const id=await sha('google:'+sub);
   const used=await db.prepare('DELETE FROM clan_account_challenges WHERE id=? AND nonce=? RETURNING id').bind(identity.sessionKey,challenge.nonce).first();if(!used)throw error('이미 사용한 로그인 요청입니다.',401);
   const profile=cleanProfile(v.profile),token=random(),newKey=await sha(token),now=Date.now(),rankKey=await sha('account:'+id);
   await db.batch([
    db.prepare('INSERT OR IGNORE INTO clan_accounts(id,name,avatar,settings,legacy,revision,created,updated) VALUES (?,?,?,\'{}\',\'{}\',1,?,?)').bind(id,profile.name,profile.avatar,now,now),
    db.prepare('INSERT INTO clan_account_sessions(id,account_id,expires) VALUES (?,?,?)').bind(newKey,id,now+2592000000),
    db.prepare('DELETE FROM clan_account_sessions WHERE expires<? OR id=?').bind(now,identity.sessionKey),
    // Only an existing anonymous server ranking can be claimed; never a browser score.
    db.prepare('INSERT INTO clan_rankings(id,name,avatar,wave,updated) SELECT ?,name,avatar,wave,updated FROM clan_rankings WHERE id=? ON CONFLICT(id) DO UPDATE SET wave=MAX(clan_rankings.wave,excluded.wave)').bind(rankKey,identity.key),
    db.prepare('DELETE FROM clan_rankings WHERE id=? AND id<>?').bind(identity.key,rankKey)
   ]);
   for(const c of cookie(token,true))headers.append('Set-Cookie',c);
   return json({account:await accountView(db,id)});
  }
  if(!identity.accountId)throw error('먼저 로그인하세요.',401);
  const id=identity.accountId;
  if(v.op==='save'){
   const old=await accountView(db,id);if(v.revision!==old.revision)return json({error:'다른 기기에서 변경한 설정이 있습니다. 서버 기록을 다시 불러오세요.',account:old},409);
   const profile=cleanProfile(v.profile),settings=cleanSettings(v.settings);
   const result=await db.prepare('UPDATE clan_accounts SET name=?,avatar=?,settings=?,revision=revision+1,updated=? WHERE id=? AND revision=?').bind(profile.name,profile.avatar,JSON.stringify(settings),Date.now(),id,v.revision).run();if(!result.meta.changes)throw error('다른 기기에서 변경했습니다. 다시 불러오세요.',409);
   await db.prepare('UPDATE clan_rankings SET name=?,avatar=? WHERE id=?').bind(profile.name,profile.avatar,identity.key).run();return json({account:await accountView(db,id)});
  }
  if(v.op==='importLegacy'){
   const rows=cleanRecords(v.records),old=await accountView(db,id),merged=Object.fromEntries(recordKeys.map(k=>[k,Math.max(rows[k],old.legacy[k])]));
   const result=await db.prepare('UPDATE clan_accounts SET legacy=?,revision=revision+1,updated=? WHERE id=? AND revision=?').bind(JSON.stringify(merged),Date.now(),id,old.revision).run();if(!result.meta.changes)throw error('다른 기기에서 변경했습니다. 다시 시도하세요.',409);return json({account:await accountView(db,id)});
  }
  if(v.op==='logout'||v.op==='delete'){
   if(v.op==='delete'&&v.confirm!=='DELETE')throw error('삭제 확인이 필요합니다.');
   const room=await activeRoom(db,identity.key,env);if(room)throw error('같은 계정의 진행 중인 게임에서 나간 뒤 시도하세요.',409);
   const statements=v.op==='delete'?['DELETE FROM clan_rankings WHERE id=?','DELETE FROM clan_account_progress WHERE id=?','DELETE FROM clan_account_sessions WHERE account_id=?','DELETE FROM clan_accounts WHERE id=?'].map((sql,i)=>db.prepare(sql).bind(i===0?identity.key:id)):[db.prepare('DELETE FROM clan_account_sessions WHERE id=?').bind(identity.sessionKey)];await db.batch(statements);
   for(const c of cookie(random(),false))headers.append('Set-Cookie',c);return json({ok:true});
  }
  throw error('지원하지 않는 요청입니다.');
 }catch(e){return json({error:e.status?e.message:'계정 서버에 연결하지 못했습니다.'},e.status||503);}
}
export function stateRecords(s){return cleanRecords({wave:s.completed,kills:s.kills,castle:s.castle,miners:s.miners,wood:s.woodHarvested,tower:Math.max(0,...Object.values(s.towerLevels||{})),crystals:s.crystalsMined,research:Object.values(s.research||{}).filter(x=>x===-1).length});}
export async function saveAccountProgress(db,p){if(!p.accountId)return;const values=stateRecords(p.s),now=Date.now();await db.prepare('INSERT INTO clan_account_progress(id,wave,kills,castle,miners,wood,tower,crystals,research,updated) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM clan_accounts WHERE id=?) ON CONFLICT(id) DO UPDATE SET wave=MAX(wave,excluded.wave),kills=MAX(kills,excluded.kills),castle=MAX(castle,excluded.castle),miners=MAX(miners,excluded.miners),wood=MAX(wood,excluded.wood),tower=MAX(tower,excluded.tower),crystals=MAX(crystals,excluded.crystals),research=MAX(research,excluded.research),updated=excluded.updated').bind(p.accountId,...recordKeys.map(k=>values[k]),now,p.accountId).run();}
