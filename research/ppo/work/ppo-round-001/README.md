# PPO 001회 파이참 실행

이번 프로젝트의 실행 파일은 `run_ppo_001.py`다. 코드는 Codex가 로컬 파일에 수정하고, 파이참이 같은 파일을 읽어 편집기에 표시한다.

파이참 오른쪽 위 실행 구성에서 `PPO 001 학습률 비교`를 선택하고 초록색 실행 버튼 또는 Shift+F10을 누른다. 아래 Run 창에서 PREFLIGHT, START, TRAIN, CHECKPOINT, DONE, EVAL, ROUND 001 COMPLETE 메시지를 확인한다.

기존에 등록된 파이참 Python SDK가 시작 파일을 실행한다. 시작 파일은 `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-venv\Scripts\python.exe`를 호출하여 PPO 패키지와 기존 모델의 실행 환경을 맞춘다. Run 창 첫 출력에 실제 전용 환경 경로가 나온다.

학습은 네 조건을 CPU 프로세스 4개에서 병행한다. 각 조건은 계층형42·43의 기본/모방 초기 가중치를 읽어 낮은 학습률에서131,072스텝 학습한다. 기존 학습률의131,072 모델은 평가 대조군으로 읽는다. 시연 모방을 이번에 다시 수행하는 비용은 없다.

PPO Python은 기존 동결 엔진 묶음의 `ml/fixed_env.py`와 `ml/env.py`를 거쳐 Node `ml/bridge.mjs`에 관측·행동을 주고받는다. 실제 상태 전이는 `lib/game-engine.js`에서 계산한다.

현재 폴더의 주요 파일은 다음과 같다.

- `plan.json`은 사전에 정한 예산·시드·판정 기준과 동결 파일 해시다.
- `training.log`는 진행 메시지다.
- `state.json`은 단계와 완료 조건을 기록한다.
- `runs`는 조건별 모델·PPO 통계 CSV·완료 게임 CSV를 보관한다.
- `evaluations`는 게임별 완료 웨이브와 행동 다양성을 기록한다.
- `result.json`은 완료 결과다.

간단보고서는 `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\outputs\PPO_간단보고서_001회.md`에 갱신한다. 학습을 모두 완료한 뒤 같은 실행 버튼을 다시 누르면 저장된 완료 결과를 확인한다. 실행 중 중복 시작은 파일 잠금으로 차단한다.
