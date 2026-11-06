(()=>{
 'use strict';
 const consentKey='ageclan-analytics-consent-v1',visitorKey='ageclan-analytics-visitor-v1',sessionKey='ageclan-analytics-session-v1',pendingKey='ageclan-analytics-delete-pending-v1';
 const allowed=new Set(['page_view','game_start','game_end','pvp_game_start','pvp_game_end']);
 let banner,working=null,declined=false,memoryPending=null;
 const read=(store,key)=>{try{return store.getItem(key);}catch{return null;}};
 const consent=()=>read(localStorage,consentKey)||'';
 function pending(){if(memoryPending)return memoryPending;try{return JSON.parse(read(localStorage,pendingKey)||'null');}catch{return null;}}
 function identity(){if(declined||consent()!=='yes'||pending())return null;try{let visitor=localStorage.getItem(visitorKey),session=sessionStorage.getItem(sessionKey);if(!visitor){visitor=crypto.randomUUID();localStorage.setItem(visitorKey,visitor);}if(!session){session=crypto.randomUUID();sessionStorage.setItem(sessionKey,session);}return{visitorId:visitor,sessionId:session};}catch{return null;}}
 function track(event){const analytics=identity();if(!analytics||!allowed.has(event))return Promise.resolve();return fetch('/api/clan/analytics',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({event,analytics}),keepalive:true}).catch(()=>{});}
 function trackOnce(event,key){if(!allowed.has(event)||!identity())return;try{const once='ageclan-analytics-once:'+event+':'+String(key).slice(0,100);if(sessionStorage.getItem(once))return;sessionStorage.setItem(once,'1');}catch{}return track(event);}
 function hide(){const current=banner;banner=null;if(current){current.close();current.remove();}}
 function announce(text,error=false){const node=banner?.querySelector('[role="status"]');if(node){node.textContent=text;node.dataset.error=String(error);}}
 async function retryDeletion(){
  if(working)return working;const analytics=pending();if(!analytics)return true;
  working=(async()=>{
   announce('새 통계 수집은 중단했습니다. 이전 기록을 삭제하는 중…');
   // Server-side suppression handles late writes; a hung older POST must not
   // prevent the deletion request or postpone its timeout indefinitely.
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
   try{
    const response=await fetch('/api/clan/analytics',{method:'DELETE',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({analytics}),keepalive:true,signal:controller.signal});
    if(!response.ok)throw Error('기록을 삭제하지 못했습니다.');
    if(read(localStorage,visitorKey)===analytics.visitorId)localStorage.removeItem(visitorKey);
    sessionStorage.removeItem(sessionKey);localStorage.removeItem(pendingKey);memoryPending=null;
    announce('이 브라우저의 선택 동의 기록을 삭제했습니다. 새 통계 수집은 중단된 상태입니다.');return true;
   }catch{announce('새 통계 수집은 중단했습니다. 이전 기록 삭제가 완료되지 않았습니다. 다시 시도해 주세요.'+(memoryPending&&!read(localStorage,pendingKey)?' 브라우저 저장에 실패해 재시도 정보가 이 탭에만 남아 있습니다.':''),true);return false;}
   finally{clearTimeout(timer);}
  })().finally(()=>{working=null;renderControls();});renderControls();return working;
 }
 async function forget(){
  const analytics=pending()||identity();declined=true;memoryPending=analytics;
  try{localStorage.setItem(consentKey,'no');if(analytics)localStorage.setItem(pendingKey,JSON.stringify(analytics));}
  catch{announce('새 통계 수집은 중단했습니다. 브라우저 설정 저장에 실패해 이 탭에서 삭제를 재시도합니다.',true);}
  renderControls();if(analytics)return retryDeletion();announce('선택 통계를 수집하지 않습니다.');return true;
 }
 function button(label,fn,primary=false){const node=document.createElement('button');node.type='button';node.textContent=label;node.className=primary?'primary-small':'mini-button';node.onclick=fn;return node;}
 function renderControls(){
  const controls=banner?.querySelector('.analytics-controls');if(!controls)return;
  if(pending())controls.replaceChildren(button(working?'삭제 중…':'기록 삭제 다시 시도',()=>retryDeletion(),true),button('닫기',hide));
  else controls.replaceChildren(button('익명 통계 허용',()=>{try{localStorage.setItem(consentKey,'yes');declined=false;hide();track('page_view');}catch{announce('브라우저 설정을 저장하지 못했습니다.',true);}},true),button('허용하지 않음',()=>forget()),button('닫기',hide));
  if(working)controls.querySelector('button').disabled=true;
 }
 function preferences(){
  if(banner){banner.focus();return;}
  banner=document.createElement('dialog');banner.className='analytics-preferences';banner.tabIndex=-1;banner.setAttribute('aria-label','익명 이용 통계 설정');
  banner.addEventListener('cancel',event=>{event.preventDefault();hide();});
  const heading=document.createElement('h2');heading.textContent='익명 이용 통계';
  const copy=document.createElement('p');copy.textContent='서비스 상태 확인을 위해 국가 코드·요청 종류·응답 결과를 합산합니다. 선택 동의하면 무작위 식별자로 방문·로그인·게임 시작과 종료를 기록하며 최대 90일 보관합니다. 동의하지 않아도 게임을 이용할 수 있습니다.';
  const link=document.createElement('a');link.href='privacy.html';link.target='_blank';link.rel='noopener';link.textContent='개인정보 안내';
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const controls=document.createElement('div');controls.className='analytics-controls';const snippetExcluded=document.createElement('div');snippetExcluded.setAttribute('data-nosnippet','');snippetExcluded.append(heading,copy,link,status,controls);banner.append(snippetExcluded);document.body.append(banner);renderControls();
  if(pending())announce('새 통계 수집은 중단했습니다. 이전 기록 삭제를 다시 시도할 수 있습니다.',true);
  // A native dialog must enter the top layer above the open settings dialog;
  // a high-z-index section in body would remain inert behind that modal.
  banner.showModal();banner.focus();
 }
 window.AgeAnalytics={track,trackOnce,context:identity,showPreferences:preferences};
 document.getElementById('analyticsSettings')?.addEventListener('click',preferences);
 window.addEventListener('online',()=>{if(pending())retryDeletion();});
 if(pending()){preferences();retryDeletion();}else if(consent()==='yes')track('page_view');else if(consent()!=='no')preferences();
})();
