(() => {
'use strict';
const key='age-guest-session-v1';
function integer(n){const value=new Uint32Array(1);crypto.getRandomValues(value);return value[0]%n;}
function create(){const adjectives=['고요한','용감한','푸른','은빛','붉은','굳건한','빛나는','새벽의','현명한','황금의','바람의','숲속의'];const symbols=['매','사자','늑대','별','참나무','방패','불꽃','산'];
 return {name:adjectives[integer(adjectives.length)]+' '+symbols[integer(symbols.length)]+' '+String(integer(10000)).padStart(4,'0'),avatar:integer(8)};
}
function valid(p){return p&&typeof p.name==='string'&&p.name.trim().length>0&&p.name.length<=16&&!/[<>\u0000-\u001f]/.test(p.name)&&Number.isInteger(p.avatar)&&p.avatar>=0&&p.avatar<8;}
function save(p){try{sessionStorage.setItem(key,JSON.stringify(p));}catch{}return {...p};}
function load(){try{const p=JSON.parse(sessionStorage.getItem(key)||'null');if(valid(p))return {...p};}catch{}return save(create());}
window.GuestProfile={create,load,save,valid};
})();
