# aGe-Clan 로컬 밸런스 ML

2026-10-24 최신 지시: 궁수 저항을 제거하고 번개66/폭격포72, 폭격 반경120, 발리스타Lv.5 반경160·최대5명으로 변경했습니다. 이전300판 모델은 이전 규칙의 역사적 결과입니다. 새 게임 해시로 데이터를 다시 생성해야 합니다.

`balance_ml/`은 밸런스 결과를 학습하고 패치 후보를 검증하는 독립 프로그램입니다.
기존 `ml/`은 플레이 행동을 학습하던 PPO/MaskablePPO 실험이며 보존합니다.
새 프로그램은 PPO, Gymnasium, OpenAI API를 사용하지 않습니다. Node.js와 NumPy만 필요합니다.

## 실행 — Windows CMD

저장소 루트에서 실행합니다. 기존 Python 환경을 그대로 사용할 수 있습니다.

```bat
cd /d "C:\Users\pc\OneDrive\문서\ChatGPT\tower depense\github-age-clan"
set TEMP=%CD%\balance_ml\runs
set TMP=%TEMP%
if not exist "%TEMP%" mkdir "%TEMP%"
C:\Users\pc\aGe-ai\.venv\Scripts\python.exe -m unittest discover -s balance_ml/tests -v
C:\Users\pc\aGe-ai\.venv\Scripts\python.exe -m balance_ml.agent --run my-first-run --games 300 --max-seconds 600
C:\Users\pc\aGe-ai\.venv\Scripts\python.exe -m balance_ml.agent --run my-first-run --games 300 --status
C:\Users\pc\aGe-ai\.venv\Scripts\python.exe -m balance_ml.predict
```

일일 예산 5,000판(10,000도 가능), CPU 수치 연산 1스레드, 최대 6시간:

```bat
powershell -NoProfile -ExecutionPolicy Bypass -File balance_ml\daily.ps1 -Games 5000
```

`daily.ps1`은 숨김 프로세스로 시작하고 즉시 반환합니다. 자체 스케줄러가 아니라 하루 한 번의
Codex 자동화에서 호출할 실행기입니다. PC와 Codex 앱이 실행 중이어야 예약 작업이 시작됩니다.
프로세스가 시작된 뒤의 시뮬레이션은 로컬 프로그램이 수행합니다.
`balance_ml/runs/YYYY-MM-DD/progress.json`, `stdout.log`, `stderr.log`로 확인합니다.
보고서는 종료 후 `REPORT.md`, `report.json`에 생성됩니다. 채팅 알림은 다음 자동화 점검에서 수집합니다.

중단 시 동일한 run/games/seed 명령으로 재개합니다. 매 판 종료마다 JSONL과 진행 상황을 저장합니다.
예산 소진은 `paused`이며 다음 실행에서 재개합니다. 다음 날에는 이전 일자의 일시 중단된 작업을 우선 재개합니다.
실패한 작업은 로그를 확인한 뒤 같은 명령으로 수동 재개합니다.
`agent.lock`이 있으면 중복 시작을 거부합니다. 강제 종료/재부팅 후 남은 잠금은 기록된 PID가 실제 종료됐는지
작업 관리자에서 확인한 후에만 삭제하세요. 실행 중 삭제하면 중복 실행될 수 있습니다.
엔진/정책/스키마가 바뀌면 다른 run 이름으로 시작해야 합니다.

## 실제 학습과 검증

1. 현재 `public/game/game.js`, `balance.js`, 나무 배치, 정책을 읽고 해시와 원문을 보관합니다.
2. 실제 엔진을 격리 VM에서 돌립니다. 한 판은 성 파괴/40웨이브 완료/6,000게임초 안전 제한까지입니다.
   0.1초 고정 tick, 1게임초마다 행동하며 실시간 대기는 없습니다. 교란병과 시설 파괴 규칙을 유지합니다.
