(() => {
'use strict';
function endlessUnlocked(s){return !!s.endlessAnnounced||((s.completed||0)>=20&&!(s.waves||[]).some(w=>w.number<=20));}
function waveLabel(s){return String(s.wave||0).padStart(2,'0')+' / '+(s.multiplayer||endlessUnlocked(s)?'∞':'20');}
class GamePresentation{
 constructor(){this.previous=null;this.timer=null;this.banner=document.createElement('div');this.banner.id='milestoneBanner';this.banner.hidden=true;this.banner.setAttribute('role','status');this.banner.setAttribute('aria-live','polite');this.banner.innerHTML='<svg aria-hidden="true"><use href="#i-castle"></use></svg><div><small>THE FIRST FRONTIER</small><strong>20웨이브 방어 성공</strong><span>개척지의 수호자 · 무한 방어가 열렸습니다</span></div>';document.body.append(this.banner);}
 observe(s,key){const unlocked=endlessUnlocked(s),old=this.previous;this.previous={key,time:s.time,started:s.started,unlocked};if(old?.started&&s.started&&!s.multiplayer&&old.key===key&&s.time>=old.time&&!old.unlocked&&unlocked)this.celebrate();if(!s.started)this.hide();}
 celebrate(){clearTimeout(this.timer);this.banner.hidden=false;this.banner.classList.remove('celebrate');void this.banner.offsetWidth;this.banner.classList.add('celebrate');this.timer=setTimeout(()=>this.hide(),4200);}
 hide(){clearTimeout(this.timer);this.banner.hidden=true;this.banner.classList.remove('celebrate');}
 reset(){this.previous=null;this.hide();}
}
window.GamePresentation=GamePresentation;window.GamePresentationRules={endlessUnlocked,waveLabel};
})();
