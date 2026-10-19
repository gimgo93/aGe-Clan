# aGe Clan

GitHub 저장소: https://github.com/gimgo93/aGe-Clan

이 저장본을 내려받아 실행·독립 배포하려면 [GitHub 실행 및 배포 안내](docs/GITHUB_AND_DEPLOYMENT.md)를 먼저 읽으세요. 머신러닝 코드는 아직 작성 전이며 [ML 작업 폴더](ml/README.md)에 연결 지점을 정리했습니다.

공개 주소: https://age-clan.elatedbadge256.chatgpt.site/

Canvas 2D 혼자하기와 서버 판정 5인 자유 대전. Sites Worker + D1 + Vinext.

## 편집

- public/game/: 메뉴, 스타일, 이미지, 전투 로직, 편집 도구
- public/game/balance.js: 밸런스 설정. npm run build가 서버 엔진에도 반영
- lib/match-engine.js: 매칭 전투 진행, 출병 및 승리 규칙
- app/api/clan/route.ts: 익명 세션, 5인 매칭, 원자적 상태 저장, 명령 중복 방지
- db/schema.ts, drizzle/: 매칭 데이터 스키마 및 변경 이력

Node >=22.13, npm ci 후 npm run build. 로컬 DB 준비는 Sites 스킬의 D1 migration 지침 사용. npm start는 빌드된 서버를 로컬 실행.

public/game만 정적 호스팅하면 혼자하기만 작동합니다. 대전은 전체 Worker와 D1을 함께 배포해야 합니다. 기존 Sites project_id와 공개 범위를 유지하세요.

## 대전 규칙

5명 자동 시작, 1배속, 시작 30초 후 첫 웨이브. 웨이브가 모두 종료된 뒤 20초 대기. 20웨이브 방어 이후 출병하며 21웨이브부터도 계속 진행. 훈련소 나무100, 군사 금80, 대기 최대50, 출병1~10명, 쿨타임8초. 침공군은 포탑을 공격하며 마지막 생존자가 승리. 90초 재접속 유예.

## 검증

node tools/check-pvp.mjs: 엔진 규칙. 로컬 서버 실행 후 node tools/check-match-api.mjs: 서로 다른 5세션 동시 매칭, 자원 차감, 중복요청 방지, 접근검사, 승리.

이 버전은 익명 세션 대전입니다. 정식 계정·전적·랭킹 및 대규모 부하 검증은 포함되지 않았습니다. 이전 releases ZIP은 정적 혼자하기 버전이므로 현재 대전 배포에 사용하지 마세요.

## 친구 초대방

시작 화면에서 방 만들기 → 8자리 코드 공유 → 코드로 입장. 2~5인, 방장 시작, 5초 준비. 일반 매칭과 분리. 대기 중 방장 퇴장 시 남은 참가자에게 권한 이전, 빈 초대방은 폐쇄. node tools/check-friend-rooms.mjs로 로컬 API 검증.

방당 정원은 5명이며, 운영 서버 전체의 안정적인 동시접속 상한은 아직 부하 시험으로 측정되지 않았습니다.

## 2026-10-17 게임 개편

포탑/훈련소/연구소 건설: 3/8/10 게임 초. 연구소: 나무200. 연구: 30게임초, 천둥/얼음 각20크리스탈, PvP 약화30. 천둥60%, 얼음5초 빙결, 사용7·대기2초. 약화: 10크리스탈, 10초간 ×0.6 독립 중첩, 대기5초. 성 수리+20: 나무5부터 두 배. 모든 적 처치 즉시2금. 20웨이브 후 적수+1, HP/속도×1.1의 무한 웨이브. 동시2웨이브는 두 웨이브 HP×1.2.

PvP: 각자 웨이브 진행, 관전 대상만 상세 데이터 전달, 좌표 보간, 방 이동 시 잔여 참가 상태 자동 정리, 퇴장 재시도와 idempotent 처리. 의견 보내기는 clan_feedback 테이블 저장. 운영자는 Sites 데이터베이스 도구로 확인 가능.

추가 검사: node tools/check-overhaul.mjs 및 로컬 서버에서 node tools/check-overhaul-api.mjs. 운영 서버 대규모 부하 상한은 미측정.

첫 웨이브는 시작 30게임초 후 자동 진행, 이후 웨이브 종료 후 대기는 기존 설정(기본20초)입니다. 벌목 표시 인원은 위쪽4·아래쪽3의 고정 작업 구역에서 가까운 나무를 순환합니다. 기존 외곽 나무 일부를 아래쪽 작업 구역으로 재배치했습니다. 2웨이브의 HP×1.2 시스템은 유지하며 버튼 표기만 단순화했습니다.

### PvP realtime transport (protocol 2)

`ClanRoom` is one Durable Object per room. Its serial command queue owns authoritative state; WebSocket snapshots are sent every 200 ms with delta frames when smaller. Successful commands are persisted before acknowledgment, state checkpoints are stored every 2 seconds, and the D1 room directory/checkpoint is refreshed every 5 seconds or on membership changes. Session cookies and same-origin WebSocket checks protect room entry; action IDs/sequences prevent duplicate purchases after reconnect.

`vite.config.ts` declares the `CLAN_ROOMS` binding and the `clan-rooms-v1` SQLite migration. The deployed `/api/clan` health response reports `transport: websocket` only when that binding actually exists. Sites may restrict provisioned binding types: if absent, the client uses the compatible HTTP path with immediate action requests, shorter adaptive polling and reuse of snapshots less than 200 ms old. Do not claim WebSocket deployment without checking this endpoint and an actual upgrade.

The client keeps health and resources authoritative, limits movement extrapolation to 0.8 seconds and smooths reconciliation over 80–200 ms. Network status distinguishes WebSocket ping round-trip from HTTP response latency. `tools/check-realtime.mjs` exercises 2/5 clients, actions, idempotent retries, independent waves, spectator scope, delta decoding and reconnect. Set `CLAN_TEST_URL` only to an explicitly authorized test destination; these tests create disposable rooms.


## 2026-10-19 업데이트

광장·서버 랭킹·업적·군주 프로필, 밸런스 조정 및 PvP 응답 개선을 추가했습니다. [반영 내역](docs/FEEDBACK_RELEASE_2026-10-19.md)과 [보안 검토](docs/SECURITY_RELEASE_2026-10-19.md)를 참고하세요. 혼자하기 랭킹도 서버 연결이 필요합니다.
