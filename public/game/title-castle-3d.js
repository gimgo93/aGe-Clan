import * as THREE from '../../3D/vendor/three.module.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';

const viewport=document.getElementById('castle3d'),title=document.getElementById('titleScreen'),background=title.querySelector('.title-landscape');
let renderer,scene,camera,castle,frame=0,active=false,dragging=false,pointer=null,lastX=0,yaw=0,lastTime=0;
const originalBackground=background.src;
function stop(){active=false;if(frame)cancelAnimationFrame(frame);frame=0;lastTime=0;}
function start(){if(active||document.hidden||document.body.dataset.mode!=='title'||!castle)return;active=true;frame=requestAnimationFrame(draw);}
function resize(){if(!renderer)return;const width=viewport.clientWidth,height=viewport.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();if(castle)start();}
function draw(now){if(!active)return;const dt=Math.min(.05,(now-(lastTime||now))/1000);lastTime=now;if(!dragging)yaw+=(0-yaw)*(1-Math.exp(-2.3*dt));castle.rotation.y=yaw;renderer.render(scene,camera);if(!dragging&&Math.abs(yaw)<.0005){yaw=0;stop();return;}frame=requestAnimationFrame(draw);}
function release(e){if(pointer!==e.pointerId)return;dragging=false;pointer=null;viewport.classList.remove('dragging');if(matchMedia('(prefers-reduced-motion: reduce)').matches||document.body.classList.contains('reduce-motion'))yaw=0;start();}
try{
 renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0x000000,0);renderer.domElement.setAttribute('aria-hidden','true');viewport.prepend(renderer.domElement);
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(34,1,.1,500);camera.position.set(64,54,91);camera.lookAt(0,12,0);
 scene.add(new THREE.HemisphereLight(0xdce5dc,0x3c392b,2));const sun=new THREE.DirectionalLight(0xffdda6,2.5);sun.position.set(60,100,65);scene.add(sun);
 new GLTFLoader().load('assets/castle-with-keep-cc0.glb',gltf=>{
  castle=new THREE.Group();const model=gltf.scene,box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3());model.position.set(-center.x,-box.min.y,-center.z);castle.add(model);
  const roofMaterial=new THREE.MeshStandardMaterial({color:0x4b3427,roughness:1});for(const x of [-20.8,20.8])for(const z of [-20.8,20.8]){const roof=new THREE.Mesh(new THREE.ConeGeometry(5.3,4,8),roofMaterial);roof.position.set(x,15,z);roof.rotation.y=Math.PI/8;castle.add(roof);}scene.add(castle);
  const mountain=new Image();mountain.onload=()=>{background.src=mountain.src;viewport.classList.add('ready');resize();start();};mountain.onerror=()=>{viewport.classList.add('ready');resize();start();};mountain.src='assets/title-mountains-3d.webp';
 },undefined,()=>{viewport.hidden=true;background.src=originalBackground;});
 viewport.addEventListener('pointerdown',e=>{if(!castle||e.button!==0)return;dragging=true;pointer=e.pointerId;lastX=e.clientX;viewport.setPointerCapture(e.pointerId);viewport.classList.add('dragging');start();});
 viewport.addEventListener('pointermove',e=>{if(!dragging||pointer!==e.pointerId)return;yaw+=(e.clientX-lastX)*.018;lastX=e.clientX;});
 viewport.addEventListener('pointerup',release);viewport.addEventListener('pointercancel',release);viewport.addEventListener('lostpointercapture',()=>{dragging=false;pointer=null;viewport.classList.remove('dragging');});
 viewport.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();yaw+=e.key==='ArrowLeft'?.5:-.5;start();}else if(e.key==='Home'){e.preventDefault();yaw=0;start();}});
 new ResizeObserver(resize).observe(viewport);document.addEventListener('visibilitychange',()=>document.hidden?stop():start());new MutationObserver(()=>document.body.dataset.mode==='title'?start():stop()).observe(document.body,{attributes:true,attributeFilter:['data-mode']});resize();
}catch(error){viewport.hidden=true;console.warn('3D castle unavailable; using title image.',error);}
