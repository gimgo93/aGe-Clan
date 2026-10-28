import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync('public/game/'+p,'utf8');
const storage=new Map();const sessionStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
function guests(store=sessionStorage){const c=vm.createContext({window:{},crypto,sessionStorage:store});vm.runInContext(read('guest-profile.js'),c);return c.window.GuestProfile;}
const g=guests(),first=g.load();assert.ok(g.valid(first));assert.equal(JSON.stringify(guests().load()),JSON.stringify(first));
const sample=Array.from({length:100},()=>g.create());assert.ok(new Set(sample.map(p=>p.name)).size>90);assert.ok(new Set(sample.map(p=>p.avatar)).size>1);
assert.ok(sample.every(p=>g.valid(p)));
storage.set('age-guest-session-v1','{"name":"<bad>","avatar":99}');assert.ok(g.valid(g.load()));
const fallback=guests({getItem(){throw Error();},setItem(){throw Error();}});assert.ok(fallback.valid(fallback.load()));
const settings={volume:60,music:true,effects:true};
class Param{constructor(){this.value=0;this.calls=[];}setValueAtTime(...a){this.calls.push(a);}linearRampToValueAtTime(...a){this.calls.push(a);}exponentialRampToValueAtTime(...a){this.calls.push(a);}setTargetAtTime(v){this.value=v;}cancelScheduledValues(){}}
class Node{constructor(){this.gain=new Param();this.frequency=new Param();this.Q={value:0};this.connections=[];}connect(n){this.connections.push(n);}disconnect(){this.disconnected=true;}start(){}stop(){}}
class AudioContext{constructor(){this.state='running';this.currentTime=0;this.destination={};this.nodes=[];this.sampleRate=48000;}node(){const n=new Node();this.nodes.push(n);return n;}createGain(){return this.node();}createOscillator(){return this.node();}createBufferSource(){return this.node();}createBiquadFilter(){return this.node();}createBuffer(ch,n){const data=new Float32Array(n);return {getChannelData(){return data;}};}resume(){this.state="running";return Promise.resolve();}suspend(){this.state="suspended";return Promise.resolve();}}
const documentEvents=new Map(),windowEvents=new Map(),timers=new Set();let timerId=0;const document={hidden:false,hasFocus:()=>true,addEventListener:(key,fn)=>documentEvents.set(key,fn)};const c=vm.createContext({window:{AudioContext,addEventListener:(key,fn)=>windowEvents.set(key,fn)},document,setInterval(){const id=++timerId;timers.add(id);return id;},clearInterval:id=>timers.delete(id),Math});vm.runInContext(read('audio.js'),c);
const sound=new c.window.ClanAudio(()=>settings);assert.equal(sound.context,null,'no autoplay at load');sound.init();
assert.equal(sound.master.gain.value,.6);assert.equal(sound.effectsGain.gain.value,1);
const queueBefore=sound.context.nodes.length;sound.chime('queue');assert.equal(sound.context.nodes.length-queueBefore,6,'queue jingle has three notes');
sound.tone('kill');const count=sound.context.nodes.length;sound.tone('kill');assert.equal(sound.context.nodes.length,count,'same-type throttle');
sound.tone('crystal');assert.ok(sound.context.nodes.length>count,'kill must not suppress crystal');
settings.effects=false;sound.apply();assert.equal(sound.effectsGain.gain.value,0);const muted=sound.context.nodes.length;sound.chime();sound.transition('slide');assert.equal(sound.context.nodes.length,muted);
settings.effects=true;settings.volume=0;sound.apply();sound.tone('build');assert.equal(sound.context.nodes.length,muted);assert.equal(sound.master.gain.value,0);
settings.volume=60;sound.apply();sound.context.currentTime=1;sound.transition('slide');assert.ok(sound.noise);sound.context.currentTime=2;sound.transition('fade');
sound.setScene('mine');assert.equal(sound.musicGain.gain.value,.165);sound.setScene('battle');assert.equal(sound.musicGain.gain.value,.5);settings.music=false;sound.apply();assert.equal(sound.musicGain.gain.value,0);settings.music=true;sound.apply();sound.tone('castleHit');sound.tone('mine');assert.ok(sound.metalBuffer,'mining uses metallic PCM, not pitch sweeps');const metal=sound.metalBuffer;const pcm=metal.getChannelData(0);assert.ok(pcm.every(Number.isFinite));const peak=pcm.reduce((n,v)=>Math.max(n,Math.abs(v)),0);assert.ok(peak>.6&&peak<.721);const energy=(a,b)=>Math.sqrt(pcm.slice(a,b).reduce((n,v)=>n+v*v,0)/(b-a));assert.ok(energy(pcm.length-2400,pcm.length)<energy(0,4800)*.05,'metal ring naturally decays');sound.context.currentTime=3;sound.tone('mine');assert.equal(sound.metalBuffer,metal,'reuse cached metal buffer');
for(const n of sound.context.nodes)if(n.onended)n.onended();assert.equal(sound.voices,0,'all transient nodes release');
const events=[];sound.tone=k=>events.push(k);
const state={started:true,time:50,kills:100,crystalsMined:20,hp:100,over:false};sound.observe(state,'one');assert.deepEqual(events,[]);
sound.observe({...state,time:51,kills:102,crystalsMined:21},'one');assert.deepEqual(events,['kill','crystal']);
sound.observe({...state,time:51,kills:102,crystalsMined:21},'one');assert.equal(events.length,2,'duplicate snapshot silent');
sound.observe({...state,time:500,kills:900},'new-room');assert.equal(events.length,2,'new room baseline silent');
sound.observe({started:false});sound.observe(state,'one');assert.equal(events.length,2);
assert.ok(!read('multiplayer.js').includes('입장 알림음은 설정'));assert.ok(read('chronicle.js').includes('assets/menu-guide-v3.svg'));assert.ok(fs.existsSync('public/game/assets/menu-guide-v3.svg'));
assert.ok(!read('style.css').includes('.title-library{left:auto;right:4%'));
assert.ok(read('renderer.js').includes('Noto Serif KR'));
events.length=0;
sound.observe({...state,scene:'mine',strikes:10},'mine-test');sound.observe({...state,scene:'mine',strikes:15,time:51},'mine-test');assert.deepEqual(events,['mine']);
sound.observe({...state,scene:'mine',strikes:15,time:51},'mine-test');assert.equal(events.length,1);
sound.observe({...state,scene:'battle',strikes:20,time:52,hp:86},'mine-test');assert.deepEqual(events,['mine','castleHit']);
sound.observe({...state,scene:'battle',strikes:25,time:53},'mine-test');assert.equal(events.length,2,'repair and off-scene mining silent');
console.log('PASS: randomized/session-stable guests, invalid/storage fallback, audio consent/settings/mute/throttle/cleanup, transitions and snapshot deltas, menu/font integration');

