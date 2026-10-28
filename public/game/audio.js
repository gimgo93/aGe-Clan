/* Original synthesized audio. All effects share the existing master volume. */
(() => {
'use strict';
class ClanAudio {
 constructor(settings){this.readSettings=settings;this.context=null;this.sources=new Set();this.cooldowns=new Map();this.voices=0;this.previous=null;this.scene='lobby';this.musicTimer=null;this.focused=typeof document.hasFocus==='function'?document.hasFocus():true;this.pageHidden=false;
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.suspendBackground();else{this.focused=typeof document.hasFocus==='function'?document.hasFocus():true;this.resumeForeground();}});
  window.addEventListener('blur',()=>{this.focused=false;this.suspendBackground();});window.addEventListener('focus',()=>{this.focused=true;this.resumeForeground();});
  window.addEventListener('pagehide',()=>{this.pageHidden=true;this.suspendBackground();});window.addEventListener('pageshow',()=>{this.pageHidden=false;this.focused=typeof document.hasFocus==='function'?document.hasFocus():true;this.resumeForeground();});
  document.addEventListener('freeze',()=>this.suspendBackground());
 }
 isForeground(){return !document.hidden&&!this.pageHidden&&this.focused;}
 init(){if(document.hidden||this.pageHidden)return;this.focused=typeof document.hasFocus==='function'?document.hasFocus():true;if(!this.isForeground())return;try{if(!this.context){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;this.context=new C();this.master=this.context.createGain();this.master.connect(this.context.destination);this.musicGain=this.context.createGain();this.musicGain.connect(this.master);this.effectsGain=this.context.createGain();this.effectsGain.connect(this.master);this.musicStep=0;}this.apply();this.context.resume().catch(()=>{});}catch{}}
 startMusic(){if(this.musicTimer||!this.context||!this.isForeground()||!this.readSettings().music||this.readSettings().volume<=0)return;this.musicTimer=setInterval(()=>this.musicNote(),650);}
 stopMusic(){if(this.musicTimer){clearInterval(this.musicTimer);this.musicTimer=null;}}
 suspendBackground(){this.stopMusic();this.previous=null;if(!this.context)return;this.master.gain.cancelScheduledValues(this.context.currentTime);this.master.gain.setValueAtTime(0,this.context.currentTime);for(const source of this.sources)try{source.stop();}catch{}this.sources.clear();this.voices=0;this.context.suspend().catch(()=>{});}
 resumeForeground(){if(!this.context||!this.isForeground())return;this.context.resume().then(()=>{if(this.isForeground())this.apply();else this.suspendBackground();}).catch(()=>{});}
 apply(){if(!this.context)return;const s=this.readSettings(),t=this.context.currentTime,foreground=this.isForeground();this.master.gain.setTargetAtTime(foreground?Math.max(0,Math.min(100,s.volume))/100:0,t,.025);this.musicGain.gain.setTargetAtTime(s.music?(this.scene==='mine'?.165:this.scene==='lobby'?.4:.5):0,t,.25);this.effectsGain.gain.setTargetAtTime(s.effects?1:0,t,.015);if(foreground&&s.music&&s.volume>0)this.startMusic();else this.stopMusic();}
 setScene(scene){if(scene===this.scene)return;this.scene=scene;this.musicStep=0;this.apply();}
 allowed(kind,interval=.08){const s=this.readSettings();if(!s.effects||s.volume<=0||!this.context||this.context.state!=='running'||!this.isForeground())return false;
   const t=this.context.currentTime;if(t-(this.cooldowns.get(kind)??-100)<interval||this.voices>=24)return false;this.cooldowns.set(kind,t);return true;
 }
 note(frequency,{delay=0,duration=.16,volume=.04,type='sine',end=frequency,bus=this.effectsGain,attack=.012}={}){
   if(this.voices>=24||!this.context||!this.isForeground())return;const c=this.context,t=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();this.voices++;
   o.type=type;o.frequency.setValueAtTime(frequency,t);o.frequency.exponentialRampToValueAtTime(end,t+duration);
   g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+Math.min(attack,duration/2));g.gain.exponentialRampToValueAtTime(.0001,t+duration);
   o.connect(g);g.connect(bus);this.sources.add(o);o.start(t);o.stop(t+duration+.02);o.onended=()=>{const tracked=this.sources.delete(o);o.disconnect();g.disconnect();if(tracked)this.voices=Math.max(0,this.voices-1);};
 }
 musicNote(){const s=this.readSettings();if(!this.context||this.context.state!=='running'||!s.music||s.volume<=0||!this.isForeground())return;const lobby=this.scene==='lobby',scale=lobby?[293.66,369.99,440,587.33,493.88,440,369.99,0,329.63,392,493.88,659.25,587.33,493.88,440,0]:[293.66,440,349.23,440,261.63,392,329.63,392,293.66,440,349.23,523.25,261.63,392,220,0],step=this.musicStep++,f=scale[step%scale.length];if(f){this.note(f,{duration:lobby?1.1:1.8,volume:lobby?.035:.028,type:lobby?'sine':'triangle',bus:this.musicGain,attack:lobby?.012:.04});if(lobby&&step%4===0)this.note(f/2,{duration:1.4,volume:.012,type:'triangle',bus:this.musicGain,attack:.03});}}
 melody(kind,frequencies,{volume=.045,spacing=.09,duration=.28}={}){
   if(!this.allowed(kind,.22))return;frequencies.forEach((f,i)=>this.note(f,{delay:i*spacing,duration,volume}));
 }
 chime(kind='join'){if(kind==='queue'){this.melody(kind,[293.66,440,587.33],{volume:.06,spacing:.085,duration:.26});return;}this.melody(kind,kind==='ready'?[392,523.25,659.25]:[659.25,880],{volume:.055,spacing:.13,duration:.3});}
 tone(kind='click'){
   if(kind==='castleHit'){if(!this.allowed(kind,.28))return;this.note(100,{end:38,duration:.35,volume:.12,type:'triangle'});this.note(520,{end:180,duration:.10,volume:.065,type:'triangle'});this.note(220,{duration:.22,volume:.035});return;}
   if(kind==='mine'){this.metalStrike();return;}

   if(kind==='crystal'){this.melody(kind,[880,1174.66,1568],{volume:.033,spacing:.065,duration:.36});return;}
   if(kind==='upgrade'){this.melody(kind,[293.66,440],{volume:.028,spacing:.08,duration:.18});return;}if(kind==='era'||kind==='milestone'){this.melody(kind,[293.66,440,587.33],{volume:.04,spacing:.14,duration:.4});return;}if(kind==='clear'){this.melody(kind,[392,523.25],{volume:.026,spacing:.08,duration:.2});return;}
   if(kind==='victory'){this.melody(kind,[392,523.25,659.25,783.99],{spacing:.15,duration:.45});return;}
   if(kind==='defeat'){this.melody(kind,[329.63,261.63,196],{volume:.035,spacing:.16,duration:.4});return;}
   const presets={click:[440,520,.055,.018],error:[180,130,.11,.027],attack:[160,100,.055,.012],kill:[240,125,.085,.025],mine:[220,150,.065,.018],build:[330,520,.16,.035],hire:[440,580,.13,.03],demolish:[150,75,.18,.032],destroy:[110,45,.22,.04],potion:[440,110,.23,.035],wave:[196,260,.22,.032],repair:[392,520,.15,.03]};
   const p=presets[kind];if(!p||!this.allowed(kind,kind==='attack'?.2:kind==='kill'?.12:.08))return;
   this.note(p[0],{end:p[1],duration:p[2],volume:p[3],type:['attack','mine','kill'].includes(kind)?'triangle':'sine'});
 }

 metalStrike(){
  if(!this.allowed('mine',.18))return;
  const c=this.context;
  if(!this.metalBuffer){
   const rate=c.sampleRate,buffer=c.createBuffer(1,Math.ceil(rate*.62),rate),data=buffer.getChannelData(0);
   const modes=[{f:2137,a:.48,d:12},{f:3349,a:.28,d:17},{f:4783,a:.18,d:22},{f:6121,a:.1,d:29},{f:7937,a:.06,d:42}];
   let seed=527,previous=0,peak=0;
   for(let i=0;i<data.length;i++){
    const t=i/rate;let value=0;
    for(const [at,amount]of [[0,1],[.075,.27],[.144,.12]]){const u=t-at;if(u<0)continue;const attack=Math.min(1,u/.0007);for(const m of modes)value+=amount*attack*m.a*Math.sin(2*Math.PI*m.f*u)*Math.exp(-u*m.d);}
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/4294967296*2-1;
    value+=(noise-previous)*.16*Math.exp(-t*180);previous=noise;
    value*=Math.min(1,(data.length-1-i)/(rate*.012));data[i]=value;peak=Math.max(peak,Math.abs(value));
   }
   if(peak)for(let i=0;i<data.length;i++)data[i]*=.72/peak;
   this.metalBuffer=buffer;
  }
  const source=c.createBufferSource(),gain=c.createGain(),filter=c.createBiquadFilter(),t=c.currentTime;
  source.buffer=this.metalBuffer;filter.type='highpass';filter.frequency.value=950;filter.Q.value=.5;
  gain.gain.setValueAtTime(.16,t);gain.gain.setValueAtTime(0,t+.63);
  source.connect(filter);filter.connect(gain);gain.connect(this.effectsGain);this.voices++;
  this.sources.add(source);source.start(t);source.stop(t+.64);source.onended=()=>{const tracked=this.sources.delete(source);source.disconnect();filter.disconnect();gain.disconnect();if(tracked)this.voices=Math.max(0,this.voices-1);};
 }
 transition(style){
   if(style==='none'||!this.allowed('transition',.25))return;
   if(style==='fade'){this.note(330,{end:440,duration:.32,volume:.024,attack:.12});this.note(495,{end:660,duration:.32,volume:.012,attack:.12});return;}
   const c=this.context,t=c.currentTime;if(!this.noise){this.noise=c.createBuffer(1,Math.ceil(c.sampleRate*.36),c.sampleRate);const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.5;}
   const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();this.voices++;
   source.buffer=this.noise;filter.type='bandpass';filter.Q.value=.7;filter.frequency.setValueAtTime(1500,t);filter.frequency.exponentialRampToValueAtTime(300,t+.3);
   gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.065,t+.1);gain.gain.exponentialRampToValueAtTime(.0001,t+.33);
   source.connect(filter);filter.connect(gain);gain.connect(this.effectsGain);this.sources.add(source);source.start(t);source.stop(t+.35);
   source.onended=()=>{const tracked=this.sources.delete(source);source.disconnect();filter.disconnect();gain.disconnect();if(tracked)this.voices=Math.max(0,this.voices-1);};
 }
 observe(s,key='local'){
   this.setScene(!s.started?'lobby':s.scene||'battle');
   if(!s.started||document.hidden){this.previous=null;return;}
   const now={key,time:s.time,kills:s.kills,crystals:s.crystalsMined,over:s.over,hp:s.hp,strikes:s.strikes||0};const old=this.previous;this.previous=now;
   // Baseline first snapshots/reconnects and resets; never replay historical kills.
   if(!old||old.key!==key||now.time<old.time||now.kills<old.kills||now.crystals<old.crystals)return;
   if(now.kills>old.kills)this.tone('kill');
   if(now.crystals>old.crystals)this.tone('crystal');
   if(now.hp<old.hp)this.tone('castleHit');
   if(this.scene==='mine'&&!s.paused&&now.strikes>old.strikes)this.tone('mine');
   if(now.over&&!old.over)this.tone(s.won?'victory':'defeat');
 }
}
window.ClanAudio=ClanAudio;
})();
