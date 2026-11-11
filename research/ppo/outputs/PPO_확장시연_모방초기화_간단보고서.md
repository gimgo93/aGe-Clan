**확장 교사 시연 모방 초기화 — 간단 결과 보고서**

작성: 2026-11-08 20:08 KST

기존 구조와 계층형, 학습 시드47·48의 모방 초기화 4개를 완료했다. 아래는 **PPO 추가 학습 전** 저장 가중치를 다시 읽어 평가한 결과다.

이번 모방 초기화 단계에서는 기존 구조가 계층형보다 높은 평균 완료 웨이브를 보였다. 앞서 보고한 시드47의 35.2는 선택용 5판 평균이고, 이번 40.5는 같은 저장 가중치를 새로운 20판에서 측정한 평균이다.

|구조|학습 시드|선택/수행 업데이트|독립20판 평균 완료|중앙값|완료 범위|
|---|---:|---:|---:|---:|---|
|기존|47|8,000/8,000|40.50|42.0|26~47|
|계층형|47|4,000/8,000|24.50|24.0|16~46|
|기존|48|8,000/8,000|43.25|44.0|29~55|
|계층형|48|8,000/8,000|27.20|24.5|17~49|

훈련36판·100,325상태, 시연 검증12판·32,301상태를 두 구조에 동일하게 제공했다. 궁수·발리스타·폭격포·서리·번개 및 경제·연구·포션 행동을 포함한다. 번개 건설은 훈련8건·검증3건으로 적다.
모방 업데이트500·1000·2000·4000·8000을 검증했고, 검증 게임5판의 중앙값→평균→종류 균형 손실로 초기 가중치를 선택했다. 선택용 Python게임 시드412000–412004와 이번 독립 확인432000–432019를 분리했다. 계층형은 상위→타워 종류→위치의 경로 로그 확률 합으로 배우고 단계별 정확도를 측정했다. 표의 선택/수행은 PPO에 넘긴 체크포인트와 실제 모방 업데이트 수다.
결과는 실제 연속 완료 웨이브다. 무효 행동과 시간 제한 종료 수는 아래와 같다. 교사 평균34.6~47.2웨이브는 학생 결과와 구분한다. 이번 값은 모방 초기화 성능이며, 현재 별도로 진행 중인 PPO 후 성능이나 최종 게임 난이도 확정 값은 아니다.
최고 평균 모델 flat-48-imitation의 40웨이브 이상 완료 비율은 15/20(75%)다. 사전 기준80%에는 미달해 게임 난이도 후보로 확정하지 않는다.
독립 확인80판: 무효 행동 0건, 제한 종료 0판.
다음 단계는 같은 초기 모델에서 진행 중인 PPO 후 결과와 비교해 향상·퇴화를 확인하는 것이다. 모방 업데이트는 교사 행동의 정답 손실로 수행하며 게임 보상을 직접 사용하지 않는다. 평가 엔진과 후속 PPO의 defense-v1 보상은 유지했고, 모방 중 critic과 PPO optimizer는 갱신하지 않았다. 기본 초기화 대조군은 별도 PPO 비교에 포함된다.

**파일·데이터 흐름**

Node 교사·수집 `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-expanded-demo-v2\teachers.mjs`·`C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-expanded-demo-v2\collect.mjs` → 같은 실제 게임 엔진 → 원본 관측·마스크·정답 → `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo_expanded_prepare.py`의 공통 NPZ 검증 → `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo_expanded_train.py`의 모방 초기화. 이번 독립 평가·보고 제어는 `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo_imitation_brief.py`다.
자료와 모델은 `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-expanded-demo-v2`의 data·initial 폴더에, 에피소드별 결과는 bc-confirmation-*.json과 bc-final-summary.json에 저장했다.

- flat-47-imitation: `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-expanded-demo-v2\initial\flat-47-imitation\model.zip`
- hierarchy-47-imitation: `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-expanded-demo-v2\initial\hierarchy-47-imitation\model.zip`
- flat-48-imitation: `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-expanded-demo-v2\initial\flat-48-imitation\model.zip`
- hierarchy-48-imitation: `C:\Users\jjiho\Documents\Codex\PPO학습\PPO강화학습·난이도연구\work\ppo-expanded-demo-v2\initial\hierarchy-48-imitation\model.zip`
