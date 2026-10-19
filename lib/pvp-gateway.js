// Keep browser cookies and WebSockets on the Site origin. Only the owner can
// select the backend; browser-supplied forwarding/identity headers are discarded.
export async function pvpGateway(request,env,fetcher=fetch){
 if(!env.CLAN_BACKEND_URL)return null;
 const fail=(error,status=503)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
 const source=new URL(request.url);
 if(!['/api/clan','/api/clan/socket'].includes(source.pathname))return fail('잘못된 대전 경로입니다.',404);
 const socket=source.pathname.endsWith('/socket');
 if(!['GET','POST'].includes(request.method)||(socket&&request.method!=='GET'))return fail('허용되지 않은 요청입니다.',405);
 if((socket||request.headers.has('origin'))&&request.headers.get('origin')!==source.origin)return fail('허용되지 않은 연결입니다.',403);
 let target;
 try{target=new URL(env.CLAN_BACKEND_URL);if(target.protocol!=='https:'||target.username||target.password||target.pathname!=='/'||target.search||target.hash||target.origin===source.origin)throw Error();}
 catch{return fail('대전 서버 주소 설정을 확인해 주세요.');}
 if(typeof env.CLAN_BACKEND_TOKEN!=='string'||env.CLAN_BACKEND_TOKEN.length<32)return fail('대전 서버 인증 설정이 필요합니다.');
 target.pathname=source.pathname;target.search=source.search;
 const headers=new Headers({'Origin':target.origin,'x-clan-backend-token':env.CLAN_BACKEND_TOKEN});
 const token=request.headers.get('cookie')?.match(/(?:^|;\s*)clan_session=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(token)headers.set('Cookie','clan_session='+token);
 const ingress=request.headers.get('CF-Connecting-IP');if(ingress){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ingress)));headers.set('x-clan-ingress',Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''));}
 if(socket){if(request.headers.get('upgrade')?.toLowerCase()!=='websocket')return fail('WebSocket 연결이 필요합니다.',426);headers.set('Upgrade','websocket');}
 else if(request.method==='POST')headers.set('Content-Type','application/json');
 try{
  // Refuse redirects so the shared secret cannot leak to another origin.
  const body=request.method==='POST'?await request.text():undefined;
  if(body&&body.length>2048)return fail('요청이 너무 큽니다.',413);
  const response=await fetcher(new Request(target,{method:request.method,headers,body,redirect:'manual'}));
  if(response.status>=300&&response.status<400)return fail('대전 서버 주소가 올바르지 않습니다.');
  return response;
 }catch{return fail('실시간 대전 서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.');}
 // Never fall back to D1 after configuration: that would create two room states.
}
