import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import D from '../../lib/game-engine.js';
const nodes=new Map(),storage=new Map();
const node=()=>({value:'',append(){},addEventListener(){},checkValidity(){return true;}});
const context=vm.createContext({Defense:D,structuredClone,
  document:{getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node},
  localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
const text=fs.readFileSync(new URL('../../public/game/editor.js',import.meta.url),'utf8');
vm.runInContext(text.replace('})();','globalThis.editorTest={read,normalize,fill};})();'),context);
const plain=x=>JSON.parse(JSON.stringify(x));
assert.deepEqual(plain(context.editorTest.read().soloArrowResistance),D.BALANCE.soloArrowResistance);
const older=structuredClone(D.BALANCE);delete older.soloArrowResistance;
context.editorTest.fill(context.editorTest.normalize(older));
assert.deepEqual(plain(context.editorTest.read().soloArrowResistance),D.BALANCE.soloArrowResistance);
const custom=structuredClone(D.BALANCE);custom.soloArrowResistance={startWave:14,step:.1,max:.8};
context.editorTest.fill(context.editorTest.normalize(custom));
assert.deepEqual(plain(context.editorTest.read().soloArrowResistance),custom.soloArrowResistance);
for(const bad of [{startWave:0,step:.2,max:.9},{startWave:13,step:true,max:.9},{startWave:13,step:.2,max:1}]) {
  assert.throws(()=>context.editorTest.normalize({...D.BALANCE,soloArrowResistance:bad}));
}
console.log('PASS: editor save/import preserves new resistance, old configs inherit published values, invalid values rejected');
