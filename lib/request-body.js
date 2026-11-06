// One bounded, byte-counted read per Request. Never clone an unbounded stream.
const bodies=new WeakMap();
export const bodyLimit=request=>new URL(request.url).pathname==='/api/clan/account'?12000:new URL(request.url).pathname==='/api/feedback'?8000:new URL(request.url).pathname==='/api/clan/analytics'?(request.method==='DELETE'?500:1200):2048;
export function httpError(message,status){return Object.assign(new Error(message),{status});}
export function readBody(request,limit=bodyLimit(request)){
 if(!bodies.has(request))bodies.set(request,(async()=>{
  const declared=request.headers.get('content-length');
  // Reject a declared oversized body without touching its transport stream.
  // The runtime owns unread incoming bodies; cancelling it here can tear down
  // a reused upstream connection before the 413 response is delivered.
  if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>limit))throw httpError('요청이 너무 큽니다.',413);
  if(!request.body)return{text:'',bytes:0};
  const reader=request.body.getReader(),chunks=[];let bytes=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>limit){void reader.cancel().catch(()=>{});throw httpError('요청이 너무 큽니다.',413);}chunks.push(value);}}
  finally{reader.releaseLock();}
  const all=new Uint8Array(bytes);let at=0;for(const chunk of chunks){all.set(chunk,at);at+=chunk.byteLength;}
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(all);}catch{throw httpError('잘못된 문자 인코딩입니다.',400);}
  return{text,bytes};
 })());
 return bodies.get(request).then(body=>{if(body.bytes>limit)throw httpError('요청이 너무 큽니다.',413);return body.text;});
}
export async function readJson(request,limit=bodyLimit(request)){
 const raw=await readBody(request,limit);let value;try{value=JSON.parse(raw);}catch{throw httpError('잘못된 JSON 요청입니다.',400);}
 if(!value||typeof value!=='object'||Array.isArray(value))throw httpError('잘못된 요청입니다.',400);
 return value;
}
export async function boundedRequest(request){
 if(!['POST','PUT','PATCH','DELETE'].includes(request.method))return request;
 const text=await readBody(request),headers=new Headers(request.headers);headers.delete('content-length');
 return new Request(request.url,{method:request.method,headers,body:text,redirect:request.redirect});
}
