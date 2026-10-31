(() => {
 const canvas=document.getElementById('titleTravelers'),screen=document.getElementById('titleScreen'),ctx=canvas.getContext('2d'),sheet=new Image();
 const horse=new Image();
 // Blend adjacent poses in a shared offscreen canvas. Additive compositing
 // combines their premultiplied alpha without fading the whole character out.
 const blend=document.createElement('canvas');blend.width=256;blend.height=256;
 const bctx=blend.getContext('2d');
 const road=[[1660,660],[1510,605],[1370,550],[1265,510],[1230,490],[1260,468],[1300,450]];
 const lengths=road.slice(1).map((point,i)=>Math.hypot(point[0]-road[i][0],point[1]-road[i][1])),total=lengths.reduce((a,b)=>a+b,0);
 let people=[],next=0,last=0;
 function loadWalkers(){sheet.src='assets/title-walk-frames-packed.webp';horse.src='assets/title-horse-walk-packed.webp';}
 if('requestIdleCallback' in window)requestIdleCallback(loadWalkers,{timeout:2500});else setTimeout(loadWalkers,1500);
 function position(progress){let distance=Math.min(1,progress)*total,i=0;while(i<lengths.length-1&&distance>lengths[i])distance-=lengths[i++];const f=distance/lengths[i];return [road[i][0]+(road[i+1][0]-road[i][0])*f,road[i][1]+(road[i+1][1]-road[i][1])*f];}
 function frame(now){
  requestAnimationFrame(frame);
  if(document.hidden||document.body.dataset.mode!=='title'||matchMedia('(prefers-reduced-motion: reduce)').matches){last=0;return;}
  const dt=last?Math.min((now-last)/1000,.1):0;last=now;
  const w=screen.clientWidth,h=screen.clientHeight,dpr=Math.min(devicePixelRatio||1,1.5);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  next-=dt;if(next<=0&&people.length<5){people.push({kind:Math.floor(Math.random()*4),p:0,speed:.021+Math.random()*.004,offset:(Math.random()-.5)*8,phase:Math.random()*4,pace:2.8+Math.random()*.4});next=6+Math.random()*6;}
  const scale=Math.max(w/1672,h/941),ox=(w-1672*scale)*.66,oy=(h-941*scale)*(w<=700?.28:.44);
  people=people.filter(person=>person.p<1);
  for(const person of people){person.p+=dt*person.speed;person.phase=(person.phase+dt*person.pace)%4;const [x,y]=position(person.p),step=person.phase*Math.PI/2,frameIndex=Math.floor(person.phase),fraction=person.phase-frameIndex,art=person.kind===2?horse:sheet,sw=art.width/(person.kind===2?2:4),sh=art.height/(person.kind===2?2:4);
   const height=(36-person.p*14)*scale,width=height*(person.kind===2?1.65:1.02);
   ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,person.p*15,(1-person.p)*15));ctx.translate(ox+x*scale,oy+(y+person.offset)*scale+Math.sin(step*2)*.35*scale);ctx.rotate(Math.sin(step)*.008);
   if(art.complete&&art.naturalWidth){
    // Keep most of each pose crisp, then ease briefly into the next one.
    const mix=Math.max(0,Math.min(1,(fraction-.65)/.35));const eased=mix*mix*(3-2*mix);
    bctx.clearRect(0,0,256,256);bctx.globalCompositeOperation='source-over';
    for(const [index,alpha] of [[frameIndex,1-eased],[(frameIndex+1)%4,eased]]){
     if(alpha<=0)continue;bctx.globalAlpha=alpha;
     const sx=(person.kind===2?index%2:index)*sw,sy=(person.kind===2?Math.floor(index/2):person.kind)*sh;
     bctx.drawImage(art,sx,sy,sw,sh,0,0,256,256);bctx.globalCompositeOperation='lighter';
    }
    bctx.globalAlpha=1;bctx.globalCompositeOperation='source-over';ctx.drawImage(blend,-width/2,-height,width,height);
   }ctx.restore();
  }
 }
 sheet.onload=()=>requestAnimationFrame(frame);
})();
