// Only the secret-authenticated backend entry may trust gateway metadata.
const backendRequests=new WeakSet(),windows=new WeakMap(),cleanupTimes=new WeakMap();
export function trustBackendIngress(request){backendRequests.add(request);return request;}
export function ingressIdentity(request){return (backendRequests.has(request)?request.headers.get('x-clan-ingress'):null)||request.headers.get('CF-Connecting-IP')||'unavailable';}
export async function ingressHash(request){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('clan-ingress:'+ingressIdentity(request)))),b=>b.toString(16).padStart(2,'0')).join('');}
// A bounded in-isolate prefilter protects the persistent quota itself. Persistent
// SQL counters remain the cross-isolate authority for admission, not this cache.
export function prefilter(request,env,family,max=180){
 const owner=env.DB||env;let map=windows.get(owner);if(!map){map=new Map();windows.set(owner,map);}
 const now=Date.now(),key=family+':'+ingressIdentity(request);let entry=map.get(key);
 if(!entry||entry.until<=now){if(map.size>=4096){for(const [k,v]of map)if(v.until<=now)map.delete(k);if(map.size>=4096)throw Object.assign(Error('잠시 후 다시 시도하세요.'),{status:429});}entry={until:now+60000,hits:0};map.set(key,entry);}
 if(++entry.hits>max)throw Object.assign(Error('잠시 후 다시 시도하세요.'),{status:429});
}
export async function consumeQuota(db,key,max,now=Date.now()){
 const id='admission:'+key+':'+Math.floor(now/60000);
 const row=await db.prepare('INSERT INTO clan_limits(id,hits,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET hits=hits+1 RETURNING hits').bind(id,now+120000).first();
 if(!row||row.hits>max)throw Object.assign(Error('잠시 후 다시 시도하세요.'),{status:429});
 if(now-(cleanupTimes.get(db)||0)>60000){cleanupTimes.set(db,now);try{await db.prepare('DELETE FROM clan_limits WHERE expires<?').bind(now).run();}catch(e){cleanupTimes.delete(db);throw e;}}
}
export async function admitRoom(request,env,socket=false){
 prefilter(request,env,socket?'socket':'room',socket?60:3600);
 const hash=await ingressHash(request);await consumeQuota(env.DB,(socket?'socket:':'room:')+hash,socket?60:3600);
}
