# GitHub 저장본 실행 및 배포

## 현재 저장본

- 기준: 2026-10-17 배포한 PvP 최적화 소스 `87a69dbc3f57811aa0cb516a923033567306bb51`
- 추가: 운영 HTTP 확인 도구, 독립 Cloudflare 배포 설정 생성기, 실행 안내, ML 작업 폴더
- 포함: 브라우저 게임, 이미지와 출처, 매칭 API, 친구 방, D1 스키마, WebSocket 방 서버
- 제외: 로그인 정보, 서버 DB 데이터, 로컬 런타임, node_modules, Python 가상환경
- 머신러닝 코드 및 모델: 아직 작성 전. `ml/README.md` 참고

GitHub는 소스를 보관하는 곳입니다. 업로드만으로 PvP 서버가 실행되지는 않습니다.
현재 Sites 서비스는 유지되며 이 저장본 업로드는 운영 서버를 변경하지 않습니다.

## 로컬 실행 (Node.js 22.13 이상과 npm)

```sh
git clone https://github.com/gimgo93/aGe-Clan.git
cd aGe-Clan
npm ci
npm run build
npx wrangler d1 execute DB --config dist/server/wrangler.json --local --persist-to .wrangler/state --file drizzle/0000_absent_angel.sql
npx wrangler d1 execute DB --config dist/server/wrangler.json --local --persist-to .wrangler/state --file drizzle/0001_conscious_gorgon.sql
npm start -- --port 8787
```

게임: `http://127.0.0.1:8787/game/`

위 SQL 직접 실행은 빈 로컬 DB를 처음 준비할 때 한 번 사용합니다.
이미 테이블이 있는 DB에서는 재실행하지 마세요. 운영 배포에는 아래 migration 명령을 사용합니다.

## 본인 Cloudflare 계정에 PvP 서버 배포

계정 가입과 이메일 인증을 완료한 뒤 진행합니다. 로그인 및 약관 동의는 계정 소유자가 합니다.
도메인 구매 없이 workers.dev 주소로 시작할 수 있습니다.

```sh
npx wrangler login
npx wrangler d1 create age-clan-db
```

반환된 `database_id`를 설정합니다. 이 UUID는 API 토큰이 아닙니다.

Windows PowerShell:

```powershell
$env:CLAN_DATABASE_ID = '반환된-database_id'
```

Windows CMD:

```bat
set CLAN_DATABASE_ID=반환된-database_id
```

macOS/Linux:

```sh
export CLAN_DATABASE_ID='반환된-database_id'
```

이후 같은 터미널에서 실행합니다.

```sh
npm run build
npm run prepare:cloudflare
npx wrangler d1 migrations apply DB --config dist/server/wrangler.deploy.json --remote
npm run deploy:cloudflare
```

`deploy:cloudflare`는 준비된 빌드를 배포합니다. 소스를 수정한 후에는 다시 build와
prepare:cloudflare를 실행하세요. Worker 이름은 기본 `age-clan`이며,
원하면 `CLAN_WORKER_NAME`을 먼저 설정합니다. DB 이름 변경 시 `CLAN_DATABASE_NAME`도 설정하세요.

생성 파일 `dist/server/wrangler.deploy.json`은 본인 계정의 D1과 `CLAN_ROOMS` Durable Object를 연결합니다.
기존 `.openai/hosting.json`은 원래 Sites 프로젝트 식별자이므로 새 프로젝트에 복제해서 사용하지 마세요.
독립 Cloudflare 배포에는 그 식별자로 원래 Sites를 수정할 필요가 없습니다.

배포된 주소의 `/api/clan`에서 `transport: "websocket"`인지 확인하고 실제 2인 접속을 확인하세요.
`"http"`이면 WebSocket 방 서버가 활성화되지 않은 상태입니다.
무료 사용량에는 한도가 있으므로 실제 지속 운영 가능 인원은 별도 부하 측정으로 판단합니다.

## 편집 및 확인

- 게임 규칙: `public/game/game.js`, 밸런스: `public/game/balance.js`
- 화면: `public/game/index.html`, `style.css`, `renderer.js`, `app.js`
- PvP: `public/game/multiplayer.js`, `lib/match-engine.js`, `lib/clan-room.js`, `lib/room-state.js`
- ML 작업: `ml/`

```sh
npm run check:pvp
node tools/check-overhaul.mjs
```

로컬 서버가 실행 중일 때에만:

```sh
node tools/check-realtime.mjs
```

이 도구는 기본적으로 로컬 8787 포트에 2인·5인 테스트 방을 만듭니다.
운영 서버 테스트 도구는 `CLAN_TEST_URL`로 명시한 주소에서 확인용 방을 생성합니다.
실제 사용자 방을 부하 시험에 사용하지 마세요.

## GitHub Pages

`public/game/`의 정적 파일은 혼자하기용으로 호스팅할 수 있습니다.
전체 사이트와 PvP는 Worker, D1, Durable Object가 필요하며 GitHub Pages만으로 실행되지 않습니다.

## 이미지와 라이선스

이미지 출처와 조건은 `public/game/ASSET_CREDITS.md` 및 assets의 라이선스 파일에 있습니다.
저장소 공개가 모든 이미지의 권리 포기를 의미하지는 않습니다. 재배포 시 출처 표기를 유지하세요.
