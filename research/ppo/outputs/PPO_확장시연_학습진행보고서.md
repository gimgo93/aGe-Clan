**확장 시연·검증 기반 초기화·PPO 진행 보고서**

상태: complete. 시작 2026-11-08T19:20:48.611110.

기존/계층 구조에 정확히 같은 새 시연과 추출 규칙을 제공한다. 기본 초기화 대조군에는 시연이나 시연 통계가 들어가지 않는다. 교사 성능과 PPO 학생 성능을 구분한다.
계층형은 상위 선택→타워 종류→위치의 조건부 로그 확률 합으로 모방 손실을 계산한다. 검증에서 상위·타워·위치 정확도를 따로 기록한다. 최종 행동의 결합 확률을 PPO에 사용한다.
대기 50%·나머지 50% 배치이며, 나머지는 상위 행동 종류→세부 종류→웨이브 구간을 고르게 추출한다. 기존 구조에도 같은 배치를 준다. 모방 체크포인트 500/1000/2000/4000/8000에서 같은 학생 검증 게임 5판과 별도 시연 검증 손실을 비교한다. 최소 4000 이후 두 차례 개선이 없으면 조기 종료한다. 검증 게임 중앙값→평균→종류 균형 NLL로 모델을 고른다. 실제 수행 업데이트와 선택 업데이트는 별도다.
학습 시드47·48, 기존/계층×기본/새 모방8조건, 각PPO131072스텝(총1048576). 입력148고정 단위, 행동173, defense-v1 보상, gamma0.99, entropy0.003, LR0.0001, rollout256/batch64/epoch4를 유지한다. 목표 종료0·최대120000틱이며 제한 종료는 최대 성과의 하한이다.
개발 Python 시드420000–420009, 최종430000–430019. 시연 직접 엔진 시드410000–410035/411000–411011, 학생 초기화 선택 Python시드412000–412004와 구분한다. 목표는 기본 초급20–25·중급30–35·고급40이상, 중앙값/80%구간/제한종료없음 조건이다.
새 시연과 초기화 선택 절차, 학습 시드가 이전 회차와 함께 바뀌므로 과거 결과와의 차이를 새 시연만의 인과 효과라고 부르지 않는다. 이번 회차 안의 두 구조 비교가 주 분석이다. 교사 ID는 학생에게 주지 않고 미래 RNG도 사용하지 않는다. 교사의 일부 위치 판단은 학생의 구간별 관측보다 정밀할 수 있다.

훈련 시연 36판/100325상태, 검증 12판/32301상태.
훈련 타워별 건설 {'archer': 887, 'ballista': 1178, 'cannon': 278, 'frost': 76, 'storm': 8}.

|평가|조건|판수|평균 완료|중앙값|범위|최고 시작|제한 종료|
|---|---|---:|---:|---:|---|---:|---:|
|development|flat-47-imitation|10|41.00|41.5|36~44|45|0|
|development|hierarchy-47-imitation|10|45.20|46.0|43~46|48|0|
|development|flat-48-imitation|10|37.80|37.5|33~43|44|0|
|development|flat-47-basic|10|1.00|1.0|1~1|2|0|
|development|hierarchy-48-imitation|10|31.80|28.0|26~47|48|0|
|development|hierarchy-47-basic|10|1.00|1.0|1~1|2|0|
|development|flat-48-basic|10|1.00|1.0|1~1|2|0|
|development|hierarchy-48-basic|10|2.00|2.0|2~2|3|0|
|confirmation|flat-47-imitation|20|40.65|42.0|35~46|47|0|
|confirmation|hierarchy-47-imitation|20|45.15|45.0|43~47|49|0|
|confirmation|flat-47-basic|20|1.00|1.0|1~1|2|0|
|confirmation|flat-48-imitation|20|37.20|37.5|20~45|46|0|
|confirmation|hierarchy-47-basic|20|1.00|1.0|1~1|2|0|
|confirmation|flat-48-basic|20|1.00|1.0|1~1|2|0|
|confirmation|hierarchy-48-basic|20|2.00|2.0|2~2|3|0|
|confirmation|hierarchy-48-imitation|20|28.30|28.0|23~43|45|0|

개발 선택: {'basic': 'hierarchy-48-basic', 'imitation': 'flat-47-imitation'}

**실제 파일과 상호 작용**

- 제어·초기화·학습·평가·자동 보고: `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo_expanded_train.py`.
- 교사·수집: `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-expanded-demo-v2\teachers.mjs`, `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-expanded-demo-v2\collect.mjs`. Node의 TrainingSession이 `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-expanded-demo-v2\engine\lib\game-engine.js`를 실행해 원본 관측/마스크/정답을 바이너리로 저장한다.
- 변환·감사: `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo_expanded_prepare.py` → `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-expanded-demo-v2\data-audit.json`와 data/teacher-training.npz·teacher-validation.npz. 두 구조가 동일 SHA256의 파일을 읽는다.
- 학생: `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-expanded-demo-v2\engine\ml\hierarchical.py`·fixed_env.py → env.py → JSONL → bridge.mjs → 게임 엔진. 배우는 단계와 별개로 게임 행동 한 번당0.1초 tick10회만 진행한다.
- 모델/모방 체크포인트/학습 CSV/검증 게임/최종 평가/다음 계획: `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-expanded-demo-v2`. 모방 중 진행은 각runs/조건/bc-progress.json, PPO 중 진행은 progress.csv에 기록한다.
- 보고서: `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\outputs\PPO_확장시연_학습진행보고서.md`. 프로세스가 결과 도착 시 갱신한다. 실행 실패 시 상태와 오류를 기록한다.
