/* Original synthesized audio. All effects share the existing master volume. */
(() => {
'use strict';
class ClanAudio {
 constructor(settings){this.readSettings=settings;this.context=null;this.oscillators=[];this.cooldowns=new Map();this.voices=0;this.previous=null;}
 init(){try{if(!this.context){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
   this.context=new C();this.master=this.context.createGain();this.master.connect(this.context.destination);
   this.musicGain=this.context.createGain();this.musicGain.connect(this.master);
   this.effectsGain=this.context.createGain();this.effectsGain.connect(this.master);
   for(const f of [73.42,110]){const o=this.context.createOscillator(),g=this.context.createGain();o.type='sine';o.frequency.value=f;g.gain.value=.018;o.connect(g);g.connect(this.musicGain);o.start();this.oscillators.push(o);}
   this.musicStep=0;this.musicTimer=setInterval(()=>this.musicNote(),650);this.apply();
 }this.context.resume().catch(()=>{});}catch{}}
 apply(){if(!this.context)return;const s=this.readSettings(),t=this.context.currentTime;
   this.master.gain.setTargetAtTime(Math.max(0,Math.min(100,s.volume))/100,t,.025);
   this.musicGain.gain.setTargetAtTime(s.music?.55:0,t,.05);
   this.effectsGain.gain.setTargetAtTime(s.effects?1:0,t,.015);
 }
 allowed(kind,interval=.08){const s=this.readSettings();if(!s.effects||s.volume<=0||!this.context||this.context.state!=='running'||document.hidden)return false;
   const t=this.context.currentTime;if(t-(this.cooldowns.get(kind)??-100)<interval||this.voices>=24)return false;this.cooldowns.set(kind,t);return true;
 }
 note(frequency,{delay=0,duration=.16,volume=.04,type='sine',end=frequency,bus=this.effectsGain,attack=.012}={}){
   if(this.voices>=24)return;const c=this.context,t=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();this.voices++;
   o.type=type;o.frequency.setValueAtTime(frequency,t);o.frequency.exponentialRampToValueAtTime(end,t+duration);
   g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+Math.min(attack,duration/2));g.gain.exponentialRampToValueAtTime(.0001,t+duration);
   o.connect(g);g.connect(bus);o.start(t);o.stop(t+duration+.02);o.onended=()=>{o.disconnect();g.disconnect();this.voices--;};
 }
 musicNote(){const s=this.readSettings();if(!this.context||this.context.state!=='running'||!s.music||s.volume<=0||document.hidden)return;
   const scale=[293.66,440,349.23,440,261.63,392,329.63,392,293.66,440,349.23,523.25,261.63,392,220,0],f=scale[this.musicStep++%scale.length];
   if(f)this.note(f,{duration:1.8,volume:.028,type:'triangle',bus:this.musicGain,attack:.04});
 }
 melody(kind,frequencies,{volume=.045,spacing=.09,duration=.28}={}){
   if(!this.allowed(kind,.22))return;frequencies.forEach((f,i)=>this.note(f,{delay:i*spacing,duration,volume}));
 }
 chime(kind='join'){this.melody(kind,kind==='ready'?[392,523.25,659.25]:[659.25,880],{volume:.055,spacing:.13,duration:.3});}
 tone(kind='click'){
   if(kind==='crystal'){this.melody(kind,[880,1174.66,1568],{volume:.033,spacing:.065,duration:.36});return;}
   if(kind==='upgrade'||kind==='era'||kind==='clear'){this.melody(kind,kind==='era'?[392,523.25,659.25,783.99]:[523.25,659.25,783.99]);return;}
   if(kind==='victory'){this.melody(kind,[392,523.25,659.25,783.99],{spacing:.15,duration:.45});return;}
   if(kind==='defeat'){this.melody(kind,[329.63,261.63,196],{volume:.035,spacing:.16,duration:.4});return;}
   const presets={click:[440,520,.055,.018],error:[180,130,.11,.027],attack:[160,100,.055,.012],kill:[240,125,.085,.025],mine:[220,150,.065,.018],build:[330,520,.16,.035],hire:[440,580,.13,.03],demolish:[150,75,.18,.032],destroy:[110,45,.22,.04],potion:[440,110,.23,.035],wave:[196,260,.22,.032],repair:[392,520,.15,.03]};
   const p=presets[kind];if(!p||!this.allowed(kind,kind==='attack'?.2:kind==='kill'?.12:.08))return;
   this.note(p[0],{end:p[1],duration:p[2],volume:p[3],type:['attack','mine','kill'].includes(kind)?'triangle':'sine'});
 }
 transition(style){
   if(style==='none'||!this.allowed('transition',.25))return;
   if(style==='fade'){this.note(330,{end:440,duration:.32,volume:.024,attack:.12});this.note(495,{end:660,duration:.32,volume:.012,attack:.12});return;}
   const c=this.context,t=c.currentTime;if(!this.noise){this.noise=c.createBuffer(1,Math.ceil(c.sampleRate*.36),c.sampleRate);const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.5;}
   const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();this.voices++;
   source.buffer=this.noise;filter.type='bandpass';filter.Q.value=.7;filter.frequency.setValueAtTime(1500,t);filter.frequency.exponentialRampToValueAtTime(300,t+.3);
   gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.065,t+.1);gain.gain.exponentialRampToValueAtTime(.0001,t+.33);
   source.connect(filter);filter.connect(gain);gain.connect(this.effectsGain);source.start(t);source.stop(t+.35);
   source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();this.voices--;};
 }
 observe(s,key='local'){
   if(!s.started||document.hidden){this.previous=null;return;}
   const now={key,time:s.time,kills:s.kills,crystals:s.crystalsMined,over:s.over,hp:s.hp};const old=this.previous;this.previous=now;
   // Baseline first snapshots/reconnects and resets; never replay historical kills.
   if(!old||old.key!==key||now.time<old.time||now.kills<old.kills||now.crystals<old.crystals)return;
   if(now.kills>old.kills)this.tone('kill');
   if(now.crystals>old.crystals)this.tone('crystal');
   if(now.hp<old.hp)this.tone('destroy');
   if(now.over&&!old.over)this.tone(s.won?'victory':'defeat');
 }
}
window.ClanAudio=ClanAudio;
})();