3. 기준 수치에서 **한 매개변수만** 변경하며 다섯 정책을 실행합니다. 고정/경제 궁수,
   광부 없는 조합, 물약 없는 경제 조합, 물약 있는 경제 조합입니다. 정책은 고정 규칙이며 학습되지 않습니다.
4. 수치+정책 → 완료 웨이브를 예측하는 비선형 회귀 앙상블을 학습합니다.
   64개 tanh 무작위 특징, ridge 정규화 2, bootstrap 5개입니다. 특징은 고정되어 있고 회귀 가중치는 실제 결과에서 학습됩니다.
   작은 표 데이터용 첫 설정이며 최적성은 입증하지 않았습니다. GPU나 대형 언어 모델이 필요하지 않습니다.
5. 설정 단위 약20% 홀드아웃으로 평가합니다. 같은 설정의 반복 시드는 학습/검증 양쪽으로 나누지 않습니다.
   정책별 상수 예측보다 나쁜 모델은 추천을 보류합니다. 앙상블 편차는 확률적 신뢰구간이 아닙니다.
6. 최대512개 수치 후보를 예측하고 상위3개를 실제 엔진에서 비교합니다.
   개발 비교는 4설정×5정책×3시드=60판, 최종 확인은 기준/선택 후보×5정책×새5시드=50판입니다.
   총 예산에서110판을 예약하고 나머지를 데이터 생성에 사용합니다. **예산은 행동 수가 아닌 게임 수입니다.**
7. 최종 새 시드 목표 오차가 평균0.5웨이브 이상 개선되고
   실패 행동과 시간 제한 종료가 없을 때만 `review_candidate`를 출력합니다. 나머지는 `no_patch`입니다.
   이는 검토 후보이며 운영 패치를 생성·적용·배포하지 않습니다.

목표 벡터는13/15/20/30/40입니다. 고정 정책을 사람의 초보/중수 실력으로 단정하지 않습니다.
HP·처치·누수·성 피해·파괴·생존 게임초·행동/시설 이용·실패 행동률을 함께 기록합니다.
실패 행동은 선택 후 실제 엔진 명령이 `error`를 반환한 경우입니다. 대기나 성 파괴는 실패 행동이 아닙니다.
시간 제한 종료는 검증 통과를 막으며 성공으로 세지 않습니다.

## 범위와 한계

첫 버전 탐색 대상은 5종 포탑의 피해/가격(기준±20%), 시작 골드200–280입니다. 물약·광부·벌목·수리·연구소는 실제 정책에 포함되지만
그 비용/효과 상수 전체를 학습 탐색하는 것은 다음 단계입니다. 도달하지 않은 현대 문명/시설의 효과를 증명하지 않습니다.
포탑 수치 변경을 실제 적용하면 PvP에도 영향이 있을 수 있어 이 솔로 결과만으로 배포하면 안 됩니다.
실제 이용자 실력/접속 지연/동접/운영 장애는 이 시뮬레이션에서 측정하지 않습니다.
학습은 해당 실행의 **로컬 엔진 스냅샷** 기준입니다. 라이브 사이트가 같은 버전이라는 뜻이 아닙니다.

`runs/`의 모델(`surrogate.npz`), 원시 기록, 스냅샷, 로그는 로컬에 보존하고 Git에서 제외합니다.
검토 가능한 초기 학습 모델/보고서만 `models/bootstrap/`, `reports/`에 별도로 보존할 수 있습니다.
기본 predict 명령은 함께 보관한 초기 모델을 읽으며, 그 모델의 검증 오차도 출력합니다. 예측값은 패치 승인 근거가 아닙니다.
매일 새 데이터로 재학습하며 호환되지 않는 버전의 과거 데이터를 섞지 않습니다. 장기 누적 학습은 아직 하지 않습니다.
게임당 시간은 정책/수치/PC 부하에 따라 달라집니다. 보고서의5천/1만판 시간은 측정된 소표본의 추정이며 보장 시간이 아닙니다.

