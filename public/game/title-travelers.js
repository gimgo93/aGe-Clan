(() => {
 const canvas=document.getElementById('titleTravelers'),screen=document.getElementById('titleScreen'),ctx=canvas.getContext('2d'),sheet=new Image();
 const figures=[[45,30,450,650],[540,20,400,650],[950,70,835,600],[1800,5,350,665]];
 const road=[[1660,660],[1510,605],[1370,550],[1265,510],[1230,490],[1260,468],[1300,450]];
 let people=[],next=0,last=0;
 sheet.src='assets/title-travelers.png';
 function frame(now){
  requestAnimationFrame(frame);
  if(document.hidden||document.body.dataset.mode!=='title'||matchMedia('(prefers-reduced-motion: reduce)').matches){last=0;return;}
  const dt=last?Math.min((now-last)/1000,.1):0;last=now;
  const w=screen.clientWidth,h=screen.clientHeight,dpr=Math.min(devicePixelRatio||1,1.5);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  next-=dt;if(next<=0&&people.length<5){people.push({kind:Math.floor(Math.random()*4),p:0,speed:.035+Math.random()*.015,offset:(Math.random()-.5)*9});next=3+Math.random()*5;}
  const scale=Math.max(w/1672,h/941),ox=(w-1672*scale)*.66,oy=(h-941*scale)*(w<=700?.28:.44);
  people=people.filter(person=>person.p<1);
  for(const person of people){person.p+=dt*person.speed;const segment=Math.min(road.length-2,Math.floor(person.p*(road.length-1))),f=person.p*(road.length-1)-segment;
   const x=road[segment][0]*(1-f)+road[segment+1][0]*f,y=road[segment][1]*(1-f)+road[segment+1][1]*f+person.offset;
   const [sx,sy,sw,sh]=figures[person.kind],height=(23-person.p*10)*scale,width=height*sw/sh;
   ctx.globalAlpha=Math.min(1,person.p*12,(1-person.p)*12);ctx.drawImage(sheet,sx,sy,sw,sh,ox+x*scale-width/2,oy+y*scale-height+Math.sin(now*.009+person.offset)*.6*scale,width,height);
  }ctx.globalAlpha=1;
 }
 sheet.onload=()=>requestAnimationFrame(frame);
})();
