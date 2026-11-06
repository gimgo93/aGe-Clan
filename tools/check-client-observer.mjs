import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import Defense from '../lib/game-engine.js';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function element(tag='div'){return {tag,open:false,hidden:false,value:'',dataset:{},style:{setProperty(){}},options:[],children:[],classList:{add(){},remove(){},toggle(){}},setAttribute(){},removeAttribute(){},focus(){},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;},append(...nodes){this.children.push(...nodes);if(tag==='select')this.options.push(...nodes);},replaceChildren(){},remove(){}};}
const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
const storage=new Map(),own=new Defense.Game(),remote=new Defense.Game();own.start();remote.start();own.s.multiplayer=remote.s.multiplayer=true;own.s.gold=777;remote.s.gold=1234;
const game=new Defense.Game(),renderer={game,images:{},ground:{},groundDetail:{},decor:[]};let status='waiting',version=0;const requests=[];
const view=(watchId=null)=>({roomId:'F-TESTROOM',code:'TESTROOM',private:true,capacity:4,hostId:'self',selfId:'self',status,watchedId:watchId==='other'&&status==='playing'?'other':null,version:++version,nextActionSeq:1,serverTime:Date.now(),simulationTime:Date.now(),transport:'http',players:[{id:'self',name:'나',frontier:'west',s:structuredClone(own.s)},{id:'other',name:'상대',frontier:'south',s:watchId==='other'?structuredClone(remote.s):{hp:100,maxHp:100,castle:1,wave:0,gold:1234,army:0}}]});
const scope={Defense,performance,crypto,structuredClone,Date,console,setTimeout,clearTimeout,setInterval,clearInterval,URL,AbortController,
 location:{href:'http://localhost/game/',protocol:'http:'},document:{getElementById:get,createElement:element,createTextNode:text=>({textContent:text}),body:{dataset:{}},addEventListener(){}},navigator:{},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},requestAnimationFrame(){},
 fetch:async(_url,options)=>{const input=JSON.parse(options.body);requests.push(input);if(input.op==='begin')status='playing';return new Response(JSON.stringify(view(input.watchId)),{headers:{'content-type':'application/json'}});}};
scope.window=scope;vm.createContext(scope);
for(const file of ['player-identity','net-visual','frontier-view','multiplayer'])vm.runInContext(await readFile(`public/game/${file}.js`,'utf8'),scope);
const client=scope.setupClan({game,renderer,audio:{init(){},notify(){}},toast(){},hud(){},online(){},home(){},switchView(commit){commit();}});
try{
 get('friendPlayBtn').onclick();await get('joinMatch').onclick();get('beginFriendMatch').onclick();
 for(let i=0;!client.active&&i<50;i++)await pause(10);assert.equal(client.active,true);
 client.selectFrontier('other');for(let i=0;client.viewGame===game&&i<50;i++)await pause(10);
 assert.equal(client.spectating,true);assert.equal(client.viewPlayer.id,'other');assert.equal(client.viewGame.s.gold,1234);assert.equal(game.s.gold,777);assert.equal(renderer.game,client.viewGame);assert.equal(client.viewGame.canAct(),false);
 const before=requests.length;assert.match(game.build('archer',0).error,/관전/);assert.equal(requests.length,before,'read-only action never enters request queue');
 client.viewGame.s.scene='mine';assert.equal(game.s.scene,'battle','spectator scene never mutates own scene');client.animate(.016);assert.equal(game.s.gold,777);
 client.selectFrontier('self');for(let i=0;requests.at(-1)?.watchId!==null&&i<50;i++)await pause(10);
 assert.equal(client.spectating,false);assert.equal(client.viewGame,game);assert.equal(renderer.game,game);assert.equal(client.viewPlayer.id,'self');
 console.log('PASS: full-screen observer preserves own state, selects remote snapshot, blocks outgoing mutations, keeps independent scenes and restores self');
}finally{await client.leave();}
