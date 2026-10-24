import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync('public/game/'+p,'utf8');
const contexts=[];
function context(){const c={save(){},restore(){},translate(){},scale(){},drawImage(){},fillRect(){},beginPath(){},rect(){},ellipse(){},clip(){},createPattern(){return {};}};contexts.push(c);return c;}
const document={createElement(){return {getContext:context};}};
const env=vm.createContext({document,window:{},Math});vm.runInContext(read('renderer.js')+'\nglobalThis.Renderer=WorldRenderer;',env);
const renderer=Object.create(env.Renderer.prototype);let patterns=0;renderer.ctx={createPattern(){patterns++;return {};}};renderer.images={'town-courtyard-v2':{}};renderer.tile=()=>{};
renderer.prepareBackdrops();assert.equal(patterns,4);
for(const [w,h]of [[390,844],[1366,768],[844,390]])for(const scale of [.12,.3,.7,1.8])for(const x of [-w*.7,0,w*.7])for(const y of [-h*.6,0,h*.6])for(const shake of [-3,0,3]){
 renderer.w=w;renderer.h=h;const t={x,y,scale},b=renderer.visibleBounds(t,shake);
 assert.ok(b.x*scale+x+shake<=0);assert.ok(b.y*scale+y<=0);
 assert.ok((b.x+b.w)*scale+x+shake>=w);assert.ok((b.y+b.h)*scale+y>=h);
 for(const scene of ['battle','mine','town'])renderer.backdrop(context(),scene,t,shake);
}
assert.equal(patterns,4,'camera motion must reuse cached textures');
renderer.outskirts(context(),{x:0,y:0,scale:.3});
const transitions=vm.createContext({window:{},document});vm.runInContext(read('scene-transition.js'),transitions);
const {SceneTransition,sceneTransitionStyle}=transitions.window;
assert.equal(sceneTransitionStyle({transition:'fade'}),'fade');assert.equal(sceneTransitionStyle({transition:'slide'}),'slide');assert.equal(sceneTransitionStyle({transition:'bad'}),'fade');assert.equal(sceneTransitionStyle({transition:'slide',reducedMotion:true}),'none');
const animations=[];const overlay={children:[],className:'',replaceChildren(...children){this.children=children;},animate(){let resolve,reject;const animation={finished:new Promise((a,b)=>{resolve=a;reject=b;}),cancel(){this.cancelled=true;reject(Error('cancelled'));},resolve(){resolve();}};animations.push(animation);return animation;}};
const controller=new SceneTransition(overlay,{width:800,height:600});let committed='',finished=0;
controller.run('fade',()=>committed='mine',()=>finished++);assert.equal(committed,'mine');assert.equal(overlay.children.length,1);
controller.run('slide',()=>committed='town',()=>finished++);assert.ok(animations[0].cancelled);assert.equal(committed,'town');
animations[1].resolve();await Promise.resolve();await Promise.resolve();assert.equal(finished,1);assert.equal(overlay.children.length,0);assert.ok(animations[1].cancelled,'completed fill animation must be removed');
controller.run('none',()=>committed='battle',()=>finished++);assert.equal(committed,'battle');assert.equal(animations.length,2);assert.equal(finished,2);
assert.ok(read('app.js').includes('sceneTransitionStyle(settings)'));assert.ok(!read('app.js').includes("scene==='town'||game.s.scene==='town'?"));
for(const file of ['construction-site-v1.png','lab-building-v1.png','barracks-building-v1.png'])assert.ok(fs.existsSync('public/game/assets/'+file));
assert.ok(!read('renderer.js').includes("ctx.fillStyle='#77715a';ctx.fillRect"));
console.log('PASS: camera coverage across sizes/zoom/pan/shake, cached scene textures, presentation-only forest, transition settings/cancellation/reduced motion, generated construction asset');