## 후속 개발과 검증

[개발 계획](DEVELOPMENT_PLAN.md)에 단계별 통과 기준을 기록합니다. 완료된 실행은
`python -m balance_ml.audit --run balance_ml/runs/실행이름`으로 전략별 예측 오차와
설정 단위 bootstrap 진단을 읽을 수 있습니다. 실행 중인 작업은 건드리지 않으며 패치를 자동 적용하지 않습니다.

완료된 실행의 ridge 설정 비교(0.5/2/8, 내부 3분할 선택·외부 설정 검증):

```bat
C:\Users\pc\aGe-ai\.venv\Scripts\python.exe -m balance_ml.compare --run balance_ml/runs/2026-10-25
```

기존 모델을 교체하지 않으며 새 게임·운영 패치를 실행하지 않습니다. 외부 검증 결과를 보고 반복 설정 선택을 하지 않습니다.

## 40·50웨이브 후속 목표

`frontier50.mjs`는50완료까지 관찰하는 별도 격리 평가기입니다. 기본40목표 ML을 교체하지 않습니다.
36웨이브부터 적 체력5% 증가 후보와1초/0.2초 판단·물약/경제 대조를 준비했습니다.
아직50성공이나 난이도 개선이 검증된 패치가 아닙니다. 다음 일일 예산 안에서 별도 배분 후 실행합니다.
`node balance_ml/tests/check-frontier50.mjs`는경계·재현성 검사만 수행하며 전체게임배치를 시작하지 않습니다.

## 다음 신규 일일 실행: 50평가와 ML 예산 분리

```bat
powershell -NoProfile -ExecutionPolicy Bypass -File balance_ml/daily50.ps1
```

50웨이브 평가64판을 실행한 뒤 결과 검토 단계에서 종료합니다. 남은4936판은 새 가설/검증 계획을 정한 뒤 배분하며 기존40평가를 자동 반복하지 않습니다.
전역 잠금과 최초 시작 기준6시간 마감으로 중복/시간초과를 방지합니다. 기존당일5000판 작업이있으면 시작하지 않습니다.
시간예산이소진된캠페인은 다음날재배분검토가필요합니다. 같은날재시작으로마감을초기화하지않습니다.
50평가결과는 `날짜-frontier50/frontier-report.json`에 저장합니다. 기존40모델과원시기록은기존run에보존합니다.

50평가보고서의 `feedback`은 개발시드에서선택한전략을새5시드에서확인합니다.
기준/후보50성공각3/5이상과40난이도상승근거,소폭변경범위,실패/시간제한없음을잠정기준으로씁니다.
이는사전등록한연구기준이며사용자가정한공식성공률이나통계적보장은아닙니다.
50미도달시전략개선이우선이며 `review_candidate`도운영패치를적용하지않습니다.

50보고서의 `strategy_effects`는 같은 시드·HP설정에서 판단간격/물약/추가광부투자의 효과를 비교합니다.
HP·처치·누수·피해·시설파괴·자원잔량·시설행동횟수·실패행동률을 함께 제공합니다.
광부투자제외도 시작광부5명은 유지되므로 경제전체를 제거한 실험은 아닙니다.

## 완료 후 자동 진단

`python -m balance_ml.finalize --run balance_ml/runs/실행이름 --wait-seconds 3600`은
최대1시간 완료를 기다린 뒤 정확도진단/정규화비교를 `analysis-complete.json`에 저장합니다.
추가게임·모델교체·패치를하지않고 이미저장된결과는보존합니다. 실패/일시중단시즉시종료합니다.
`analysis.lock`의PID를확인하기전잠금을삭제하지않습니다. 일반즉시진단은wait옵션을생략합니다.


## v2: 같은 시드의 밸런스 변경 효과 학습

