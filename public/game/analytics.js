(()=>{
 'use strict';
 const consentKey='ageclan-analytics-consent-v1',visitorKey='ageclan-analytics-visitor-v1',sessionKey='ageclan-analytics-session-v1';
 const allowed=new Set(['page_view','game_start','game_end','pvp_game_start','pvp_game_end']);
 const uuid=()=>crypto.randomUUID();
 function consent(){try{return localStorage.getItem(consentKey)||'';}catch{return '';}}
 function identity(){if(consent()!=='yes')return null;try{let visitor=localStorage.getItem(visitorKey),session=sessionStorage.getItem(sessionKey);if(!visitor){visitor=uuid();localStorage.setItem(visitorKey,visitor);}if(!session){session=uuid();sessionStorage.setItem(sessionKey,session);}return{visitorId:visitor,sessionId:session};}catch{return null;}}
 function send(event,method='POST'){const analytics=identity();if(!analytics||!allowed.has(event))return Promise.resolve();const payload=JSON.stringify({event,analytics});return fetch('/api/clan/analytics',{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:payload,keepalive:true}).catch(()=>{});}
 function track(event){return send(event);}
 function trackOnce(event,key){if(!allowed.has(event))return;try{const once='ageclan-analytics-once:'+event+':'+String(key).slice(0,100);if(sessionStorage.getItem(once))return;sessionStorage.setItem(once,'1');}catch{}return track(event);}
 function forget(){const analytics=identity();if(analytics)send('page_view','DELETE');try{localStorage.removeItem(visitorKey);sessionStorage.removeItem(sessionKey);localStorage.setItem(consentKey,'no');}catch{}hide();}
 let banner;
 function hide(){banner?.remove();banner=null;}
 function preferences(){
  if(banner){banner.focus();return;}
  banner=document.createElement('section');banner.tabIndex=-1;banner.setAttribute('role','dialog');banner.setAttribute('aria-label','익명 이용 통계 설정');banner.setAttribute('aria-live','polite');
  Object.assign(banner.style,{position:'fixed',zIndex:'10000',left:'max(12px,env(safe-area-inset-left))',right:'max(12px,env(safe-area-inset-right))',bottom:'max(12px,env(safe-area-inset-bottom))',maxWidth:'760px',margin:'auto',padding:'18px',border:'1px solid #b89954',borderRadius:'14px',background:'#17251e',color:'#f4eedc',boxShadow:'0 12px 40px #0009',font:'14px/1.6 system-ui,sans-serif'});
  const copy=document.createElement('p');copy.style.margin='0 0 12px';copy.textContent='aGe Clan은 서비스 상태 확인을 위해 시간, 대략적인 국가 코드, 요청 종류와 응답 결과를 익명 합산합니다. 선택 동의하면 무작위 식별자로 페이지 방문, Google 로그인 결과, 게임·대전 시작과 종료도 기록합니다. IP 주소, 이메일, Google 인증 토큰, 전체 User-Agent는 이 통계에 저장하지 않으며 90일 후 삭제합니다. 동의하지 않아도 게임을 이용할 수 있습니다.';
  const links=document.createElement('p');links.style.margin='0 0 12px';const a=document.createElement('a');a.href='privacy.html';a.target='_blank';a.rel='noopener';a.textContent='개인정보 안내';a.style.color='#e6ca7c';links.append(a);
  const controls=document.createElement('div');Object.assign(controls.style,{display:'flex',gap:'10px',flexWrap:'wrap'});
  const button=(label,fn,primary)=>{const b=document.createElement('button');b.type='button';b.textContent=label;Object.assign(b.style,{padding:'9px 14px',borderRadius:'8px',border:primary?'1px solid #e2c679':'1px solid #837c67',background:primary?'#d9b65c':'transparent',color:primary?'#1c241d':'#f4eedc',font:'600 14px system-ui',cursor:'pointer'});b.onclick=fn;controls.append(b);return b;};
  button('익명 통계 허용',()=>{try{localStorage.setItem(consentKey,'yes');}catch{}hide();track('page_view');},true);
  button('허용하지 않음',()=>{if(consent()==='yes')forget();else{try{localStorage.setItem(consentKey,'no');}catch{}hide();}},false);
  banner.append(copy,links,controls);document.body.append(banner);banner.focus();
 }
 window.AgeAnalytics={track,trackOnce,context:identity,showPreferences:preferences};
 document.getElementById('analyticsSettings')?.addEventListener('click',preferences);
 if(consent()==='yes')track('page_view');else if(consent()!=='no')preferences();
})();
