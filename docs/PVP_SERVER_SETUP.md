# 실시간 대전 서버 연결

## 변경된 구조

브라우저 → 기존 Sites `/api/clan` 및 `/api/clan/socket` → 본인 Cloudflare Worker → 방별 ClanRoom Durable Object.

전투·자원·명령 순서의 기준 상태는 방 서버 메모리에서 처리합니다. 200ms 간격으로 변경분을 전송하고 클라이언트는 사이를 보간합니다. 2026-10-19 변경 이후 건설 등 명령은 메모리에 적용한 뒤 저장 완료를 기다리지 않고 확인 응답을 보냅니다. 진행 상태는 약2초마다 같은 방의 로컬 저장소에 보관합니다. 강제 종료·저장 장애 시 최근 진행이 되돌아갈 수 있습니다. D1에는 방 검색·재참가용 작은 메타데이터만 약5초마다 저장하며, 이 원격 저장의 완료를 전투 진행이나 명령 응답에서 기다리지 않습니다. 중간 대기 쓰기는 최신 버전으로 합칩니다. D1에 있는 메타데이터만으로 전투를 복구하지 않습니다.

WebSocket 연결 직후 프레임 수신과 재접속은 기존 클라이언트가 처리합니다. HTTP 요청도 같은 방 서버로 전달되므로 소켓 재연결 중에 별개의 게임이 생성되지 않습니다. 사이트에서 외부 서버를 설정한 뒤 서버가 고장나면 503을 반환합니다. Sites의 기존 DB로 자동 전환하지 않습니다.

`CLAN_BACKEND_URL`이 없으면 기존 Sites의 HTTP 대전이 유지됩니다. 코드 배포와 실시간 서버 활성화는 별개의 단계입니다.

## 운영 연결 완료 (2026-10-18)

- 기본 사이트: `https://ageclan.com/game/` (2026-10-20 도메인 연결), 이전 `https://age-clan.elatedbadge256.chatgpt.site/game/` 유지
- 대전 Worker: `https://age-clan-pvp.jjiho1021.workers.dev`
- 계정: `461dfd7a5b1c91735bf05dcb6f9ce666`
- APAC D1: `age-clan-pvp-db`, ID `73303eba-e0dd-4736-a276-b350ac869f75`
- `CLAN_ROOMS` SQLite Durable Object를 실제 배포했고, 서버 인증 키를 Worker와 Sites에 secret으로 등록했습니다. 키 값은 소스에 포함하지 않습니다.
- Sites 환경 변수 revision 1을 적용한 뒤 공개 사이트 API에서 `transport: "websocket"`, `storage: "durable-object"` 응답을 확인했습니다.
- 공개 사이트를 경유하는 실제 2인·5인 소켓 연결, 건물 설치, 명령 중복 방지, 변경분 전송, 관전, 재접속 검증을 통과했습니다. 실제 브라우저에서도 코드 입장·궁수 초소 설치·웨이브 전투를 확인했습니다.
- 브라우저 확인 중 왕복 표시는 약 23~56ms였습니다. 작은 표본이며 네트워크·부하에 따라 달라집니다. 동시 접속 수 한도를 측정한 결과는 아닙니다.
- 초기 배포를 막았던 OAuth 로그인과 이메일 미인증(10034)은 소유자가 완료한 뒤 해결됐습니다.

기존 Sites D1 데이터는 새 대전 DB와 공유되지 않습니다. 전환 전에 열었던 방 대신 새 친구 방을 만드세요. 브라우저에 오래 열린 게임은 새로고침하세요. 대전 Worker에 직접 접근하면 인증 키가 없어 403 응답이 나오는 것이 정상입니다.

재배포할 때에는 아래 명령의 `CLAN_DATABASE_ID`에 위 DB ID를 사용해 기존 DB를 재사용합니다. DB 생성 및 초기 migration을 매번 다시 하지 않습니다. Worker secret과 Sites secret은 유지하고, 키 교체 시에는 양쪽을 함께 변경합니다.

## 소유자가 먼저 할 일