기존 `model.py`는 절대 완료 웨이브를 예측한다. 새 모듈은 별도로 보존하며
**후보 완료 웨이브 − 같은 시드·정책의 기준 완료 웨이브**를 예측한다.

- `effect_data.py`: data 단계만 대응시키고 중복·미사용 시설·실패/시간제한을 진단한다.
- `effect_model.py`: 64개 비선형 특징, 5개 시드 bootstrap 모델, ridge=2.
  기준 효과는0으로 고정한다. 40/50 목표와 소스 해시를 저장·복원 시 검증한다.
- `effect_train.py`: 설정과 시드를 모두 분리한 외부 검증. 10설정·10시드 미만이면 학습 보류.
  모델 오차를 같은 평가행의 효과0 예측과 비교한다. 관측 범위를 벗어난 예측은 거부한다.

Windows CMD, 저장소 루트에서 완료된 기존40 실행의 준비도 진단:

```bat
C:\Users\pc\aGe-ai\.venv\Scripts\python.exe -m balance_ml.effect_train --run balance_ml/runs/2026-10-25 --output-name effect-v2-my-check
C:\Users\pc\aGe-ai\.venv\Scripts\python.exe -m unittest balance_ml.tests.test_effect -v
```

출력은 `balance_ml/runs/<output-name>/report.json`이다. 학습이 가능할 때만 그 안의
`model/`에 가중치를 저장한다. 같은 이름은 덮어쓰지 않는다. 새 게임은 실행하지 않는다.
이 CLI는 기존40 실행 전용이다. `train_effect(..., target_wave=50, fingerprint=...)`
API는 목표50 대응 데이터를 지원하지만 실제50 학습용 데이터 수집 연결과 가중치 학습은 후속 단계다.
검증용 게임을 새 학습으로 섞지 않는다. 새 모델은 기존 agent의 추천 경로에 자동 적용되지 않는다.
시설 건설 기록은 최소 근거이며 실제 공격 효과나 사람 숙련도를 증명하지 않는다.


## 성17 해금용 물약 크리스탈 예약 대조

`reserve-policy.mjs`는18웨이브 이상·성17 미만에서 물약 사용 후 다음 성 강화 비용을
남기지 못할 때 물약을 보류한다. 다른 강화·연구·수리·판단 간격은 그대로다.
이 규칙은 로컬 실험용이며 게임 규칙을 변경하지 않는다.

```bat
C:\Users\pc\aGe-ai\.venv\Scripts\python.exe -m balance_ml.reserve_experiment
node balance_ml/tests/check-reserve.mjs
C:\Users\pc\aGe-ai\.venv\Scripts\python.exe -m unittest balance_ml.tests.test_reserve -v
```

해당 한국 날짜의64판 frontier 캠페인을 완료·검토한 뒤만 실행한다.
새 개발10시드/확인10시드에 기준·후보 각1판으로40판이다. 원래 캠페인의6시간 마감과
일일5000판 예산을 공유한다. 날짜 외 이름의 수동 run도 manifest 생성일로 예산에 포함한다.
진행/원시 기록/보고서는 `runs/날짜-castle-reserve/`에 보존한다.
같은 명령 재개 시 완료한 게임은 반복하지 않으며 소스·계획 변경 시 기존 기록을 덮어쓰지 않는다.
실패 시 stderr와 실제PID를 확인한 후 재개한다. 자동 가중치 학습·운영 적용은 하지 않는다.
`positive_policy_signal_only`는 두 단계에서 평균 진척이 좋아졌다는 탐색적 표시에 한정된다.
통계적 유의성,50 성공,게임 난이도 적정성은 별도로 판단해야 한다.


## 자원 흐름 감사와 후반 광부 목표 대조

완료된 성17 예약 대조의행동횟수와기록된원본엔진으로소비를복원한다(추가게임없음):

```bat
node balance_ml/crystal-audit.mjs balance_ml/runs/2026-10-27-castle-reserve
```

