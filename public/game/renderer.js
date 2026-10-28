class WorldRenderer {
 constructor(canvas,game){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.game=game;this.images={};this.camera={x:0,y:0,zoom:1};this.hover=-1;this.selected=null;this.buildType=null;this.scene='battle';this.ready=false;this.art=window.ART_META;this.resize();}
 async load(){await Promise.all(['ballista','ballista-arm','grassland','cave','miner','soldier','raider','woodcutter','woodcutter-axe','battleOuter','mineOuter','battleDetail','mineDetail','town-courtyard-v3','construction-site-v1','lab-building-v1','barracks-building-v1'].map(name=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{this.images[name]=image;resolve();};image.onerror=()=>reject(new Error(name+' 이미지를 불러오지 못했습니다.'));image.src='assets/'+name+((name.startsWith('woodcutter')||name.startsWith('ballista')||['construction-site-v1','lab-building-v1','barracks-building-v1','town-courtyard-v3'].includes(name))?'.png':'.webp');})));this.ground={battle:this.images.battleOuter,mine:this.images.mineOuter};this.groundDetail={battle:this.images.battleDetail,mine:this.images.mineDetail};this.prepareBackdrops();this.decor=this.props();this.game.setTreeSites(this.decor.filter(p=>p.id>=240));this.ready=true;}

 // Cache small repeating surfaces once; coverage follows the camera, not a fixed map rectangle.
 prepareBackdrops(){
  const floor=set=>{const surface=document.createElement('canvas');surface.width=768;surface.height=384;const ctx=surface.getContext('2d');
   ctx.fillStyle=set==='cave'?'#493c30':'#676b3b';ctx.fillRect(0,0,768,384);ctx.filter=set==='cave'?'brightness(1.55) saturate(.78)':'brightness(1.35) saturate(.75)';
   for(let row=-2;row<11;row++)for(let col=-2;col<6;col++){const r=(row%8+8)%8,c=(col%4+4)%4,id=16+(r*7+c*3)%16;this.tile(ctx,set,id,col*192+(row%2?96:0),row*48,1);}
   return surface;};
  const paving=document.createElement('canvas');paving.width=512;paving.height=256;const p=paving.getContext('2d'),town=this.images['town-courtyard-v3'];
  for(let row=0;row<2;row++)for(let col=0;col<2;col++){p.save();p.translate(col*256+(col?256:0),row*128+(row?128:0));p.scale(col?-1:1,row?-1:1);p.drawImage(town,620,560,256,128,0,0,256,128);p.restore();}
  const forest=document.createElement('canvas');forest.width=768;forest.height=768;const f=forest.getContext('2d'),random=this.rng(1739),trees=[];
  for(let row=0;row<6;row++)for(let col=0;col<6;col++){const x=col*128+random()*70,y=row*128+random()*65,id=[248,249,252,253,240][Math.floor(random()*5)],scale=.6+random()*.22;
   for(const dx of [-768,0,768])for(const dy of [-768,0,768])trees.push({x:x+dx,y:y+dy,id,scale});}
  trees.sort((a,b)=>a.y-b.y).forEach(t=>this.tile(f,'grassland',t.id,t.x,t.y,t.scale));
  this.backdrops={battle:this.ctx.createPattern(floor('grassland'),'repeat'),mine:this.ctx.createPattern(floor('cave'),'repeat'),town:this.ctx.createPattern(paving,'repeat')};
  this.forestBackdrop=this.ctx.createPattern(forest,'repeat');
 }
 visibleBounds(transform,shake=0){const pad=4/transform.scale;return{x:(-transform.x-shake)/transform.scale-pad,y:-transform.y/transform.scale-pad,w:this.w/transform.scale+pad*2,h:this.h/transform.scale+pad*2};}
 backdrop(ctx,scene,transform,shake=0){const b=this.visibleBounds(transform,shake);ctx.fillStyle=this.backdrops[scene];ctx.fillRect(b.x,b.y,b.w,b.h);}
 outskirts(ctx,transform,shake=0){const b=this.visibleBounds(transform,shake);for(let ring=0;ring<4;ring++){ctx.save();ctx.beginPath();ctx.rect(b.x,b.y,b.w,b.h);ctx.ellipse(800,500,1100+ring*140,750+ring*110,0,0,Math.PI*2);ctx.clip('evenodd');ctx.globalAlpha=ring===3?1:.25;ctx.fillStyle=this.forestBackdrop;ctx.fillRect(b.x,b.y,b.w,b.h);ctx.restore();}}
 construction(ctx,x,y,remaining,total,width=160,pending=false,label='건설'){
  const image=this.images['construction-site-v1'],height=width*image.height/image.width,progress=Math.max(0,Math.min(1,1-remaining/total));
  this.shadow(ctx,x,y,width*.29);ctx.drawImage(image,x-width/2,y-height+22,width,height);
  const bar=width*.55;ctx.fillStyle='#1c241ded';ctx.fillRect(x-bar/2,y+22,bar,5);ctx.fillStyle='#cdb77a';ctx.fillRect(x-bar/2,y+22,bar*progress,5);
  this.text(ctx,pending?'설치 확인 중':label+' · '+remaining.toFixed(1)+'초',x,y+43,'#efe0bc',width>200?16:12);
 }

 observeCastleDamage(s,now,key='local'){
  this.observeBuildingUpgrades(s,now,this.upgradeScope||key);
  if(!s.started){this.damageBaseline=null;this.castleImpact=null;return;}
  const old=this.damageBaseline;this.damageBaseline={key,time:s.time,hp:s.hp};
  if(!old||old.key!==key||s.time<old.time){this.castleImpact=null;return;}
  if(s.hp<old.hp)this.castleImpact={at:now,damage:old.hp-s.hp};
 }
 castleDamage(ctx,now,settings,screen=false){
  const impact=this.castleImpact;if(!impact)return;const elapsed=now-impact.at;if(elapsed<0||elapsed>1)return;
  const fade=1-elapsed;ctx.save();
  if(screen){const gradient=ctx.createRadialGradient(this.w/2,this.h/2,this.w*.25,this.w/2,this.h/2,Math.max(this.w,this.h)*.7);gradient.addColorStop(0,'#b52a1700');gradient.addColorStop(1,'rgba(220,52,25,'+(fade*.48)+')');ctx.fillStyle=gradient;ctx.fillRect(0,0,this.w,this.h);this.text(ctx,'성 피해 −'+impact.damage,this.w/2,118,'#ffceaa',22);}
  else{const x=1430,y=550;ctx.globalAlpha=fade;const glow=ctx.createRadialGradient(x,y-55,10,x,y-55,230);glow.addColorStop(0,'#ffe6a8cc');glow.addColorStop(.3,'#e96a3780');glow.addColorStop(1,'#b52a1700');ctx.fillStyle=glow;ctx.fillRect(x-240,y-295,480,480);ctx.strokeStyle='#ffd298';ctx.lineWidth=5*fade;ctx.beginPath();ctx.ellipse(x,y+5,85+elapsed*180,35+elapsed*75,0,0,Math.PI*2);ctx.stroke();if(!settings.reducedMotion){for(let i=0;i<14;i++){const angle=i*2.399,dist=25+elapsed*(100+i%4*30);ctx.fillStyle=i%2?'#ffd998':'#c8784b';ctx.fillRect(x+Math.cos(angle)*dist,y-40+Math.sin(angle)*dist*.5-elapsed*45,5*fade+1,5*fade+1);}}this.text(ctx,'−'+impact.damage,x,y-135-elapsed*25,'#ffe1b3',30);}
  ctx.restore();
 }
 resize(){this.w=innerWidth;this.h=innerHeight;this.dockHeight=document.getElementById('commandDock')?.getBoundingClientRect().height||this.h*.3;this.dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=this.w*this.dpr;this.canvas.height=this.h*this.dpr;this.canvas.style.width=this.w+'px';this.canvas.style.height=this.h+'px';}
 get scale(){const bottom=this.dockHeight;if(this.scene==='town')return Math.min(this.w/2020,Math.max(80,this.h-bottom-80)/1300)*this.camera.zoom;return Math.max(this.w/1900,Math.min(this.w/1630,(this.h-bottom-90)/840))*1.12*this.camera.zoom;}
 transform(){const bottom=this.dockHeight;const scale=this.scale;return{scale,x:this.w/2-800*scale+this.camera.x,y:68+(this.h-bottom-68)/2-440*scale+this.camera.y};}
 world(clientX,clientY){const t=this.transform();return{x:(clientX-t.x)/t.scale,y:(clientY-t.y)/t.scale};}
 resetCamera(){this.camera={x:0,y:0,zoom:1};}
 tile(ctx,set,id,x,y,scale=1,center=false){const t=this.art[set][id];if(!t)return;const [sx,sy,w,h,ox,oy]=t;ctx.drawImage(this.images[set],sx,sy,w,h,x-(center?w/2:ox)*scale,y-(center?h*.83:oy)*scale,w*scale,h*scale);}
 rng(seed){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
 terrain(set,detail=false){const surface=document.createElement('canvas'),pixel=detail?1:.55,left=detail?-500:-900,top=detail?-420:-1900,worldW=detail?2600:3300,worldH=detail?1800:4800;surface.width=Math.round(worldW*pixel);surface.height=Math.round(worldH*pixel);const ctx=surface.getContext('2d');ctx.fillStyle=set==='cave'?'#493c30':'#676b3b';ctx.fillRect(0,0,surface.width,surface.height);ctx.scale(pixel,pixel);ctx.translate(-left,-top);ctx.filter=set==='cave'?'brightness(1.55) saturate(.78)':'brightness(1.35) saturate(.75)';const tileScale=.8,tw=192*tileScale,th=96*tileScale,seed=set==='cave'?543:281;for(let row=detail?-15:-55;row<(detail?42:86);row++)for(let col=detail?-10:-15;col<(detail?20:26);col++){const x=col*tw+(row%2)*tw/2,y=row*th/2;let n=(Math.imul(row+200,73856093)^Math.imul(col+200,19349663)^seed)>>>0;n=Math.imul(n^(n>>>13),1274126177)>>>0;const random=n/4294967296;let id=16+Math.floor(random*16);if(set==='grassland'){const d=Defense.roadDistance({x,y});if(d<45)id=32+Math.floor(random*4);else if(d<80)id=40+Math.floor(random*8);}else if(Math.abs(y-(x*.48+120))<25)id=32;this.tile(ctx,set,id,x,y,tileScale+.005);}ctx.filter='none';if(detail){ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='destination-in';const gx=ctx.createLinearGradient(0,0,surface.width,0);gx.addColorStop(0,'#0000');gx.addColorStop(.045,'#000');gx.addColorStop(.955,'#000');gx.addColorStop(1,'#0000');ctx.fillStyle=gx;ctx.fillRect(0,0,surface.width,surface.height);const gy=ctx.createLinearGradient(0,0,0,surface.height);gy.addColorStop(0,'#0000');gy.addColorStop(.065,'#000');gy.addColorStop(.935,'#000');gy.addColorStop(1,'#0000');ctx.fillStyle=gy;ctx.fillRect(0,0,surface.width,surface.height);}return surface;
 }
 sprite(ctx,name,state,frame,dir,x,y,scale=1){const info=this.art.sprites[name][state];const f=Math.max(0,Math.floor(frame))%info.frames;ctx.drawImage(this.images[name],f*128,(info.row+dir)*128,128,128,x-64*scale,y-105*scale,128*scale,128*scale);}
 direction(angle){const index=Math.round(angle/(Math.PI/4));return((index+5)%8+8)%8;}
 shadow(ctx,x,y,w){ctx.fillStyle='#10170c55';ctx.beginPath();ctx.ellipse(x,y,w,w*.37,0,0,Math.PI*2);ctx.fill();}
 text(ctx,text,x,y,color='#f4dfb2',size=13){ctx.font=`600 ${size}px "Noto Serif KR","Batang",Georgia,serif`;ctx.textAlign='center';ctx.fillStyle='#0b0d0ac9';ctx.fillText(text,x+1,y+2);ctx.fillStyle=color;ctx.fillText(text,x,y);}
 flag(ctx,x,y,color,time,scale=1){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.strokeStyle='#4c3422';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-76);ctx.stroke();ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(1,-75);ctx.lineTo(34,-68+Math.sin(time*3+x)*3);ctx.lineTo(26,-40);ctx.lineTo(1,-47);ctx.closePath();ctx.fill();ctx.strokeStyle='#d4b879aa';ctx.lineWidth=1;ctx.stroke();ctx.restore();}
 props(){const random=this.rng(313),props=[];for(let i=0;i<420;i++){const p={x:random()*2400-400,y:random()*1450-250};if(Defense.roadDistance(p)<105||Defense.PADS.some(t=>Defense.dist(t,p)<100)||Defense.dist(p,{x:1420,y:540})<165)continue;const border=p.x<100||p.x>1500||p.y<160||p.y>800;if(border&&(Defense.roadDistance(p)<195||Defense.PADS.some(t=>Math.abs(t.x-p.x)<100&&p.y-t.y>-40&&p.y-t.y<240)))continue;const id=border?[248,249,252,253,240][Math.floor(random()*5)]:[112,113,128,129,124,136][Math.floor(random()*6)];props.push({...p,id,scale:border?.35+random()*.22:.5+random()*.25});}const groves=[{x:350,y:70},{x:800,y:70},{x:370,y:760},{x:350,y:780},{x:390,y:740},{x:730,y:780},{x:710,y:760},{x:750,y:820},{x:1150,y:840},{x:1110,y:840},{x:1070,y:840}],outer=props.filter(p=>p.id>=240&&(p.x<0||p.x>1600||p.y<0||p.y>1000));groves.forEach((p,i)=>{if(outer[i])Object.assign(outer[i],p,{scale:.4});});return props;}
 drawProp(ctx,p,time){const hit=p.id>=240&&this.game.s.workers.slice(0,7).some(w=>w.phase==='chop'&&Defense.dist(w,p)<85);this.tile(ctx,'grassland',p.id,p.x+(hit?Math.sin(time*22)*2:0),p.y,p.scale);}
 woodcutter(ctx,w,time){
   const image=this.images.woodcutter,axe=this.images['woodcutter-axe'],walk=w.phase==='walk',phase=((w.clock||0)+ (this.game.s.multiplayer?((this.visualElapsed||0)*(this.game.s.speed===2?2:1)):0))/.75%1;
   const smooth=t=>t*t*(3-2*t),lift=phase<.4?smooth(phase/.4):phase<.62?1-smooth((phase-.4)/.22):0,impact=phase>.4&&phase<.62?smooth((phase-.4)/.22):phase>=.62?1-smooth((phase-.62)/.38):0;
   const gait=walk?Math.sin(time*9+w.offsetX)*.30:0,lean=walk?Math.sin(time*4)*.025:-impact*.10;
   this.shadow(ctx,w.x,w.y,21);ctx.save();ctx.translate(w.x,w.y+(walk?Math.abs(Math.sin(time*9))*2:0));
   // Split the complete front-facing figure at the hips; animate each leg independently.
   for(let i=0;i<2;i++){ctx.save();ctx.translate(i?8:-8,-43);ctx.rotate((i?-1:1)*gait);ctx.drawImage(image,350+i*35,88,35,70,i?-4:-21,0,25,49);ctx.restore();}
   ctx.save();ctx.translate(0,-42);ctx.rotate(lean);ctx.drawImage(image,350,0,70,90,-25,-65,50,65);
   const hand={x:walk?-22:-22-lift*3-impact*16,y:walk?-4:-15-lift*31+impact*10};
   ctx.lineCap='round';for(const shoulder of [-17,14]){ctx.strokeStyle='#54432e';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(shoulder,-42);ctx.quadraticCurveTo(shoulder-14-lift*6,-23-lift*14,hand.x+(shoulder>0?6:0),hand.y);ctx.stroke();ctx.strokeStyle='#b28e65';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(hand.x-2,hand.y);ctx.lineTo(hand.x+7,hand.y+2);ctx.stroke();}
   ctx.save();ctx.translate(hand.x,hand.y);ctx.rotate(walk?-.3:.4+lift*.9-impact*1.5);ctx.drawImage(axe,-20,-56,40,67);ctx.restore();ctx.restore();
   if(!walk&&phase>.55&&phase<.76){const p=(phase-.55)/.21;for(let i=0;i<4;i++){ctx.fillStyle=i%2?'#cda35b':'#a47c40';ctx.fillRect(-42-i*7*p,-45-i%2*6-p*20,4*(1-p)+1,2);}}
   ctx.restore();
 }

 castle(ctx,time){const s=this.game.s;this.shadow(ctx,1430,550,106);if(s.castle<5){this.tile(ctx,'grassland',72,1395,555,1.05,true);this.tile(ctx,'grassland',75,1470,565,.7,true);}else{this.tile(ctx,'grassland',296,1430,565,.27+(s.castle/20)*.08,true);for(let i=0;i<Math.min(3,Math.floor(s.castle/6));i++)this.tile(ctx,'grassland',296,1360+i*80,585,.11,true);}
   this.flag(ctx,1490,530,'#a63d30',time,1.05);this.sprite(ctx,'soldier','stance',time*4,7,1350,590,.72);this.sprite(ctx,'soldier','stance',time*4,7,1470,610,.72);this.text(ctx,'성을 터치해 강화',1430,415,'#ffe6af',13);this.text(ctx,`성 Lv.${s.castle}`,1430,440,'#f6ddaa',18);ctx.fillStyle='#191b18';ctx.fillRect(1375,451,110,7);ctx.fillStyle='#a3bf76';ctx.fillRect(1376,452,108*s.hp/s.maxHp,5);
 }
 tower(ctx,t,time,preview=false){if(t.buildRemaining>0&&!preview){this.construction(ctx,t.x,t.y,t.buildRemaining,3,160,t._pending);return;}if(!preview&&t.hp<300){ctx.fillStyle='#291b15';ctx.fillRect(t.x-25,t.y+12,50,5);ctx.fillStyle='#d4a250';ctx.fillRect(t.x-25,t.y+12,50*Math.max(0,t.hp)/300,5);}const p=Defense.spec(t.type),st=this.game.stats(t),level=this.game.s.towerLevels[t.type];this.shadow(ctx,t.x,t.y,40);if(t.type==='archer'){this.tile(ctx,'grassland',72,t.x,t.y,.45,true);}else if(t.type==='frost'){this.tile(ctx,'grassland',296,t.x,t.y,.105,true);}else if(t.type!=='ballista'&&t.type!=='cannon'){this.tile(ctx,'grassland',264,t.x-18,t.y,.38);}if(t.type==='cannon'){ctx.save();ctx.translate(t.x,t.y);ctx.fillStyle='#626858';ctx.strokeStyle='#343c30';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,43,19,0,0,Math.PI*2);ctx.fill();ctx.stroke();for(let i=0;i<9;i++){const a=i*Math.PI*2/9;ctx.beginPath();ctx.moveTo(Math.cos(a)*26,Math.sin(a)*11);ctx.lineTo(Math.cos(a)*42,Math.sin(a)*18);ctx.stroke();}ctx.restore();}
   if(t.type==='cannon'){
     ctx.save();ctx.translate(t.x,t.y-17);ctx.rotate(t.angle??-.7);const recoil=t.attack?-Math.sin(Math.min(1,t.attack/.4)*Math.PI)*6:0;
     ctx.fillStyle='#4a321e';ctx.strokeStyle='#201c17';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-27,-19);ctx.lineTo(12,-12);ctx.lineTo(34,0);ctx.lineTo(12,12);ctx.lineTo(-27,19);ctx.closePath();ctx.fill();ctx.stroke();
     for(const y of [-23,23]){ctx.save();ctx.translate(-8,y);ctx.fillStyle='#302b22';ctx.beginPath();ctx.ellipse(0,0,15,7,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#8d7a50';ctx.lineWidth=3;ctx.stroke();ctx.lineWidth=2;for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*13,Math.sin(a)*6);ctx.stroke();}ctx.restore();}
     const bronze=ctx.createLinearGradient(0,-12,0,12);bronze.addColorStop(0,'#c6bb86');bronze.addColorStop(.22,'#9c915d');bronze.addColorStop(.53,'#707b61');bronze.addColorStop(.76,'#666449');bronze.addColorStop(1,'#343c30');ctx.fillStyle=bronze;ctx.beginPath();ctx.moveTo(-17+recoil,-11);ctx.bezierCurveTo(-30+recoil,-9,-30+recoil,9,-17+recoil,11);ctx.lineTo(43+recoil,8);ctx.lineTo(43+recoil,-8);ctx.closePath();ctx.fill();ctx.strokeStyle='#30271b';ctx.lineWidth=1.5;ctx.stroke();
     for(const x of [-8,12,36]){ctx.strokeStyle='#a6a17b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+recoil,-10);ctx.lineTo(x+recoil,10);ctx.stroke();}
     ctx.fillStyle='#141512';ctx.beginPath();ctx.ellipse(44+recoil,0,5,8,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#aaa47b';ctx.lineWidth=2;ctx.stroke();
     if(t.attack>.22){const a=(t.attack-.22)/.18;ctx.fillStyle='rgba(255,201,100,'+a+')';ctx.beginPath();ctx.moveTo(49,0);ctx.lineTo(70,-9);ctx.lineTo(64,0);ctx.lineTo(73,9);ctx.closePath();ctx.fill();}ctx.restore();
   }
   else if(t.type==='frost'||t.type==='storm'){ctx.save();ctx.translate(t.x,t.y-52);const color=t.type==='frost'?'#80d8ed':'#bd9ef1';ctx.shadowColor=color;ctx.shadowBlur=15;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,-28);ctx.lineTo(15,-7);ctx.lineTo(0,15);ctx.lineTo(-13,-7);ctx.closePath();ctx.fill();ctx.fillStyle='#e8ffffb5';ctx.beginPath();ctx.moveTo(0,-28);ctx.lineTo(0,15);ctx.lineTo(-13,-7);ctx.closePath();ctx.fill();ctx.restore();}
   else if(t.type==='archer'){const dir=this.direction(t.angle||1);this.sprite(ctx,'soldier',t.attack?'shoot':'stance',t.attack?( .4-t.attack)*10:time*4,dir,t.x,t.y-25,.72);}
   if(t.type==='ballista'){
     // LPC Siege Weapons by bluecarrot16, CC BY 4.0. Each frame is 128 × 128.
     const a=t.angle??-.65,crewX=t.x-Math.cos(a)*39,crewY=t.y-Math.sin(a)*22+5,row=((Math.round(a/(Math.PI/4))+2)%8+8)%8,frame=t.attack?Math.min(5,Math.floor((.4-t.attack)/.4*6)):0;
     if(crewY<t.y)this.ballistaCrew(ctx,t,time,crewX,crewY);
     ctx.save();ctx.translate(t.x,t.y-14);ctx.filter='saturate(.65) brightness(1.25)';
     ctx.drawImage(this.images.ballista,frame*128,row*128,128,128,-47,-77,94,94);
     ctx.drawImage(this.images['ballista-arm'],frame*128,row*128,128,128,-47,-77,94,94);ctx.restore();
     if(crewY>=t.y)this.ballistaCrew(ctx,t,time,crewX,crewY);
   }
   if(level===5){ctx.strokeStyle=p.color;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(t.x,t.y,42,19,0,0,Math.PI*2);ctx.stroke();}
   if(!preview){this.flag(ctx,t.x-29,t.y-9,p.color,time,.44);this.text(ctx,`Lv.${level}`,t.x,t.y+25,p.color,12);if(this.selected===t.id){ctx.strokeStyle='#ffe4a4';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(t.x,t.y,49,23,0,0,Math.PI*2);ctx.stroke();ctx.fillStyle=p.color+'0c';ctx.strokeStyle=p.color+'88';ctx.lineWidth=1;ctx.beginPath();ctx.arc(t.x,t.y,st.range,0,Math.PI*2);ctx.fill();ctx.stroke();}}
 }
 ore(ctx,x,y,time,index){
    if(!this.oreCache)this.oreCache={};
    if(!this.oreCache[index]){const [sx,sy,w,h]=this.art.cave[151],c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.drawImage(this.images.cave,sx,sy,w,h,0,0,w,h);g.globalCompositeOperation='source-atop';const random=this.rng(700+index);
      for(let j=0;j<38;j++){const px=25+random()*(w-50),py=25+random()*(h-45),sz=2+random()*4;g.strokeStyle=j%3===0?'#f4d67c':j%3===1?'#a9873b':'#cbae59';g.lineWidth=1+random()*2;g.beginPath();g.moveTo(px-sz*2,py-sz);g.lineTo(px,py);g.lineTo(px+sz,py-sz*.5);g.lineTo(px+sz*2,py+sz);g.stroke();g.fillStyle='#dec46c';g.fillRect(px,py,sz,sz*.65);}
      this.oreCache[index]=c;
    }const image=this.oreCache[index];ctx.drawImage(image,x-image.width*.7,y-image.height*1.05,image.width*1.4,image.height*1.4);
 }
 mine(ctx,time){const s=this.game.s;const random=this.rng(125);for(let i=0;i<12;i++){this.tile(ctx,'cave',64,115+i*67.2,250-i*33.6,.7);this.tile(ctx,'cave',65,854+i*67.2,-119.6+i*33.6,.7);}
   for(const x of [180,1360])for(let y=340;y<850;y+=145)this.tile(ctx,'cave',80,x,y,.8);
   this.tile(ctx,'cave',128,1050,780,1.7);this.tile(ctx,'cave',130,1180,820,1.2);this.tile(ctx,'cave',163,250,700,1.15);this.tile(ctx,'cave',162,300,745,.9);
   for(let i=0;i<Defense.MINERS.length;i++){const m=Defense.MINERS[i];this.ore(ctx,m.x,m.y-37,time,i);if(i>=Math.min(7,s.miners))continue;const phase=(time/1.5+i*.13)%1,anim=phase<.28?0:phase<.7?Math.floor((phase-.28)/.42*4):3;this.shadow(ctx,m.x,m.y,23);this.sprite(ctx,'miner',phase>.25&&phase<.72?'swing':'stance',phase>.25&&phase<.72?anim:0,m.dir,m.x,m.y+16,1.15);
    if(phase>.57&&phase<.82){for(let n=0;n<6;n++){ctx.fillStyle=n%2?'#e8c665':'#a29570';const progress=(phase-.57)/.25;ctx.beginPath();ctx.arc(m.x+(n-3)*25*progress,m.y-50-28*Math.sin(progress*Math.PI)+(n%2)*12,2*(1-progress)+.6,0,Math.PI*2);ctx.fill();}}
    if(phase>.82)this.text(ctx,'+0.5',m.x,m.y-84-(phase-.82)*90,'#e8c567',17);
   }
   for(const p of [{x:220,y:260},{x:1330,y:320},{x:700,y:750}]){this.tile(ctx,'cave',110,p.x,p.y,.65);const grad=ctx.createRadialGradient(p.x,p.y-110,2,p.x,p.y-110,110);grad.addColorStop(0,'#ffc15b44');grad.addColorStop(1,'#ffb84000');ctx.fillStyle=grad;ctx.fillRect(p.x-110,p.y-220,220,220);ctx.fillStyle='#ffe3a5';ctx.beginPath();ctx.ellipse(p.x,p.y-115,4+Math.sin(time*13)*1.5,10,0,0,Math.PI*2);ctx.fill();}
 }


 ballistaCrew(ctx,t,time,x,y){
   // The crew reaches for the string, draws it back, then releases on firing.
   const cooldown=t.cd??0,rate=this.game.stats(t).rate,loading=cooldown>.4;
   const p=loading?Math.min(1,Math.max(0,(rate-cooldown)/Math.max(.1,rate-.4))):0;
   const pull=loading?Math.sin(p*Math.PI/2):t.attack?Math.max(0,t.attack/.4):0;
   const a=t.angle??-.65,dir=this.direction(a),lean=loading?Math.sin(p*Math.PI)*3:0;
   this.shadow(ctx,x,y,18);ctx.save();
   this.sprite(ctx,'soldier',loading?'shoot':'stance',loading?Math.min(3,Math.floor(p*4)):time*3,dir,x+Math.cos(a)*lean,y,.64);
   // Hands travel back from the bolt rail with the drawn string.
   const reach=25-pull*16,handX=x+Math.cos(a)*reach,handY=y-40+Math.sin(a)*reach*.5;
   ctx.lineCap='round';ctx.strokeStyle='#685c43';ctx.lineWidth=5;
   for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(x+side*8,y-44);ctx.quadraticCurveTo(x+side*10+Math.cos(a)*9,y-34,handX,handY+side*2);ctx.stroke();}
   ctx.fillStyle='#c5a17b';ctx.beginPath();ctx.ellipse(handX,handY,4,3,a,0,Math.PI*2);ctx.fill();ctx.restore();
 }
 observeBuildingUpgrades(s,now,key){
  const old=this.upgradeBaseline;
  if(!s.started||!old?.started||old.key!==key||s.time<old.time){this.levelGlows=new Map();this.castleLevelGlow=null;}
  else{
   if(s.castle>old.castle)this.castleLevelGlow={at:now,level:s.castle};
   for(const [type,level] of Object.entries(s.towerLevels))if(level>(old.levels[type]||1))this.levelGlows.set(type,{at:now,level});
  }
  this.upgradeBaseline={key,started:s.started,time:s.time,castle:s.castle,levels:{...s.towerLevels}};
  for(const [type,glow] of this.levelGlows)if(now-glow.at>1.5)this.levelGlows.delete(type);
 }
 buildingUpgradeGlow(ctx,now,reducedMotion=false){
  const draw=(x,y,width,height,glow,castle=false)=>{const p=(now-glow.at)/1.4;if(p<0||p>=1)return;const fade=Math.sin(Math.PI*p);ctx.save();ctx.globalAlpha=fade;ctx.strokeStyle='#ddc18a';ctx.lineWidth=2;if(!reducedMotion){ctx.beginPath();ctx.ellipse(x,y-3,width*(.75+p*.15),width*.25,0,0,Math.PI*2);ctx.stroke();}const yy=y-height-8-(reducedMotion?0:p*8);ctx.fillStyle='#182019dd';ctx.fillRect(x-35,yy-19,70,26);this.text(ctx,'Lv.'+glow.level+' ↑',x,yy,'#e4d0a2',castle?18:15);ctx.restore();};
  for(const tower of this.game.s.towers){const glow=this.levelGlows?.get(tower.type);if(glow&&!(tower.buildRemaining>0))draw(tower.x,tower.y,54,100,glow);}
  if(this.castleLevelGlow&&!(now-this.eraGlowAt<1.8))draw(1430,535,110,205,this.castleLevelGlow,true);
 }
 civilizationGlow(ctx,now,reducedMotion=false){const p=(now-this.eraGlowAt)/1.8;if(!(p>=0&&p<1))return;ctx.save();ctx.globalAlpha=Math.sin(Math.PI*p);ctx.strokeStyle='#cbb079';ctx.lineWidth=2;if(!reducedMotion){ctx.beginPath();ctx.ellipse(1430,535,115+p*12,36,0,0,Math.PI*2);ctx.stroke();}ctx.fillStyle='#192119e8';ctx.fillRect(1320,282,220,38);this.text(ctx,Defense.ERAS[this.game.era]+' 문명 도달',1430,308,'#eddbaf',20);ctx.restore();
 }

 town(ctx,time){
  const s=this.game.s,era=this.game.era;
  // The painted curtain walls and eight watchtowers replace the former tree fence.
  ctx.drawImage(this.images['town-courtyard-v3'],-120,-150,1840,1152);
  for(const [x,y] of [[120,180],[410,120],[685,105],[930,105],[1210,120],[1500,180]]){
   this.flag(ctx,x,y,'#8f3c30',time,.48);
   this.sprite(ctx,'soldier','stance',Math.floor(time*2),7,x-14,y+10,.52);
  }
  const fountain=ctx.createRadialGradient(800,550,8,800,550,65);fountain.addColorStop(0,'#8eb4b4');fountain.addColorStop(1,'#596d65');ctx.fillStyle=fountain;ctx.beginPath();ctx.ellipse(800,550,74,35,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#c5bb99';ctx.lineWidth=9;ctx.stroke();ctx.strokeStyle='#abcfd080';ctx.lineWidth=2;for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(800,550,15+((time*15+i*20)%55),8+((time*7+i*10)%25),0,0,Math.PI*2);ctx.stroke();}
  for(const [kind,x,y,label,cost] of [['barracks',550,515,'훈련소',100],['lab',1040,505,'연구소',200]]){
   if(kind==='barracks'&&!s.multiplayer)continue;
   if(!s[kind]){ctx.strokeStyle='#d2ba7a88';ctx.setLineDash([10,8]);ctx.lineWidth=3;ctx.strokeRect(x-100,y-75,200,105);ctx.setLineDash([]);this.text(ctx,label+' 건설 터',x,y+70,'#ead9a6',19);this.text(ctx,'나무 '+cost,x,y+98,'#cdbb88',15);continue;}
   const building=s[kind==='lab'?'labBuild':'barracksBuild'];if(building>0){this.construction(ctx,x,y,building,kind==='lab'?10:8,310,false,label);continue;}
   this.shadow(ctx,x,y,120);
   const image=this.images[kind==='lab'?'lab-building-v1':'barracks-building-v1'],width=330,height=width*image.height/image.width;ctx.drawImage(image,x-width/2,y-height+30,width,height);
   const timer=s[kind==='lab'?'labBuild':'barracksBuild'];this.text(ctx,timer>0?label+' 건설 '+Math.ceil(timer)+'초':label,x,y+72,'#f2deb1',23);this.text(ctx,'터치하여 관리',x,y+99,'#d4c49f',14);
   if(kind==='barracks')for(let i=0;i<Math.min(5,s.army);i++)this.sprite(ctx,'soldier','stance',time*3+i,7,x-70+i*34,y+25,.75);
  }
  for(let i=0;i<5;i++){const x=330+i*210+Math.sin(time*.25+i)*40,y=665+Math.sin(time*.3+i)*45;this.sprite(ctx,'soldier','run',time*5+i,7,x,y,.65);}
 }

 draw(settings={}){const ctx=this.ctx,s=this.game.s,visualNow=performance.now()/1000,currentEra=this.game.era;if(this.lastEra!==undefined&&currentEra>this.lastEra&&s.started)this.eraGlowAt=visualNow;if(!s.started||currentEra<this.lastEra)this.eraGlowAt=-100;this.lastEra=currentEra;ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.fillStyle='#292d20';ctx.fillRect(0,0,this.w,this.h);if(!this.ready)return;this.observeCastleDamage(s,visualNow,window.Clan?.audioKey||'local');const transform=this.transform(),time=s.started&&!s.multiplayer?s.time:performance.now()/1000;ctx.save();let shake=!settings.reducedMotion&&settings.shake?(this.castleImpact&&visualNow-this.castleImpact.at<.65?Math.sin(visualNow*83)*8*(1-(visualNow-this.castleImpact.at)/.65):s.shake>0?Math.sin(time*99)*3:0):0;ctx.translate(transform.x+shake,transform.y);ctx.scale(transform.scale,transform.scale);const kind=this.scene;this.backdrop(ctx,kind,transform,shake);if(kind!=='town'){ctx.drawImage(this.ground[kind],-900,-1900,3300,4800);ctx.drawImage(this.groundDetail[kind],-500,-420);}
   if(kind==='battle'){
    this.outskirts(ctx,transform,shake);
    for(const p of this.decor.filter(p=>p.y<450))this.drawProp(ctx,p,time);
    this.flag(ctx,110,260,'#9e3a2c',time,.9);this.text(ctx,'침공로',105,170,'#e4cdb0',15);
    for(let i=0;i<Defense.PADS.length;i++){const p=Defense.PADS[i];if(s.towers.some(t=>t.pad===i))continue;ctx.strokeStyle=this.hover===i?'#ffe9ad':this.buildType?'#f4d88fd9':'#d8cf9870';ctx.fillStyle=this.hover===i?'#fff2bf55':this.buildType?'#f2d68b31':'#b9ad6233';ctx.lineWidth=this.hover===i?4:2;ctx.shadowColor=this.buildType?'#efcb72':'transparent';ctx.shadowBlur=this.buildType?13:0;ctx.beginPath();ctx.ellipse(p.x,p.y,38,19,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.shadowBlur=0;if(this.buildType||this.hover===i)this.text(ctx,'+',p.x,p.y+7,'#e6d09c',23);}
    const drawables=[...s.workers.slice(0,7).map(w=>({y:w.y,draw:()=>this.woodcutter(ctx,w,time)})),...s.towers.map(t=>({y:t.y,draw:()=>this.tower(ctx,t,time)})),...s.enemies.map(e=>({y:e.y,draw:()=>{this.shadow(ctx,e.x,e.y,e.kind==='brute'?33:20);ctx.save();if(e.slow||e.frozen)ctx.filter='sepia(.35) saturate(1.3) hue-rotate(145deg)';else if(e.kind==='saboteur')ctx.filter='sepia(.75) saturate(1.6) hue-rotate(330deg)';if(e.hit)ctx.globalAlpha=.7;this.sprite(ctx,e.invader?'soldier':'raider',e.siege?'swing':'run',e.frozen>0?0:e.siege?e.siege*9:time*13,e.siege?5:this.direction(e.angle),e.x,e.y,e.kind==='brute'?1.65:e.kind==='heavy'?1.25:e.kind==='saboteur'?1.05:.85);ctx.restore();ctx.fillStyle='#211e17';ctx.fillRect(e.x-22,e.y-73,44,4);ctx.fillStyle=e.kind==='brute'?'#d6ac60':e.kind==='saboteur'?'#e86d42':'#a83e32';ctx.fillRect(e.x-21,e.y-72,42*Math.max(0,e.hp/e.max),2);if(e.invader)this.text(ctx,'침공군',e.x,e.y-92,'#b5d8ff',12);if(e.frozen)this.text(ctx,'빙결',e.x,e.y-85,'#b1e4ff',11);if(e.kind==='saboteur')this.text(ctx,'!',e.x,e.y-95,'#ffc391',19);}})),{y:560,draw:()=>this.castle(ctx,time)}];drawables.sort((a,b)=>a.y-b.y).forEach(p=>p.draw());
    for(const p of this.decor.filter(p=>p.y>=450))this.drawProp(ctx,p,time);
    if(this.hover>=0&&this.buildType&&!s.towers.some(t=>t.pad===this.hover)){const p=Defense.PADS[this.hover];ctx.globalAlpha=.65;this.tower(ctx,{...p,type:this.buildType,level:1,id:-1,attack:0},time,true);ctx.globalAlpha=1;ctx.strokeStyle='#d7c68e70';ctx.beginPath();ctx.arc(p.x,p.y,Defense.spec(this.buildType).range,0,Math.PI*2);ctx.stroke();}
    this.castleDamage(ctx,visualNow,settings);
    this.civilizationGlow(ctx,visualNow,settings.reducedMotion);
    this.buildingUpgradeGlow(ctx,visualNow,settings.reducedMotion);
    for(const shot of s.shots){if(shot.delay>0||shot._netHidden)continue;const color=Defense.spec(shot.type).color;ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=8;ctx.beginPath();ctx.arc(shot.x,shot.y,shot.type==='cannon'?7:3,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
    for(const e of s.effects){ctx.save();ctx.globalAlpha=Math.min(1,e.life*2);if(e.type==='sabotageBomb'){const p=Math.max(0,1-e.life/(e.duration||1.05)),x=e.x+(e.toX-e.x)*p,y=e.y+(e.toY-e.y)*p-Math.sin(p*Math.PI)*150;ctx.globalAlpha=1;ctx.fillStyle='#252921';ctx.strokeStyle='#9c8355';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,11,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.strokeStyle='#d1a36d';ctx.beginPath();ctx.moveTo(x+4,y-8);ctx.quadraticCurveTo(x+13,y-25,x+18,y-15);ctx.stroke();ctx.fillStyle='#ffd36f';ctx.beginPath();ctx.arc(x+18,y-15,3+Math.sin(time*30),0,Math.PI*2);ctx.fill();}else if(e.type==='demolish'){const p=Math.max(0,1-e.life/1.2);ctx.globalAlpha=1-p;const glow=ctx.createRadialGradient(e.x,e.y-25,0,e.x,e.y-25,85*p+20);glow.addColorStop(0,'#ffe4a0cc');glow.addColorStop(.45,'#e28f4866');glow.addColorStop(1,'#3d332400');ctx.fillStyle=glow;ctx.fillRect(e.x-120,e.y-145,240,220);ctx.strokeStyle='#f5c06e';ctx.lineWidth=5*(1-p);ctx.beginPath();ctx.ellipse(e.x,e.y,18+p*90,9+p*40,0,0,Math.PI*2);ctx.stroke();for(let i=0;i<16;i++){const a=i*2.4,rad=18+p*(45+i%4*13);ctx.save();ctx.translate(e.x+Math.cos(a)*rad,e.y-30+Math.sin(a)*rad*.55-Math.sin(p*Math.PI)*35);ctx.rotate(i+p*5);ctx.fillStyle=i%3?'#bba077':'#5c5346';ctx.fillRect(-4,-4,6+i%4,6);ctx.restore();}for(let i=0;i<5;i++){ctx.fillStyle='#aa9c8266';ctx.beginPath();ctx.ellipse(e.x+(i-2)*16*p,e.y-20-p*(30+i*8),20+p*25,12+p*15,0,0,Math.PI*2);ctx.fill();}}else if(e.type==='lightning'||e.type==='arc'){ctx.strokeStyle='#dcddff';ctx.shadowColor='#ada5ff';ctx.shadowBlur=13;ctx.lineWidth=e.type==='lightning'?4:2;ctx.beginPath();ctx.moveTo(e.fromX??e.x-25,e.fromY??e.y-220);ctx.lineTo(e.x+15,e.y-90);ctx.lineTo(e.x-15,e.y-70);ctx.lineTo(e.x,e.y);ctx.stroke();}else{ctx.fillStyle=e.type==='ice'?'#8ddbff66':e.type==='blast'?'#e7aa5577':'#c8b58e66';ctx.beginPath();ctx.ellipse(e.x,e.y,e.type==='blast'?98*(1-e.life):19,e.type==='blast'?46*(1-e.life):9,0,0,Math.PI*2);ctx.fill();}ctx.restore();}
   }else if(kind==='town')this.town(ctx,time);else this.mine(ctx,time);
   ctx.restore();const vignette=ctx.createRadialGradient(this.w/2,this.h*.42,this.w*.12,this.w/2,this.h*.42,this.w*.75);vignette.addColorStop(0,'#050a0800');vignette.addColorStop(1,kind==='mine'?'#09060352':'#0c140b38');ctx.fillStyle=vignette;ctx.fillRect(0,0,this.w,this.h);this.castleDamage(ctx,visualNow,settings,true);
 }
}
window.WorldRenderer=WorldRenderer;
