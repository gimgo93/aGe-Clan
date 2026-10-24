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
assert.deepEqual(plain(context.editorTest.read()),plain(D.BALANCE));
const old=structuredClone(D.BALANCE);old.soloArrowResistance={startWave:13,step:.2,max:.9};
assert.equal(context.editorTest.normalize(old).soloArrowResistance,undefined,'obsolete drafts cannot restore armor');
const invalid=structuredClone(D.BALANCE);invalid.towers.storm.damage=-1;
assert.throws(()=>context.editorTest.normalize(invalid));
console.log('PASS: editor balance, obsolete armor ignored, invalid damage rejected');
