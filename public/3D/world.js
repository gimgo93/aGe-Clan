import * as T from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {FrontierWeather} from './weather.js';
const D=window.Defense;
const pos=p=>new T.Vector3((p.x-800)*.04,0,(p.y-440)*.04);
const rand=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const palette={stone:'#b3b1a0',stoneDark:'#747f74',roof:'#485b59',wood:'#695443',gold:'#c9a25d',steel:'#80969c',cloth:'#8c4537',grass:'#819878',earth:'#675d48',skin:'#c8ab86'};

export class FrontierWorld{
 constructor(canvas,game,onPick){
  this.game=game;this.canvas=canvas;this.pick=onPick;this.mode='battle';this.time=0;this.materials=new Map();this.geometries=new Map();this.flags=[];this.units=new Map();this.towers=new Map();this.projectiles=new Map();this.effects=new Map();this.workerModels=[];this.minerModels=[];
  this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.2;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
  this.scene=new T.Scene();this.scene.background=new T.Color('#95b8bb');this.scene.fog=new T.Fog('#95b8bb',85,200);
  this.camera=new T.PerspectiveCamera(40,1,.1,280);
  this.controls=new OrbitControls(this.camera,canvas);Object.assign(this.controls,{enableDamping:true,dampingFactor:.075,minDistance:18,maxDistance:170,minPolarAngle:.28,maxPolarAngle:1.27,screenSpacePanning:false,maxTargetRadius:28});
  this.hemi=new T.HemisphereLight('#e4efda','#5c736d',2.3);this.scene.add(this.hemi);
  this.sun=new T.DirectionalLight('#fff1d0',3.1);this.sun.position.set(-24,42,16);this.sun.castShadow=true;Object.assign(this.sun.shadow.camera,{left:-47,right:47,top:38,bottom:-38,near:1,far:130});this.sun.shadow.bias=-.0007;this.sun.shadow.normalBias=.07;this.scene.add(this.sun);
  this.groups={battle:new T.Group(),mine:new T.Group(),town:new T.Group()};Object.values(this.groups).forEach(g=>this.scene.add(g));this.interact=[];this.buildBattle();this.buildMine();this.buildTown();this.range=new T.Mesh(new T.RingGeometry(1,1.018,80),new T.MeshBasicMaterial({color:'#e7d18a',transparent:true,opacity:.65,side:T.DoubleSide,depthWrite:false}));this.range.rotation.x=-Math.PI/2;this.range.position.y=.19;this.groups.battle.add(this.range);this.range.visible=false;
  this.ray=new T.Raycaster();this.pointer=new T.Vector2();let down=null;
  canvas.addEventListener('pointerdown',e=>{if(e.button===0)down={x:e.clientX,y:e.clientY,id:e.pointerId};});
  canvas.addEventListener('pointerup',e=>{if(!down||e.pointerId!==down.id)return;const tap=Math.hypot(e.clientX-down.x,e.clientY-down.y)<8;down=null;if(tap)this.selectAt(e.clientX,e.clientY);});
  canvas.addEventListener('pointercancel',()=>down=null);canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();window.dispatchEvent(new Event('frontier-context-lost'));});canvas.addEventListener('webglcontextrestored',()=>location.reload());
  this.weather=new FrontierWeather(this);this.quality(matchMedia('(pointer:coarse)').matches?'low':'high');this.setScene('battle');this.resize();addEventListener('resize',()=>this.resize());
 }
 mat(color,extra={}){const key=color+JSON.stringify(extra);if(!this.materials.has(key))this.materials.set(key,new T.MeshStandardMaterial({color,roughness:.85,...extra}));return this.materials.get(key);}
 geo(kind,...args){const key=kind+args.join(',');if(!this.geometries.has(key)){const classes={box:T.BoxGeometry,cyl:T.CylinderGeometry,cone:T.ConeGeometry,ico:T.IcosahedronGeometry,torus:T.TorusGeometry,ring:T.RingGeometry};this.geometries.set(key,new classes[kind](...args));}return this.geometries.get(key);}
 mesh(parent,geometry,material,x=0,y=0,z=0){const o=new T.Mesh(geometry,material);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
 box(g,x,y,z,w,h,d,color){return this.mesh(g,this.geo('box',w,h,d),this.mat(color),x,y,z);}
 cyl(g,x,y,z,r,h,color,top=r,n=8){return this.mesh(g,this.geo('cyl',top,r,h,n),this.mat(color),x,y,z);}
 rock(g,x,z,size,color=palette.stoneDark){const r=this.mesh(g,this.geo('ico',1,0),this.mat(color),x,size*.35,z);r.scale.set(size,size*.7,size*.8);r.rotation.set(x,.4*z,.2);return r;}
 banner(g,x,y,z,color=palette.cloth){this.cyl(g,x,y+.8,z,.035,1.8,palette.wood);const cloth=this.box(g,x+.28,y+1.25,z,.55,.65,.035,color);this.flags.push(cloth);return cloth;}
 turret(g,x,z,h=4,r=.85){this.cyl(g,x,h/2,z,r,h,palette.stone);this.cyl(g,x,h-.3,z,r+.14,.35,palette.stoneDark);for(let i=0;i<8;i++){const a=i*Math.PI/4;this.box(g,x+Math.cos(a)*r*.88,h+.15,z+Math.sin(a)*r*.88,.31,.5,.31,palette.stone);}for(let i=0;i<2;i++)this.box(g,x,h*.4+i*1.2,z+r+.01,.18,.48,.05,'#3e5151');}
 castleModel(){const g=new T.Group();this.box(g,0,.2,0,7.9,.4,7,palette.stoneDark);this.box(g,0,2,0,5.2,4,4.3,palette.stone);this.box(g,0,4.3,0,5.8,.6,4.8,palette.stoneDark);this.cyl(g,0,5,0,2.2,1.5,palette.roof,.2,4).rotation.y=Math.PI/4;for(const x of [-3,3])for(const z of [-2.6,2.6]){this.turret(g,x,z,4.2,.85);this.banner(g,x,4.4,z);}
  this.box(g,0,1.3,2.19,1.5,2.6,.16,palette.wood);for(const x of [-.5,0,.5])this.box(g,x,1.3,2.3,.05,2.55,.06,palette.gold);this.box(g,0,1.8,2.35,1.6,.08,.1,palette.gold);for(const x of [-1.6,1.6])this.box(g,x,2.5,2.2,.4,.8,.1,'#344d4c');this.banner(g,0,6,0);return g;}
 human(kind='soldier'){
  if(kind==='miner')return this.minerModel();
  const g=new T.Group(),color=kind==='enemy'?'#8a4239':kind==='miner'?'#82705a':kind==='wood'?'#758965':'#536d7a';
  const body=this.cyl(g,0,.68,0,.21,.55,color,.26,6);this.cyl(g,0,.39,0,.27,.18,color,.2,6);this.mesh(g,this.geo('ico',.18,1),this.mat(palette.skin),0,1.12,0);this.cyl(g,0,1.27,0,.2,.12,kind==='miner'?palette.gold:palette.steel,.18,8);
  const legs=[];for(const x of [-.11,.11]){const limb=new T.Group();limb.position.set(x,.42,0);this.box(limb,0,-.19,0,.13,.38,.15,palette.wood);this.box(limb,0,-.38,.04,.16,.1,.25,'#39463f');g.add(limb);legs.push(limb);}
  const arm=new T.Group();arm.position.set(.26,.93,0);this.box(arm,0,-.18,0,.12,.39,.13,color);g.add(arm);this.box(g,-.29,.72,0,.12,.38,.14,color);
  if(kind==='miner'||kind==='wood'){this.box(arm,0,-.2,.27,.055,.055,.75,palette.wood);if(kind==='miner')this.box(arm,0,-.2,.62,.65,.09,.09,palette.steel);else this.box(arm,.08,-.2,.58,.25,.09,.28,palette.steel);}
  else if(kind==='archer'){const bow=new T.Mesh(this.geo('torus',.36,.035,5,12,Math.PI),this.mat(palette.wood));bow.position.set(0,-.18,.3);bow.rotation.z=Math.PI/2;arm.add(bow);this.box(arm,0,-.18,.3,.02,.65,.02,palette.gold);}
  else{this.box(arm,0,-.2,.25,.045,.045,.7,palette.steel);const shield=this.cyl(g,-.32,.73,.1,.25,.07,kind==='enemy'?'#794a3c':palette.gold,.25,6);shield.rotation.z=Math.PI/2;}
  g.userData={legs,arm,body};return g;
 }
 forest(g,sites){const trunk=new T.InstancedMesh(this.geo('cyl',.16,.22,1.3,5),this.mat('#5d503d'),sites.length);trunk.castShadow=true;g.add(trunk);const crowns=[0,1,2].map(()=>{const m=new T.InstancedMesh(this.geo('cone',1,1.9,7),this.mat(['#3f6354','#4e7460','#5b8068'][g.children.length%3]),sites.length);m.castShadow=true;g.add(m);return m;});const temp=new T.Object3D();sites.forEach((p,i)=>{const v=pos(p),size=p.size||1;temp.position.set(v.x,.65,v.z);temp.scale.set(size,1,size);temp.updateMatrix();trunk.setMatrixAt(i,temp.matrix);crowns.forEach((m,k)=>{temp.position.set(v.x,1.6+k*.9*size,v.z);temp.scale.setScalar(size*(1-k*.18));temp.updateMatrix();m.setMatrixAt(i,temp.matrix);});});}
 buildBattle(){const g=this.groups.battle,rng=rand(821);
  const water=this.mesh(g,new T.PlaneGeometry(400,400),this.mat('#447b85',{roughness:.3,metalness:.18}),0,-2,0);water.rotation.x=-Math.PI/2;
  this.box(g,0,-1.25,0,74,2.3,47,'#736f58');this.box(g,0,-.18,0,73,.45,46,palette.grass);
  for(let i=0;i<65;i++){const side=i%2===0?-1:1,x=(rng()-.5)*73,z=side*(22+rng()*2);this.rock(g,x,z,1+rng()*2,'#8b8d76');}
  for(let i=0;i<D.PATH.length-1;i++){const a=pos(D.PATH[i]),b=pos(D.PATH[i+1]),dir=b.clone().sub(a),mid=a.clone().add(b).multiplyScalar(.5);const strip=this.box(g,mid.x,.075,mid.z,dir.length()+.2,.14,2.45,'#baa887');strip.rotation.y=-Math.atan2(dir.z,dir.x);this.cyl(g,a.x,.07,a.z,1.23,.15,'#baa887',1.23,20);}
  const stones=[];for(let d=0;d<D.pathLength;d+=19){const p=D.pointAt(d),v=pos(p);for(let k=-1;k<2;k++)stones.push({x:v.x-Math.sin(p.angle)*k*.55,y:.16,z:v.z+Math.cos(p.angle)*k*.55,angle:p.angle,scale:.75+rng()*.4});}
  const cobbles=new T.InstancedMesh(this.geo('box',.5,.1,.4),this.mat('#c1b69b'),stones.length);cobbles.receiveShadow=true;const dummy=new T.Object3D();stones.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.y=-p.angle;dummy.scale.set(p.scale,1,p.scale);dummy.updateMatrix();cobbles.setMatrixAt(i,dummy.matrix);});g.add(cobbles);
  const sites=[];for(let i=0;i<420&&sites.length<95;i++){const p={x:55+rng()*1480,y:35+rng()*810,size:.7+rng()*.7};if(D.roadDistance(p)>105&&D.PADS.every(t=>D.dist(t,p)>65)&&D.dist(p,{x:1430,y:550})>170)sites.push(p);}
  this.treeSites=sites;this.game.setTreeSites(sites);this.forest(g,sites);
  for(let i=0;i<38;i++){const p={x:40+rng()*1500,y:20+rng()*830};if(D.roadDistance(p)>80)this.rock(g,pos(p).x,pos(p).z,.3+rng()*.65,'#9b9e83');}
  this.padMeshes=D.PADS.map((p,index)=>{const v=pos(p),root=new T.Group();root.position.copy(v);root.userData.click={kind:'pad',index};const base=this.cyl(root,0,.1,0,1.1,.2,'#9a9d7e',1.1,12);const ring=new T.Mesh(new T.RingGeometry(.86,1.07,24),new T.MeshBasicMaterial({color:'#f6d38b',transparent:true,opacity:.7,side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.22;root.add(ring);const beam=this.cyl(root,0,.5,0,.022,.6,palette.gold);g.add(root);this.interact.push(root);return root;});
  this.castle=this.castleModel();this.castle.position.copy(pos({x:1430,y:550}));this.castle.rotation.y=-Math.PI/2;this.castle.userData.click={kind:'castle'};g.add(this.castle);this.interact.push(this.castle);
  for(const z of [-4.8,4.8]){this.box(this.castle,0,1.1,z,9,2.2,.6,palette.stoneDark);for(let x=-4;x<5;x++)this.box(this.castle,x,2.3,z,.6,.4,.7,palette.stone);}
  const entry=pos(D.PATH[0]);for(const dz of [-2.2,2.2]){this.turret(g,entry.x-1,entry.z+dz,2.6,.5);this.banner(g,entry.x-1,2.7,entry.z+dz,'#933e33');}
  this.birds=[];for(let i=0;i<5;i++){const bird=new T.Group();const left=this.box(bird,-.2,0,0,.4,.035,.09,'#2f5157'),right=this.box(bird,.2,0,0,.4,.035,.09,'#2f5157');g.add(bird);this.birds.push({bird,left,right,phase:i*1.4});}
 }
 buildMine(){const g=this.groups.mine,rng=rand(77);this.box(g,0,-.7,0,70,1.4,43,'#655c4b');this.mineLights=[];
  for(let i=0;i<33;i++){const a=i/33*Math.PI*2,x=Math.cos(a)*33,z=Math.sin(a)*20;this.rock(g,x,z,3+rng()*3,'#615e55');}
  for(const p of D.MINERS){const v=pos(p),rock=this.rock(g,v.x,v.z-1,1.7,'#717367');for(let j=0;j<7;j++){const ore=this.mesh(g,this.geo('ico',.3,0),this.mat(j%3===0?'#d7edf1':'#e5bc59',{metalness:.6,roughness:.28,emissive:j%3===0?'#3e7881':'#786024',emissiveIntensity:.5}),v.x+(rng()-.5)*2,.5+rng()*.9,v.z-1+(rng()-.5));ore.scale.y=1.6;}
   const miner=this.human('miner');miner.position.copy(v);miner.position.z+=1.1;miner.scale.setScalar(1.7);g.add(miner);this.minerModels.push(miner);
  }
  for(const [x,z]of [[-18,-8],[0,-11],[18,3],[-7,8]]){for(const dx of [-2,2])this.box(g,x+dx,2,z,.3,4,.3,palette.wood);this.box(g,x,4,z,4.8,.4,.4,palette.wood);this.box(g,x,3.3,z-.2,.2,.8,.2,palette.gold);const l=new T.PointLight('#ffd58c',35,17,1.5);l.position.set(x,3,z);g.add(l);this.mineLights.push(l);}
  for(let i=0;i<28;i++){this.box(g,-15+i*1.1,.12,15,.12,.12,1.2,'#7a644c');}for(const z of [14.6,15.4])this.box(g,0,.23,z,34,.12,.08,palette.steel);this.box(g,12,.7,15,2,1,1.5,palette.wood);for(const x of [11.4,12.6])for(const z of [14.2,15.8]){const wheel=this.cyl(g,x,.3,z,.32,.16,palette.steel);wheel.rotation.x=Math.PI/2;}
 }
 buildTown(){const g=this.groups.town;this.box(g,0,-.7,0,55,1.4,38,'#828271');this.box(g,0,.01,0,54,.08,37,'#b3b19c');for(let i=-6;i<=6;i++)this.box(g,i*4,.08,0,.04,.03,36,'#939b88');for(let i=-4;i<=4;i++)this.box(g,0,.08,i*4,53,.03,.04,'#939b88');
  for(const x of [-25,25]){this.box(g,x,1.5,0,.9,3,36,palette.stone);for(let z=-17;z<=17;z+=2)this.box(g,x,3.2,z,1,.6,1,palette.stone);}
  this.box(g,0,1.5,-17,50,3,.9,palette.stone);for(let x=-24;x<=24;x+=2)this.box(g,x,3.2,-17,1,.6,1,palette.stone);
  for(const x of [-25,-9,9,25]){this.turret(g,x,-17,5.6,1.2);this.banner(g,x,5.9,-17);const guard=this.human();guard.position.set(x,5.8,-17);g.add(guard);}
  for(const x of [-25,25]){this.turret(g,x,14,5.6,1.2);this.banner(g,x,5.9,14);}
  this.townCastle=this.castleModel();this.townCastle.position.set(-10,.15,-6);this.townCastle.scale.setScalar(1.3);this.townCastle.userData.click={kind:'castle'};g.add(this.townCastle);this.interact.push(this.townCastle);
  const lab=new T.Group();this.box(lab,0,1.5,0,5,3,4,palette.stone);this.cyl(lab,0,3.7,0,3,2,'#5e7275',0,4).rotation.y=Math.PI/4;this.cyl(lab,0,5.2,0,.4,2,palette.gold,.1);this.mesh(lab,this.geo('ico',.6,0),this.mat('#9edfe3',{emissive:'#449aaf',emissiveIntensity:.8}),0,6.3,0);this.box(lab,0,1,2.1,1,2,.1,palette.wood);lab.position.set(11,0,-6);g.add(lab);
  this.cyl(g,0,.25,6,2.4,.5,palette.stoneDark,2.4,24);this.cyl(g,0,.5,6,1.9,.15,'#79a4a4',1.9,24);this.cyl(g,0,1,6,.3,1,palette.stone);this.cyl(g,0,1.55,6,1.2,.2,palette.stone,1.2,16);
  this.townPeople=[];for(let i=0;i<5;i++){const p=this.human();p.position.set(-14+i*7,0,10);g.add(p);this.townPeople.push(p);}
 }
 makeTower(type){const g=new T.Group();this.cyl(g,0,.15,0,1,.3,palette.stoneDark,1,10);let turret=new T.Group();g.add(turret);
  if(type==='archer'){for(const x of [-.55,.55])for(const z of [-.55,.55])this.box(g,x,1.4,z,.18,2.5,.18,palette.wood);this.box(g,0,2.6,0,1.65,.2,1.65,palette.wood);for(const z of [-.8,.8])this.box(g,0,2.95,z,1.75,.55,.1,palette.wood);const archer=this.human('archer');archer.position.y=2.75;archer.scale.setScalar(.85);turret.add(archer);g.userData.archer=archer;this.cyl(g,0,4,0,1.35,1.15,palette.roof,0,4).rotation.y=Math.PI/4;}
  else if(type==='ballista'){this.box(g,0,.7,0,1.3,.7,1.3,palette.wood);turret.position.y=1.1;this.box(turret,0,.15,0,.22,.2,2.4,palette.wood);this.box(turret,0,.25,.6,2.7,.12,.12,palette.wood);for(const x of [-1.25,1.25])this.box(turret,x,.25,.35,.08,.08,.55,palette.gold);const crew=this.human();crew.position.set(.7,0,-1);g.add(crew);}
  else if(type==='cannon'){this.box(g,0,.7,0,1.8,.6,1.4,palette.wood);turret.position.y=1.25;const barrel=this.cyl(turret,0,.2,.6,.36,2.2,'#6e826d',.28,12);barrel.rotation.x=Math.PI/2+.25;for(const x of [-1,1]){const wheel=this.cyl(g,x,.75,0,.7,.22,palette.wood,.7,12);wheel.rotation.z=Math.PI/2;}}
  else{this.turret(g,0,0,2.8,.65);const color=type==='frost'?'#a2e4ec':'#cfb3ee';this.mesh(turret,this.geo('ico',.75,0),this.mat(color,{metalness:.35,roughness:.2,emissive:color,emissiveIntensity:.45}),0,3.5,0).scale.y=1.6;for(let i=0;i<3;i++){const ring=new T.Mesh(this.geo('torus',.9,.04,5,24),this.mat(palette.gold));ring.position.y=3.5;ring.rotation.set(i*.7,i*.8,Math.PI/3);turret.add(ring);}}
  this.banner(g,-.8,1.1,-.7,type==='frost'?'#648e9e':palette.cloth);g.userData.turret=turret;return g;
 }
 setScene(mode){this.mode=mode;for(const [name,g]of Object.entries(this.groups))g.visible=name===mode;this.scene.background.set(mode==='mine'?'#273d41':'#95b8bb');this.scene.fog.color.copy(this.scene.background);this.hemi.intensity=mode==='mine'?.8:2.3;this.sun.intensity=mode==='mine'?.5:3.1;this.home();}
 home(){this.camera.position.set(this.mode==='battle'?40:36,this.mode==='battle'?42:34,this.mode==='battle'?48:42);this.controls.target.set(0,0,0);this.controls.update();}
 rotate(){const p=this.camera.position.clone().sub(this.controls.target);p.applyAxisAngle(new T.Vector3(0,1,0),Math.PI/4);this.camera.position.copy(this.controls.target).add(p);this.controls.update();}
 resize(){this.camera.aspect=innerWidth/innerHeight;this.camera.fov=innerWidth<640?55:40;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight,false);}
 quality(value){this.qualityValue=value;this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,value==='high'?1.6:1));this.sun.shadow.mapSize.set(value==='high'?2048:1024,value==='high'?2048:1024);if(this.sun.shadow.map){this.sun.shadow.map.dispose();this.sun.shadow.map=null;}this.resize();}
 selectAt(x,y){const rect=this.canvas.getBoundingClientRect();this.pointer.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);const roots=this.interact.filter(o=>{let p=o;while(p){if(!p.visible)return false;p=p.parent;}return true;});const hits=this.ray.intersectObjects(roots,true);if(!hits.length)return;let o=hits[0].object;while(o&&!o.userData.click)o=o.parent;if(o)this.pick(o.userData.click);}
 minerModel(){
  const g=new T.Group(),torso=new T.Group();torso.position.y=.57;g.add(torso);
  for(const x of [-.16,.16]){this.box(g,x,.35,0,.23,.53,.25,'#384b51');this.box(g,x,.11,.09,.27,.2,.4,'#302e29');this.box(g,x,.37,.145,.16,.18,.04,'#8c7b59');}
  this.cyl(torso,0,.22,0,.29,.57,'#506f77',.33,8);this.box(torso,0,.02,.03,.6,.09,.35,'#46362b');this.box(torso,0,.03,.225,.1,.08,.035,'#caa56d');
  for(const x of [-.19,.19])this.box(torso,x,.26,.267,.055,.45,.025,'#b39a69');
  this.box(torso,0,.26,-.27,.43,.46,.22,'#8b6845');this.box(torso,0,.3,-.4,.3,.08,.03,'#4f4030');
  this.mesh(torso,this.geo('ico',.21,1),this.mat('#c3a07a'),0,.75,.025);this.box(torso,0,.66,.19,.25,.16,.07,'#655145');
  this.cyl(torso,0,.91,0,.255,.16,'#ae873e',.22,10);this.cyl(torso,0,.84,.035,.29,.045,'#d1af62',.29,12);
  this.cyl(torso,0,.91,.245,.065,.07,'#39494a',.065,8).rotation.x=Math.PI/2;
  this.mesh(torso,this.geo('ico',.045,1),this.mat('#fff1b5',{emissive:'#ffe59b',emissiveIntensity:1.8}),0,.91,.29);
  const swing=new T.Group();swing.position.set(0,.46,.07);torso.add(swing);
  for(const x of [-.28,.28]){const arm=this.box(swing,x,-.18,.19,.17,.43,.18,'#506f77');arm.rotation.x=-.7;this.box(swing,x,-.32,.34,.18,.17,.18,'#b69a6d');}
  const tool=new T.Group();tool.position.set(0,-.3,.34);swing.add(tool);this.box(tool,0,0,.23,.07,.075,.95,'#825a38');this.cyl(tool,0,0,.66,.11,.16,'#798e91',.11,8).rotation.x=Math.PI/2;
  for(const sign of [-1,1]){const prong=this.box(tool,sign*.21,-.035,.66,.44,.09,.1,'#a0b6b8');prong.rotation.z=-sign*.28;const tip=this.mesh(tool,this.geo('cone',.065,.24,5),this.mat('#d1dedb'),sign*.46,-.1,.66);tip.rotation.z=sign*Math.PI/2.5;}
  g.userData={miner:true,torso,swing};return g;
 }
 animateHuman(g,phase,working=false){if(g.userData.miner){const p=(phase/(Math.PI*2))%1,{torso,swing}=g.userData;const lift=p<.55?p/.55:p<.72?1-(p-.55)/.17:0;const ease=lift*lift*(3-2*lift);swing.rotation.x=-1.65*ease+.42;torso.rotation.x=.1+(1-ease)*.16;torso.position.y=.57-Math.sin(p*Math.PI)*.035;g.rotation.z=Math.sin(p*Math.PI*2)*.018;return;}const {legs,arm}=g.userData;legs[0].rotation.x=working?0:Math.sin(phase)*.5;legs[1].rotation.x=working?0:-Math.sin(phase)*.5;arm.rotation.x=working?-.9+Math.sin(phase)*.9:Math.sin(phase)*.2;}
 update(dt,selected,type){const s=this.game.s;this.time+=dt;const tm=this.time;
  for(const flag of this.flags)flag.rotation.y=Math.sin(tm*2.5+flag.position.x)*.13;
  this.padMeshes.forEach((o,i)=>{o.visible=!s.towers.some(t=>t.pad===i);o.children[1].material.opacity=.5+Math.sin(tm*2+i)*.15;});
  const ids=new Set(s.towers.map(t=>t.id));for(const [id,o]of this.towers)if(!ids.has(id)){this.groups.battle.remove(o);this.interact=this.interact.filter(x=>x!==o);const removed=new Set();o.traverse(child=>removed.add(child));this.flags=this.flags.filter(f=>!removed.has(f));this.towers.delete(id);}
  for(const tower of s.towers){let model=this.towers.get(tower.id);if(!model){model=this.makeTower(tower.type);model.position.copy(pos(tower));model.userData.click={kind:'tower',id:tower.id};this.groups.battle.add(model);this.interact.push(model);this.towers.set(tower.id,model);}model.scale.y=tower.buildRemaining>0?Math.max(.15,1-tower.buildRemaining/3):1;model.userData.turret.rotation.y=-tower.angle+Math.PI/2;if(model.userData.archer)model.userData.archer.userData.arm.rotation.x=tower.attack>0?-.8+tower.attack:0;if(tower.type==='cannon')model.userData.turret.position.z=tower.attack>0?-.15:0;}
  const live=new Set(s.enemies.map(e=>e.id));for(const [id,o]of this.units)if(!live.has(id)){this.groups.battle.remove(o);this.units.delete(id);}
  for(const e of s.enemies){let model=this.units.get(e.id);if(!model){model=this.human('enemy');model.scale.setScalar(e.kind==='brute'?1.8:e.kind==='heavy'?1.4:1.05);const bar=new T.Group();this.box(bar,0,0,0,1,.09,.03,'#293e3e');const fill=this.box(bar,0,0,.025,.94,.05,.04,'#b6c47f');bar.position.y=1.65;model.add(bar);model.userData.bar=bar;model.userData.fill=fill;this.groups.battle.add(model);this.units.set(e.id,model);}model.position.copy(pos(e));model.rotation.y=-e.angle+Math.PI/2;if(e.frozen<=0)this.animateHuman(model,tm*9+e.id,e.siege>0);const q=this.camera.quaternion.clone();model.userData.bar.quaternion.copy(model.quaternion.clone().invert().multiply(q));model.userData.fill.scale.x=Math.max(0,e.hp/e.max);}
  const shots=new Set(s.shots.map(p=>p.id));for(const [id,o]of this.projectiles)if(!shots.has(id)){this.groups.battle.remove(o);this.projectiles.delete(id);}
  for(const p of s.shots){let o=this.projectiles.get(p.id);if(!o){o=this.mesh(this.groups.battle,this.geo('ico',p.type==='cannon'?.23:.1,0),this.mat(p.type==='frost'?'#a6ecf2':p.type==='storm'?'#d4b0f0':'#e4cf88',{emissive:'#bb9a55',emissiveIntensity:.6}));this.projectiles.set(p.id,o);}const v=pos(p);o.position.set(v.x,1.4,v.z);}
  const activeEffects=new Set(s.effects);for(const [e,o]of this.effects)if(!activeEffects.has(e)){this.groups.battle.remove(o);o.children.forEach(m=>m.material.dispose());this.effects.delete(e);}
  for(const e of s.effects){if(e.type==='ice'||e.type==='lightning')continue;let o=this.effects.get(e);if(!o){o=new T.Group();o.position.copy(pos(e));o.userData.duration=Math.max(.01,e.life);const color=e.type==='ice'?'#afeaff':e.type==='lightning'?'#ffe79a':'#e9ad67';const material=new T.MeshBasicMaterial({color,transparent:true,opacity:.75,side:T.DoubleSide,depthWrite:false});const ring=new T.Mesh(this.geo('ring',.7,1,24),material);ring.rotation.x=-Math.PI/2;ring.position.y=.3;o.add(ring);if(e.type==='lightning'){const beam=new T.Mesh(this.geo('cyl',.06,.06,7,5),material.clone());beam.position.y=3.5;o.add(beam);}this.groups.battle.add(o);this.effects.set(e,o);}const p=1-e.life/o.userData.duration;o.scale.set(1+p*3,1,1+p*3);o.children.forEach(m=>m.material.opacity=Math.max(0,1-p));}
  this.range.visible=this.mode==='battle'&&s.started;const tower=s.towers.find(t=>t.id===selected),range=this.game.stats({type:tower?.type||type}).range*.04;this.range.scale.setScalar(range);if(tower)this.range.position.copy(pos(tower)).y=.2;else this.range.visible=false;
  this.minerModels.forEach((m,i)=>{m.visible=i<Math.min(7,s.miners);this.animateHuman(m,tm*3.8+i*1.4,true);m.rotation.y=Math.PI;});
  while(this.workerModels.length<Math.min(7,s.population)){const m=this.human('wood');this.groups.battle.add(m);this.workerModels.push(m);}this.workerModels.forEach((m,i)=>{const w=s.workers[i];m.visible=!!w;if(w){m.position.copy(pos(w));const tree=this.treeSites[w.target];if(tree)m.rotation.y=-Math.atan2(tree.y-w.y,tree.x-w.x)+Math.PI/2;this.animateHuman(m,tm*7+i,w.phase!=='walk');}});
  this.birds.forEach(({bird,left,right,phase})=>{const a=tm*.1+phase;bird.position.set(Math.cos(a)*24,10+Math.sin(a*2),Math.sin(a)*15);bird.rotation.y=-a;left.rotation.z=Math.sin(tm*4+phase)*.35;right.rotation.z=-left.rotation.z;});
  this.townPeople.forEach((m,i)=>{m.position.x=-14+i*7+Math.sin(tm*.2+i)*2;this.animateHuman(m,tm*4+i);});
  const newEra=this.game.era;if(this.lastEra!==undefined&&newEra>this.lastEra)this.glowUntil=tm+2.5;this.lastEra=newEra;for(const castle of [this.castle,this.townCastle])castle.scale.y=1+(s.castle-1)*.018;
  if(this.glowUntil>tm){const strength=Math.sin((this.glowUntil-tm)/2.5*Math.PI);this.sun.color.setRGB(1,1-strength*.15,.82-strength*.2);}else this.sun.color.set('#fff1d0');
  this.weather.update(dt);this.controls.update(dt);this.renderer.render(this.scene,this.camera);
 }
}
