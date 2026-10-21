# 1차 학습 설계 · 2026-10-21

## 목표와 판단 기준

실제 게임 규칙을 유지한 혼자하기 환경에서 PPO가 방어 행동을 배우는지 확인합니다.
1차 실험은 학습 시드 42, 43 각각 32,768행동, CPU 1스레드로 제한합니다.
평가에는 학습 시드와 다른 Python 시드 20000–20019를 모든 정책에 공통 적용합니다.
대기·173개 행동 균등 무작위·고정 궁수 건설/강화 정책과 비교합니다.
시드 2개만으로 학습 안정성을 확정할 수 없으며 탐색 실험으로 해석합니다.

주요 지표는 300게임초 생존 에피소드 수, 평균 생존 시간, 완료 웨이브, 처치 수입니다.
보상과 실패 행동 비율도 함께 봅니다. 엔진의 completed는 적이 성에 도달해 피해를 준 경우에도
증가할 수 있으므로 완료 웨이브 하나만으로 방어에 성공했다고 판단하지 않습니다.
목표 웨이브 모드를 사용하지 않으므로 target_successes는 이 실험의 성능 지표가 아닙니다.
규칙 기반 정책은 고정 비교 기준이며 평가 결과에 맞춰 수정하지 않습니다.

## 알고리즘과 모델

Stable-Baselines3 2.9.0의 **PPO(Proximal Policy Optimization)**를 사용합니다.
현재 정책으로 경험을 수집한 뒤, 정책 변화가 과도하지 않도록 clipped objective를 이용해
미니배치로 업데이트하는 방식입니다. [원 논문](https://arxiv.org/abs/1707.06347),
[SB3 공식 문서](https://stable-baselines3.readthedocs.io/en/master/modules/ppo.html).
구체적인 기본값과 망 구조는 설치된 라이브러리 및 실제 저장 모델에서 확인했습니다.

- 모델: MlpPolicy / ActorCriticPolicy. 사전학습 모델 없이 무작위 가중치에서 시작합니다.
- 입력: 148개 float32 부분 관측, VecNormalize로 정규화, ±10에서 clipping.
- 정책망: 148 → 64(Tanh) → 64(Tanh) → 173개 행동 logits, 범주형 분포로 행동 선택.
- 가치망: 148 → 64(Tanh) → 64(Tanh) → 상태 가치 1개.
- 학습 파라미터: 총 38,702개. 최적화: PyTorch Adam.
- 학습 중 행동은 확률적으로 표집하고, 평가는 `predict(deterministic=True)`를 사용합니다.
- RNN/LSTM 기억, CNN 이미지 입력, 사전학습 언어모델은 사용하지 않습니다.

| 설정 | 값 / 의미 |
| --- | --- |
| n_steps | 256행동 수집 후 업데이트 |
| batch_size | 64개 경험씩 사용 |
| n_epochs | 수집 경험을 4회 학습 |
| learning_rate | 0.0003 |
| gamma / gae_lambda | 0.99 / 0.95 |
| clip_range | 0.2 |
| ent_coef | 0.01, 탐색 유지 항목 |
| vf_coef | 0.5, 가치 손실 가중치 |
| max_grad_norm | 0.5, 기본 gradient clipping |
| frame_skip / max_ticks | 10 / 3000: 행동당 최대 1게임초, 에피소드 최대 300게임초 |

## 함수와 실제 실행 과정

1. `AgeClanEnv.reset()`가 게임 시드를 만들고 Node `TrainingSession.reset()`을 호출합니다.
2. `PPO.learn()` → `collect_rollouts()`가 정책 행동을 계산하고 `AgeClanEnv.step()`을 실행합니다.
3. Node `TrainingSession.step()`이 원래 Game의 build/hire/upgrade 등 메서드를 실행하고
   `Game.tick(0.1)`을 반복합니다. `observation()`과 보상 항목을 Python에 돌려줍니다.
4. SB3 RolloutBuffer의 `compute_returns_and_advantage()`가 할인 보상과 GAE 이점을 계산합니다.
5. `PPO.train()`이 clipped 정책 손실, 가치 예측 손실, 엔트로피 항목을 이용해 역전파합니다.
6. `Monitor`는 종료된 에피소드를, SB3 logger는 rollout 평균/손실/KL 등을 CSV에 기록합니다.
7. CheckpointCallback이 8192행동마다 모델과 관측 정규화 통계를 함께 저장합니다.
   checkpoint는 수집 중 저장본이며 해당 rollout의 마지막 업데이트 전일 수 있습니다.
8. 최종 `model.save()`와 `VecNormalize.save()` 뒤 manifest에 모델 구조·버전·소스 해시를 기록합니다.
9. `evaluate()`가 정규화 통계를 고정하고 학습 없는 평가를 수행합니다.
   `reference_evaluate()`와 `summarize()`로 같은 시드의 기준 정책을 비교합니다.

보상은 기존 값 그대로 유지합니다: 처치 +0.01, completed 증가 +1, HP 피해 -0.02,
실패 행동 -0.05, 함락 -10. 금 생산·판매·수리 자체에는 보상이 없습니다.
이번 실험 중 보상/행동/관측을 바꾸지 않아 같은 문제를 학습·평가합니다.
합법 행동 마스크가 없어 탐색의 상당 부분을 실패 행동에 사용할 가능성이 있습니다.
우선 이를 측정하고, 다음 실험에서 마스크 또는 행동 구조 개편의 필요성을 판단합니다.

## CMD 재현

저장소 루트에서 실행합니다. 출력 폴더가 존재하면 새 이름을 사용하세요.

```bat
set "PYTHON=C:\Users\pc\aGe-ai\.venv\Scripts\python.exe"
"%PYTHON%" -m ml.phase1 --output ml/runs/phase1-20261021
```

모델·정규화·checkpoint·원시 로그는 로컬 ml/runs 아래에 보존하며 Git에 올리지 않습니다.
비교 요약과 결과 해석은 ml/reports에 남깁니다. 운영 PvP/배포와 OpenAI API는 사용하지 않습니다.
추가 작업이 필요하면 관측된 문제와 근거, 다음 실험 범위를 구체적으로 제안합니다.
