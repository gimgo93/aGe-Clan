import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
let active=0,peak=0,fail='bad',requests=[];
class FakeImage {
 decode(){return Promise.resolve();}
 set src(url){if(!url)return;requests.push(url);peak=Math.max(peak,++active);setTimeout(()=>{active--;if(url===fail)this.onerror?.();else this.onload?.();},2);}
}
const window={};vm.runInNewContext(fs.readFileSync('public/game/asset-loader.js','utf8'),{window,Image:FakeImage,setTimeout,clearTimeout,Error,Promise});
const images={},progress=[],names=['a','b','bad','c','d','e'];
await assert.rejects(window.GameAssets.load(names,x=>x,images,(done,total)=>progress.push([done,total]),{concurrency:2}),/불러오지/);
assert.equal(peak,2);assert.equal(Object.keys(images).length,5);assert.equal(progress.at(-1)[0],6);
requests=[];fail=null;await window.GameAssets.load(names,x=>x,images);assert.deepEqual(requests,['bad']);
class StalledImage{set src(url){}}
const stalled={};vm.runInNewContext(fs.readFileSync('public/game/asset-loader.js','utf8'),{window:stalled,Image:StalledImage,setTimeout,clearTimeout,Error,Promise});
await assert.rejects(stalled.GameAssets.load(['never'],x=>x,{},()=>{},{timeoutMs:5}),/초과/);
const html=fs.readFileSync('public/game/index.html','utf8'),app=fs.readFileSync('public/game/app.js','utf8');
assert(html.includes('id="loading" hidden'));assert(html.indexOf('asset-loader.js')<html.indexOf('renderer.js'));
assert(app.indexOf('window.GameApp=')<app.indexOf('await renderer.load'));
assert(app.includes('retry.onclick=prepareGame'));
console.log('PASS: concurrency limit, successful-cache reuse, failed retry, stalled timeout, lobby before assets, dependency order');
