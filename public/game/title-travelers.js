// Coordinates use the existing 1672 × 941 fortress illustration. Keep this
// geometry independent of canvas/CSS so the approach and direction can be checked.
const TitleTravelersGeometry = (() => {
 // Trace the middle of the approach, around its hairpin, then through the
 // threshold. The last segment follows the arch's depth instead of the wall.
 const anchors=[[1710,730],[1540,653],[1395,591],[1285,548],[1237,526],[1227,514],[1233,502],[1253,490],[1277,480],[1294,470],[1300,460],[1301,450],[1301,441]];
 const points=[];
 // A gently tensioned Hermite curve removes the abrupt segment headings at
 // the last bend. Flatten once and sample by length to retain constant speed.
 for(let i=0;i<anchors.length-1;i++){
  const a=anchors[Math.max(0,i-1)],b=anchors[i],c=anchors[i+1],d=anchors[Math.min(anchors.length-1,i+2)];
  const steps=Math.max(4,Math.ceil(Math.hypot(c[0]-b[0],c[1]-b[1])/3));
  for(let n=0;n<steps;n++){const t=n/steps,t2=t*t,t3=t2*t;points.push([0,1].map(k=>(2*t3-3*t2+1)*b[k]+(t3-2*t2+t)*(c[k]-a[k])*.35+(-2*t3+3*t2)*c[k]+(t3-t2)*(d[k]-b[k])*.35));}
 }
 points.push(anchors.at(-1));
 const road=Object.freeze(points.map(point=>Object.freeze(point)));
 const lengths=road.slice(1).map((point,i)=>Math.hypot(point[0]-road[i][0],point[1]-road[i][1]));
 const total=lengths.reduce((a,b)=>a+b,0);
 const gateIndex=road.findIndex(point=>point[0]>=1297&&point[1]<=465);
 const entryStart=lengths.slice(0,gateIndex).reduce((a,b)=>a+b,0)/total;
 function sample(progress){
  let distance=Math.max(0,Math.min(1,progress))*total,i=0;
  while(i<lengths.length-1&&distance>lengths[i])distance-=lengths[i++];
  const fraction=Math.max(0,Math.min(1,distance/lengths[i])),a=road[i],b=road[i+1],heading=Math.atan2(b[1]-a[1],b[0]-a[0]);
  return {x:a[0]+(b[0]-a[0])*fraction,y:a[1]+(b[1]-a[1])*fraction,heading};
 }
 const lead=(progress,distance)=>Math.min(1,progress+distance/total);
 return Object.freeze({road,total,entryStart,sample,lead});
})();

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
 function headPart(rig,parts,x,y,w,h,angle,yaw){
  // Rotate around the neck and turn the face from left profile to right profile.
  ctx.save();ctx.translate(x,y+h*.85);ctx.rotate(angle);ctx.scale(yaw,1);rigPart(rig,parts,'head',0,-h*.85,w,h);ctx.restore();
 }
 function drawHuman(rig,parts,height,step,turn,yaw=1){
  ctx.save();ctx.scale(height/205,height/205);ctx.translate(0,-205);const swing=Math.sin(step),bob=Math.sin(step*2);
  rigPart(rig,parts,'legBack',7,105,53,100,-swing*.30,.52);rigPart(rig,parts,'armBack',14,52,38,80,swing*.26);
  ctx.save();ctx.translate(0,90);ctx.rotate(swing*.025);rigPart(rig,parts,'body',0,-45,86,92);headPart(rig,parts,-7,-89,57,58,Math.sin(step+.5)*.035+turn*.06,yaw);rigPart(rig,parts,'armFront',-5,-39,42,83,-swing*.26);ctx.restore();
  rigPart(rig,parts,'legFront',-10,105,53,100,swing*.30,.52);ctx.restore();
 }
 function drawHorse(height,step,turn,yaw=1){
  const rig=rigs[2],swing=Math.sin(step),p=horseParts;ctx.save();ctx.scale(height/205,height/205);ctx.translate(0,-205);
  rigPart(rig,p,'frontBack',-36,117,35,90,-swing*.24);rigPart(rig,p,'rearBack',43,117,38,90,swing*.24);
  ctx.save();ctx.translate(5,105);ctx.rotate(swing*.016);rigPart(rig,p,'body',0,-55,150,100);headPart(rig,p,-76,-74,90,80,Math.sin(step+.4)*.045+turn*.05,yaw);ctx.restore();
  rigPart(rig,p,'frontFront',-42,117,35,90,swing*.24);rigPart(rig,p,'rearFront',47,117,38,90,-swing*.24);ctx.restore();
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
 // Finish inside the arch, not on the upper-right wall.
 const route=TitleTravelersGeometry;
 // Small cached wisps drift along the illustrated mountain valleys. No image
 // filters or extra animation loop: the title's existing canvas draws them.
 const mist=document.createElement('canvas');mist.width=384;mist.height=96;
 const mistCtx=mist.getContext('2d');
 for(const [x,y,r,alpha] of [[90,51,82,.22],[183,44,100,.26],[285,52,87,.18]]){
  const glow=mistCtx.createRadialGradient(x,y,0,x,y,r);
  glow.addColorStop(0,`rgba(210,225,223,${alpha})`);glow.addColorStop(1,'rgba(210,225,223,0)');
  mistCtx.save();mistCtx.translate(0,y);mistCtx.scale(1,.32);mistCtx.translate(0,-y);
  mistCtx.fillStyle=glow;mistCtx.fillRect(x-r,y-r,r*2,r*2);mistCtx.restore();
 }
 const mistBands=[[350,310,450,76,58,0],[620,285,440,66,72,1.6],[480,390,510,94,85,3.1],[790,350,360,70,65,4.5]];
 function drawMist(time,scale,ox,oy){
  for(const [x,y,width,height,period,phase] of mistBands){
   const drift=Math.sin(time/period+phase),lift=Math.sin(time/(period*.7)+phase);
   ctx.globalAlpha=.52+Math.sin(time/(period*.8)+phase)*.1;
   ctx.drawImage(mist,ox+(x+drift*48-width/2)*scale,oy+(y+lift*5-height/2)*scale,width*scale,height*scale);
  }
  ctx.globalAlpha=1;
 }
 let people=[],next=0,last=0;
 function loadWalkers(){sheet.src='assets/title-walk-frames-packed.webp';horse.src='assets/title-horse-walk-packed.webp';['traveler','farmer','horse','guard'].forEach((name,i)=>{rigs[i].src='assets/title-rig-'+name+'.webp';});}
 if('requestIdleCallback' in window)requestIdleCallback(loadWalkers,{timeout:2500});else setTimeout(loadWalkers,1500);
 function drawTraveler(kind,progress,person,step,scale,ox,oy,w,h,relativeHeight=1,facing=person.facing){
  const point=route.sample(progress),height=(36-progress*14)*scale*relativeHeight,width=height*(kind===2?1.65:1.02);
  const art=kind===2?horse:sheet,frameIndex=Math.floor(person.phase),pose=poses[kind][Math.floor(person.phase*poseCount/4)];
  if(!art.complete||!art.naturalWidth)return;
  const horizontal=Math.cos(point.heading);
  // Every source sprite faces left. Mirror the complete figure, not just its
  // head, when the road bends right. The horse and its load turn together.
  const away=Math.max(0,-Math.sin(point.heading));
  const profile=.45+.55*Math.abs(horizontal),headYaw=1-.72*away*(1-Math.abs(horizontal));
  const lane=person.offset*Math.max(0,Math.min(1,(1-progress)/.14));
  const entryDepth=Math.max(0,Math.min(1,(progress-route.entryStart)/(1-route.entryStart)));
  const shadow=entryDepth*entryDepth*(3-2*entryDepth);
  ctx.save();
  if(entryDepth>0){ctx.beginPath();for(const [i,p]of [[1281,466],[1281,429],[1288,414],[1300,406],[1312,415],[1319,430],[1319,466]].entries()){const x=ox+p[0]*scale,y=oy+p[1]*scale;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.closePath();ctx.clip();}
  ctx.translate(ox+point.x*scale,oy+(point.y+lane)*scale);
  // Walk into the doorway's shadow after crossing the threshold. This keeps
  // feet on the approach and removes the group before it crosses the wall.
  ctx.globalAlpha=1-shadow;ctx.scale(facing*profile,1);ctx.rotate(Math.sin(step)*.012);
  if(rigs[kind].complete&&rigs[kind].naturalWidth){
   if(kind===2)drawHorse(height,step,0,headYaw);else drawHuman(rigs[kind],humanParts[kind],height,step,0,headYaw);
  }else if(pose){ctx.drawImage(pose,-width/2,-height,width,height);}
  else{const sw=art.naturalWidth/(kind===2?2:4),sh=art.naturalHeight/(kind===2?2:4),sx=(kind===2?frameIndex%2:frameIndex)*sw,sy=(kind===2?Math.floor(frameIndex/2):kind)*sh;ctx.drawImage(art,sx,sy,sw,sh,-width/2,-height,width,height);}
  ctx.restore();
 }
 function frame(now){
  requestAnimationFrame(frame);
  if(document.hidden||document.body.dataset.mode!=='title'||matchMedia('(prefers-reduced-motion: reduce)').matches){last=0;return;}
  const dt=last?Math.min((now-last)/1000,.1):0;last=now;
  const w=screen.clientWidth,h=screen.clientHeight,dpr=Math.min(devicePixelRatio||1,1.5);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  next-=dt;if(next<=0&&people.length<5){
   const pair=people.length<=3&&Math.random()<.35,speed=.021+Math.random()*.004;
   for(let i=0;i<(pair?2:1);i++)people.push({kind:pair?[0,1,3][Math.floor(Math.random()*3)]:Math.floor(Math.random()*4),p:0,speed,offset:pair?(i===0?-7:7):0,phase:Math.random()*4,pace:2.8+Math.random()*.4,facing:1});
   next=4+Math.random()*9;
  }
  const scale=Math.max(w/1672,h/941),ox=(w-1672*scale)*.66,oy=(h-941*scale)*(w<=700?.28:.44);
  drawMist(now/1000,scale,ox,oy);
  people=people.filter(person=>person.p<1);
  // Draw farther figures first, so an approaching person does not cover one
  // closer to the foreground merely because they spawned earlier.
  people.sort((a,b)=>b.p-a.p);
  for(const person of people){
   person.p+=dt*person.speed;person.phase=(person.phase+dt*person.pace)%4;const step=person.phase*Math.PI/2;
   const horizontal=Math.cos(route.sample(person.p).heading),target=horizontal>.12?-1:horizontal<-.12?1:person.facing;
   person.facing+=(target-person.facing)*(1-Math.exp(-dt*12));
   drawTraveler(person.kind,person.p,person,step,scale,ox,oy,w,h);
   // Place the handler ahead along the same road arc, including the gate turn.
   // A fixed left offset put the handler beside/behind a right-turning horse.
   if(person.kind===2){
    const lead=route.lead(person.p,18),leadHorizontal=Math.cos(route.sample(lead).heading);
    const leadTarget=leadHorizontal>.12?-1:leadHorizontal<-.12?1:(person.handlerFacing??1);
    person.handlerFacing=(person.handlerFacing??1)+(leadTarget-(person.handlerFacing??1))*(1-Math.exp(-dt*12));
    drawTraveler(0,lead,person,step+.25,scale,ox,oy,w,h,.84,person.handlerFacing);
   }
  }

 }
 sheet.onload=()=>{requestAnimationFrame(frame);preparePoses(sheet,[0,1,3]);};
 horse.onload=()=>preparePoses(horse,[2]);
})();
