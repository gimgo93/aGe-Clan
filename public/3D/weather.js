import * as T from 'three';
const clamp=x=>Math.max(0,Math.min(1,x));
const point=p=>new T.Vector3((p.x-800)*.04,.6,(p.y-440)*.04);

// One reusable snow field; transient lightning geometry is disposed after every cast.
export class FrontierWeather {
 constructor(world){
  this.world=world;this.snowAge=Infinity;this.thunderAge=Infinity;this.bolts=[];
  this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.root=new T.Group();world.scene.add(this.root);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
  const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(16,16,0,16,16,16);
  gradient.addColorStop(0,'#fff');gradient.addColorStop(.3,'#fff');gradient.addColorStop(1,'#ffffff00');ctx.fillStyle=gradient;ctx.fillRect(0,0,32,32);
  this.texture=new T.CanvasTexture(canvas);
  this.snowData=new Float32Array(1800*3);for(let i=0;i<1800;i++){this.snowData[i*3]=(Math.random()-.5)*74;this.snowData[i*3+1]=Math.random()*26;this.snowData[i*3+2]=(Math.random()-.5)*48;}
  this.snowGeometry=new T.BufferGeometry();this.snowGeometry.setAttribute('position',new T.BufferAttribute(this.snowData,3));
  this.snowMaterial=new T.PointsMaterial({color:'#effbff',size:.38,map:this.texture,transparent:true,opacity:0,depthWrite:false,sizeAttenuation:true});
  this.flakes=new T.Points(this.snowGeometry,this.snowMaterial);this.flakes.frustumCulled=false;this.flakes.visible=false;this.root.add(this.flakes);
  this.coverMaterial=new T.MeshStandardMaterial({color:'#f0f7fc',roughness:1,transparent:true,opacity:0,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
  this.streakData=new Float32Array(220*6);this.streakGeometry=new T.BufferGeometry();this.streakGeometry.setAttribute('position',new T.BufferAttribute(this.streakData,3));
  this.streakMaterial=new T.LineBasicMaterial({color:'#e7f7ff',transparent:true,opacity:0,depthWrite:false});this.streaks=new T.LineSegments(this.streakGeometry,this.streakMaterial);this.streaks.frustumCulled=false;this.streaks.visible=false;this.root.add(this.streaks);
  this.treeMaterial=this.coverMaterial.clone();
  this.treeMaterial.onBeforeCompile=shader=>{shader.vertexShader='varying vec3 snowLocal;\nvarying vec3 snowWorld;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsnowLocal=position;\nvec4 snowP=vec4(position,1.0);\n#ifdef USE_INSTANCING\nsnowP=instanceMatrix*snowP;\n#endif\nsnowWorld=(modelMatrix*snowP).xyz;');shader.fragmentShader='varying vec3 snowLocal;\nvarying vec3 snowWorld;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nfloat edge=0.18+sin(snowWorld.x*6.0+snowWorld.z*4.0)*0.10;\nif(snowLocal.y<edge)discard;');};
  this.pileGeometry=new T.SphereGeometry(1,12,6,0,Math.PI*2,0,Math.PI/2);
  this.covers=[];
  for(const [name,g] of Object.entries(world.groups)){
   const cover=new T.Group();cover.visible=false;
   const piles=new T.InstancedMesh(this.pileGeometry,this.coverMaterial,150);piles.receiveShadow=true;cover.add(piles);const treeCaps=[];
   if(name==='battle')for(const source of [...g.children].filter(o=>o.isInstancedMesh&&o.geometry.type==='ConeGeometry')){const cap=new T.InstancedMesh(source.geometry,this.treeMaterial,source.count);cover.add(cap);treeCaps.push({source,cap});}
   cover.userData={name,piles,treeCaps};
   g.add(cover);this.covers.push(cover);
  }
  this.flash=new T.PointLight('#d8e9ff',0,110,1);this.flash.position.set(0,16,0);this.root.add(this.flash);
 }
 populateSnow(){
  const dummy=new T.Object3D(),matrix=new T.Matrix4(),shift=new T.Matrix4().makeTranslation(0,.035,0);
  for(const cover of this.covers){const {name,piles,treeCaps}=cover.userData;let n=0;const w=name==='battle'?69:name==='mine'?61:49,h=name==='battle'?41:name==='mine'?35:32;
   const addPile=(x,z,r)=>{if(n>=150)return;dummy.position.set(x,.12,z);dummy.rotation.set(0,Math.random()*Math.PI,0);dummy.scale.set(r,.045+Math.random()*.12,r*(.55+Math.random()*.45));dummy.updateMatrix();piles.setMatrixAt(n++,dummy.matrix);};
   // Isolated soft drifts leave most of the terrain exposed.
   for(let i=0;i<12;i++){const x=(Math.random()-.5)*(w-6),z=(Math.random()-.5)*(h-6);for(let j=0;j<4;j++){const a=Math.random()*Math.PI*2,d=Math.random()*2.4;addPile(x+Math.cos(a)*d,z+Math.sin(a)*d,.55+Math.random()*1.1);}}
   if(name==='battle')for(const tree of this.world.treeSites){if(Math.random()<.37){const v=point(tree);addPile(v.x+.4,v.z,.65+Math.random()*.5);if(Math.random()<.5)addPile(v.x-.55,v.z+.3,.5);}}
   piles.count=n;piles.instanceMatrix.needsUpdate=true;piles.computeBoundingSphere();
   const chosen=new Set();if(treeCaps.length)for(let i=0;i<treeCaps[0].source.count;i++)if(Math.random()<.55)chosen.add(i);
   treeCaps.forEach(({source,cap},level)=>{let count=0;for(const i of chosen){if(level===0&&Math.random()>.24)continue;if(level===1&&Math.random()>.5)continue;source.getMatrixAt(i,matrix);matrix.premultiply(shift);cap.setMatrixAt(count++,matrix);}cap.count=count;cap.instanceMatrix.needsUpdate=true;cap.computeBoundingSphere();});
  }
 }
 clearBolts(){for(const g of this.bolts){this.root.remove(g);g.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});}this.bolts=[];}
 reset(){this.snowAge=Infinity;this.thunderAge=Infinity;this.clearBolts();this.flakes.visible=false;this.streaks.visible=false;this.covers.forEach(o=>o.visible=false);this.flash.intensity=0;}
 chargeThunder(){this.clearBolts();this.thunderAge=0;}
 thunder(targets){
  this.clearBolts();this.thunderAge=1;
  for(const target of targets){const end=point(target),vertices=[];for(let j=0;j<=12;j++)vertices.push(new T.Vector3(end.x+(j===12?0:(Math.random()-.5)*2),17-j*16.4/12,end.z+(j===12?0:(Math.random()-.5)*1.2)));
   const group=new T.Group(),curve=new T.CatmullRomCurve3(vertices, false,'catmullrom',.05);
   for(const [radius,color,opacity] of [[.13,'#6389ff',.35],[.045,'#f3fbff',1]]){const m=new T.Mesh(new T.TubeGeometry(curve,36,radius,4,false),new T.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false}));m.userData.alpha=opacity;group.add(m);}
   const branch=new T.BufferGeometry().setFromPoints([vertices[4],vertices[4].clone().add(new T.Vector3(1.8,-1.3,.3)),vertices[4].clone().add(new T.Vector3(.8,-3,.6))]);const line=new T.Line(branch,new T.LineBasicMaterial({color:'#dbeaff',transparent:true,opacity:.8}));line.userData.alpha=.8;group.add(line);
   const ring=new T.Mesh(new T.RingGeometry(.35,.65,24),new T.MeshBasicMaterial({color:'#bddaff',transparent:true,opacity:.9,side:T.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.set(end.x,.3,end.z);ring.userData.alpha=.9;group.add(ring);group.userData.ring=ring;group.visible=false;this.root.add(group);this.bolts.push(group);
  }
 }
 frost(){this.populateSnow();this.snowAge=0;}
 update(dt){
  this.snowAge+=dt;this.thunderAge+=dt;
  const a=this.snowAge,snow=a<4?clamp(a/1.6):a<5?1:clamp(1-(a-5)/2),blizzard=a<4?Math.min(1,a*4, (4-a)*3):0;
  this.coverMaterial.opacity=snow*.94;this.treeMaterial.opacity=snow*.94;this.covers.forEach(o=>o.visible=snow>0);
  this.flakes.visible=blizzard>0;this.streaks.visible=blizzard>0&&!this.reduced;this.snowMaterial.opacity=blizzard*.98;this.streakMaterial.opacity=blizzard*.3;
  if(blizzard>0){const count=this.world.qualityValue==='low'?750:1800,gust=1+Math.sin(a*4)*.35;this.snowGeometry.setDrawRange(0,count);for(let i=0;i<count;i++){const j=i*3,x=this.snowData[j],z=this.snowData[j+2],vortex=Math.sin(x*.12+z*.15+a*5+i%11);this.snowData[j]+=dt*(this.reduced?3:17*gust+vortex*10);this.snowData[j+1]-=dt*(7+i%7);this.snowData[j+2]+=dt*(this.reduced?1:Math.cos(x*.15-z*.09+a*4)*12+5);if(this.snowData[j]>37)this.snowData[j]-=74;if(this.snowData[j]<-37)this.snowData[j]+=74;if(this.snowData[j+2]>24)this.snowData[j+2]-=48;if(this.snowData[j+2]<-24)this.snowData[j+2]+=48;if(this.snowData[j+1]<.3)this.snowData[j+1]=26;if(i<220){const k=i*6;this.streakData[k]=this.snowData[j];this.streakData[k+1]=this.snowData[j+1];this.streakData[k+2]=this.snowData[j+2];this.streakData[k+3]=this.snowData[j]-.85*gust;this.streakData[k+4]=this.snowData[j+1]+.45;this.streakData[k+5]=this.snowData[j+2]-.25-vortex*.35;}}this.snowGeometry.attributes.position.needsUpdate=true;this.streakGeometry.setDrawRange(0,this.world.qualityValue==='low'?160:440);this.streakGeometry.attributes.position.needsUpdate=true;}
  const t=this.thunderAge,dark=t<1?clamp(t/.3):t<1.55?1:clamp(1-(t-1.55)/.9),strike=t>=1&&t<1.61,alpha=strike?clamp(1-(t-1.08)/.53):0;
  for(const g of this.bolts){g.visible=strike&&this.world.mode==='battle';g.traverse(o=>{if(o.material)o.material.opacity=o.userData.alpha*alpha;});g.userData.ring.scale.setScalar(1+Math.max(0,t-1)*5);}
  if(t>=2.45&&this.bolts.length)this.clearBolts();
  this.flash.intensity=this.reduced?0:strike?Math.max(0,1-(t-1)/.25)*55:0;
  const mine=this.world.mode==='mine',bg=new T.Color(mine?'#273d41':'#95b8bb');bg.lerp(new T.Color('#101c35'),dark*.88);bg.lerp(new T.Color('#b4cbd6'),blizzard*.35);this.world.scene.background.copy(bg);this.world.scene.fog.color.copy(bg);
  this.world.hemi.intensity=(mine?.8:2.3)*(1-dark*.78);this.world.sun.intensity=(mine?.5:3.1)*(1-dark*.9)*(1-blizzard*.3);
 }
}
