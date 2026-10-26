/* One transition policy for every pair of locations; snapshots contain visuals only. */
(() => {
'use strict';
function style(settings){return settings.reducedMotion?'none':settings.transition==='slide'?'slide':'fade';}
class SceneTransition {
 constructor(overlay,world){this.overlay=overlay;this.world=world;this.animation=null;this.sequence=0;}
 run(mode,commit,complete=()=>{}){
  const token=++this.sequence;if(this.animation)this.animation.cancel();this.animation=null;
  this.overlay.replaceChildren();this.overlay.className='';
  if(mode==='none'){commit();complete();return;}
  const snapshot=document.createElement('canvas');snapshot.width=this.world.width;snapshot.height=this.world.height;
  const ctx=snapshot.getContext('2d');if(!ctx){commit();complete();return;}ctx.drawImage(this.world,0,0);
  this.overlay.replaceChildren(snapshot);this.overlay.className='scene-snapshot';commit();
  const frames=mode==='slide'?[{transform:'translateX(0)',opacity:1},{transform:'translateX(-100%)',opacity:1}]:[{opacity:1},{opacity:0}];
  const finish=()=>{if(token!==this.sequence)return;if(this.animation)this.animation.cancel();this.animation=null;this.overlay.replaceChildren();this.overlay.className='';complete();};
  if(!this.overlay.animate){finish();return;}
  this.animation=this.overlay.animate(frames,{duration:mode==='slide'?360:300,easing:'cubic-bezier(.22,.61,.36,1)',fill:'forwards'});
  this.animation.finished.then(finish,()=>{});
 }
}
window.SceneTransition=SceneTransition;window.sceneTransitionStyle=style;
})();
