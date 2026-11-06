import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Load the real route without starting image loading or an animation loop.
const context=vm.createContext({
 document:{getElementById:id=>id==='titleTravelers'?{getContext:()=>({})}:{}},
 Image:class{},window:{requestIdleCallback(){}},requestIdleCallback(){},
 requestAnimationFrame(){},setTimeout(){},Math,Object,
});
vm.runInContext(readFileSync('public/game/title-travelers.js','utf8').split('\n(() => {')[0],context);
const route=vm.runInContext('TitleTravelersGeometry',context);
const first=route.sample(0),doorway=route.sample(1);
assert.ok(first.x>1672,'arrive from outside the right edge of the illustration');
assert.ok(Math.hypot(doorway.x-1301,doorway.y-441)<1e-6,'finish inside the arch, not on the upper wall');
assert.ok(route.entryStart>.9&&route.entryStart<1);
for(let i=0;i<=1000;i++){
 const p=i/1000,a=route.sample(p),b=route.sample(Math.min(1,p+.00001));
 assert.ok(a.y>=441&&a.y<=730);
 if(p>=route.entryStart){assert.ok(a.x>=1297&&a.x<=1310);assert.ok(a.y<=465,'fade only after crossing the doorway threshold');}
 if(p<1){const alignment=(b.x-a.x)*Math.cos(a.heading)+(b.y-a.y)*Math.sin(a.heading);assert.ok(alignment>=-1e-6,'route tangent must point in the travel direction');}
 const lead=route.lead(p,18),handler=route.sample(lead);
 assert.ok(lead>=p&&lead<=1,'handler remains ahead along the same road arc');
 assert.ok(handler.y<=a.y,'handler must lead toward the gate, never trail below the horse');
}
const left=route.sample(.2),right=route.sample(route.entryStart-.035);
assert.ok(Math.cos(left.heading)<0,'road approach travels left');
assert.ok(Math.cos(right.heading)>0,'approach turns right before entering the arch');
let largestTurn=0;
for(let i=1;i<1000;i++){const a=route.sample((i-1)/1000),b=route.sample(i/1000);const turn=Math.abs(Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading)));largestTurn=Math.max(largestTurn,turn);}
assert.ok(largestTurn<.35,'last bend must turn smoothly rather than snap between straight segments');
console.log('PASS: road-tangent direction, doorway endpoint/threshold, horse-handler lead and path bounds');
