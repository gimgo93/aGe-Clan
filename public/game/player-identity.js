(() => {
'use strict';
function label(player){return (player?.name||'개척 군주')+(player?.admin===true?' (관리자)':'');}
function render(node,player,prefix=''){
 node.replaceChildren(document.createTextNode(prefix+(player?.name||'개척 군주')));
 if(player?.admin===true){const badge=document.createElement('span');badge.className='identity-admin';badge.textContent='(관리자)';badge.setAttribute('aria-label','서버에서 확인된 관리자');node.append(badge);}
}
window.PlayerIdentity={label,render};
})();