1. <https://dash.cloudflare.com/sign-up>에서 계정을 만들고 이메일을 인증합니다. 도메인 구매 없이 workers.dev 주소를 사용할 수 있습니다.
2. 프로젝트 폴더의 터미널에서 `npx wrangler login`을 실행하고 브라우저에서 허용합니다. 로그인·약관 동의는 본인이 진행합니다. API 토큰이나 비밀번호는 채팅에 보내지 않습니다.
3. 로그인 완료를 알려주면 다음 배포와 Sites 환경 변수 연결을 이어서 수행할 수 있습니다.

## 배포 명령 (Node.js 22.13 이상)

```powershell
npm ci
npx wrangler login
npx wrangler d1 create age-clan-pvp-db
$env:CLAN_DATABASE_ID = '반환된 database_id UUID'
npm run prepare:pvp
npx wrangler d1 migrations apply DB --config dist/pvp/wrangler.json --remote
```

충분히 긴 임의 인증 키를 생성해 Worker secret `CLAN_BACKEND_TOKEN`에 등록한 뒤 배포합니다. 키는 터미널 입력/배포 비밀 저장소를 사용하며 Git에 기록하지 않습니다.

```powershell
npx wrangler secret put CLAN_BACKEND_TOKEN --config dist/pvp/wrangler.json
npm run deploy:pvp
```

이 서버는 게임 화면 없이 대전 API만 호스팅합니다. 배포된 주소는 `https://age-clan-pvp.<본인계정>.workers.dev` 형식이며 반드시 실제 반환된 주소를 사용합니다. 임의 주소를 설정하지 않습니다.

사이트 소유자 권한으로 Sites 운영 환경 변수에 다음 두 값을 등록하고 사이트 버전을 다시 배포합니다.

| 변수 | 값 |
| --- | --- |
| `CLAN_BACKEND_URL` | 반환된 HTTPS 서버 원점 주소 (경로 없음) |
| `CLAN_BACKEND_TOKEN` | Worker와 동일한 인증 키. 반드시 secret으로 저장 |

쿠키는 기존 사이트에만 보관되고 서버 간 요청에서는 `clan_session`만 전달합니다. 직접 외부 서버에 접근하면 인증 없이는 거절합니다. 브라우저 공개 코드에 키를 넣지 않습니다. 키를 교체할 때는 Worker와 Sites 양쪽을 맞추어야 합니다.

## 활성화 확인

사이트의 `/api/clan` 응답이 `transport: "websocket"`, `storage: "durable-object"`인지 확인합니다. 이것만으로 연결 성공을 단정하지 않고 2인 친구 방에서 실제 소켓 101 연결, 이동, 건설, 재접속을 확인합니다.

현재 구현은 SQLite Durable Object를 사용합니다. 무료 플랜에서도 사용할 수 있지만 요청·실행 시간·저장 용량 한도가 있습니다. 게임 진행 중에는 방이 계속 실행되므로 무료 무제한 운영을 보장하지 않습니다. 유료 전환은 소유자의 선택이 필요하며 자동 결제를 설정하지 않습니다.

참고: <https://developers.cloudflare.com/durable-objects/platform/pricing/>

## 장애와 복구

- 진행 상태는 Durable Object 저장소에서 복구합니다. 마지막 주기 저장 이후 약 2초 분량은 서버 강제 종료 시 다시 계산되거나 일부 되돌아갈 수 있습니다. 확인 응답한 명령은 먼저 로컬에 저장합니다.
- D1 장애 중 이미 열린 소켓 대전은 계속 처리할 수 있지만 신규 매칭·방 검색은 영향을 받습니다. 저장 실패는 로그에 남기고 다음 동기화 때 재시도합니다.
- 외부 서버를 해제하려면 Sites에서 위 두 변수를 제거한 뒤 재배포합니다. 기존 외부 방은 Sites DB로 이동되지 않습니다.
- 안정 동시 접속 수와 운영 지연은 배포 후 별도 측정이 필요합니다. 로컬 2인·5인 기능 검증은 서버 수용량 보증이 아닙니다.

## 개발 확인

```sh
node tools/check-pvp-gateway.mjs
node tools/check-lag-regressions.mjs
node tools/check-client-commands.mjs
# 로컬 서버 실행 후:
node tools/check-realtime.mjs
```
