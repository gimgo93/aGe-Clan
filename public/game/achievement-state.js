/* Achievement thresholds and deduplication shared by the display and notification queue. */
(()=>{
 'use strict';
 const definitions=[
  {id:'wave-10',key:'wave',goal:10,title:'첫 방어선',detail:'10웨이브 방어',art:0},
  {id:'wave-20',key:'wave',goal:20,title:'개척지의 수호자',detail:'20웨이브 방어',art:1},
  {id:'wave-30',key:'wave',goal:30,title:'끝없는 전설',detail:'30웨이브 방어',art:2},
  {id:'wave-50',key:'wave',goal:50,title:'불멸의 군주',detail:'50웨이브 방어',art:3},
  {id:'kills-1000',key:'kills',goal:1000,title:'천의 군세',detail:'적 1,000명 처치',art:4},
  {id:'castle-20',key:'castle',goal:20,title:'현대의 성채',detail:'성 레벨 20 달성',art:5},
  {id:'miners-30',key:'miners',goal:30,title:'황금의 손',detail:'광부 30명 고용',art:6},
  {id:'wood-100',key:'wood',goal:100,title:'마을의 기초',detail:'나무 100개 수확',art:7},
  {id:'tower-5',key:'tower',goal:5,title:'명장의 무기',detail:'포탑 한 종류 레벨 5',art:8},
  {id:'research-3',key:'research',goal:3,title:'연금술의 대가',detail:'서로 다른 포션 3종 연구',art:9},
  {id:'crystals-100',key:'crystals',goal:100,title:'수정 탐험가',detail:'크리스탈 100개 채굴',art:10}
 ];
 function progress(s){return{wave:s.completed||0,kills:s.kills||0,castle:s.castle||0,miners:s.miners||0,wood:s.woodHarvested||0,tower:Math.max(0,...Object.values(s.towerLevels||{})),crystals:s.crystalsMined||0,research:Object.values(s.research||{}).filter(v=>v===-1).length};}
 class Tracker{
  constructor(records={}){this.reset(records);}
  reset(records={}){this.known=new Set();this.records={...records};this.seed(records);}
  seed(records={}){for(const [key,value] of Object.entries(records))this.records[key]=Math.max(this.records[key]||0,Number(value)||0);for(const medal of definitions)if((this.records[medal.key]||0)>=medal.goal)this.known.add(medal.id);}
  observe(s){if(!s?.started)return[];for(const [key,value] of Object.entries(progress(s)))this.records[key]=Math.max(this.records[key]||0,value);const earned=definitions.filter(m=>(this.records[m.key]||0)>=m.goal&&!this.known.has(m.id));for(const m of earned)this.known.add(m.id);return earned;}
 }
 window.AgeAchievements={definitions,progress,Tracker};
})();
