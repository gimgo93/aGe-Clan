(() => {
 const canvas=document.getElementById('titleTravelers'),screen=document.getElementById('titleScreen'),ctx=canvas.getContext('2d');
 const sheet=new Image(),horse=new Image();
 const road=[[1660,660],[1510,605],[1370,550],[1265,510],[1230,490],[1260,468],[1300,450]];
 const lengths=road.slice(1).map((p,i)=>Math.hypot(p[0]-road[i][0],p[1]-road[i][1])),total=lengths.reduce((a,b)=>a+b,0);
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 let people=[],next=1+Math.random()*3,last=null;
 sheet.src='assets/title-walk-frames.png';horse.src='assets/title-horse-walk.png';
 function location(distance){let i=0;distance=Math.min(total,Math.max(0,distance));while(i<lengths.length-1&&distance>lengths[i])distance-=lengths[i++];const t=distance/lengths[i];return {x:road[i][0]+(road[i+1][0]-road[i][0])*t,y:road[i][1]+(road[i+1][1]-road[i][1])*t,heading:road[i+1][0]-road[i][0]};}
 function spawn(){const kind=Math.floor(Math.random()*4);people.push({kind,distance:0,speed:total*(.020+Math.random()*.007),offset:(Math.random()-.5)*7,step:Math.random()*4,scale:.93+Math.random()*.12});}
 function frame(now){
  requestAnimationFrame(frame);
  if(document.hidden||document.body.dataset.mode!=='title'||motion.matches){last=null;return;}
  const dt=last===null?0:Math.min(Math.max((now-last)/1000,0),.25);last=now;
  const w=screen.clientWidth,h=screen.clientHeight,dpr=Math.min(devicePixelRatio||1,1.5);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  next-=dt;if(next<=0){if(people.length<6)spawn();next=2.5+Math.random()*10.5;}
  const scale=Math.max(w/1672,h/941),ox=(w-1672*scale)*.66,oy=(h-941*scale)*(w<=700?.28:.44);
  for(const person of people){
   person.distance=Math.min(total,person.distance+dt*person.speed);const progress=person.distance/total,point=location(person.distance),art=person.kind===2?horse:sheet;
   if(!art.complete||!art.naturalWidth)continue;
   const cycle=person.distance/(person.kind===2?25:19)+person.step,frameIndex=Math.floor(cycle)%4,sw=art.naturalWidth/(person.kind===2?2:4),sh=art.naturalHeight/(person.kind===2?2:4),sx=(person.kind===2?frameIndex%2:frameIndex)*sw,sy=(person.kind===2?Math.floor(frameIndex/2):person.kind)*sh;
   const height=(36-progress*14)*scale*person.scale,width=height*(person.kind===2?1.65:1.02),alpha=Math.max(0,Math.min(1,progress*15,(1-progress)*15));
   const bob=Math.sin(cycle*Math.PI*2)*.38*scale;
   ctx.save();ctx.globalAlpha=alpha*.22;ctx.fillStyle='#15140e';ctx.beginPath();ctx.ellipse(ox+point.x*scale,oy+(point.y+person.offset)*scale,width*.22,Math.max(1,height*.035),0,0,Math.PI*2);ctx.fill();ctx.restore();
   ctx.save();ctx.globalAlpha=alpha;ctx.translate(ox+point.x*scale,oy+(point.y+person.offset)*scale+bob);if(point.heading>0)ctx.scale(-1,1);ctx.rotate(Math.sin(cycle*Math.PI*2)*.008);ctx.drawImage(art,sx,sy,sw,sh,-width/2,-height,width,height);ctx.restore();
  }
  people=people.filter(person=>person.distance<total);
 }
 requestAnimationFrame(frame);
})();
