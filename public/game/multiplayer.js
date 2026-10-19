function setupClan(app){
 const $=id=>document.getElementById(id),game=app.game;
 let roomId=null,data=null,selfId=null,busy=false,joining=false,viewId=null,lastEvent=0,lastVersion=-1,active=false,lastGood=0,queued=[],pollTimer=null,failures=0,latency=0,epoch=0,startedSound=false;
 let members=new Set(),serverOffset=0,previewId=-1;
 let socket=null,heartbeat=null,wire=null,retryAt=0,commandBusy=false,commandTimer=null,streamFailures=0;
 function mergePatch(old,p){if(!p)return old;if(Object.hasOwn(p,'set'))return p.set;if(p.order){const map=new Map((old||[]).map(x=>[x.id,x]));return p.order.map(id=>mergePatch(map.get(id),p.entries[id]));}const next={...old};for(const k of p.remove||[])delete next[k];for(const [k,v] of Object.entries(p.changes||{}))next[k]=mergePatch(next[k],v);return next;}
 function networkLabel(){if(roomId&&!failures)$('networkState').textContent=(socket?.readyState===1?'실시간 연결 · 왕복 ':'연결됨 · 응답 ')+latency+'ms · 공통 1×';}
 function stopSocket(){clearInterval(heartbeat);clearTimeout(commandTimer);commandBusy=false;if(socket){const old=socket;socket=null;old.close();}wire=null;}
 function openRealtime(){
  if(data?.transport!=='websocket'||socket||Date.now()<retryAt||!roomId)return;
  const current=roomId,generation=epoch,url=new URL('/api/clan/socket',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';url.searchParams.set('roomId',roomId);
  const ws=new WebSocket(url);socket=ws;const opening=setTimeout(()=>{if(ws.readyState!==1)ws.close();},4000);
  ws.onopen=()=>{clearTimeout(opening);if(socket!==ws)return;streamFailures=0;clearTimeout(pollTimer);ws.send(JSON.stringify({type:'ping',sentAt:performance.now()}));heartbeat=setInterval(()=>{if(ws.readyState===1)ws.send(JSON.stringify({type:'ping',sentAt:performance.now()}));},5000);if(queued.length)sendCommand();};
  ws.onmessage=event=>{if(roomId!==current||epoch!==generation||socket!==ws)return;let m;try{m=JSON.parse(event.data);}catch{return;}
   if(m.type==='pong'){latency=Math.max(0,Math.round(performance.now()-m.sentAt));lastGood=Date.now();networkLabel();return;}
   if(m.type==='snapshot')wire=m.value;
   else if(m.type==='patch'){if(!wire||wire.version!==m.baseVersion){ws.send(JSON.stringify({type:'resync'}));return;}wire=mergePatch(wire,m.patch);}
   else if(m.type==='ack'){const matches=queued[0]&&((m.actionId&&queued[0].actionId===m.actionId)||(m.requestId&&queued[0].requestId===m.requestId));if(!matches)return;clearTimeout(commandTimer);commandBusy=false;if(m.status===429){setTimeout(sendCommand,180);return;}queued.shift();if(m.error)app.toast(m.error);if(m.value){if(!apply(m.value)&&data)apply(data,true);}else if(data)apply(data,true);networkLabel();setTimeout(()=>{if(queued.length)sendCommand();},120);return;}
   else if(m.type==='error'){app.toast(m.error);return;}else return;
   failures=0;apply(structuredClone(wire));networkLabel();
  };
  ws.onclose=()=>{clearTimeout(opening);if(socket!==ws)return;clearInterval(heartbeat);clearTimeout(commandTimer);commandBusy=false;socket=null;wire=null;retryAt=Date.now()+Math.min(15000,1000*2**Math.min(4,streamFailures++));if(roomId===current&&epoch===generation){clearTimeout(pollTimer);pump();}};
  ws.onerror=()=>ws.close();
 }
 async function sendCommand(){
  if(commandBusy||!roomId||!queued.length)return;commandBusy=true;const command=queued[0],current=roomId,generation=epoch;
  if(socket?.readyState===1){socket.send(JSON.stringify({type:'command',input:command,requestId:command.requestId}));commandTimer=setTimeout(()=>{if(socket)socket.close();},3500);return;}
  try{const value=await request({...command,roomId:current});if(roomId!==current||epoch!==generation)return;if(queued[0]===command)queued.shift();if(!apply(value)){if(value.result?.error)app.toast(value.result.error);if(data)apply(data,true);}}
  catch(e){if(roomId!==current||epoch!==generation)return;if(e.status&&![409,429,503].includes(e.status)){queued.shift();app.toast(e.message);if(data)apply(data,true);}else setTimeout(sendCommand,300);}
  finally{if(epoch===generation){commandBusy=false;app.hud();if(queued.length)setTimeout(sendCommand,120);else if(roomId){clearTimeout(pollTimer);pollTimer=setTimeout(pump,40);}}}
 }

 let entryMode='join',entryId=crypto.randomUUID(),lastSnapshot=performance.now();
 const original={};
 for(const method of ['build','hire','hireWoodcutter','upgradeCastle','upgradeTower','startWave','sellTower','potion','buildBarracks','recruit','buildLab','researchPotion','repairCastle','setSpeed','setPaused']){
   original[method]=game[method].bind(game);
   game[method]=(...args)=>{if(!active)return original[method](...args);return queueAction(method,args);};
 }
 function queueAction(action,args){
  if(queued.length>=8||Date.now()-lastGood>5000)return{error:'서버 연결을 확인 중입니다. 잠시 후 다시 시도하세요.'};
  const last=queued.filter(c=>c.op==='action').at(-1),command={op:'action',action,args,actionId:crypto.randomUUID(),sequence:last?last.sequence+1:data.nextActionSeq,previewId:previewId--,queuedAt:performance.now()};
  const result=ClanVisual.preview(game,command);if(result?.error)return result;queued.push(command);sendCommand();app.hud();return{...result,pending:true};
 }
 async function request(body){const began=performance.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{const response=await fetch('/api/clan',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({...body,watchId:$('spectateDialog').open?viewId:null}),signal:controller.signal,keepalive:body.op==='leave'});const value=await response.json();const duration=performance.now()-began,serverMs=Number(response.headers.get('Server-Timing')?.match(/app;dur=([\d.]+)/)?.[1]||0);value._receivedAt=performance.now();value._leadSeconds=Math.max(0,Math.min(2,((value.serverTime-(value.simulationTime||value.serverTime))+Math.max(0,duration-serverMs)/2)/1000));if(!response.ok)throw Object.assign(new Error(value.error||'대전 서버 오류'),{status:response.status});return value;}finally{clearTimeout(timer);}}
 function apply(value,force=false){
   if(!value.roomId||value.version<lastVersion)return false;
   const changed=force||value.version>lastVersion||!active;value._receivedAt??=performance.now();
   const wasKnown=members.size>0,arrivals=value.players.filter(p=>p.id!==value.selfId&&!members.has(p.id));
   if(wasKnown&&arrivals.length){app.audio.notify('join');$('lobbyNotice').textContent=arrivals.map(p=>p.name).join(', ')+' 님이 입장했습니다.';}
   members=new Set(value.players.map(p=>p.id));
   data=value;lastVersion=value.version;roomId=value.roomId;selfId=value.selfId;lastGood=Date.now();serverOffset=value.serverTime-Date.now();
   sessionStorage.setItem('clan-room',roomId);openRealtime();
   const me=value.players.find(p=>p.id===selfId);
   if(!me)return;
   $('lobbyTitle').textContent=value.private?'친구 초대방':'5인 매칭';
   $('lobbyIntro').textContent=value.private?'초대 코드를 받은 친구끼리 2~5명이 참가합니다. 방장이 시작을 누르면 5초 후 동시에 시작합니다.':'실제 플레이어 5명이 모이면 시작합니다. 20웨이브 방어 후 상대에게 출병할 수 있습니다.';
   $('joinMatch').hidden=true;
   $('friendCodePanel').hidden=!value.private;$('friendCode').textContent=value.code||'';$('roomCodeLabel').hidden=true;
   $('beginFriendMatch').hidden=!value.private||value.status!=='waiting';$('beginFriendMatch').disabled=value.hostId!==selfId||value.players.length<2;
   $('beginFriendMatch').textContent=value.hostId===selfId?'친구 대전 시작':'방장이 시작하기를 기다립니다';
   $('matchStatus').textContent=value.status==='waiting'?(value.private?`친구 ${value.players.length} / 5 · 2명부터 방장이 시작할 수 있습니다.`:`매칭 대기 ${value.players.length} / 5 · 실제 플레이어가 모이면 시작합니다.`):'대전 시작';
   if(value.status==='waiting'||value.status==='countdown')$('lobbySlots').replaceChildren(...Array.from({length:5},(_,i)=>{const span=document.createElement('span');span.textContent=value.players[i]?.name||'대기';return span;}));
   if(value.status==='countdown'&&!startedSound){startedSound=true;app.audio.notify('ready');$('lobbyNotice').textContent='곧 전투가 시작됩니다.';}
   if(value.status==='waiting')startedSound=false;
   if(value.status==='playing'||value.status==='finished'){
     if(!changed)return true;
     const scene=active?game.s.scene:'battle';
     if(!active){game.reset();active=true;app.online();if($('matchDialog').open)$('matchDialog').close();}
     const previous=game.s;lastSnapshot=performance.now();app.renderer.visualElapsed=0;
     game.s=structuredClone(me.s);game.normalize();game.s.scene=scene;game.s.paused=false;
     const lead=Math.min(2,(value._leadSeconds??Math.max(0,(value.serverTime-(value.simulationTime||value.serverTime)+latency/2)/1000))+(performance.now()-value._receivedAt)/1000);
     for(const t of game.s.towers)t.buildRemaining=Math.max(0,t.buildRemaining-lead);
     for(const command of queued){if(command.op!=='action'||command.sequence<value.nextActionSeq)continue;const eventCount=game.s.events.length;const preview=ClanVisual.preview(game,command);game.s.events.length=eventCount;if(preview?.tower)preview.tower.buildRemaining=Math.max(.05,3-(performance.now()-command.queuedAt)/1000);}
     ClanVisual.adopt(game.s,previous,lead);
     game.s.events=game.s.events.filter(e=>(e.seq||0)>lastEvent);lastEvent=me.s.eventSeq||0;
     for(const event of game.s.events)if(event.type==='destroy'&&!game.s.effects.some(e=>e.type==='demolish'&&e.x===event.x&&e.y===event.y)){game.s.effects.push({type:'demolish',x:event.x,y:event.y,life:1.2});game.s.shake=.4;}
     document.body.dataset.multiplayer=String(!value.solo);$('rivals').hidden=!!value.solo;game.s.rankedSolo=!!value.solo;window.Chronicle?.identity(me.name,me.avatar);window.Chronicle?.tick(game.s);
     if(value.result?.error)app.toast(value.result.error);
     if(!value.solo)renderRivals();app.hud();
   }
   return true;
 }
 async function pump(){
   if(queued.length){sendCommand();return;}if(commandBusy||socket?.readyState===1)return;if(busy||!roomId)return;busy=true;
   const command={op:'poll'},current=roomId,generation=epoch,began=performance.now();
   try{const value=await request({...command,roomId:current});if(roomId!==current||generation!==epoch)return;latency=Math.round(performance.now()-began);failures=0;if(queued[0]===command)queued.shift();apply(value);$('networkState').classList.remove('offline');networkLabel();}
   catch(e){if(roomId!==current||generation!==epoch)return;failures++;$('networkState').classList.add('offline');$('matchStatus').textContent=e.message;if(e.status&&![409,503,429].includes(e.status)){queued=[];app.toast(e.message);if(e.status===403||e.status===404)await leave();}}
   finally{if(generation===epoch){busy=false;if(roomId&&socket?.readyState!==1){clearTimeout(pollTimer);pollTimer=setTimeout(pump,failures?Math.min(8000,600*2**Math.min(4,failures))+Math.random()*250:active?Math.max(30,(data?.pollAfterMs||250)-(performance.now()-began)):750);}}}
 }
 async function join(){
   if(joining||roomId)return;app.audio.init();joining=true;$('joinMatch').disabled=true;$('playerName').disabled=true;$('matchStatus').textContent='매칭 서버에 연결 중…';
   try{const pending=sessionStorage.getItem('clan-pending-leave');if(pending){try{await request({op:'leave',roomId:pending});sessionStorage.removeItem('clan-pending-leave');}catch{}}const value=await request({op:entryMode,name:window.Chronicle?.profile.name||$('playerName').value,avatar:window.Chronicle?.profile.avatar||0,code:$('roomCodeInput').value,entryId});apply(value);pump();}
   catch(e){$('matchStatus').textContent=e.message;$('joinMatch').disabled=false;$('playerName').disabled=false;}
   finally{joining=false;}
 }
 async function leave(){
   const old=roomId;epoch++;stopSocket();retryAt=0;streamFailures=0;busy=false;roomId=null;queued=[];active=false;data=null;selfId=null;lastVersion=-1;lastEvent=0;members.clear();startedSound=false;failures=0;clearTimeout(pollTimer);sessionStorage.removeItem('clan-room');document.body.dataset.multiplayer='false';$('rivals').hidden=true;$('joinMatch').disabled=false;$('playerName').disabled=false;app.home();
   if(old){sessionStorage.setItem('clan-pending-leave',old);try{await request({op:'leave',roomId:old});if(sessionStorage.getItem('clan-pending-leave')===old)sessionStorage.removeItem('clan-pending-leave');}catch{app.toast('퇴장을 다시 확인합니다. 다음 방 입장 시 자동으로 정리합니다.');}}
 }
 function openLobby(mode){entryMode=mode;entryId=crypto.randomUUID();app.audio.init();$('lobbyTitle').textContent=mode==='create'?'친구 방 만들기':mode==='joinCode'?'코드로 입장':'5인 매칭';$('lobbyIntro').textContent=mode==='join'?'실제 플레이어 5명이 모이면 시작합니다. 20웨이브 방어 후 상대에게 출병할 수 있습니다.':'친구 대전은 2~5명이 참가하고 방장이 시작합니다. 코드를 알려준 사람만 입장할 수 있습니다.';$('friendCodePanel').hidden=true;$('beginFriendMatch').hidden=true;$('roomCodeLabel').hidden=mode!=='joinCode';$('roomCodeInput').value='';$('joinMatch').hidden=false;$('joinMatch').textContent=mode==='create'?'방 만들고 코드 받기':mode==='joinCode'?'코드로 입장':'매칭 참가';$('lobbySlots').replaceChildren();$('matchStatus').textContent=mode==='join'?'실제 플레이어 5명이 모이면 시작합니다.':mode==='create'?'나와 친구들만 참가하는 초대방을 만듭니다.':'친구에게 받은 초대 코드 8자리를 입력하세요.';$('lobbyNotice').textContent='입장 알림음은 설정의 효과음과 전체 음량을 따릅니다.';$('matchDialog').showModal();}
 $('matchBtn').onclick=()=>openLobby('join');$('createRoomBtn').onclick=()=>openLobby('create');$('codeRoomBtn').onclick=()=>openLobby('joinCode');$('createRoomBtn').disabled=false;$('codeRoomBtn').disabled=false;
 $('roomCodeInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();join();}});
 $('copyRoomCode').onclick=async()=>{try{await navigator.clipboard.writeText(data.code);$('lobbyNotice').textContent='초대 코드를 복사했습니다.';}catch{$('lobbyNotice').textContent='코드를 직접 선택해서 친구에게 알려주세요: '+data.code;}};
 $('beginFriendMatch').onclick=()=>{if(!roomId||queued.length)return;$('beginFriendMatch').disabled=true;queued.push({op:'begin',requestId:crypto.randomUUID()});sendCommand();};
 $('joinMatch').onclick=join;$('cancelMatch').onclick=()=>{if(!joining)leave();};
 $('matchDialog').addEventListener('cancel',e=>{e.preventDefault();if(!joining)leave();});
 $('armyBtn').onclick=()=>{const r=game.buildBarracks();if(r.error)app.toast(r.error);else app.setScene('town');app.hud();};$('closeArmy').onclick=()=>$('armyDialog').close();
 $('buildBarracks').onclick=()=>{const r=game.buildBarracks();if(r.error)app.toast(r.error);app.hud();};
 $('recruitBtn').onclick=()=>{const r=game.recruit();if(r.error)app.toast(r.error);app.hud();};
 $('dispatchBtn').onclick=()=>{if(!active)return;const r=queueAction('dispatch',[$('attackTarget').value,Number($('sendCount').value)]);if(r?.error)app.toast(r.error);};
 $('rivalsToggle').onclick=()=>$('rivals').classList.toggle('collapsed');
 $('closeSpectate').onclick=()=>$('spectateDialog').close();$('spectateDialog').addEventListener('close',()=>{if(socket?.readyState===1)socket.send(JSON.stringify({type:'watch',id:null}));});
 const rivalNodes=new Map();
 function renderRivals(){
   for(const [id,node] of rivalNodes)if(!data.players.some(p=>p.id===id)){node.card.remove();rivalNodes.delete(id);}
   for(const p of data.players){
     let node=rivalNodes.get(p.id);
     if(!node){const card=document.createElement('button'),name=document.createElement('span'),badge=document.createElement('b'),detail=document.createElement('small'),bar=document.createElement('div'),fill=document.createElement('i');bar.className='bar';bar.append(fill);card.append(name,badge,detail,bar);card.onclick=()=>{viewId=p.id;$('spectateTitle').textContent=p.name+'의 전장';$('spectateDialog').showModal();if(socket?.readyState===1)socket.send(JSON.stringify({type:'watch',id:viewId}));else pump();};node={card,name,badge,detail,fill};rivalNodes.set(p.id,node);$('rivalCards').append(card);}
     node.card.className='rival-card'+(p.id===selfId?' active':'');node.name.textContent=p.name+(p.id===selfId?' · 나':'');node.badge.textContent=p.s.over?(p.s.won?'승리':'탈락'):'W'+p.s.wave;node.detail.textContent=`성 ${Math.ceil(p.s.hp)}/${p.s.maxHp} · 포탑 ${p.towerCount??p.s.towers?.length??0} · 군사 ${p.s.army}${p.connected?'':' · 재연결 중'}`;node.fill.style.width=p.s.hp/p.s.maxHp*100+'%';
   }
   const targets=data.players.filter(p=>p.id!==selfId&&!p.s.over);
   for(const select of [$('attackTarget'),$('potionTarget')]){const signature=targets.map(p=>p.id).join('|');if(select.dataset.members===signature)continue;const selected=select.value;select.dataset.members=signature;for(const option of [...select.options])if(!targets.some(p=>p.id===option.value))option.remove();for(const p of targets){let option=[...select.options].find(o=>o.value===p.id);if(!option){option=document.createElement('option');option.value=p.id;select.append(option);}option.textContent=p.name;}if(targets.some(p=>p.id===selected))select.value=selected;}
 }
 function hud(){
   const s=game.s,waiting=active&&(queued.length>=8||Date.now()-lastGood>5000);
   if(data?.status==='countdown'&&!failures)$('matchStatus').textContent=`${data.players.length}명 · ${Math.max(0,Math.ceil((data.readyAt-Date.now()-serverOffset)/1000))}초 후 시작`;
   if(failures&&roomId)$('networkState').textContent=`재연결 중 · 마지막 응답 ${Math.floor((Date.now()-lastGood)/1000)}초 전`;
   $('buildBarracks').textContent=s.barracks?'훈련소 건설 완료':'훈련소 건설 · 나무 100';
   $('buildBarracks').disabled=!game.canAct()||s.barracks||s.wood<100||waiting;
   $('armyCount').textContent=`대기 군사 ${s.army} / 50`;
   $('recruitBtn').disabled=!game.canAct()||!s.barracks||s.barracksBuild>0||s.gold<80||s.army>=50||waiting;
   $('buildBarracks').textContent=s.barracksBuild>0?'훈련소 건설 '+Math.ceil(s.barracksBuild)+'초':s.barracks?'훈련소 건설 완료':'훈련소 건설 · 나무 100';
   $('attackPotion').hidden=!s.multiplayer||s.research.attack!==-1;const cd=s.potionCooldown.attack;$('attackPotion').disabled=!active||!game.canAct()||s.crystals<10||cd>0||waiting;$('attackCooldown').textContent=cd>0?cd.toFixed(1):'';$('attackCooldown').classList.toggle('active',cd>0);$('castAttackPotion').disabled=$('attackPotion').disabled||!$('potionTarget').value;
   $('dispatchBtn').disabled=!active||!game.canAct()||!s.barracks||s.completed<20||s.waves.some(w=>w.number<=20)||s.army<1||s.dispatchCooldown>0||!$('attackTarget').value||waiting;
   $('dispatchHint').textContent=!active?'출병은 5인 매칭에서 이용할 수 있습니다.':s.completed<20?'20웨이브까지 방어를 마치면 출병할 수 있습니다.':s.dispatchCooldown>0?`다음 출병 ${Math.ceil(s.dispatchCooldown)}초`:'출병 가능 · 1~10명 · 다음 출병까지 8초';
 }
 const watchGame=new Defense.Game(),watch=new WorldRenderer($('spectateCanvas'),watchGame);
 Object.assign(watch,{images:app.renderer.images,ground:app.renderer.ground,groundDetail:app.renderer.groundDetail,decor:app.renderer.decor,ready:true,w:1000,h:550,dockHeight:0,dpr:1});
 watch.canvas.width=1000;watch.canvas.height=550;watch.canvas.style.width='100%';watch.canvas.style.height='auto';
 function spectator(){if($('spectateDialog').open&&data){const p=data.players.find(p=>p.id===viewId);if(p){if(p.s.enemies){watchGame.s=p.s;watchGame.normalize();watch.draw({});}$('spectateStats').textContent=`웨이브 ${p.s.wave} · 성 Lv.${p.s.castle} · 금 ${Math.floor(p.s.gold)} · 크리스탈 ${p.s.crystals} · 나무 ${p.s.wood} · 광부 ${p.s.miners}명 · 벌목 인구 ${p.s.population}명 · 군사 ${p.s.army}${p.s.enemies?'':' · 전장 불러오는 중…'}`;}}requestAnimationFrame(spectator);}requestAnimationFrame(spectator);
 // A reload uses the same HttpOnly session, so it resumes the same participant.
 const saved=sessionStorage.getItem('clan-room');if(saved){roomId=saved;$('matchDialog').showModal();$('joinMatch').disabled=true;$('matchStatus').textContent='이전 대전에 다시 연결 중…';pump();}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&roomId)pump();});
 $('attackPotion').onclick=()=>{$('attackPotionStatus').textContent='';$('attackDialog').showModal();};$('closeAttack').onclick=()=>$('attackDialog').close();$('castAttackPotion').onclick=()=>{if(!active)return;const r=queueAction('attackPotion',[$('potionTarget').value]);if(r?.error)app.toast(r.error);else $('attackDialog').close();};
 function animate(dt){
  if(!active||game.s.paused||Date.now()-lastGood>5000)return;app.renderer.visualElapsed=(app.renderer.visualElapsed||0)+dt;
  ClanVisual.animate(game.s,dt,app.renderer.visualElapsed,Defense,game.treeSites);
 }
 async function startSolo(){
   if(joining||active)return;joining=true;app.audio.init();$('startBtn').disabled=true;
   try{const value=await request({op:'solo',name:window.Chronicle?.profile.name||'개척 군주',avatar:window.Chronicle?.profile.avatar||0,entryId:crypto.randomUUID()});apply(value);pump();}
   catch(e){app.toast('기록 서버에 연결하지 못했습니다. 잠시 후 다시 시작하세요.');}
   finally{joining=false;$('startBtn').disabled=false;}
 }
 return{hud,leave,animate,startSolo,get active(){return active;}};
}
