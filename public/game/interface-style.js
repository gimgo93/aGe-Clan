(()=>{
 'use strict';
 const key='ageclan-interface-style-v1',styles=new Set(['original','fortress']);
 const sheet=document.getElementById('fortressControls');
 let selected='original';try{const saved=localStorage.getItem(key);if(styles.has(saved))selected=saved;}catch{}
 function apply(){if(sheet)sheet.disabled=selected!=='fortress';document.documentElement.dataset.interfaceStyle=selected;}
 apply();
 document.addEventListener('DOMContentLoaded',()=>{
  const select=document.getElementById('interfaceStyle'),status=document.getElementById('interfaceStyleStatus');if(!select)return;
  const label=()=>selected==='original'?'기존 디자인':'성채 UI 개선';
  function render(saved=true){select.value=selected;if(status)status.textContent=label()+'을 사용합니다.'+(saved?' 언제든 변경할 수 있습니다.':' 브라우저 저장에 실패해 현재 탭에만 적용됩니다.');}
  render();
  select.addEventListener('change',()=>{
   if(!styles.has(select.value))return;selected=select.value;apply();let saved=true;
   try{localStorage.setItem(key,selected);}catch{saved=false;}render(saved);
  });
 });
})();
