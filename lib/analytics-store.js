import {accountIdentity} from './account-store.js';
import {hasAdminBadge} from './account-badges.js';

const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BROWSER_EVENTS=new Set(['page_view','game_start','game_end','pvp_game_start','pvp_game_end']);
const SERVER_EVENTS=new Set(['google_login_challenge','google_login_success','google_login_failure','account_settings_save','account_logout','account_delete','pvp_solo_start','pvp_room_create','pvp_room_join','pvp_friend_room_join','pvp_match_begin','pvp_leave','pvp_leaderboard_view']);
const GAME_ACTIONS=new Set(['build','hire','hireWoodcutter','upgradeCastle','upgradeTower','startWave','sellTower','potion','buildBarracks','recruit','buildLab','researchPotion','repairCastle','setSpeed','setPaused','dispatch','attackPotion']);
const COUNTRY=/^[A-Z]{2}$/;
const MAX_AGE=90*86400000;
let cleanupAt=0;

function cleanCountry(value){const code=String(value||'').toUpperCase();return COUNTRY.test(code)&&code!=='XX'?code:'XX';}
export async function analyticsHash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('age-clan-analytics:'+value))),b=>b.toString(16).padStart(2,'0')).join('');}
function validIdentity(value){return value&&ID.test(value.visitorId||'')&&ID.test(value.sessionId||'');}
async function cleanup(db,now){if(now-cleanupAt<6*3600000)return;cleanupAt=now;try{await db.batch([db.prepare('DELETE FROM clan_analytics_events WHERE created<?').bind(now-MAX_AGE),db.prepare('DELETE FROM clan_analytics_requests WHERE hour<?').bind(Math.floor((now-MAX_AGE)/3600000)*3600000),db.prepare('DELETE FROM clan_analytics_actions WHERE hour<?').bind(Math.floor((now-MAX_AGE)/3600000)*3600000)]);}catch{cleanupAt=0;}}

