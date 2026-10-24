# 점진적 개선: 합법 행동 마스크와 후속 실험

사용자 요청에 따라 1차 비마스킹 모델을 보존하고, 보상을 유지한 채 마스크 효과부터 비교합니다.
설치된 SB3와 같은 버전인 sb3-contrib 2.9.0의 MaskablePPO를 사용합니다.
[공식 문서](https://sb3-contrib.readthedocs.io/en/master/modules/ppo_mask.html).

## 구현과 불변 조건

`AgeClanEnv.action_masks()` → JSONL masks → `TrainingSession.actionMasks()`로 조회합니다.
True는 지금 실행 가능한 행동, False는 엔진이 거절할 행동입니다. 대기는 항상 True입니다.
엔진의 복제 상태에서 실제 메서드를 호출하므로 자원·문명·쿨다운 가격을 Python에 복제하지 않습니다.
probe의 RNG는 실제 게임 RNG와 분리합니다. 마스크 조회는 시간, 자원, ID, 이벤트, 실제 난수를
소비하지 않습니다. 마스크가 있어도 step 자체는 기존 엔진 검증을 유지합니다.

건설은 현재 엔진에서 터에 따른 제약이 점유 여부뿐이므로 종류별 비어 있는 터 한 곳에서
엔진 판정을 구하고 비어 있는 나머지 터에 적용합니다. 빈 터 판매는 False로 처리하고,
나머지 행동은 개별 복사본에서 엔진을 호출합니다. 이 최적화는 173개 행동 전체를 각각
실행한 oracle과 여러 상태에서 대조합니다. 향후 pad별 제약이 추가되면 전체 대조 검사를
갱신하고 최적화도 재검토해야 합니다.

Python 검사기는 행동을 무작위 표집해 마스크를 무시할 수 있으므로, 불가능한 행동을 보냈을 때의
기존 오류 처리도 유지합니다. 학습에서는 MaskablePPO가 현재 마스크를 받아 행동 분포에서 제외하고,
평가에서도 `get_action_masks()`를 `predict(..., action_masks=...)`에 전달합니다.
관측 148개, 행동 173개, 망 구조, 보상 함수는 그대로입니다.

## 단계 A: 통제 비교

| 항목 | 설정 |
| --- | --- |
| 비마스킹 기준 | 현재 브리지에서 PPO를 다시 학습 |
| 비교 대상 | 같은 설정의 MaskablePPO |
| 학습 시드 / 행동 수 | 42·43, 각각 32,768 |
| PPO 설정 | phase1.json 그대로, entropy 0.01 |
| 에피소드 | 최대 300게임초 |
| 공통 개발 평가 시드 | 40000–40019 |
| 우선 지표 | 실패 행동 0 여부, 생존, 진척, 처치, HP, 보상 |

브리지/env 소스 변경으로 기존 모델의 해시가 달라졌으므로 이전 manifest를 덮어쓰거나
검사를 우회하지 않고, 현 버전에서 비마스킹 대조군도 재실행합니다. 1차 원본 모델과 결과는
ml/runs/phase1-20261021 및 ml/reports/2026-10-21-phase1에 보존합니다.

## 단계 B: 결과에 따른 한 변수 개선

마스킹으로 실패 행동이 사라져도 탐색 행동 때문에 방어가 불안정하다면, 다른 조건을 고정하고
entropy 계수만 0.01 → 0.003으로 줄여 비교합니다. 수치가 좋아지지 않으면 채택하지 않습니다.
모든 후보는 새로 초기화해 같은 학습 예산을 쓰므로, 더 많은 누적 학습으로 인한 효과와 구분합니다.
후속 후보의 최종 채택은 새 검증 시드에서 확인합니다. 한 번에 보상·관측·학습률을 함께 바꾸지 않습니다.

```bat
set "PYTHON=C:\Users\pc\aGe-ai\.venv\Scripts\python.exe"
"%PYTHON%" -m pip install -r ml/requirements.txt
node ml/test_masks.mjs
"%PYTHON%" -m unittest ml.test_env ml.test_training -v
"%PYTHON%" -m ml.phase2 --variant control --output ml/runs/new-control
"%PYTHON%" -m ml.phase2 --variant masked --output ml/runs/new-mask
"%PYTHON%" -m ml.phase2 --variant low-entropy --output ml/runs/new-low-entropy
```

## 계속 학습 운영

현재 대화에 연결된 자동화 `aGe Clan 강화학습 단계별 개선`을 2시간 간격으로 설정했습니다.
실행마다 최신 보고서를 읽고 근거 있는 한 요소만 개선합니다. 실행당 최대 2시드·65,536행동,
CPU 1스레드, 약 10분 이내로 제한하며 이미 학습 중이면 중복 실행하지 않습니다.
모델과 로그를 보존하고, 검증한 소스/보고서만 PR에 반영합니다.
중요한 결과·개선·실패·사용자 판단 필요 시 알리고, 변화가 없으면 같은 보고를 반복하지 않습니다.
3회 연속 개선이 없으면 다음 방향을 한 번 요청하고 불필요한 실험을 반복하지 않습니다.
로컬 작업이므로 PC와 앱이 켜져 있어야 합니다.
운영 PvP·DB·배포, OpenAI API, 유료 자원, 대규모 장시간 학습은 범위 밖입니다.
