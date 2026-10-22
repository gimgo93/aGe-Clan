# 5차 사전 계획: 재개 학습률만 낮춘 통제 비교

4차에서 학습량을 늘리자 기존 최선이 개발 평가 20/20→9/20회 생존으로 퇴행했다.
이번 가설은 재개 업데이트의 학습률을 낮추면 방어 정책의 퇴행을 줄일 수 있다는 것이다.
원인이 학습률이라고 확정하지 않으며 보상·마스크 등 다른 요소는 바꾸지 않는다.

- 같은 부모: phase3-continued-20261022의 seed 42·43, 각 누적 65,536행동 모델.
- 유일한 설정 변경: learning_rate 0.0003→0.0001, 명시적인 resume override로 기록.
- 같은 예산: 각 추가 32,768행동/누적 98,304행동, 이번 실행 합계 65,536행동.
- 대조군: phase4-continued-20261022의 같은 부모·같은 예산·학습률 0.0003 모델.
- optimizer 통계·정규화는 이어받고 entropy 0.003, 나머지 PPO 설정, 보상·300초 환경을 고정.
- 재개 후 실제 optimizer LR·schedule·optimizer step 지속과 다른 설정 변경 거절을 먼저 검사.
- 개발 seed 40000–40019에서 부모/후보/같은 예산 대조군을 비교하고 생존→completed→처치→HP→보상 순으로 후보 선택.
- 최종 판단은 새 seed 80000–80019에서 후보/기존 마스킹 최선/같은 예산 대조군/비마스킹 기준/참조 정책 비교.
- raw reward만으로 채택하지 않고, 기존 최선의 생존과 실패 행동 0을 유지하며 진척·처치·HP를 본다.
- CPU 1스레드, 약 10분 내의 제한된 학습. 원본 모델/로그는 보존하고 운영/DB/배포/OpenAI API/유료 자원을 사용하지 않는다.

```bat
"%PYTHON%" -m ml.phase3 --parents ml/runs/phase3-continued-20261022 --resume-learning-rate 0.0001 --same-budget-control ml/runs/phase4-continued-20261022 --confirmation-seed 80000 --output ml/runs/phase5-low-lr-20261022
```
