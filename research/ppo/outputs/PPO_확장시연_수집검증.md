**확장 시연 수집·검증 결과**

교사의 직접 엔진 게임 시드와 학생의 Python 평가 시드를 구분한다. 아래 결과는 교사의 성능이며 PPO 학생 성능이 아니다.

|교사|독립 확인 5판 평균 완료|중앙값|
|---|---:|---:|
|m20-o3-pierce|47.20|49|
|m20-o5-splash|44.20|45|
|m20-o5-control|43.20|43|
|save-m30-o5-moderntrue|34.60|34|

training: 36판, 100325상태. 타워별 건설 {'archer': 887, 'ballista': 1178, 'cannon': 278, 'frost': 76, 'storm': 8}. 행동별 수 {'build': 2427, 'upgradeTower': 470, 'upgradeCastle': 523, 'wait': 94113, 'hire': 564, 'hireWoodcutter': 144, 'buildLab': 36, 'researchPotion': 72, 'potion': 1697, 'repairCastle': 279}.
자료 `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-expanded-demo-v2\data\teacher-training.npz`. SHA256 `45d0dadf2294f3a71d1bd09faf749afcbd2d96534c861f97f02bcbf793c1d235`.

validation: 12판, 32301상태. 타워별 건설 {'archer': 320, 'ballista': 403, 'cannon': 72, 'frost': 13, 'storm': 3}. 행동별 수 {'build': 811, 'upgradeTower': 152, 'upgradeCastle': 167, 'wait': 30171, 'hire': 189, 'hireWoodcutter': 48, 'buildLab': 12, 'researchPotion': 24, 'potion': 637, 'repairCastle': 90}.
자료 `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-expanded-demo-v2\data\teacher-validation.npz`. SHA256 `964b832bbb241e64366283ac1434bfa1caf254be7a92ed4d828e1cef429b354d`.

검증: 두 자료의 직접 엔진 시드 분리, 모든 정답이 해당 상태의 유효 행동, 유한 관측, 원본 바이너리 크기 일치, 다섯 타워 및 경제·연구 행동 포함, 이전 회차와 같은 엔진 지문을 확인했다.
교사는 현재 엔진 상태와 공개 규칙을 사용하고 미래 RNG는 읽지 않는다. 교사의 개별 적 위치 판단은 학생의 구간별 관측보다 세밀할 수 있어 완전한 행동 복원을 보장하지 않는다. 자료의 희소 행동 수를 공개하며, 교사 성능을 학생의 달성 성능으로 옮겨 적지 않는다.
제어·변환 파일 `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo_expanded_prepare.py`. 교사 정의·수집 파일은 `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-expanded-demo-v2`의 teachers.mjs·collect.mjs다. Node TrainingSession이 실제 엔진을 진행하며 관측·마스크·정답을 바이너리로 저장하고, Python이 NPZ로 변환·검증했다.