const frequencies=[],realNote=sound.note;sound.note=f=>frequencies.push(f);sound.setScene('lobby');sound.musicStep=1;sound.musicNote();sound.setScene('battle');sound.musicStep=1;sound.musicNote();assert.notEqual(frequencies[0],frequencies[1],'lobby has its own melody');sound.note=realNote;
document.hidden=true;documentEvents.get('visibilitychange')();assert.equal(sound.context.state,'suspended');assert.equal(timers.size,0);const hiddenNodes=sound.context.nodes.length;sound.init();sound.musicNote();assert.equal(sound.context.nodes.length,hiddenNodes);windowEvents.get('focus')();assert.equal(sound.context.state,'suspended','focus cannot resume a hidden app');document.hidden=false;documentEvents.get('visibilitychange')();await Promise.resolve();assert.equal(sound.context.state,'running');assert.equal(timers.size,1);windowEvents.get('blur')();assert.equal(timers.size,0);assert.equal(sound.context.state,'suspended');windowEvents.get('focus')();await Promise.resolve();assert.equal(timers.size,1);windowEvents.get('pagehide')();assert.equal(sound.context.state,'suspended');assert.equal(sound.sources.size,0);sound.init();assert.equal(sound.context.state,'suspended');windowEvents.get('pageshow')();await Promise.resolve();assert.equal(sound.context.state,'running');assert.equal(timers.size,1);console.log('PASS: distinct lobby melody and hidden/blur/pagehide stop all audio and music scheduling; safe foreground resume');
