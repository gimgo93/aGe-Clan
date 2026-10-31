import vm from 'node:vm';import fs from 'node:fs';import assert from 'node:assert/strict';
let raf=[],timers=[],imgs=[],draws=0,prepares=0,clips=0;const ctx=()=>({setTransform(){},clearRect(){},save(){},restore(){},translate(){},rotate(){},scale(){},beginPath(){},rect(){},clip(){clips++},drawImage(){draws++}});
const mainctx=ctx(),canvas={width:0,height:0,getContext:()=>mainctx},screen={clientWidth:1672,clientHeight:941};
const document={hidden:false,body:{dataset:{mode:'title'}},getElementById:id=>id==='titleTravelers'?canvas:screen,createElement:()=>({width:0,height:0,getContext:()=>{prepares++;return ctx()}})};
class Image{constructor(){this.naturalWidth=1264;this.naturalHeight=1264;this.complete=true;imgs.push(this)}set src(v){if(v)this.onload?.()}}
const math=Object.create(Math);math.random=()=>0.1;
const scope={document,window:{},Image,Math:math,devicePixelRatio:1,matchMedia:()=>({matches:false}),requestAnimationFrame:f=>raf.push(f),setTimeout:f=>timers.push(f)};
vm.runInNewContext(fs.readFileSync('public/game/title-travelers.js','utf8'),scope);
let batches=0;while(timers.length){timers.shift()();assert(++batches<100)}assert.equal(prepares,256);
for(let i=1;i<=8000;i++){const fn=raf.shift();assert(fn);fn(i*16.67)}assert(draws>1000);assert(clips>0);assert(!fs.readFileSync('public/game/title-travelers.js','utf8').includes('ctx.globalAlpha='));console.log('PASS: cached poses, simulated paired travelers entering doorway without opacity fades, and joint rendering');
