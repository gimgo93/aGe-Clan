import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const script=readFileSync('public/game/interface-style.js','utf8'),html=readFileSync('public/game/index.html','utf8');
function launch(initial,deny=false){
 const storage=new Map(initial?[['ageclan-interface-style-v1',initial]]:[]),events={},controls={},sheet={disabled:true},status={},select={value:'',addEventListener:(type,fn)=>controls[type]=fn};
 const document={documentElement:{dataset:{}},getElementById:id=>({fortressControls:sheet,interfaceStyle:select,interfaceStyleStatus:status})[id],addEventListener:(type,fn)=>events[type]=fn};
 vm.runInNewContext(script,{document,localStorage:{getItem:k=>storage.get(k),setItem(k,v){if(deny)throw Error('storage denied');storage.set(k,v);}}});events.DOMContentLoaded();
 return{sheet,select,status,storage,change(value){select.value=value;controls.change();}};
}
const original=launch();assert.equal(original.sheet.disabled,true);original.change('fortress');assert.equal(original.sheet.disabled,false);assert.equal(original.storage.get('ageclan-interface-style-v1'),'fortress');
assert.equal(launch('fortress').sheet.disabled,false);original.change('original');assert.equal(original.sheet.disabled,true);assert.equal(launch('invalid').sheet.disabled,true);
const denied=launch(null,true);denied.change('fortress');assert.equal(denied.sheet.disabled,false);assert.match(denied.status.textContent,/현재 탭/);
assert.match(html,/href="privacy-controls\.css\?v=v58"/);assert.match(html,/id="fortressControls"[^>]+ disabled/);assert.match(html,/앱 릴리스 ver\.1/);
assert.equal(JSON.parse(readFileSync('public/game/release.json','utf8')).version,'v58');
console.log('PASS: original style defaults, reversible enhancement, persistence/reload and storage failure; privacy remains linked and release is v58');
