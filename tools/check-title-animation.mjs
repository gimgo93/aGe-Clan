import vm from 'node:vm';import fs from 'node:fs';import assert from 'node:assert/strict';
let raf=[],timers=[],imgs=[],draws=0,prepares=0,clips=0;const seen=new Set();const ctx=()=>({setTransform(){},clearRect(){},save(){},restore(){},translate(){},rotate(){},scale(){},beginPath(){},rect(){},clip(){clips++},drawImage(image){draws++;if(image?.source)seen.add(image.source)}});
const mainctx=ctx(),canvas={width:0,height:0,getContext:()=>mainctx},screen={clientWidth:1672,clientHeight:941};
const document={hidden:false,body:{dataset:{mode:'title'}},getElementById:id=>id==='titleTravelers'?canvas:screen,createElement:()=>({width:0,height:0,getContext:()=>{prepares++;return ctx()}})};
class Image{constructor(){this.naturalWidth=1264;this.naturalHeight=1264;this.complete=true;imgs.push(this)}set src(v){this.source=v;if(v)this.onload?.()}}
const math=Object.create(Math);let seed=42;math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const scope={document,window:{},Image,Math:math,devicePixelRatio:1,matchMedia:()=>({matches:false}),requestAnimationFrame:f=>raf.push(f),setTimeout:f=>timers.push(f)};
vm.runInNewContext(fs.readFileSync('public/game/title-travelers.js','utf8'),scope);
let batches=0;while(timers.length){timers.shift()();assert(++batches<100)}assert.equal(prepares,256);
for(let i=1;i<=18000;i++){const fn=raf.shift();assert(fn);fn(i*16.67)}assert(draws>1000);assert(clips>0);for(const name of ['traveler','farmer','horse','guard'])assert(seen.has('assets/title-rig-'+name+'.webp'),name+' rig was not rendered');assert(!fs.readFileSync('public/game/title-travelers.js','utf8').includes('ctx.globalAlpha='));console.log('PASS: all four rigs rendered during doorway simulation, no opacity fades');
