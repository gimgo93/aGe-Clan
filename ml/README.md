# aGe Clan 오프라인 강화학습 환경

실제 JavaScript 게임 엔진을 Python Gymnasium의 `reset()` / `step()`에 연결했습니다.
이번 범위는 **혼자하기 방어 환경과 연결 테스트**입니다. PPO 학습, 학습 모델, 상대 AI,
PvP 봇 배포는 포함하지 않습니다. OpenAI API, 운영 HTTP/WebSocket, DB, 사용자 계정,
Cloudflare/Sites 배포에 접근하지 않습니다. 인터넷 없이 시뮬레이션할 수 있습니다.

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
행동 마스크는 아직 없으므로 탐색 시 실패 행동이 많을 수 있습니다. 범위 밖 인덱스는 Python에서
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
