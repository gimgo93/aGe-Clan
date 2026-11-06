(() => {
 'use strict';
 const regions=Object.freeze({west:{name:'서부 국경지대',english:'WESTERN FRONTIER'},south:{name:'남부 국경지대',english:'SOUTHERN FRONTIER'},north:{name:'북부 국경지대',english:'NORTHERN FRONTIER'},east:{name:'동부 국경지대',english:'EASTERN FRONTIER'},central:{name:'중앙 국경지대',english:'CENTRAL FRONTIER'}});
 function region(player,solo=false){return regions[solo?'central':player?.frontier]||regions.central;}
 window.FrontierView={regions,region};
})();
