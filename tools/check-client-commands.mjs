import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import Defense from '../lib/game-engine.js';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function element(tag='div'){return{tag,open:false,value:'',style:{},options:[],classList:{add(){},remove(){},toggle(){}},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;},append(...nodes){this.options.push(...nodes);},replaceChildren(){},remove(){}};}
const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
const storage=new Map(),server=new Defense.Game();server.start();server.s.multiplayer=true;server.s.gold=1000;
let version=0,sequence=1,status='waiting',release,block=false,reject=false;const received=[],notifications=[];
const view=result=>({roomId:'F-ABCDEFGH',code:'ABCDEFGH',private:true,hostId:'self',selfId:'self',status,version:++version,nextActionSeq:sequence,serverTime:Date.now(),simulationTime:Date.now(),transport:'http',players:[{id:'self',name:'test',s:structuredClone(server.s)}],result});
const game=new Defense.Game();
const context={Defense,performance,crypto,structuredClone,Date,console,setTimeout,clearTimeout,setInterval,clearInterval,URL,AbortController,
 location:{href:'http://localhost/game/',protocol:'http:'},document:{getElementById:get,createElement:element,createTextNode:text=>({textContent:text}),body:{dataset:{}},addEventListener(){}},
 navigator:{},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},requestAnimationFrame(){},WorldRenderer:class{constructor(){this.canvas={style:{}};}draw(){}},
 fetch:async(_url,options)=>{const input=JSON.parse(options.body);received.push(input);let result;if(input.op==='begin')status='playing';if(input.op==='action'){
   if(block)await new Promise(resolve=>{release=resolve;});assert.equal(input.sequence,sequence);sequence++;
   result=reject?{error:'테스트 거절'}:server[input.action](...input.args);reject=false;
  }return new Response(JSON.stringify(view(result)),{headers:{'Content-Type':'application/json','Server-Timing':'app;dur=0'}});}
};context.window=context;vm.createContext(context);
vm.runInContext(await readFile(new URL('../public/game/player-identity.js',import.meta.url),'utf8'),context);vm.runInContext(await readFile(new URL('../public/game/net-visual.js',import.meta.url),'utf8'),context);
vm.runInContext(await readFile(new URL('../public/game/multiplayer.js',import.meta.url),'utf8'),context);
const clan=context.setupClan({game,renderer:{images:{},ground:{},groundDetail:{},decor:[]},audio:{init(){},notify(kind){notifications.push(kind);}},toast(){},hud(){},online(){},home(){}});
get('createRoomBtn').onclick();await get('joinMatch').onclick();assert.equal(notifications.filter(k=>k==='queue').length,1);await get('joinMatch').onclick();assert.equal(notifications.filter(k=>k==='queue').length,1,'duplicate join must not replay queue sound');get('beginFriendMatch').onclick();await wait(180);
assert.equal(clan.active,true);block=true;
const one=game.build('archer',0),two=game.build('archer',1);
assert.equal(one.pending,true);assert.equal(two.pending,true);assert.equal(game.s.towers.length,2,'both placements appear before an HTTP reply');
assert.equal(server.s.towers.length,0,'preview must not mutate authoritative state');assert.equal(game.s.gold,720);assert.equal(server.s.gold,1000);
block=false;release();await wait(320);
assert.equal(server.s.towers.length,2);assert.equal(game.s.towers.length,2);assert.ok(game.s.towers.every(t=>!t._pending));assert.equal(game.s.gold,720);
assert.deepEqual(received.filter(c=>c.op==='action').map(c=>c.sequence),[1,2]);
block=true;reject=true;const three=game.build('archer',2);assert.equal(three.pending,true);assert.equal(game.s.towers.length,3);block=false;release();await wait(30);
assert.equal(game.s.towers.length,2,'rejected build must roll back');assert.equal(game.s.gold,720);
await clan.leave();console.log('PASS: immediate queued placement, unique command sequences, no duplicate gold deduction, authoritative acknowledgments and rejected-build rollback');