export async function recordAnalyticsEvent(db,identity,event,request,{source='browser',success=true}={}){
 if(!db||!validIdentity(identity)||(!BROWSER_EVENTS.has(event)&&!SERVER_EVENTS.has(event)))return false;
 const now=Date.now(),visitor=await analyticsHash(identity.visitorId),session=await analyticsHash(identity.sessionId),country=cleanCountry(request?.headers?.get('CF-IPCountry')||request?.headers?.get('x-clan-country'));
 try{await db.prepare('INSERT INTO clan_analytics_events (id,visitor_hash,session_hash,event,source,country,success,created) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),visitor,session,event,source,country,success?1:0,now).run();await cleanup(db,now);return true;}catch(e){console.error('analytics event write',e?.message||'failed');return false;}
}

// Record at most one occurrence of each game command per consented session,
// country and hour. This answers which server features were used without
// persisting a detailed play-by-play history.
export async function recordGameAction(db,identity,action,request){
 if(!db||!validIdentity(identity)||!GAME_ACTIONS.has(action))return false;
 try{
  const visitor=await analyticsHash(identity.visitorId),session=await analyticsHash(identity.sessionId),now=Date.now(),hour=Math.floor(now/3600000)*3600000,country=cleanCountry(request?.headers?.get('CF-IPCountry')||request?.headers?.get('x-clan-country'));
  await db.prepare('INSERT OR IGNORE INTO clan_analytics_actions (hour,visitor_hash,session_hash,country,action) VALUES (?,?,?,?,?)').bind(hour,visitor,session,country,action).run();await cleanup(db,now);return true;
 }catch(e){console.error('analytics action write',e?.message||'failed');return false;}
}

export async function recordRequestAggregate(db,request,status,durationMs){
 if(!db)return;
 try{
  const url=new URL(request.url),path=url.pathname.toLowerCase(),method=request.method.toUpperCase();let route=null;
  if(path==='/')route='home';
  else if(path==='/game'||path==='/game/'||path==='/game/index.html')route='game';
  else if(path==='/privacy'||path==='/game/privacy.html')route='privacy';
  else if(['/robots.txt','/sitemap.xml','/ads.txt'].includes(path))route='search';
  else if(/^\/(?:\.env(?:\.|$)|wp-|xmlrpc\.php|phpinfo|config\.php|(?:admin|api|app|backend|core)\/\.env|credentials\.json|.*\/wp-includes\/)/.test(path))route='scanner_probe';
  else if(path==='/api/clan/account'&&method==='POST')route='account_api';
  else if(path==='/api/clan/analytics')route='analytics_api';
  else if(path==='/api/clan'&&method==='POST'){
   const body=await request.clone().json().catch(()=>null),op=body?.op;
   if(['solo','join','create','joinCode','begin','leave','leaderboard'].includes(op))route='pvp_api';
   else if(status>=500)route='pvp_error';
  }else if(status>=500)route='server_error';
  if(!route)return;
  const headers=request.headers,bot=/bot|crawler|spider|slurp|headless|curl\/|wget\/|python-requests|facebookexternalhit|preview/i.test(headers.get('user-agent')||'')?1:0;
  const hour=Math.floor(Date.now()/3600000)*3600000,country=cleanCountry(headers.get('CF-IPCountry'));
  const ms=Math.max(0,Math.min(60000,Math.round(Number(durationMs)||0))),code=Math.max(100,Math.min(599,Number(status)||500));
  await db.prepare('INSERT INTO clan_analytics_requests (hour,country,route,status,bot,requests,total_ms,max_ms) VALUES (?,?,?,?,?,1,?,?) ON CONFLICT(hour,country,route,status,bot) DO UPDATE SET requests=requests+1,total_ms=total_ms+excluded.total_ms,max_ms=MAX(max_ms,excluded.max_ms)').bind(hour,country,route,code,bot,ms,ms).run();
  await cleanup(db,Date.now());
 }catch(e){console.error('analytics request write',e?.message||'failed');}
}

function json(value,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store'}});}
function sameOrigin(req){const origin=req.headers.get('origin');return req.method==='GET'?(!origin||origin===new URL(req.url).origin):origin===new URL(req.url).origin;}

export async function analyticsRequest(req,env,{adminAuthorized=false}={}){
 const db=env?.DB;if(!db)return json({error:'통계 저장소를 사용할 수 없습니다.'},503);
 if(!sameOrigin(req))return json({error:'허용되지 않은 요청입니다.'},403);
 if(req.method==='GET'){
  if(!adminAuthorized){const identity=await accountIdentity(req,env);if(!identity.accountId||!hasAdminBadge(identity.accountId,env))return json({error:'운영자 권한이 필요합니다.'},403);}
  const now=Date.now(),fromRaw=Number(new URL(req.url).searchParams.get('from')),toRaw=Number(new URL(req.url).searchParams.get('to'));
  const to=Number.isSafeInteger(toRaw)&&toRaw>0?Math.min(toRaw,now):now,from=Number.isSafeInteger(fromRaw)&&fromRaw>0?fromRaw:to-86400000;
  if(from>=to||to-from>31*86400000)return json({error:'조회 기간은 최대 31일입니다.'},400);
  const [events,requests,actionResults]=await Promise.all([
   db.prepare('SELECT event,source,country,success,created,visitor_hash,session_hash FROM clan_analytics_events WHERE created>=? AND created<? ORDER BY created DESC LIMIT 10000').bind(from,to).all(),
   db.prepare('SELECT hour,country,route,status,bot,requests,total_ms,max_ms FROM clan_analytics_requests WHERE hour>=? AND hour<? ORDER BY hour,country,route,status,bot LIMIT 10000').bind(Math.floor(from/3600000)*3600000,Math.ceil(to/3600000)*3600000).all(),
   db.prepare('SELECT hour,country,action,visitor_hash,session_hash FROM clan_analytics_actions WHERE hour>=? AND hour<? ORDER BY hour,country,action LIMIT 10000').bind(Math.floor(from/3600000)*3600000,Math.ceil(to/3600000)*3600000).all()
  ]);
  const rows=events.results||[],reqRows=requests.results||[],actionRows=actionResults.results||[],countBy=(items,key)=>{const out={};for(const x of items)out[x[key]]=(out[x[key]]||0)+1;return out;};
  const hourly={};for(let h=Math.floor(from/3600000)*3600000;h<to;h+=3600000)hourly[h]={hour:h,events:0,visitors:new Set(),requests:0,botRequests:0,errors:0};
  for(const x of rows){const h=Math.floor(x.created/3600000)*3600000;if(hourly[h]){hourly[h].events++;hourly[h].visitors.add(x.visitor_hash);}}
  for(const x of actionRows){if(hourly[x.hour])hourly[x.hour].visitors.add(x.visitor_hash);}
  for(const x of reqRows){if(hourly[x.hour]){hourly[x.hour].requests+=x.requests;hourly[x.hour].botRequests+=x.bot?x.requests:0;if(x.status>=500)hourly[x.hour].errors+=x.requests;}}
  const countryStats={};for(const x of rows){const c=countryStats[x.country]||= {country:x.country,events:0,visitors:new Set(),actions:0,requests:0};c.events++;c.visitors.add(x.visitor_hash);}
  for(const x of actionRows){const c=countryStats[x.country]||= {country:x.country,events:0,visitors:new Set(),actions:0,requests:0};c.visitors.add(x.visitor_hash);c.actions++;}
  const requestsByCountry={};for(const x of reqRows){requestsByCountry[x.country]=(requestsByCountry[x.country]||0)+x.requests;const c=countryStats[x.country]||= {country:x.country,events:0,visitors:new Set(),actions:0,requests:0};c.requests+=x.requests;}
  const totalRequests=reqRows.reduce((n,x)=>n+x.requests,0),botRequests=reqRows.reduce((n,x)=>n+(x.bot?x.requests:0),0),errors=reqRows.reduce((n,x)=>n+(x.status>=500?x.requests:0),0),totalMs=reqRows.reduce((n,x)=>n+x.total_ms,0),maxMs=Math.max(0,...reqRows.map(x=>x.max_ms));
  const actions=Object.values(actionRows.reduce((out,x)=>{const v=out[x.action]||= {action:x.action,visitors:new Set(),sessions:new Set(),countries:{},hours:{}};v.visitors.add(x.visitor_hash);v.sessions.add(x.session_hash);v.countries[x.country]=(v.countries[x.country]||0)+1;v.hours[x.hour]=(v.hours[x.hour]||0)+1;return out;},{})).map(x=>({...x,visitors:x.visitors.size,sessions:x.sessions.size})).sort((a,b)=>b.sessions-a.sessions);
  const resultGroups=rows.reduce((out,x)=>{const k=x.event+':'+x.source+':'+(x.success?'success':'failure');out[k]=(out[k]||0)+1;return out;},{});
  const report={from,to,visitors:new Set([...rows,...actionRows].map(x=>x.visitor_hash)).size,sessions:new Set([...rows,...actionRows].map(x=>x.session_hash)).size,eventCounts:countBy(rows,'event'),eventsBySource:countBy(rows,'source'),eventResults:Object.entries(resultGroups).map(([key,count])=>({key,count})),successfulEvents:rows.filter(x=>x.success).length,failedEvents:rows.filter(x=>!x.success).length,actions,countries:Object.values(countryStats).map(x=>({...x,visitors:x.visitors.size})).sort((a,b)=>b.events-a.events||b.requests-a.requests),hourly:Object.values(hourly).map(x=>({...x,visitors:x.visitors.size})),requestsByCountry:Object.entries(requestsByCountry).map(([country,requests])=>({country,requests})).sort((a,b)=>b.requests-a.requests),requestRoutes:Object.entries(reqRows.reduce((out,x)=>{const k=x.route;const v=out[k]||= {route:k,requests:0,botRequests:0,errors:0,totalMs:0,maxMs:0};v.requests+=x.requests;if(x.bot)v.botRequests+=x.requests;if(x.status>=500)v.errors+=x.requests;v.totalMs+=x.total_ms;v.maxMs=Math.max(v.maxMs,x.max_ms);return out;},{})).map(([,x])=>({...x,averageMs:x.requests?Math.round(x.totalMs/x.requests):0})).sort((a,b)=>b.requests-a.requests),requestSummary:{requests:totalRequests,botHintRequests:botRequests,serverErrors:errors,averageMs:totalRequests?Math.round(totalMs/totalRequests):0,maxMs},dataLimits:{eventsReached10000:rows.length===10000,requestBucketsReached10000:reqRows.length===10000,actionBucketsReached10000:actionRows.length===10000}};
  return json(report);
 }
 if(req.method==='POST'){
  const raw=await req.text();if(raw.length>1200)return json({error:'요청이 너무 큽니다.'},413);let input;try{input=JSON.parse(raw);}catch{return json({error:'잘못된 요청입니다.'},400);}
  if(!BROWSER_EVENTS.has(input?.event)||!validIdentity(input?.analytics))return json({error:'허용되지 않은 통계 이벤트입니다.'},400);
  const now=Date.now(),visitor=await analyticsHash(input.analytics.visitorId),limitId='analytics:'+visitor+':'+Math.floor(now/60000);
  try{const allowance=await db.prepare('INSERT INTO clan_limits(id,hits,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET hits=hits+1 RETURNING hits').bind(limitId,now+120000).first();if(allowance.hits>60)return json({error:'잠시 후 다시 시도하세요.'},429);}catch{return json({error:'통계 요청을 처리하지 못했습니다.'},503);}
  const saved=await recordAnalyticsEvent(db,input.analytics,input.event,req,{source:'browser'});return saved?json({ok:true},202):json({error:'통계 이벤트를 저장하지 못했습니다.'},503);
 }
 if(req.method==='DELETE'){
  const raw=await req.text();if(raw.length>500)return json({error:'요청이 너무 큽니다.'},413);let input;try{input=JSON.parse(raw);}catch{return json({error:'잘못된 요청입니다.'},400);}
  if(!validIdentity(input?.analytics))return json({error:'요청을 확인할 수 없습니다.'},400);
  try{const visitor=await analyticsHash(input.analytics.visitorId);await db.batch([db.prepare('DELETE FROM clan_analytics_events WHERE visitor_hash=?').bind(visitor),db.prepare('DELETE FROM clan_analytics_actions WHERE visitor_hash=?').bind(visitor)]);return json({ok:true});}catch{return json({error:'기록을 삭제하지 못했습니다.'},503);}
 }
 return json({error:'허용되지 않은 요청입니다.'},405);
}