단일전략솔로대조만지원하며수치변경run은거부한다. 채굴량은복원소비+잔량−초기자원으로
역산한값이며직접관측획득량과구분한다. 소비시점은과거행동횟수에서복원할수없다.

새6개진단시드에서성공호출의소비시점과실제채굴획득량을관측하려면:

```bat
C:\Users\pc\aGe-ai\.venv\Scripts\python.exe -m balance_ml.resource_diagnostic
node balance_ml/tests/check-crystals.mjs
```

같은날완료된frontier캠페인의6시간마감과일일예산을공유한다. 각게임의
초기+획득−소비=잔량보존식과행동횟수기반소비를대조한다. 진단은새정책/모델채택을하지않는다.
판단시점의성강화비용부족횟수는관측자료이며모두실제강화시도가거절됐다는뜻은아니다.

14웨이브이후광부목표만18→22로바꾸는새40판대조:

```bat
C:\Users\pc\aGe-ai\.venv\Scripts\python.exe -m balance_ml.reserve_experiment --study miners22
node balance_ml/tests/check-miners.mjs
C:\Users\pc\aGe-ai\.venv\Scripts\python.exe -m unittest balance_ml.tests.test_resources balance_ml.tests.test_reserve -v
```

기준/후보는동일0.2초판단,기존고용마감/금유보/물약/연구/수리규칙을쓴다.
물약예약정책과섞지않는다. 새개발81001~81010/확인82001~82010을사용한다.
기존정책의기본광부목표는18명이며실험옵션으로만22명을요청한다.
이대조도스스로게임하는전략학습이나새밸런스ML가중치학습을수행하지않는다.


## 실험용 이벤트 난수 프로토콜

기존LCG는한줄의난수열을여러기능이공유하므로광부수를늘리면이후교란병난수도밀린다.
`coupled-rng.mjs`는운영엔진을바꾸지않고실험용Game인스턴스에서이벤트별난수를준다.

| 경로 | 키 |
|---|---|
| 채굴 | 시드,채굴회차,광부추첨인덱스 |
| 교란병 | 시드,웨이브,적스폰인덱스,추첨인덱스 |
| 벌목고용 | 시드,고용인구인덱스,추첨인덱스 |
| 다음나무 | 시드,작업자인덱스,나무전환회차,추첨인덱스 |

프로토콜은 `event-sha256-u32-v1`이며같은키에는같은값을반환한다.
추가채굴이교란병난수를소비하지않는다. 같은난수여도타워목록·나무후보·생존시간이달라지면
실제결과는달라진다. 원래LCG와게임궤적이다르므로과거학습자료와섞지않는다.
벤치마크행에는 `stage=method_benchmark`, `rng_mode`와결과의 `rngProtocol`을저장한다.
학습자료를만들때도프로토콜과소스해시를함께묶어버전을구분해야한다.

```bat
node balance_ml/tests/check-coupling.mjs
C:\Users\pc\aGe-ai\.venv\Scripts\python.exe -m unittest balance_ml.tests.test_coupling -v
C:\Users\pc\aGe-ai\.venv\Scripts\python.exe -m balance_ml.coupling_study
```

이명령은coupling-plan.json의새8시드×두난수모드×두고정정책을32판실행한다.
정책선택/ML학습/패치적용이아닌방법진단이다. 기존50캠페인을선행할필요는없고,
당일다른실험의예산·최초마감을합산하며최대5000판/6시간/전역잠금을지킨다.
원시자료와보고서는 `runs/날짜-rng-coupling/`에보존한다. 같은소스/계획만재개할수있다.
작은표본의대응결과분산비율이낮아져도일반적인분산감소를증명하는것은아니다.
각경로처음32추첨의감사표본만저장하며전체난수테이프를동일세계상태로취급하지않는다.
이미완료된같은계획/시드를다음날자동반복하지않는다.
