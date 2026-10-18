import { env } from 'cloudflare:workers';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200,headers={})=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
export async function POST(req:Request){try{
 if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return json({error:'허용되지 않은 요청입니다.'},403);
 const last=Number(req.headers.get('cookie')?.match(/(?:^|;\s*)clan_feedback_at=(\d+)/)?.[1]||0);if(Date.now()-last<60000)return json({error:'의견은 1분 후 다시 보낼 수 있습니다.'},429);
 if(Number(req.headers.get('content-length'))>8000)return json({error:'의견은 2,000자 이내로 작성하세요.'},413);
 const raw=await req.text();if(raw.length>8000)return json({error:'의견이 너무 깁니다.'},413);
 let body;try{body=JSON.parse(raw);}catch{return json({error:'올바른 의견을 입력하세요.'},400);}
 const message=typeof body?.message==='string'?body.message.trim():'';if(message.length<5||message.length>2000)return json({error:'의견을 5~2,000자로 작성하세요.'},400);
 const id=crypto.randomUUID();await env.DB!.prepare('INSERT INTO clan_feedback (id,message,created) VALUES (?,?,?)').bind(id,message,Date.now()).run();
 return json({ok:true,id},200,{'Set-Cookie':`clan_feedback_at=${Date.now()}; Path=/api/feedback; HttpOnly; SameSite=Strict; Max-Age=60${new URL(req.url).protocol==='https:'?'; Secure':''}`});
}catch{return json({error:'의견을 저장하지 못했습니다. 잠시 후 다시 시도하세요.'},503);}}
