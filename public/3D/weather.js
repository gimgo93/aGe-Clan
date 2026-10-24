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
  this.snowData=new Float32Array(1000*3);for(let i=0;i<1000;i++){this.snowData[i*3]=(Math.random()-.5)*74;this.snowData[i*3+1]=Math.random()*26;this.snowData[i*3+2]=(Math.random()-.5)*48;}
  this.snowGeometry=new T.BufferGeometry();this.snowGeometry.setAttribute('position',new T.BufferAttribute(this.snowData,3));
  this.snowMaterial=new T.PointsMaterial({color:'#effbff',size:.32,map:this.texture,transparent:true,opacity:0,depthWrite:false,sizeAttenuation:true});
  this.flakes=new T.Points(this.snowGeometry,this.snowMaterial);this.flakes.frustumCulled=false;this.flakes.visible=false;this.root.add(this.flakes);
  this.coverMaterial=new T.MeshStandardMaterial({color:'#f0f7fc',roughness:1,transparent:true,opacity:0,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
  this.coverMaterial.onBeforeCompile=shader=>{shader.vertexShader='varying float snowUp;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsnowUp=normalize(mat3(modelMatrix)*normal).y;');shader.fragmentShader='varying float snowUp;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(snowUp<0.38)discard;');};
  this.covers=[];
  for(const [name,g] of Object.entries(world.groups)){
   const cover=new T.Group();cover.visible=false;
   const ground=new T.Mesh(new T.PlaneGeometry(name==='battle'?73:name==='mine'?68:54,name==='battle'?46:name==='mine'?41:37),this.coverMaterial);ground.rotation.x=-Math.PI/2;ground.position.y=.24;ground.receiveShadow=true;cover.add(ground);
   // Snow rests on the existing roofs, rocks and foliage as well as the ground.
   const caps=[];g.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh){o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;if(b&&b.max.y-b.min.y>.3&&b.max.x-b.min.x>.6&&b.max.x-b.min.x<10)caps.push(o);}});
   g.updateMatrixWorld(true);
   for(const o of caps.slice(0,140)){const cap=new T.Mesh(o.geometry,this.coverMaterial);cap.matrix.copy(o.matrixWorld);cap.matrix.premultiply(new T.Matrix4().makeTranslation(0,.025,0));cap.matrixAutoUpdate=false;cover.add(cap);}
   // Reuse the foliage instance transforms rather than creating a mesh per tree.
   if(name==='battle')for(const o of [...g.children].filter(o=>o.isInstancedMesh&&o.geometry.type==='ConeGeometry')){const cap=new T.InstancedMesh(o.geometry,this.coverMaterial,o.count),matrix=new T.Matrix4();for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);matrix.premultiply(new T.Matrix4().makeTranslation(0,.025,0));cap.setMatrixAt(i,matrix);}cover.add(cap);}
   g.add(cover);this.covers.push(cover);
  }
  this.flash=new T.PointLight('#d8e9ff',0,110,1);this.flash.position.set(0,16,0);this.root.add(this.flash);
 }
 clearBolts(){for(const g of this.bolts){this.root.remove(g);g.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});}this.bolts=[];}
 reset(){this.snowAge=Infinity;this.thunderAge=Infinity;this.clearBolts();this.flakes.visible=false;this.covers.forEach(o=>o.visible=false);this.flash.intensity=0;}
 thunder(targets){
  this.clearBolts();this.thunderAge=0;
  for(const target of targets){const end=point(target),vertices=[];for(let j=0;j<=12;j++)vertices.push(new T.Vector3(end.x+(j===12?0:(Math.random()-.5)*2),17-j*16.4/12,end.z+(j===12?0:(Math.random()-.5)*1.2)));
   const group=new T.Group(),curve=new T.CatmullRomCurve3(vertices, false,'catmullrom',.05);
   for(const [radius,color,opacity] of [[.13,'#6389ff',.35],[.045,'#f3fbff',1]]){const m=new T.Mesh(new T.TubeGeometry(curve,36,radius,4,false),new T.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false}));m.userData.alpha=opacity;group.add(m);}
   const branch=new T.BufferGeometry().setFromPoints([vertices[4],vertices[4].clone().add(new T.Vector3(1.8,-1.3,.3)),vertices[4].clone().add(new T.Vector3(.8,-3,.6))]);const line=new T.Line(branch,new T.LineBasicMaterial({color:'#dbeaff',transparent:true,opacity:.8}));line.userData.alpha=.8;group.add(line);
   const ring=new T.Mesh(new T.RingGeometry(.35,.65,24),new T.MeshBasicMaterial({color:'#bddaff',transparent:true,opacity:.9,side:T.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.set(end.x,.3,end.z);ring.userData.alpha=.9;group.add(ring);group.userData.ring=ring;group.visible=false;this.root.add(group);this.bolts.push(group);
  }
 }
 frost(){this.snowAge=0;}
 update(dt){
  this.snowAge+=dt;this.thunderAge+=dt;
  const a=this.snowAge,snow=a<4?clamp(a/1.6):a<5?1:clamp(1-(a-5)/2),blizzard=a<4?Math.min(1,a*4, (4-a)*3):0;
  this.coverMaterial.opacity=snow*.92;this.covers.forEach(o=>o.visible=snow>0);
  this.flakes.visible=blizzard>0;this.snowMaterial.opacity=blizzard*.9;
  if(blizzard>0){const count=this.world.qualityValue==='low'?450:1000;this.snowGeometry.setDrawRange(0,count);for(let i=0;i<count;i++){const j=i*3;this.snowData[j]+=dt*(this.reduced?2:8+Math.sin(a*3+i)*3);this.snowData[j+1]-=dt*(5+i%5);this.snowData[j+2]+=dt*Math.sin(a*2+i)*2;if(this.snowData[j]>37)this.snowData[j]=-37;if(this.snowData[j+1]<.3)this.snowData[j+1]=26;}this.snowGeometry.attributes.position.needsUpdate=true;}
  const t=this.thunderAge,dark=t<.24?t/.24:t<.8?1:clamp(1-(t-.8)/.9),strike=t>=.24&&t<.85,alpha=strike?clamp(1-(t-.32)/.53):0;
  for(const g of this.bolts){g.visible=strike&&this.world.mode==='battle';g.traverse(o=>{if(o.material)o.material.opacity=o.userData.alpha*alpha;});g.userData.ring.scale.setScalar(1+Math.max(0,t-.24)*5);}
  if(t>=1.7&&this.bolts.length)this.clearBolts();
  this.flash.intensity=this.reduced?0:strike?Math.max(0,1-(t-.24)/.25)*55:0;
  const mine=this.world.mode==='mine',bg=new T.Color(mine?'#273d41':'#95b8bb');bg.lerp(new T.Color('#101c35'),dark*.88);bg.lerp(new T.Color('#b4cbd6'),blizzard*.35);this.world.scene.background.copy(bg);this.world.scene.fog.color.copy(bg);
  this.world.hemi.intensity=(mine?.8:2.3)*(1-dark*.78);this.world.sun.intensity=(mine?.5:3.1)*(1-dark*.9)*(1-blizzard*.3);
 }
}
