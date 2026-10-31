(() => {
 const canvas=document.getElementById('titleTravelers'),screen=document.getElementById('titleScreen'),ctx=canvas.getContext('2d'),sheet=new Image();
 const horse=new Image(),rigs=[new Image(),new Image(),new Image(),new Image()];
 const humanParts=[
  {head:[110,110,295,315],body:[595,18,430,500],armBack:[1200,35,190,472],armFront:[195,525,190,454],legBack:[545,542,275,447],legFront:[1145,542,300,435]},
  {head:[185,75,255,325],body:[608,48,315,432],armBack:[1134,37,220,466],armFront:[185,516,210,470],legBack:[585,511,305,478],legFront:[1150,516,240,470]},
  null,
  {head:[155,72,280,340],body:[630,45,310,500],armBack:[1185,108,190,425],armFront:[190,565,180,390],legBack:[595,560,270,410],legFront:[1175,560,260,410]}
 ];
 const horseParts={head:[52,18,448,405],body:[525,36,595,465],frontBack:[1195,0,190,490],frontFront:[165,503,175,495],rearBack:[667,495,205,505],rearFront:[1165,495,210,505]};
 function rigPart(rig,parts,name,x,y,w,h,angle=0,pivot=.5){const [sx,sy,sw,sh]=parts[name];ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.drawImage(rig,sx,sy,sw,sh,-w*pivot,0,w,h);ctx.restore();}
 function drawHuman(rig,parts,height,step,turn){
  ctx.save();ctx.scale(height/205,height/205);ctx.translate(0,-205);const swing=Math.sin(step),bob=Math.sin(step*2);
  rigPart(rig,parts,'legBack',7,105,53,100,-swing*.30,.52);rigPart(rig,parts,'armBack',14,52,38,80,swing*.26);
  ctx.save();ctx.translate(0,90);ctx.rotate(swing*.025);rigPart(rig,parts,'body',0,-45,86,92);rigPart(rig,parts,'head',-7,-89,57,58,Math.sin(step+.5)*.035+turn*.16);rigPart(rig,parts,'armFront',-5,-39,42,83,-swing*.26);ctx.restore();
  rigPart(rig,parts,'legFront',-10,105,53,100,swing*.30,.52);ctx.restore();
 }
 function drawHorse(height,step,turn){
  const rig=rigs[2],swing=Math.sin(step),p=horseParts;ctx.save();ctx.scale(height/205,height/205);ctx.translate(0,-205);
  rigPart(rig,p,'frontBack',-36,117,35,90,-swing*.24);rigPart(rig,p,'rearBack',43,117,38,90,swing*.24);
  ctx.save();ctx.translate(5,105);ctx.rotate(swing*.016);rigPart(rig,p,'body',0,-55,150,100);rigPart(rig,p,'head',-76,-74,90,80,Math.sin(step+.4)*.045+turn*.10);ctx.restore();
  rigPart(rig,p,'frontFront',-42,117,35,90,swing*.24);rigPart(rig,p,'rearFront',47,117,38,90,-swing*.24);ctx.restore();
  // The handler walks just ahead of the horse and uses the same jointed rig.
  if(rigs[0].complete&&rigs[0].naturalWidth){ctx.save();ctx.translate(-height*.67,0);drawHuman(rigs[0],humanParts[0],height*.84,step+.25,turn);ctx.restore();}
 }
 // Prepare intermediate poses in small batches, instead of compositing large
 // images for every person on every animation frame.
 const poseCount=64,poseSize=96,poses=[[],[],[],[]];
 function preparePoses(art,kinds){
  let job=0;const count=kinds.length*poseCount;
  function batch(){
   const end=Math.min(job+8,count);
   for(;job<end;job++){
    const kind=kinds[Math.floor(job/poseCount)],n=job%poseCount,phase=n*4/poseCount,index=Math.floor(phase),mix=phase-index;
    const nextIndex=(index+1)%4,sw=art.naturalWidth/(kind===2?2:4),sh=art.naturalHeight/(kind===2?2:4);
    const output=document.createElement('canvas');output.width=output.height=poseSize;const out=output.getContext('2d');
    for(const [frame,alpha] of [[index,1-mix],[nextIndex,mix]]){
     if(alpha<=0)continue;out.globalAlpha=alpha;
     const sx=(kind===2?frame%2:frame)*sw,sy=(kind===2?Math.floor(frame/2):kind)*sh;
     out.drawImage(art,sx,sy,sw,sh,0,0,poseSize,poseSize);out.globalCompositeOperation='lighter';
    }
    poses[kind][n]=output;
   }
   if(job<count)setTimeout(batch,0);
  }
  batch();
 }
 const road=[[1710,718],[1510,628],[1370,565],[1270,521],[1240,500],[1250,481],[1295,461],[1300,425],[1300,405]];
 const lengths=road.slice(1).map((point,i)=>Math.hypot(point[0]-road[i][0],point[1]-road[i][1])),total=lengths.reduce((a,b)=>a+b,0);
 let people=[],next=0,last=0;
 function loadWalkers(){sheet.src='assets/title-walk-frames-packed.webp';horse.src='assets/title-horse-walk-packed.webp';['traveler','farmer','horse','guard'].forEach((name,i)=>{rigs[i].src='assets/title-rig-'+name+'.webp';});}
 if('requestIdleCallback' in window)requestIdleCallback(loadWalkers,{timeout:2500});else setTimeout(loadWalkers,1500);
 function position(progress){let distance=Math.max(0,Math.min(1,progress))*total,i=0;while(i<lengths.length-1&&distance>lengths[i])distance-=lengths[i++];const f=distance/lengths[i];return [road[i][0]+(road[i+1][0]-road[i][0])*f,road[i][1]+(road[i+1][1]-road[i][1])*f];}
 function frame(now){
  requestAnimationFrame(frame);
  if(document.hidden||document.body.dataset.mode!=='title'||matchMedia('(prefers-reduced-motion: reduce)').matches){last=0;return;}
  const dt=last?Math.min((now-last)/1000,.1):0;last=now;
  const w=screen.clientWidth,h=screen.clientHeight,dpr=Math.min(devicePixelRatio||1,1.5);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  next-=dt;if(next<=0&&people.length<5){
   const pair=people.length<=3&&Math.random()<.35,speed=.021+Math.random()*.004;
   for(let i=0;i<(pair?2:1);i++)people.push({kind:pair?[0,1,3][Math.floor(Math.random()*3)]:Math.floor(Math.random()*4),p:0,speed,offset:pair?(i===0?-7:7):0,phase:Math.random()*4,pace:2.8+Math.random()*.4});
   next=4+Math.random()*9;
  }
  const scale=Math.max(w/1672,h/941),ox=(w-1672*scale)*.66,oy=(h-941*scale)*(w<=700?.28:.44);
  people=people.filter(person=>person.p<1);
  for(const person of people){person.p+=dt*person.speed;person.phase=(person.phase+dt*person.pace)%4;const [x,y]=position(person.p),step=person.phase*Math.PI/2,frameIndex=Math.floor(person.phase),art=person.kind===2?horse:sheet,sw=art.naturalWidth/(person.kind===2?2:4),sh=art.naturalHeight/(person.kind===2?2:4),pose=poses[person.kind][Math.floor(person.phase*poseCount/4)];
   const height=(36-person.p*14)*scale,width=height*(person.kind===2?1.65:1.02);
   const before=position(person.p-.025),after=position(person.p+.025),turn=Math.atan2(after[1]-before[1],after[0]-before[0]);
   const facing=Math.atan2(Math.sin(turn+2.72),Math.cos(turn+2.72));
   const lane=person.offset*Math.max(0,Math.min(1,(1-person.p)/.14));
   ctx.save();
   // The doorway covers the traveler as they pass inside; no opacity fade.
   ctx.beginPath();ctx.rect(0,0,w,h);ctx.rect(ox+1268*scale,oy+350*scale,68*scale,117*scale);ctx.clip('evenodd');
   ctx.translate(ox+x*scale,oy+(y+lane)*scale+Math.sin(step*2)*.55*scale);ctx.rotate(Math.sin(step)*.015);
   if(art.complete&&art.naturalWidth){
    if(rigs[person.kind].complete&&rigs[person.kind].naturalWidth){if(person.kind===2)drawHorse(height,step,facing);else drawHuman(rigs[person.kind],humanParts[person.kind],height,step,facing);}
    else if(!pose){const sx=(person.kind===2?frameIndex%2:frameIndex)*sw,sy=(person.kind===2?Math.floor(frameIndex/2):person.kind)*sh;ctx.drawImage(art,sx,sy,sw,sh,-width/2,-height,width,height);}
    else if(person.kind===2){ctx.drawImage(pose,-width/2,-height,width,height);}
    else{
     // The sprite has no separate head asset. Gently tilt its upper section
     // around the shoulders, with a small overlap to hide the join.
     const cut=31,overlap=2,split=cut/poseSize*height;
     ctx.drawImage(pose,0,cut-overlap,poseSize,poseSize-cut+overlap,-width/2,-height+(cut-overlap)/poseSize*height,width,height*(poseSize-cut+overlap)/poseSize);
     ctx.save();ctx.translate(-width*.08,-height+split);ctx.rotate(Math.sin(step+.5)*.02+facing*.07);ctx.drawImage(pose,0,0,poseSize,cut,-width*.42,-split,width,split);ctx.restore();
    }
   }ctx.restore();
  }
 }
 sheet.onload=()=>{requestAnimationFrame(frame);preparePoses(sheet,[0,1,3]);};
 horse.onload=()=>preparePoses(horse,[2]);
})();
