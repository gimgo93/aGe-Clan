**확장 시연 학습 시작 확인**

확인 시각: 2026-11-08T19:31:49.058136. 두 구조의 PPO가 실제 실행 중이다. 이 문서는 시작 시점 기록이며 전체 실험 완료 보고서가 아니다.

훈련36판/100325상태, 시연 검증12판/32301상태를 같은 NPZ로 두 구조에 제공했다. 다섯 타워와 광부·벌목·연구소·연구·포션·수리가 포함된다. 번개 건설은 훈련8/검증3건으로 아직 적다.

|모델|수행한 모방 업데이트|선택 업데이트|선택 모델 검증5판 평균 완료|관측한 PPO스텝|
|---|---:|---:|---:|---:|
|flat-47-imitation|8000|8000|35.20|18944|
|hierarchy-47-imitation|8000|4000|23.60|13056|

이 5판은 초기화 선택용 검증 게임이다. 최종 성능·난이도 달성으로 확정하지 않는다. 이후 시드47·48의 기존/계층×기본/모방8조건을 각131072PPO스텝, 총1048576스텝으로 진행한다. 개발420000–420009, 최종430000–430019를 별도로 평가한다. 보상은 defense-v1 그대로다.
계층형은 경로별 조건부 로그 확률 합으로 배우고 상위·타워·위치 정확도를 따로 측정한다. 같은 최대 예산과 선택 규칙을 적용하되 실제 모방 업데이트와 선택 체크포인트는 다를 수 있다. 기본 대조군에는 시연 학습을 적용하지 않는다.

학습 제어 `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo_expanded_train.py` → 고정 입력/계층 정책 → Python env → JSONL → Node bridge → `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-expanded-demo-v2\engine\lib\game-engine.js`. 모델·체크포인트·CSV·검증 JSON은 `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-expanded-demo-v2`에 저장된다.

[사전 계획](C:/Users/jjiho/Documents/Codex/PPO학습/PPO강화학습·난이도연구/outputs/PPO_확장시연_학습계획.md) · [자동 진행 보고서](C:/Users/jjiho/Documents/Codex/PPO학습/PPO강화학습·난이도연구/outputs/PPO_확장시연_학습진행보고서.md) · [수집 검증](C:/Users/jjiho/Documents/Codex/PPO학습/PPO강화학습·난이도연구/outputs/PPO_확장시연_수집검증.md)
