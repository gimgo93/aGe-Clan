# aGe Clan

공개 주소: https://ageclan.com/game/

앱 릴리스 **v567**: [디자인 보존·버전·배포 경계](docs/V567_RELEASE.md). 기존 디자인이 기본값이며 설정에서 개선 스타일을 선택하거나 되돌릴 수 있습니다. 실제 배포 상태와 자동 Sites 버전 번호는 배포 기록을 따릅니다.

**2026-11-05 작업 기준:** [현재 소스·배포 증거·브랜치·검증 경계](docs/CURRENT_STATE_2026-11-05.md)와 [배포·복원 절차](docs/RELEASE_RUNBOOK_2026-11-05.md)를 먼저 확인하세요. 이번 보안/시각 개선은 로컬 변경이며 운영 반영 전입니다. 아래 날짜별 내용은 당시 이력입니다.

## 버전 선택

- **2D 운영 게임:** https://ageclan.com/game/ — 소스 `public/game/`, PvP 서버 `lib/`.
- **3D 혼자하기 시험판:** https://ageclan.com/3D — 소스·모델·엔진·라이브러리 모두 `public/3D/`에 분리.
- [2D / 3D 경로·데이터 구분](GAME_VERSIONS.md) · [3D 체험 내용과 제한](public/3D/README_3D.md)

## 현재 상태 · 2026-10-20

Google 로그인·기록/설정 동기화와 Cloudflare Durable Object/WebSocket 대전을 운영합니다. [계정 기능](docs/ACCOUNT_SYNC_2026-10-20.md), [20명 동접 결과와 후속 시험 계획](docs/CAPACITY_2026-10-20.md)을 참고하세요. 검증된 범위는 20명·4개 방의 단계별 30초 시험이며 실제 최대 동접 상한은 미측정입니다. 아래 날짜별 내용은 구현 이력입니다.

Canvas 2D 혼자하기와 서버 판정 5인 자유 대전. Sites Worker + D1 + Vinext.

## 편집

- public/game/: 메뉴, 스타일, 이미지, 전투 로직, 편집 도구
- public/game/balance.js: 밸런스 설정. npm run build가 서버 엔진에도 반영
- lib/match-engine.js: 매칭 전투 진행, 출병 및 승리 규칙
- app/api/clan/route.ts: 익명 세션, 5인 매칭, 원자적 상태 저장, 명령 중복 방지
- db/schema.ts, drizzle/: 매칭 데이터 스키마 및 변경 이력

Node >=22.13, npm ci 후 npm run build. 로컬 DB 준비는 Sites 스킬의 D1 migration 지침 사용. npm start는 빌드된 서버를 로컬 실행.

현재 2D 혼자하기와 대전은 모두 서버 판정이므로 정적 호스팅만으로 작동하지 않습니다. Sites 게이트웨이와 외부 Worker·D1·Durable Object를 함께 확인해야 합니다. 기존 Sites project_id와 공개 범위를 유지하세요.

## 대전 규칙

5명 자동 시작, 1배속, 시작 30초 후 첫 웨이브. 웨이브가 모두 종료된 뒤 20초 대기. 20웨이브 방어 이후 출병하며 21웨이브부터도 계속 진행. 훈련소 나무100, 군사 금80, 대기 최대50, 출병1~10명, 쿨타임8초. 침공군은 포탑을 공격하며 마지막 생존자가 승리. 90초 재접속 유예.

## 검증

node tools/check-pvp.mjs: 엔진 규칙. 로컬 서버 실행 후 node tools/check-match-api.mjs: 서로 다른 5세션 동시 매칭, 자원 차감, 중복요청 방지, 접근검사, 승리.

익명 세션과 Google 계정 대전을 지원합니다. 이전 releases ZIP은 정적 혼자하기 버전이므로 현재 대전 배포에 사용하지 마세요.

## 친구 초대방

시작 화면에서 방 만들기 → 8자리 코드 공유 → 코드로 입장. 2~5인, 방장 시작, 5초 준비. 일반 매칭과 분리. 대기 중 방장 퇴장 시 남은 참가자에게 권한 이전, 빈 초대방은 폐쇄. node tools/check-friend-rooms.mjs로 로컬 API 검증.

방당 정원은 5명이며, 20명 단기 시험을 통과했습니다. 운영 서버 전체의 최대 동접 상한과 장시간 안정성은 아직 미측정입니다.

## 2026-10-17 게임 개편

포탑/훈련소/연구소 건설: 3/8/10 게임 초. 연구소: 나무200. 연구: 30게임초, 천둥/얼음 각20크리스탈, PvP 약화30. 천둥60%, 얼음5초 빙결, 사용7·대기2초. 약화: 10크리스탈, 10초간 ×0.6 독립 중첩, 대기5초. 성 수리+20: 나무5부터 두 배. 모든 적 처치 즉시2금. 20웨이브 후 적수+1, HP/속도×1.1의 무한 웨이브. 동시2웨이브는 두 웨이브 HP×1.2.

