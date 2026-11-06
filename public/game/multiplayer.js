function setupClan(app){
 const $=id=>document.getElementById(id),game=app.game;
 let roomId=null,data=null,selfId=null,busy=false,joining=false,viewId=null,lastEvent=0,lastVersion=-1,active=false,lastGood=0,queued=[],pollTimer=null,failures=0,latency=0,epoch=0,startedSound=false;
 let members=new Set(),serverOffset=0,previewId=-1,resuming=false;
 let socket=null,heartbeat=null,wire=null,retryAt=0,commandBusy=false,commandTimer=null,streamFailures=0,nextSendAt=0,sendTimer=null;
 function speedCooldownMs(){return Math.max(0,(game.s.speedLockedUntil||0)-Date.now()-(active?serverOffset:0));}
 function rebaseQueue(){let sequence=data?.nextActionSeq||1;for(const c of queued)if(c.op==='action')c.sequence=sequence++;}
 function sendLater(ms=120){nextSendAt=Math.max(nextSendAt,performance.now()+ms);clearTimeout(sendTimer);sendTimer=setTimeout(sendCommand,Math.max(0,nextSendAt-performance.now()));}
 function rateRetry(retryAfter=120){clearTimeout(commandTimer);commandBusy=false;const c=queued[0];if(!c)return;if((c.rateRetries=(c.rateRetries||0)+1)>6){queued=[];if(data)apply(data,true);app.toast('서버가 혼잡합니다. 잠시 후 다시 선택하세요.');return;}sendLater(Math.max(120,Math.min(1000,retryAfter))+Math.random()*60);}
 function mergePatch(old,p){if(!p)return old;if(Object.hasOwn(p,'set'))return p.set;if(p.order){const map=new Map((old||[]).map(x=>[x.id,x]));return p.order.map(id=>mergePatch(map.get(id),p.entries[id]));}const next={...old};for(const k of p.remove||[])delete next[k];for(const [k,v] of Object.entries(p.changes||{}))next[k]=mergePatch(next[k],v);return next;}
 function networkLabel(){if(roomId&&!failures)$('networkState').textContent=(socket?.readyState===1?'실시간 연결 · 왕복 ':'연결됨 · 응답 ')+latency+'ms · '+(data?.solo?'':'공통 ')+(game.s.speed||1)+'×';}
 function stopSocket(){clearInterval(heartbeat);clearTimeout(commandTimer);clearTimeout(sendTimer);nextSendAt=0;commandBusy=false;if(socket){const old=socket;socket=null;old.close();}wire=null;}
 function openRealtime(){
  if(data?.transport!=='websocket'||socket||Date.now()<retryAt||!roomId)return;
  const current=roomId,generation=epoch,url=new URL('/api/clan/socket',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';url.searchParams.set('roomId',roomId);
  const ws=new WebSocket(url);socket=ws;const opening=setTimeout(()=>{if(ws.readyState!==1)ws.close();},4000);
  ws.onopen=()=>{clearTimeout(opening);if(socket!==ws)return;streamFailures=0;clearTimeout(pollTimer);ws.send(JSON.stringify({type:'ping',sentAt:performance.now()}));heartbeat=setInterval(()=>{if(ws.readyState===1)ws.send(JSON.stringify({type:'ping',sentAt:performance.now()}));},5000);if(viewId)ws.send(JSON.stringify({type:'watch',id:viewId}));if(queued.length)sendCommand();};
  ws.onmessage=event=>{if(roomId!==current||epoch!==generation||socket!==ws)return;let m;try{m=JSON.parse(event.data);}catch{return;}
   if(m.type==='pong'){latency=Math.max(0,Math.round(performance.now()-m.sentAt));lastGood=Date.now();networkLabel();return;}
   if(m.type==='snapshot')wire=m.value;
   else if(m.type==='patch'){if(!wire||wire.version!==m.baseVersion){ws.send(JSON.stringify({type:'resync'}));return;}wire=mergePatch(wire,m.patch);}
   else if(m.type==='ack'){const matches=queued[0]&&((m.actionId&&queued[0].actionId===m.actionId)||(m.requestId&&queued[0].requestId===m.requestId));if(!matches)return;clearTimeout(commandTimer);commandBusy=false;if(m.status===429){rateRetry(m.retryAfterMs);return;}queued.shift();if(m.error)app.toast(m.error);if(m.value){if(!apply(m.value)&&data)apply(data,true);}else if(data)apply(data,true);rebaseQueue();networkLabel();if(queued.length)sendLater();return;}
   else if(m.type==='error'){if(m.status===429&&commandBusy&&queued.length){rateRetry(m.retryAfterMs);return;}app.toast(m.error);return;}else return;
   failures=0;apply(structuredClone(wire));networkLabel();
  };
  ws.onclose=()=>{clearTimeout(opening);if(socket!==ws)return;clearInterval(heartbeat);clearTimeout(commandTimer);commandBusy=false;socket=null;wire=null;retryAt=Date.now()+Math.min(15000,1000*2**Math.min(4,streamFailures++));if(roomId===current&&epoch===generation){clearTimeout(pollTimer);pump();}};
  ws.onerror=()=>ws.close();
 }
 async function sendCommand(){
  if(commandBusy||!roomId||!queued.length)return;if(performance.now()<nextSendAt){clearTimeout(sendTimer);sendTimer=setTimeout(sendCommand,nextSendAt-performance.now());return;}commandBusy=true;nextSendAt=performance.now()+120;const command=queued[0],current=roomId,generation=epoch;
  if(socket?.readyState===1){socket.send(JSON.stringify({type:'command',input:command,requestId:command.requestId}));commandTimer=setTimeout(()=>{if(socket)socket.close();},3500);return;}
  try{const value=await request({...command,roomId:current});if(roomId!==current||epoch!==generation)return;if(queued[0]===command)queued.shift();if(!apply(value)){if(value.result?.error)app.toast(value.result.error);if(data)apply(data,true);}}
  catch(e){if(roomId!==current||epoch!==generation)return;if(e.status&&![409,429,503].includes(e.status)){queued.shift();app.toast(e.message);if(data)apply(data,true);}else setTimeout(sendCommand,300);}
  finally{if(epoch===generation){commandBusy=false;app.hud();if(queued.length)sendLater();else if(roomId){clearTimeout(pollTimer);pollTimer=setTimeout(pump,40);}}}
 }

 let entryMode='join',entryId=crypto.randomUUID(),lastSnapshot=performance.now();
 const watchGame=new Defense.Game();watchGame.canAct=()=>false;let watchReady=false,watchVersion=-1,watchTarget=null,watchElapsed=0;const mapNodes=new Map();
 const original={};
 for(const method of ['build','hire','hireWoodcutter','upgradeCastle','upgradeTower','startWave','sellTower','potion','buildBarracks','recruit','buildLab','researchPotion','repairCastle','setSpeed','setPaused']){
   original[method]=game[method].bind(game);
   game[method]=(...args)=>{if(!active)return original[method](...args);return queueAction(method,args);};
 }
 function queueAction(action,args){
  if(viewId||data?.watchedId)return{error:'관전 중에는 조작할 수 없습니다. 내 국경지대로 돌아가세요.'};
  if(action==='setSpeed'&&speedCooldownMs()>0)return{error:'배속은 변경 후 5초 뒤 다시 바꿀 수 있습니다.'};
  if(queued.length>=8||Date.now()-lastGood>5000)return{error:'서버 연결을 확인 중입니다. 잠시 후 다시 시도하세요.'};
  const last=queued.filter(c=>c.op==='action').at(-1),command={op:'action',action,args,actionId:crypto.randomUUID(),sequence:last?last.sequence+1:data.nextActionSeq,previewId:previewId--,queuedAt:performance.now()};
  const result=ClanVisual.preview(game,command);if(result?.error)return result;queued.push(command);sendCommand();app.hud();return{...result,pending:true};
 }
 async function request(body){const began=performance.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{const analytics=body.op==='poll'?null:window.AgeAnalytics?.context(),response=await fetch('/api/clan',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({...body,...(analytics?{analytics}:{}),watchId:viewId}),signal:controller.signal,keepalive:body.op==='leave'});const value=await response.json();const duration=performance.now()-began,serverMs=Number(response.headers.get('Server-Timing')?.match(/app;dur=([\d.]+)/)?.[1]||0);value._receivedAt=performance.now();value._leadSeconds=Math.max(0,Math.min(2,((value.serverTime-(value.simulationTime||value.serverTime))+Math.max(0,duration-serverMs)/2)/1000));if(!response.ok)throw Object.assign(new Error(value.error||'대전 서버 오류'),{status:response.status});return value;}finally{clearTimeout(timer);}}
 function apply(value,force=false){
   if(!value.roomId||value.version<lastVersion)return false;
   if(value.status==='playing')window.AgeAnalytics?.trackOnce(value.solo?'game_start':'pvp_game_start',value.roomId);
   if(value.status==='finished')window.AgeAnalytics?.trackOnce(value.solo?'game_end':'pvp_game_end',value.roomId);
   const changed=force||value.version>lastVersion||!active||value.watchedId!==data?.watchedId;value._receivedAt??=performance.now();
   const wasKnown=members.size>0,arrivals=value.players.filter(p=>p.id!==value.selfId&&!members.has(p.id));
   if(wasKnown&&arrivals.length){app.audio.notify('join');$('lobbyNotice').textContent=arrivals.map(p=>PlayerIdentity.label(p)).join(', ')+' 님이 입장했습니다.';}
   members=new Set(value.players.map(p=>p.id));
   data=value;lastVersion=value.version;roomId=value.roomId;selfId=value.selfId;lastGood=Date.now();serverOffset=value.serverTime-Date.now();
   sessionStorage.setItem('clan-room',roomId);openRealtime();
   const me=value.players.find(p=>p.id===selfId);
   if(!me)return;
   $('matchDialog').dataset.phase=value.status;$('lobbySlots').hidden=false;$('cancelMatch').textContent='방 나가기';
   $('lobbyTitle').textContent=value.private?'친구 초대방':'4인 매칭';
   $('lobbyIntro').textContent=value.private?'초대 코드를 받은 친구끼리 2~4명이 참가합니다. 방장이 시작을 누르면 5초 후 동시에 시작합니다.':'실제 플레이어 4명이 모이면 시작합니다. 20웨이브 방어 후 상대에게 출병할 수 있습니다.';
   $('joinMatch').hidden=true;$('friendEntryModes').hidden=true;
   $('friendCodePanel').hidden=!value.private;$('friendCode').textContent=value.code||'';$('roomCodeLabel').hidden=true;
   $('beginFriendMatch').hidden=!value.private||value.status!=='waiting';$('beginFriendMatch').disabled=value.hostId!==selfId||value.players.length<2;
   $('beginFriendMatch').textContent=value.hostId===selfId?'친구 대전 시작':'방장이 시작하기를 기다립니다';
   $('matchStatus').textContent=value.status==='waiting'?(value.private?`친구 ${value.players.length} / ${value.capacity||4} · 2명부터 방장이 시작할 수 있습니다.`:`매칭 대기 ${value.players.length} / ${value.capacity||4} · 실제 플레이어가 모이면 시작합니다.`):'대전 시작';
   if(value.status==='waiting'||value.status==='countdown')$('lobbySlots').replaceChildren(...Array.from({length:value.capacity||4},(_,i)=>{const span=document.createElement('span');if(value.players[i])PlayerIdentity.render(span,value.players[i]);else span.textContent='대기';return span;}));
   if(value.status==='countdown'&&!startedSound){startedSound=true;app.audio.notify('ready');$('lobbyNotice').textContent='곧 전투가 시작됩니다.';}
   if(value.status==='waiting')startedSound=false;
   if(value.status==='playing'||value.status==='finished'){
     if(!changed)return true;
     const scene=active?game.s.scene:'battle';
     if(!active){game.reset();active=true;app.online();if($('matchDialog').open)$('matchDialog').close();}
     const previous=game.s;lastSnapshot=performance.now();app.renderer.visualElapsed=0;
     game.s=structuredClone(me.s);game.normalize();game.s.scene=scene;game.s.paused=false;
     const lead=Math.min(2,(value._leadSeconds??Math.max(0,(value.serverTime-(value.simulationTime||value.serverTime)+latency/2)/1000))+(performance.now()-value._receivedAt)/1000)*(game.s.speed===2?2:1);
     for(const t of game.s.towers)t.buildRemaining=Math.max(0,t.buildRemaining-lead);
     for(const command of queued){if(command.op!=='action'||command.sequence<value.nextActionSeq)continue;const eventCount=game.s.events.length;const preview=ClanVisual.preview(game,command);game.s.events.length=eventCount;if(preview?.tower)preview.tower.buildRemaining=Math.max(.05,3-(performance.now()-command.queuedAt)/1000*(game.s.speed===2?2:1));}
     ClanVisual.adopt(game.s,previous,lead);
     game.s.events=game.s.events.filter(e=>(e.seq||0)>lastEvent);lastEvent=me.s.eventSeq||0;
     for(const event of game.s.events)if(event.type==='destroy'&&!game.s.effects.some(e=>e.type==='demolish'&&e.x===event.x&&e.y===event.y)){game.s.effects.push({type:'demolish',x:event.x,y:event.y,life:1.2});game.s.shake=.4;}
     document.body.dataset.multiplayer=String(!value.solo);$('frontierMapBtn').hidden=!!value.solo;game.s.rankedSolo=!!value.solo;window.Chronicle?.identity(me.name,me.avatar,me.admin);if(resuming){window.Chronicle?.seedServerState(me.s);resuming=false;}else window.Chronicle?.observeServerState(me.s);
     if(value.result?.error)app.toast(value.result.error);
     syncObserved(value);if(!value.solo)renderFrontiers();app.hud();
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
   if(joining||roomId)return;if(entryMode==='joinCode'&&!/^[A-Z0-9]{8}$/.test($('roomCodeInput').value.trim().toUpperCase())){$('roomCodeInput').setAttribute('aria-invalid','true');$('matchStatus').textContent='초대 코드 8자리를 확인하세요.';$('roomCodeInput').focus();return;}$('roomCodeInput').removeAttribute('aria-invalid');app.audio.init();app.audio.notify('queue');joining=true;$('joinMatch').setAttribute('aria-busy','true');$('createRoomBtn').disabled=true;$('codeRoomBtn').disabled=true;$('cancelMatch').disabled=true;$('closeMatch').disabled=true;$('joinMatch').disabled=true;$('playerName').disabled=true;$('matchStatus').textContent='매칭 서버에 연결 중…';
   try{const pending=sessionStorage.getItem('clan-pending-leave');if(pending){try{await request({op:'leave',roomId:pending});sessionStorage.removeItem('clan-pending-leave');}catch{}}const value=await request({op:entryMode,name:window.Chronicle?.profile.name||$('playerName').value,avatar:window.Chronicle?.profile.avatar||0,code:$('roomCodeInput').value,entryId});apply(value);pump();}
   catch(e){$('matchStatus').textContent=e.message;$('joinMatch').disabled=false;$('playerName').disabled=false;}
   finally{joining=false;$('createRoomBtn').disabled=false;$('codeRoomBtn').disabled=false;$('joinMatch').removeAttribute('aria-busy');$('cancelMatch').disabled=false;$('closeMatch').disabled=false;}
 }
 async function leave(){
   const old=roomId;resuming=false;epoch++;stopSocket();retryAt=0;streamFailures=0;busy=false;roomId=null;queued=[];active=false;data=null;selfId=null;lastVersion=-1;lastEvent=0;members.clear();startedSound=false;failures=0;clearTimeout(pollTimer);sessionStorage.removeItem('clan-room');document.body.dataset.multiplayer='false';viewId=null;watchReady=false;watchTarget=null;app.renderer.game=game;document.body.dataset.spectating='false';document.body.dataset.watchLoading='false';$('observerBar').hidden=true;$('frontierMapBtn').hidden=true;$('joinMatch').disabled=false;$('playerName').disabled=false;app.home();
   if(old){sessionStorage.setItem('clan-pending-leave',old);try{await request({op:'leave',roomId:old});if(sessionStorage.getItem('clan-pending-leave')===old)sessionStorage.removeItem('clan-pending-leave');}catch{app.toast('퇴장을 다시 확인합니다. 다음 방 입장 시 자동으로 정리합니다.');}}
 }
 function openLobby(mode){if(joining||roomId)return;$('matchDialog').dataset.phase='entry';$('matchDialog').dataset.entryMode=mode;$('lobbySlots').hidden=true;$('cancelMatch').textContent='돌아가기';$('roomCodeInput').removeAttribute('aria-invalid');entryMode=mode;entryId=crypto.randomUUID();app.audio.init();$('friendEntryModes').hidden=mode==='join';$('createRoomBtn').setAttribute('aria-pressed',String(mode==='create'));$('codeRoomBtn').setAttribute('aria-pressed',String(mode==='joinCode'));$('lobbyTitle').textContent=mode==='join'?'대전 찾기':'친구와 대전';$('lobbyIntro').textContent=mode==='join'?'실제 플레이어 4명이 모이면 시작합니다. 20웨이브 방어 후 상대에게 출병할 수 있습니다.':'친구 대전은 2~4명이 참가하고 방장이 시작합니다. 코드를 알려준 사람만 입장할 수 있습니다.';$('friendCodePanel').hidden=true;$('beginFriendMatch').hidden=true;$('roomCodeLabel').hidden=mode!=='joinCode';$('roomCodeInput').value='';$('joinMatch').hidden=false;$('joinMatch').textContent=mode==='create'?'방 만들고 코드 받기':mode==='joinCode'?'코드로 입장':'매칭 참가';$('lobbySlots').replaceChildren();$('matchStatus').textContent=mode==='join'?'실제 플레이어 4명이 모이면 시작합니다.':mode==='create'?'나와 친구들만 참가하는 초대방을 만듭니다.':'친구에게 받은 초대 코드 8자리를 입력하세요.';$('lobbyNotice').textContent='';$('matchDialog').showModal();}
 $('friendPlayBtn').onclick=()=>openLobby('create');$('friendPlayBtn').disabled=false;$('matchBtn').onclick=()=>openLobby('join');$('createRoomBtn').onclick=()=>openLobby('create');$('codeRoomBtn').onclick=()=>openLobby('joinCode');$('createRoomBtn').disabled=false;$('codeRoomBtn').disabled=false;
 $('roomCodeInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();join();}});
 $('copyRoomCode').onclick=async()=>{try{await navigator.clipboard.writeText(data.code);$('lobbyNotice').textContent='초대 코드를 복사했습니다.';}catch{$('lobbyNotice').textContent='코드를 직접 선택해서 친구에게 알려주세요: '+data.code;}};
 $('beginFriendMatch').onclick=()=>{if(!roomId||queued.length)return;$('beginFriendMatch').disabled=true;queued.push({op:'begin',requestId:crypto.randomUUID()});sendCommand();};
 $('joinMatch').onclick=join;$('cancelMatch').onclick=()=>{if(!joining)leave();};$('closeMatch').onclick=$('cancelMatch').onclick;$('roomCodeInput').addEventListener('input',()=>{$('roomCodeInput').value=$('roomCodeInput').value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);$('roomCodeInput').removeAttribute('aria-invalid');if($('matchStatus').textContent==='초대 코드 8자리를 확인하세요.')$('matchStatus').textContent='친구에게 받은 초대 코드 8자리를 입력하세요.';});
 $('matchDialog').addEventListener('cancel',e=>{e.preventDefault();if(!joining)leave();});
 $('armyBtn').onclick=()=>{const r=game.buildBarracks();if(r.error)app.toast(r.error);app.hud();};$('closeArmy').onclick=()=>$('armyDialog').close();
 $('buildBarracks').onclick=()=>{const r=game.buildBarracks();if(r.error)app.toast(r.error);app.hud();};
 $('recruitBtn').onclick=()=>{const r=game.recruit();if(r.error)app.toast(r.error);app.hud();};
 $('dispatchBtn').onclick=()=>{if(!active)return;const r=queueAction('dispatch',[$('attackTarget').value,Number($('sendCount').value)]);if(r?.error)app.toast(r.error);};
 function regionOf(player){return window.FrontierView?.region(player,data?.solo)||{name:'중앙 국경지대',english:'CENTRAL FRONTIER'};}
 function swapDisplay(commit){app.renderer.damageBaseline=null;app.renderer.castleImpact=null;app.renderer.lastEra=undefined;app.renderer.eraGlowAt=-100;if(app.switchView)app.switchView(commit);else commit();}
 function selectFrontier(id){
  if(!active||!data||!data.players.some(p=>p.id===id))return;
  if(queued.length||commandBusy){app.toast('명령 처리 후 지도를 다시 선택하세요.');return;}
  const next=id===selfId?null:id;
  if(next===viewId){if($('frontierMapDialog').open)$('frontierMapDialog').close();return;}
  viewId=next;watchReady=false;watchTarget=null;watchVersion=-1;
  if($('frontierMapDialog').open)$('frontierMapDialog').close();
  document.body.dataset.spectating=String(!!viewId);document.body.dataset.watchLoading=String(!!viewId);
  $('observerBar').hidden=!viewId;
  const target=data.players.find(p=>p.id===viewId);
  if(target){$('observerRegion').textContent=regionOf(target).name+' · 관전 중';$('observerName').textContent=PlayerIdentity.label(target)+' · 전장 불러오는 중…';}
  else swapDisplay(()=>{app.renderer.game=game;app.renderer.upgradeScope='self:'+selfId;});
  if(socket?.readyState===1)socket.send(JSON.stringify({type:'watch',id:viewId}));else{clearTimeout(pollTimer);pump();}
  renderFrontiers();app.hud();
 }
 function syncObserved(value){
  if(!viewId)return;
  const player=value.players.find(p=>p.id===viewId);
  if(!player){selectFrontier(selfId);app.toast('관전 대상이 없어 내 국경지대로 돌아왔습니다.');return;}
  if(value.watchedId!==viewId||!Array.isArray(player.s.enemies)||watchVersion===value.version&&watchTarget===viewId)return;
  const first=watchTarget!==viewId,previous=first?null:watchGame.s,scene=first?'battle':watchGame.s.scene;
  watchGame.s=structuredClone(player.s);watchGame.normalize();watchGame.s.scene=scene;watchGame.s.events=[];watchGame.treeSites=game.treeSites;
  const lead=Math.min(2,Math.max(0,(value.serverTime-(value.simulationTime||value.serverTime)+latency/2)/1000))*(watchGame.s.speed===2?2:1);
  ClanVisual.adopt(watchGame.s,previous,lead);watchElapsed=0;watchVersion=value.version;watchTarget=viewId;watchReady=true;
  const commit=()=>{app.renderer.game=watchGame;app.renderer.scene=scene;app.renderer.selected=null;app.renderer.buildType=null;app.renderer.visualElapsed=0;app.renderer.upgradeScope='watch:'+viewId;document.body.dataset.watchLoading='false';};
  if(first)swapDisplay(commit);else commit();
  $('observerName').textContent=PlayerIdentity.label(player)+' · 조작 불가';
 }
 $('frontierMapBtn').onclick=()=>{if(!active||data?.solo)return;renderFrontiers();$('frontierMapDialog').showModal();};
 $('closeFrontierMap').onclick=()=>$('frontierMapDialog').close();
 $('returnToFrontier').onclick=()=>selectFrontier(selfId);
 function renderFrontiers(){
  if(!data)return;
  for(const [id,node]of mapNodes)if(!data.players.some(p=>p.id===id)){node.button.remove();mapNodes.delete(id);}
  for(const player of data.players){
   let node=mapNodes.get(player.id);
   if(!node){const button=document.createElement('button'),name=document.createElement('strong'),owner=document.createElement('span'),status=document.createElement('small');button.type='button';button.append(name,owner,status);button.onclick=()=>selectFrontier(player.id);$('frontierRegions').append(button);node={button,name,owner,status};mapNodes.set(player.id,node);}
   const selected=(viewId||selfId)===player.id;
   node.button.className='frontier-region frontier-'+(player.frontier||'central')+(selected?' current':'');
   node.button.setAttribute('aria-pressed',String(selected));node.name.textContent=regionOf(player).name;
   node.owner.textContent=PlayerIdentity.label(player)+(player.id===selfId?' · 나':'');
   node.status.textContent=player.s.over?(player.s.won?'승리':'탈락'):'성 '+Math.ceil(player.s.hp)+' / '+player.s.maxHp+' · '+player.s.wave+'웨이브';
  }
  const targets=data.players.filter(p=>p.id!==selfId&&!p.s.over);
  for(const select of [$('attackTarget'),$('potionTarget')]){const signature=targets.map(p=>p.id+'|'+p.name).join(';');if(select.dataset.members===signature)continue;const selected=select.value;select.dataset.members=signature;for(const option of [...select.options])if(!targets.some(p=>p.id===option.value))option.remove();for(const player of targets){let option=[...select.options].find(o=>o.value===player.id);if(!option){option=document.createElement('option');option.value=player.id;select.append(option);}option.textContent=regionOf(player).name+' · '+PlayerIdentity.label(player);}if(targets.some(p=>p.id===selected))select.value=selected;}
 }
 function hud(){
   const s=viewId&&watchReady?watchGame.s:game.s,waiting=active&&(!!viewId||!!data?.watchedId||queued.length>=8||Date.now()-lastGood>5000);
   const cooldown=speedCooldownMs(),speedPending=queued.some(c=>c.action==='setSpeed');$('speedBtn').disabled=!game.canAct()||waiting||cooldown>0||speedPending;$('speedBtn').style.setProperty('--speed-elapsed',(Math.max(0,Math.min(1,1-cooldown/5000))*360)+'deg');$('speedBtn').removeAttribute('data-wait');$('speedBtn').classList.toggle('speed-cooling',cooldown>0||speedPending);networkLabel();
   if(data?.status==='countdown'&&!failures)$('matchStatus').textContent=`${data.players.length}명 · ${Math.max(0,Math.ceil((data.readyAt-Date.now()-serverOffset)/1000))}초 후 시작`;
   if(failures&&roomId)$('networkState').textContent=`재연결 중 · 마지막 응답 ${Math.floor((Date.now()-lastGood)/1000)}초 전`;
   $('buildBarracks').textContent=s.barracks?'훈련소 건설 완료':'훈련소 건설 · 나무 100';
   $('buildBarracks').disabled=!game.canAct()||s.barracks||s.wood<100||waiting;
   $('armyCount').textContent=`대기 군사 ${s.army} / 50`;
   $('recruitBtn').disabled=!game.canAct()||!s.barracks||s.barracksBuild>0||s.gold<80||s.army>=50||waiting;
   $('buildBarracks').textContent=s.barracksBuild>0?'훈련소 건설 '+Math.ceil(s.barracksBuild)+'초':s.barracks?'훈련소 건설 완료':'훈련소 건설 · 나무 100';
   $('attackPotion').hidden=!s.multiplayer||s.research.attack!==-1;const cd=s.potionCooldown.attack;$('attackPotion').disabled=!active||!game.canAct()||s.crystals<10||cd>0||waiting;$('attackCooldown').textContent=cd>0?cd.toFixed(1):'';$('attackCooldown').classList.toggle('active',cd>0);$('castAttackPotion').disabled=$('attackPotion').disabled||!$('potionTarget').value;
   $('dispatchBtn').disabled=!active||!game.canAct()||!s.barracks||s.completed<20||s.waves.some(w=>w.number<=20)||s.army<1||s.dispatchCooldown>0||!$('attackTarget').value||waiting;
   $('dispatchHint').textContent=!active?'출병은 4인 매칭에서 이용할 수 있습니다.':s.completed<20?'20웨이브까지 방어를 마치면 출병할 수 있습니다.':s.dispatchCooldown>0?`다음 출병 ${Math.ceil(s.dispatchCooldown)}초`:'출병 가능 · 1~10명 · 다음 출병까지 8초';
 }
 // A reload uses the same HttpOnly session, so it resumes the same participant.
 const saved=sessionStorage.getItem('clan-room');if(saved){resuming=true;roomId=saved;$('matchDialog').showModal();$('joinMatch').disabled=true;$('matchStatus').textContent='이전 대전에 다시 연결 중…';pump();}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&roomId)pump();});
 $('attackPotion').onclick=()=>{$('attackPotionStatus').textContent='';$('attackDialog').showModal();};$('closeAttack').onclick=()=>$('attackDialog').close();$('castAttackPotion').onclick=()=>{if(!active)return;const r=queueAction('attackPotion',[$('potionTarget').value]);if(r?.error)app.toast(r.error);else $('attackDialog').close();};
 function animate(dt){
  if(!active||Date.now()-lastGood>5000||document.hidden)return;
  const visible=viewId?watchReady?watchGame:null:game;
  if(!visible||visible.s.paused)return;
  if(viewId){watchElapsed+=dt;app.renderer.visualElapsed=watchElapsed;}
  else app.renderer.visualElapsed=(app.renderer.visualElapsed||0)+dt;
  ClanVisual.animate(visible.s,dt,app.renderer.visualElapsed,Defense,game.treeSites);
 }
 async function startSolo(){
   if(joining||active)return;joining=true;app.audio.init();$('startBtn').disabled=true;
   try{const value=await request({op:'solo',name:window.Chronicle?.profile.name||'개척 군주',avatar:window.Chronicle?.profile.avatar||0,entryId:crypto.randomUUID()});apply(value);pump();}
   catch(e){app.toast('기록 서버에 연결하지 못했습니다. 잠시 후 다시 시작하세요.');}
   finally{joining=false;$('startBtn').disabled=false;}
 }
 return{hud,leave,animate,startSolo,selectFrontier,get spectating(){return !!viewId;},get viewGame(){return viewId&&watchReady?watchGame:game;},get viewPlayer(){return data?.players.find(p=>p.id===(viewId||selfId));},get selfPlayer(){return data?.players.find(p=>p.id===selfId);},get region(){return regionOf(data?.players.find(p=>p.id===(viewId||selfId)));},get active(){return active;},get audioKey(){return (roomId||'local')+':'+(selfId||'self');}};
}
