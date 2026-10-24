// 편집 도구(editor.html)에서 새 파일을 내려받아 교체한 뒤 재배포하세요.
window.FRONTIER_BALANCE = {
  version: 1,
  startGold: 240,
  startCrystals: 12,
  waveRestSeconds: 20,
  // 혼자하기 중장갑 적의 화살 저항. 대전과 상위 포탑/물약에는 적용하지 않습니다.
  soloArrowResistance: {startWave: 13, step: 0.2, max: 0.9},
  towers: {
    archer: {gold: 140, damage: 16, rate: 0.8, range: 240},
    ballista: {gold: 260, damage: 61, rate: 1.4, range: 429},
    cannon: {gold: 370, damage: 65, rate: 1.8, range: 240},
    frost: {gold: 460, damage: 32, rate: 1, range: 280},
    storm: {gold: 570, damage: 44, rate: 0.65, range: 310}
  }
};