PvP: 각자 웨이브 진행, 관전 대상만 상세 데이터 전달, 좌표 보간, 방 이동 시 잔여 참가 상태 자동 정리, 퇴장 재시도와 idempotent 처리. 의견 보내기는 clan_feedback 테이블 저장. 운영자는 Sites 데이터베이스 도구로 확인 가능.

추가 검사: node tools/check-overhaul.mjs 및 로컬 서버에서 node tools/check-overhaul-api.mjs. 운영 서버 대규모 부하 상한은 미측정.

첫 웨이브는 시작 30게임초 후 자동 진행, 이후 웨이브 종료 후 대기는 기존 설정(기본20초)입니다. 벌목 표시 인원은 위쪽4·아래쪽3의 고정 작업 구역에서 가까운 나무를 순환합니다. 기존 외곽 나무 일부를 아래쪽 작업 구역으로 재배치했습니다. 2웨이브의 HP×1.2 시스템은 유지하며 버튼 표기만 단순화했습니다.

### PvP realtime transport (protocol 2)

`ClanRoom` is one Durable Object per room. Its serial command queue owns authoritative state; WebSocket snapshots are sent every 200 ms with delta frames when smaller. Commands are acknowledged after in-memory validation; recovery checkpoints are stored approximately every 2 seconds, and the D1 room directory is refreshed every 5 seconds or on membership changes. Sudden termination can lose progress since the last checkpoint. Session cookies and same-origin WebSocket checks protect room entry; action IDs/sequences prevent duplicate purchases after reconnect.

`vite.config.ts` declares the `CLAN_ROOMS` binding and the `clan-rooms-v1` SQLite migration. The deployed `/api/clan` health response reports `transport: websocket` only when that binding actually exists. Sites may restrict provisioned binding types: if absent, the client uses the compatible HTTP path with immediate action requests, shorter adaptive polling and reuse of snapshots less than 200 ms old. Do not claim WebSocket deployment without checking this endpoint and an actual upgrade.

The client keeps health and resources authoritative, limits movement extrapolation to 0.8 seconds and smooths reconciliation over 80–200 ms. Network status distinguishes WebSocket ping round-trip from HTTP response latency. `tools/check-realtime.mjs` exercises 2/5 clients, actions, idempotent retries, independent waves, spectator scope, delta decoding and reconnect. Set `CLAN_TEST_URL` only to an explicitly authorized test destination; these tests create disposable rooms.

### 2026-10-18 친구 대전 지연 개선

HTTP 경로는 한 참가자의 조회가 주로 시뮬레이션을 진행하고, 나머지 참가자는 저장된 상태를 읽습니다. 각 참가자의 생존 신호는 5초마다 저장하며, 상태가 2초 이상 오래됐거나 진행 담당자가 응답하지 않으면 다른 참가자 요청이 진행을 이어갑니다. 설치/구매/공격 명령은 항상 서버 판정과 버전 검사를 거칩니다. Server-Timing 및 X-Clan-Queries/X-Clan-Retries 응답 헤더로 저장소 지연과 충돌을 구분합니다.

클라이언트는 서버 상태를 복사해 표시하고, 설치 등의 명령을 즉시 미리 표시한 후 승인 시 확정하거나 거절 시 되돌립니다. 최대 8개 명령을 순서대로 보내며, 확인 전 중복 자원 차감을 방지합니다. 0.8초 이후 적이 이전 위치로 되돌아가던 오류를 제거하고, 서버 상태의 나이와 전송 지연을 반영한 최대 2초의 이동 보정을 적용했습니다. 자원 생산·피해·승패 판정은 서버에서 유지합니다. 기존 3초 건설 시간은 유지하며 응답 대기는 '설치 확인 중'으로 구분합니다.

node tools/check-lag-regressions.mjs: 지연·빙결·감속 및 HTTP 진행 담당자 교체.
node tools/check-client-commands.mjs: 응답 전 연속 설치 표시, 명령 순서, 자원 중복 차감 방지, 거절 후 복구.
# 별도 실시간 대전 서버

기존 사이트 주소를 유지하면서 인증된 외부 Worker의 WebSocket 방 서버에 연결할 수 있습니다. 계정 준비, 배포 명령, 현재 권한 제약은 [실시간 서버 연결 안내](docs/PVP_SERVER_SETUP.md)를 참고하세요. `npm run prepare:pvp`와 `npm run deploy:pvp`는 대전 API만 별도로 배포합니다. 외부 서버 주소와 키를 실제 설정하기 전에는 운영 사이트가 HTTP 대전을 계속 사용합니다.
