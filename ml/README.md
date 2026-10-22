# aGe Clan 오프라인 강화학습 환경

실제 JavaScript 게임 엔진을 Python Gymnasium의 `reset()` / `step()`에 연결했습니다.
현재 범위는 **혼자하기 방어 환경과 PPO 초기 학습·평가 코드**입니다. 학습 실행은 사용자가
명령으로 시작합니다. 검증용 초소형 학습 외 대규모 학습, 완성 모델, 상대 AI, PvP 봇 배포는
포함하지 않습니다. OpenAI API, 운영 HTTP/WebSocket, DB, 사용자 계정,
Cloudflare/Sites 배포에 접근하지 않습니다. 인터넷 없이 시뮬레이션할 수 있습니다.

현재 준비 상태와 남은 작업은 [STATUS.md](STATUS.md)를 먼저 확인하세요.
처음 실행한다면 아래 환경 검사 후 [초기 PPO 학습·평가](#초기-ppo-학습평가)를 진행하세요.

## 프로젝트와 엔진 재사용

저장소는 [gimgo93/aGe-Clan](https://github.com/gimgo93/aGe-Clan), 기본 브랜치는 `main`입니다.
운영 주소는 [ageclan.com/game](https://ageclan.com/game/), 보조 주소는 `www.ageclan.com`입니다.
Sites 입구 → Cloudflare Worker → 방별 Durable Object, D1 계정/기록 구조이며,
[운영 구조 문서](../docs/ARCHITECTURE_2026-10-21.md)에 상세 구성이 있습니다.

- `public/game/game.js` + `balance.js`: 게임 규칙·밸런스의 원본.
- `tools/sync-engine.mjs`: 원본을 `lib/game-engine.js`로 변환합니다.
- `lib/game-engine.js`: 브리지가 직접 import하는 실제 `Game` 구현. 규칙을 Python에 복제하지 않습니다.
- `lib/trees.js`: 서버와 같은 나무 위치. 벌목 인구·나무 생산도 작동합니다.
- `lib/match-engine.js`: 서버 명령 검증·복구·방 타이머·PvP 출병·공격 포션을 담당합니다.
  브리지는 단일 `Game`의 혼자하기 규칙을 호출합니다. 방 생성·접속 만료·상대 출병은 실행하지 않습니다.
  테스트는 공유 행동과 tick 결과가 `restore`/`act` 경로와 같은지도 비교합니다.

서버 `advance()`는 벽시계·접속 상태를 다루므로 학습에서 호출하지 않습니다.
`Game.tick()`은 입력 시간을 최대 0.1초로 제한하므로 큰 dt를 한 번 넣으면 가속되지 않습니다.
브리지는 **고정 0.1게임초 tick을 대기 없이 반복**합니다. `frame_skip=50`이면 행동 하나 뒤
최대 5게임초를 계산하며, 배속은 머신 성능·게임 상태에 따라 달라집니다. 기존 `setSpeed`는
학습 행동에 포함하지 않습니다. `frame_skip`은 관측/행동 빈도를 조절합니다.

## Windows CMD 실행

저장소 루트에서 실행합니다. 아래는 이번 검증에 사용한 준비된 가상환경입니다.
기본 `python`이 Python 3.15를 선택할 수 있으므로 환경의 실행 파일을 명시합니다.

```bat
cd /d "C:\Users\pc\OneDrive\문서\ChatGPT\tower depense\github-age-clan"
set "PYTHON=C:\Users\pc\aGe-ai\.venv\Scripts\python.exe"
node --version
"%PYTHON%" -c "import sys,numpy,gymnasium,stable_baselines3,torch; print(sys.version); print(numpy.__version__,gymnasium.__version__,stable_baselines3.__version__,torch.__version__)"
node ml/test_bridge.mjs
"%PYTHON%" -m unittest ml.test_env -v
"%PYTHON%" -m unittest ml.test_training -v
"%PYTHON%" -m ml.smoke
node tools/check-pvp.mjs
node tools/check-overhaul.mjs
```

검증 환경: Python 3.13.16, PyTorch 2.14.1+cpu, NumPy 2.5.4,
Gymnasium 1.4.0, Stable-Baselines3 2.9.0, Node.js 24.20.0.
기존 환경이 준비되어 있으면 설치를 반복할 필요가 없습니다. 새 환경은 다음처럼 준비합니다.
Python 3.13과 Node.js가 설치되어 있어야 하며, 패키지 설치 때만 인터넷이 필요합니다.

```bat
py -3.13 -m venv .venv
set "PYTHON=%CD%\.venv\Scripts\python.exe"
"%PYTHON%" -m pip install --upgrade pip
"%PYTHON%" -m pip install torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu
"%PYTHON%" -m pip install -r ml/requirements.txt
"%PYTHON%" -m unittest ml.test_env -v
```

브리지만 실행하는 데 `npm ci`, 사이트 build, 운영 secret은 필요하지 않습니다.
게임 원본 규칙을 수정한 경우에만 루트에서 `node tools/sync-engine.mjs`를 실행하고 생성본을
함께 검토하세요. `test_bridge.mjs`는 원본과 생성본의 상태 차이를 검사합니다.
Node가 PATH에 없으면 `set "AGE_CLAN_NODE=C:\Program Files\nodejs\node.exe"` 또는
`AgeClanEnv(node_executable=...)`로 지정하세요. `close()` 또는 `with`로 자식 프로세스를 종료합니다.

## Python 사용

```python
from ml.env import AgeClanEnv

with AgeClanEnv(frame_skip=10, max_ticks=6000, target_wave=0) as env:
    observation, info = env.reset(seed=42)
    env.action_space.seed(42)
    observation, reward, terminated, truncated, info = env.step(0)  # 대기
    print(observation.shape, info)
```

환경당 Node 자식 프로세스 하나를 사용하고 JSON Lines 표준 입출력으로 통신합니다.
stdout은 프로토콜 전용이고 진단은 stderr에 나옵니다. 기본 응답 제한은 30초입니다.
타임아웃/프로세스 장애 때 정리 후 오류를 냅니다. 장애 후에는 새 환경을 만드세요.
`reset(seed=...)`는 Gymnasium RNG에서 uint32 게임 시드를 생성합니다.
`info.seed`는 Node 게임 시드이므로 Python 입력 시드와 다릅니다. 같은 Python 시드·행동열은
같은 상태를 만듭니다. `reset()`은 새 에피소드 시드를 추출합니다. 상태/자원 주입 옵션은 없습니다.

## 행동 공간 v1

`Discrete(173)`입니다. 순서는 `env.actions` 또는 브리지 `describe` 응답으로 확인합니다.
`args`는 실제 엔진 메서드 인수입니다. 판매는 pad를 선택하고 현재 tower ID로 변환합니다.

| 인덱스 | 행동 |
| --- | --- |
| 0 | 대기 |
| 1–130 | 건설: archer, ballista, cannon, frost, storm 순서 × pad 0–25 |
| 131–133 | 광부 고용, 벌목 인구 고용, 성 강화 |
| 134–138 | 각 포탑 종류 전체 강화 |
| 139–140 | 1개 / 2개 웨이브 시작 |
| 141–166 | pad 0–25 포탑 판매 |
| 167 | 연구소 건설 |
| 168–169 | lightning / ice 연구 |
| 170–171 | lightning / ice 포션 사용 |
| 172 | 성 수리 |

자원·문명·쿨다운·건설 중·최대 동시 웨이브 검사는 원래 게임 메서드가 수행합니다.
합법 인덱스가 게임 규칙상 불가능하면 행동 변경 없이 오류를 반환하고 시간은 진행됩니다.
일반 PPO는 마스크 없이 실행할 수 있고, MaskablePPO는 `action_masks()`로 실패 행동을 제외합니다. 범위 밖 인덱스는 Python에서
`ValueError`를 내며 시간은 진행하지 않습니다. 훈련소·군사·상대 대상 행동은 이번 범위에서 제외했습니다.

## 관측 공간 v1

`Box(shape=(148,), dtype=float32)`이며, 순서는 `env.feature_names`로 확인합니다.
원래 게임 단위를 유지하며 연구 값은 미연구 0 / 연구 남은 시간 양수 / 완료 -1입니다.

- 공통 28개: 시간, 금·크리스탈·나무, HP·최대 HP, 성·문명, 광부·벌목 인구,
  웨이브·완료 웨이브·처치 수·활성 웨이브 수, 다음 웨이브·채굴 타이머,
  연구소 여부·건설 타이머·수리 횟수, 두 포션 연구/쿨다운, 5종 포탑 강화 레벨.
- 26개 pad × 4개: 종류(빈 터 0, 포탑 1–5), HP, 건설 남은 시간, 공격 쿨다운.
- 경로 8구간 × 2개: 적 수, 적 HP 합계.

초기 연결용 **부분 관측**입니다. 개별 적의 종류/상태 이상, 발사체, 벌목 위치 등 전체 엔진 상태를
담지 않으므로 완전한 Markov 관측을 보장하지 않습니다. 금·시간·무한 웨이브를 임의로 잘라내지 않아
상한은 infinity이며 Gymnasium 검사에서 이에 관한 경고가 나올 수 있습니다. 검증 실패는 아닙니다.
후속 학습 단계에서는 관측 확장 및 `VecNormalize` 등을 별도로 검토하세요.

## 보상·종료

매 행동 후 다음 항목을 합산하며 `info.reward_terms`로 각각 확인합니다.

| 항목 | 기본 값 |
| --- | --- |
| 적 처치 | +0.01 × 증가한 처치 수 |
| 웨이브 진척 | +1 × completed 증가량 |
| 성 피해 | -0.02 × 행동 실행 후 tick 중 감소한 HP |
| 게임 규칙상 불가능한 행동 | -0.05 |
| 성 함락 | -10 추가 |
| 선택한 목표 웨이브 달성 | +10 추가 |

`completed`는 최고 완료 웨이브 번호이므로 동시 웨이브에서는 진척 보상이며 개별 완료 횟수와
다를 수 있습니다. 성 강화·수리의 회복, 금 생산·판매 자체에는 보상이 없습니다.
보상은 학습 설계의 시작점이며 전략 품질을 검증한 값은 아닙니다.

성 함락 또는 `target_wave > 0`에서 목표 이상 완료·활성 웨이브 없음이면 `terminated=True`입니다.
목표 달성은 학습 에피소드 조건이며 원래 엔진의 승리 규칙을 수정하지 않습니다.
기본 `target_wave=0`은 무한 방어 규칙을 유지합니다. `max_ticks=6000`(600게임초)에 도달하면
`truncated=True`이고 마지막 행동도 남은 tick까지만 진행합니다. 같은 tick에 종료되면 terminated를
우선합니다. 종료 후 step하려면 reset이 필요합니다. SB3 벡터 환경의 자동 reset도 검증합니다.

## 검증 범위

`node ml/test_bridge.mjs`: 브라우저 원본/서버 생성본 상태 일치, match-engine 공유 경로 일치,
행동 오류, JSONL 오류 복구, 보상, 함락·목표·시간 제한, 나무 생산, 판매를 검사합니다.
종료 보상 테스트는 테스트 내부의 격리된 메모리 상태에만 fixture를 설정합니다.

`python -m unittest ml.test_env -v`: Gymnasium `check_env`, SB3 `check_env`, 동일 시드 재현,
환경 격리, 무작위 에피소드, SB3 `DummyVecEnv` 자동 reset, 프로세스 종료·응답 제한을 검사합니다.
`python -m ml.smoke`는 최대 60번 무작위 행동으로 가속 배율을 출력하며 모델을 학습하지 않습니다.

기존 `check-pvp`와 `check-overhaul`도 실행해 운영 규칙의 회귀 여부를 확인합니다.
실제 PvP 접속, 운영 부하 시험, 대규모 PPO 실행이나 배포는 이 검증에 포함하지 않습니다.

## 초기 PPO 학습·평가

먼저 저장소 루트에서 위의 CMD `PYTHON` 변수를 설정합니다. 아래 코드는 운영 서버에 접속하지 않는
CPU 전용 단일 환경 PPO입니다. 기본 설정은 `ml/configs/starter.json`이며 2,048개 **에이전트 행동**을
학습합니다. 이는 게임 tick 수와 다릅니다. `frame_skip=10`이면 행동당 최대 10 tick을 진행합니다.
PPO는 rollout 단위로 학습하므로 요청 step 수를 `n_steps=64`의 배수까지 올릴 수 있으며 실제 수는
manifest에 기록합니다. 첫 연결 확인에는 다음 64-step 실행을 사용할 수 있습니다.

```bat
"%PYTHON%" -m ml.train --total-timesteps 64 --output ml/runs/first-check
"%PYTHON%" -m ml.evaluate --run-dir ml/runs/first-check --episodes 2 --seed 10000 --output ml/runs/first-check/evaluation.json
```

검사 후 기본 초기 학습을 시작하려면 새 출력 폴더를 지정합니다.

```bat
"%PYTHON%" -m ml.train --config ml/configs/starter.json --output ml/runs/starter-001
"%PYTHON%" -m ml.evaluate --run-dir ml/runs/starter-001 --episodes 5 --seed 10000 --output ml/runs/starter-001/evaluation.json
```

같은 폴더를 덮어쓰지 않습니다. 재실행 때 `starter-002`처럼 새 이름을 사용하세요.
출력 경로를 생략하면 UTC 타임스탬프 이름을 사용합니다. `--checkpoint-freq 8192`를 지정하면
8192행동마다 모델과 정규화 통계를 저장합니다. 중간 checkpoint에는 최종 manifest가 없으므로
현재 evaluate 및 resume 명령은 정상 완료된 실행 폴더에 사용합니다. `--resume-from 완료폴더`로
모델·optimizer·정규화 통계를 새 출력 폴더에서 이어갈 수 있습니다.

| 파일 | 역할 |
| --- | --- |
| `config.json` | 실제 사용한 seed·환경·PPO 설정 |
| `model.zip` | SB3 PPO 모델 |
| `vecnormalize.pkl` | 모델과 함께 사용해야 하는 관측 정규화 통계 |
| `manifest.json` | 실제 step 수·라이브러리 버전·행동/관측 순서·엔진 소스 해시 |
| `episodes.monitor.csv` | 종료된 학습 에피소드의 보상·길이 |
| `progress.csv` | rollout 보상 평균·학습 손실·KL·진행 step |
| `checkpoints/` | 선택적으로 저장한 중간 모델과 정규화 통계 |
| `evaluation.json` | 명시적으로 요청한 평가 보고서 |

원래 관측값은 단위 차이가 커서 `VecNormalize(norm_obs=True, norm_reward=False)`로 정규화합니다.
평가는 저장된 통계를 불러와 고정하고, 추가 학습 없이 결정적인 행동을 선택합니다.
기본 평가 시드는 Python 기준 10000부터 순서대로 적용하며 보상·완료 웨이브·HP·실패 행동 수를
보고합니다. 훈련 seed 42와 구분한 재현 가능한 평가 시작점이며 충분한 전략 평가를 대신하지 않습니다.
현재 엔진·브리지·환경 코드나 행동/관측 순서가 학습 때와 다르면 평가를 거절하므로 호환 모델을 사용하세요.

모델·통계·로그는 `.gitignore`에 포함된 `ml/runs/`에 저장합니다. GitHub에는 초기 소스와 설정만
올립니다. 결과 모델은 로컬 실험용이며 운영 게임에 연결되지 않습니다.
`python -m unittest ml.test_training -v`는 임시 폴더에서 32-step 학습 → 저장 → 로드 → 두 평가
재현 → 호환성 검사 → 정리를 수행합니다. 초소형 테스트 통과는 게임 실력을 학습했다는 의미가 아닙니다.

## 실제 1차 실험

[학습 설계](TRAINING_PLAN.md)에 알고리즘, 망 구조, 사용하는 함수와 보상·평가 기준을 설명했습니다.
학습 시드 42·43에서 각각 32,768행동을 학습하고, 별도 공통 평가 시드 20개에서 대기·무작위·고정
규칙 기반 정책과 비교합니다. `python -m ml.phase1 --output ml/runs/새-실험-이름`으로 재현합니다.
단일 모델만 비교하려면 `python -m ml.benchmark --config ml/configs/phase1.json --run-dir 실행폴더
--episodes 20 --seed 20000 --output 새보고서.json`을 사용합니다(명령은 한 줄로 입력).
단순 학습 보상 상승을 실전 성능 향상으로 해석하지 않으며, 결과와 한계는 `ml/reports/`에 남깁니다.

## 행동 마스크와 계속 학습

[마스킹 실험 설계](MASKING_PLAN.md)를 참조하세요. `sb3-contrib==2.9.0`을 requirements에 추가했습니다.
`python -m ml.train --masked ...`로 MaskablePPO를 선택합니다. 평가는 manifest의 알고리즘을 읽어
현재 행동 마스크를 predict에 전달하며, 일반 PPO도 그대로 지원합니다.
마스크는 실제 엔진의 복사 상태를 이용해 검사하고 실제 자원·시간·난수를 바꾸지 않습니다.
`node ml/test_masks.mjs`로 모든 행동 판정과 부작용 없음을 확인합니다.

`python -m ml.phase2 --variant control|masked|low-entropy --output 새폴더`에서 variant는
세 값 중 하나만 선택해 입력합니다. 같은 평가 시드·예산에서 마스크 효과를 비교하고,
후속 low-entropy는 다른 조건을 유지한 채 entropy 계수만 낮춥니다.
이전 버전 모델의 manifest를 덮어쓰거나 소스 해시 검사를 우회하지 마세요. 과거 모델 재평가는
해당 커밋의 원본 코드에서 수행하고, 현재 실험은 현재 버전의 대조 모델을 별도로 만듭니다.

계속 학습 자동화는 2시간 간격이며, PC와 앱이 켜져 있을 때 현재 대화에서 이어집니다.
실행당 최대 2시드·65,536행동을 제한하고 중복 실행을 피합니다. 운영 배포는 하지 않습니다.

마스킹+낮은 탐색 계수 모델을 추가 32,768행동 학습하는 예입니다.

```bat
"%PYTHON%" -m ml.train --config ml/runs/phase2-low-entropy-20261021/seed-43/config.json --masked --resume-from ml/runs/phase2-low-entropy-20261021/seed-43 --total-timesteps 32768 --checkpoint-freq 8192 --output ml/runs/new-continued-43
```

resume에서는 `actual_timesteps`가 누적 행동 수, `added_timesteps`가 이번 추가량입니다.
환경·PPO 설정·seed가 부모와 다르면 거절합니다. 게임 도중 상태와 RNG의 정확한 복구가 아니라
완료 모델/optimizer/정규화 통계를 불러와 새 에피소드부터 재개하는 방식입니다.
최신 결과는 [2차 보고서](reports/2026-10-22-phase2/README.md)를 확인하세요.
