(() => {
 const canvas=document.getElementById('titleTravelers'),screen=document.getElementById('titleScreen'),ctx=canvas.getContext('2d'),sheet=new Image();
 const figures=[[45,30,450,650],[540,20,400,650],[950,70,835,600],[1800,5,350,665]];
 const road=[[1660,660],[1510,605],[1370,550],[1265,510],[1230,490],[1260,468],[1300,450]];
 const lengths=road.slice(1).map((point,i)=>Math.hypot(point[0]-road[i][0],point[1]-road[i][1])),total=lengths.reduce((a,b)=>a+b,0);
 let people=[],next=0,last=0;
 sheet.src='assets/title-travelers.png';
 function position(progress){let distance=Math.min(1,progress)*total,i=0;while(i<lengths.length-1&&distance>lengths[i])distance-=lengths[i++];const f=distance/lengths[i];return [road[i][0]+(road[i+1][0]-road[i][0])*f,road[i][1]+(road[i+1][1]-road[i][1])*f];}
 function frame(now){
  requestAnimationFrame(frame);
  if(document.hidden||document.body.dataset.mode!=='title'||matchMedia('(prefers-reduced-motion: reduce)').matches){last=0;return;}
  const dt=last?Math.min((now-last)/1000,.1):0;last=now;
  const w=screen.clientWidth,h=screen.clientHeight,dpr=Math.min(devicePixelRatio||1,1.5);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  next-=dt;if(next<=0&&people.length<5){people.push({kind:Math.floor(Math.random()*4),p:0,speed:.017+Math.random()*.004,offset:(Math.random()-.5)*8,phase:Math.random()*6});next=6+Math.random()*6;}
  const scale=Math.max(w/1672,h/941),ox=(w-1672*scale)*.66,oy=(h-941*scale)*(w<=700?.28:.44);
  people=people.filter(person=>person.p<1);
  for(const person of people){person.p+=dt*person.speed;const [x,y]=position(person.p),[sx,sy,sw,sh]=figures[person.kind];
   const height=(36-person.p*14)*scale,width=height*sw/sh,step=now*.005+person.phase;
   ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,person.p*15,(1-person.p)*15));ctx.translate(ox+x*scale,oy+(y+person.offset)*scale+Math.sin(step*2)*.55*scale);ctx.rotate(Math.sin(step)*.014);ctx.drawImage(sheet,sx,sy,sw,sh,-width/2,-height,width,height);ctx.restore();
  }
 }
 sheet.onload=()=>requestAnimationFrame(frame);
})();
