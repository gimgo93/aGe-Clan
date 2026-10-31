// Keep browser cookies and WebSockets on the Site origin. Only the owner can
// select the backend; browser-supplied forwarding/identity headers are discarded.
import {analyticsRequest,recordAnalyticsEvent,recordGameAction} from './analytics-store.js';

const errorResponse=(error,status=503)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
function analyticsEvent(path,input,responseBody,response){
 if(path==='/api/clan/account'){
  if(input?.op==='challenge')return{event:'google_login_challenge',success:response.ok};
  if(input?.op==='login')return{event:'google_login_failure',success:false};
  if(input?.op==='save')return{event:'account_settings_save',success:response.ok};
  if(input?.op==='logout')return{event:'account_logout',success:response.ok};
  if(input?.op==='delete')return{event:'account_delete',success:response.ok};
 }
 if(path==='/api/clan'){
  const events={solo:'pvp_solo_start',create:'pvp_room_create',join:'pvp_room_join',joinCode:'pvp_friend_room_join',begin:'pvp_match_begin',leave:'pvp_leave',leaderboard:'pvp_leaderboard_view'};
  if(events[input?.op])return{event:events[input.op],success:response.ok};
 }
 return null;
}

export async function pvpGateway(request,env,fetcher=fetch,ctx){
 if(!env.CLAN_BACKEND_URL)return null;
 const source=new URL(request.url),report=source.pathname==='/api/clan/analytics'&&request.method==='GET';
 if(!report&&!['/api/clan','/api/clan/socket','/api/clan/account'].includes(source.pathname))return errorResponse('잘못된 대전 경로입니다.',404);
 const socket=source.pathname.endsWith('/socket');
 if(!['GET','POST'].includes(request.method)||(socket&&request.method!=='GET'))return errorResponse('허용되지 않은 요청입니다.',405);
 if((socket||request.headers.has('origin'))&&request.headers.get('origin')!==source.origin)return errorResponse('허용되지 않은 연결입니다.',403);
 let backendOrigin;
 try{const u=new URL(env.CLAN_BACKEND_URL);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||u.origin===source.origin)throw Error();backendOrigin=u.origin;}
 catch{return errorResponse('대전 서버 주소 설정을 확인해 주세요.');}
 if(typeof env.CLAN_BACKEND_TOKEN!=='string'||env.CLAN_BACKEND_TOKEN.length<32)return errorResponse('대전 서버 인증 설정이 필요합니다.');
 const token=request.headers.get('cookie')?.match(/(?:^|;\s*)clan_session=([a-f0-9]{64})(?:;|$)/)?.[1];
 const accountCookie=token&&/(?:^|;\s*)clan_account=1(?:;|$)/.test(request.headers.get('cookie')||'');
 if(report){
  if(!token||!accountCookie)return errorResponse('운영자 권한이 필요합니다.',403);
  const authHeaders=new Headers({'Origin':backendOrigin,'Content-Type':'application/json','x-clan-backend-token':env.CLAN_BACKEND_TOKEN,'Cookie':'clan_session='+token+'; clan_account=1'});
  try{const auth=await fetcher(new Request(backendOrigin+'/api/clan/account',{method:'POST',headers:authHeaders,body:'{"op":"status"}',redirect:'manual'}));if(!auth.ok)return errorResponse('운영자 권한을 확인할 수 없습니다.',403);const data=await auth.json();if(!data?.account?.profile?.admin)return errorResponse('운영자 권한이 필요합니다.',403);return analyticsRequest(request,env,{adminAuthorized:true});}
  catch{return errorResponse('운영자 권한을 확인할 수 없습니다.',403);}
 }
 const target=new URL(source.pathname+source.search,backendOrigin),headers=new Headers({'Origin':backendOrigin,'x-clan-backend-token':env.CLAN_BACKEND_TOKEN});
 if(token)headers.set('Cookie',accountCookie?'clan_session='+token+'; clan_account=1':'clan_session='+token);
 const ingress=request.headers.get('CF-Connecting-IP');if(ingress){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ingress)));headers.set('x-clan-ingress',Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''));}
 const country=request.headers.get('CF-IPCountry');if(country&&/^[A-Za-z]{2}$/.test(country))headers.set('x-clan-country',country.toUpperCase());
 if(socket){if(request.headers.get('upgrade')?.toLowerCase()!=='websocket')return errorResponse('WebSocket 연결이 필요합니다.',426);headers.set('Upgrade','websocket');}
 else if(request.method==='POST')headers.set('Content-Type','application/json');
 try{
  const body=request.method==='POST'?await request.text():undefined;
  const maxBody=source.pathname==='/api/clan/account'?12000:2048;if(body&&body.length>maxBody)return errorResponse('요청이 너무 큽니다.',413);
  let input=null;if(body){try{input=JSON.parse(body);}catch{}}
  const response=await fetcher(new Request(target,{method:request.method,headers,body,redirect:'manual'}));
  if(response.status>=300&&response.status<400)return errorResponse('대전 서버 주소가 올바르지 않습니다.');
  const event=analyticsEvent(source.pathname,input,null,response);
  if(source.pathname==='/api/clan'&&input?.op==='action'&&input?.analytics&&response.ok){
   const result=await response.clone().json().catch(()=>null);
   if(!result?.result?.error){const task=recordGameAction(env.DB,input.analytics,input.action,request);if(ctx?.waitUntil)ctx.waitUntil(task);else await task;}
  }
  if(event&&input?.analytics){
   let eventName=event.event,success=event.success;
   if(input?.op==='login'){const responseBody=await response.clone().json().catch(()=>null);success=response.ok&&!!responseBody?.account;eventName=success?'google_login_success':'google_login_failure';}
   const task=recordAnalyticsEvent(env.DB,input.analytics,eventName,request,{source:'server',success});
   if(ctx?.waitUntil)ctx.waitUntil(task);else await task;
  }
  return response;
 }catch{return errorResponse('실시간 대전 서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.');}
 // Never fall back to D1 after configuration: that would create two room states.
}
