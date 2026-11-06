# 배포·운영 확인·복원 절차

이 문서는 실행 절차다. 사용자는 v567 검증·배포를 승인했고 외부 PvP Worker는 배포했다. 기존 Sites 프런트 배포도 승인됐지만 소유 계정 접근이 없어 준비본만 남겼다. 유료 전환, main 병합, 별도 운영 환경 변수·DNS·WAF 변경, 데이터 export/restore와 외부 참가자 초대는 이 배포 승인에 포함되지 않는다. 최종 상태는 [V567_RELEASE.md](V567_RELEASE.md)를 참고한다.

## 1. 정확한 대상 확인

Sites 기존 project `appgprj_6ad0c7b0a6fc8191b9b7fe825ec45a63`의 연결을 복구해 실제 활성 버전·source SHA·접근 범위를 다시 읽는다. 현재는 connector가 대상을 찾지 못한다. 새 Site를 만들지 않는다.

Cloudflare에서는 기존 `age-clan-pvp` Worker와 `age-clan-pvp-db`가 여전히 대상인지 읽기 전용으로 확인한다. 기존 문서의 ID를 검증 없이 재사용하지 않는다. 필요한 확인 범위는 Worker 활성 deployment/version·bindings·migration tag·secret **이름**, D1 schema/백업 가능 범위, ageclan.com zone/WAF·요금/사용량·경보 설정, 관리자 MFA 상태다. secret 값·개인정보 행·복구 코드를 보고서에 출력하지 않는다.

인증은 소유자 로그인 또는 필요한 리소스에 한정한 토큰으로 한다. 비밀번호/API 토큰을 채팅이나 소스 파일에 넣지 않는다. 첫 단계는 읽기 권한이며, 설정 편집·데이터 export·배포 권한은 구체적 변경을 제시한 뒤 받는다.

## 2. 로컬 릴리스 점검

Node >=22.13. 의존성 설치 후 소스에서 실행한다.

```powershell
node tools/check-release.mjs release-checks.json
node tools/check-local-restore.mjs
npm run build
node tools/release-manifest.mjs release-manifest.json
```

최종 빌드를 실행 중인 로컬 서버와 동시에 만들면 Windows에서 dist 파일 잠금이 날 수 있다. 미리보기 서버를 정상 종료한 후 빌드한다. 빌드 출력·체크포인트·학습 가중치·실제 DB·secret을 소스 패키지에 넣지 않는다.

로컬 서버와 마이그레이션은 `--local`과 별도 persist 디렉터리로 실행한다. 빌드 후 `node --import ./scripts/sites-env.mjs tools/check-built-worker.mjs`는 격리된 실제 workerd에서 API/DB 경계를 검증한다. `npm start`는 Wrangler 4.158.0 기반 미리보기다. `tools/diagnose-dev-proxy.mjs`는 loopback 대상만 허용하며 이전 4.92에서 재현된 이른 응답 이후 503은 이 새 경로에서 회귀를 통과했다. `tools/check-realtime.mjs`는 폐기 가능한 방을 만들므로 기본 localhost 또는 별도 승인된 서버에만 사용한다. 브라우저 실제 화면 검증과 명령행 HTTP/WS 검증은 구분한다.

읽기 전용 공개 점검은 `node tools/ops-preflight.mjs https://ageclan.com <output.json>`. 이 도구는 GET만 사용하고 방/계정/통계를 생성하지 않는다. 공개 엔진 일치는 외부 Worker 내부 엔진 일치를 증명하지 않는다.

## 3. 변경·배포 순서

1. 배포 전 현재 Sites version ID, Worker version ID, 두 DB 식별자와 schema hash, 엔진/밸런스 해시를 릴리스 기록에 채운다. 이전 코드 패키지를 보존한다.
2. 외부 Worker의 기존 vars/secret 목록을 보존한다. 승인한 내부 계정 ID만 `CLAN_ANALYTICS_ACCOUNT_IDS`로 설정한다. 기존 배지 목록을 묵시적으로 복사하지 않는다. 외부 구성이면 권한 판정은 외부 Worker에서 한다. 이 값이 없으면 조회가 막히는 것이 의도된 동작이다.
3. 이번 패치는 SQL schema·DO class migration이 없다. DB create, migration 재실행, 기존 데이터 삭제가 필요하지 않다. 운영 실제 schema가 기존 migrations와 일치하지 않으면 배포를 보류한다.
4. 같은 소스의 외부 Worker를 먼저, Sites를 다음에 배포한다. 외부 Worker가 먼저 `permissions.analyticsRead`를 반환하도록 한다. 기존 세션·계정·방 저장 형식과 기존 vars/secret을 유지한다. 기존 연결이 교체될 수 있으므로 유지보수 시점을 정한다.
5. Sites는 공식 source helper로 검증된 소스를 저장하고, 공개 기존 Site에 대한 배포 승인을 받은 뒤 native 배포 도구를 사용한다. GitHub push만으로 두 런타임이 배포되지 않는다.
6. 외부 Worker는 검증된 기존 config로 `wrangler deploy --keep-vars --config dist/pvp/wrangler.json`을 사용한다. `prepare-pvp.mjs` 출력은 환경 선택용이며 실제 DB/계정 ID 검증을 대신하지 않는다. 공유 secret은 불필요하게 회전하지 않는다.
7. 각 배포 반환 version/deployment ID와 실제 결과를 기록한다. 공개 GET 및 승인된 테스트 계정의 2인 소켓·세션 폐기·철회 재시도를 확인한다. 운영 부하/제한 공격 시험은 이 smoke test 승인과 별개다.

## 4. 되돌리기

- Sites는 사전에 보존한 정상 버전을 선택해 native 배포한다. 버전만 저장했는지 실제 배포했는지 구분한다.
- 외부 Worker는 확인된 이전 version ID로 `wrangler rollback <VERSION_ID> --config dist/pvp/wrangler.json`을 수행한다. DO class lifecycle migration이 있으면 rollback 제약을 먼저 확인한다. 이번 패치는 class migration을 추가하지 않는다.
- 코드 rollback은 D1·DO 데이터를 되돌리지 않는다. 통계 철회 차단 해시가 남아도 기존 데이터 형식과 호환되지만, 옛 코드는 지연 기록 재생성 차단과 새 권한 분리를 잃는다. 보안 문제가 있으면 단순 rollback 대신 제한/수정 배포를 판단한다.
- `CLAN_BACKEND_URL`을 삭제해 Sites DB로 자동 전환하는 것을 복원으로 사용하지 않는다. 방·계정 데이터가 별개다.

## 5. 운영 백업과 복구 연습 — 승인 후

외부 D1의 Time Travel 가능 기간·bookmark를 확인하고 승인된 안전한 위치로 export한다. SQL에는 실제 사용자 데이터가 들어가므로 Git/공개 결과물에 넣지 않는다. Wrangler의 `d1 export DB --remote --config <검증된-config> --output <안전한경로>`는 아직 실행하지 않았다.

복원은 먼저 새 격리 DB에 import하고 schema/integrity·계정/진행 행 수·랭킹 소유 관계·권한·삭제 처리 동작을 확인한다. **운영 DB restore는 현재 데이터를 덮어쓸 수 있으므로 대상·복구 시점·쓰기 중지·손실 범위를 별도 승인**한다. Sites 관리 D1은 외부 Cloudflare 계정 DB와 동일하게 접근 가능하다고 가정하지 않는다. 연결 복구 후 지원되는 export/restore 수단을 확인한다.

DO 전투 체크포인트는 별도 복구 대상이다. D1 export만으로 복원되지 않는다. 격리 Worker에서 같은 객체 재시작/최신 체크포인트 복원을 먼저 연습하고 약 2초의 최근 진행 손실 가능성을 기록한다.

## 6. 운영 보호 설정안 — 확인 후 확정

WAF가 실제로 적용되는 zone 경로와 Sites 기본 주소·별도 workers.dev 우회 경로를 확인한다. 공개 API 전체를 획일적으로 challenge하면 WS와 게임 명령을 방해할 수 있다. 인증 없는 스캔 경로, 계정/통계 API, socket upgrade를 구분한 규칙을 먼저 관찰하고 NAT 영향과 기존 앱 제한을 함께 검토한다. 현재 요금제·규칙 수·분석 자료를 보기 전 유료 옵션이나 강제 임계값을 확정하지 않는다.

비용은 Worker 요청·CPU, DO 실행 시간/저장, D1 read/write/storage를 나눠 확인한다. 소유자가 정한 월 예산의 50/80/100% 경보를 제안하되 실제 청구 경보의 지원 범위를 확인한다. 경보는 비용 상한이나 자동 차단이 아니다. 수신 대상·금액 승인 후 적용한다. 관리자 계정 MFA, 최소 권한 토큰, 백업 복구 권한과 사용하지 않는 토큰은 소유자 확인이 필요하다.

## 공식 참고

- [Worker 버전과 배포](https://developers.cloudflare.com/workers/versions-and-deployments/): 저장소 상태는 코드 버전에 포함되지 않는다.
- [Worker rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
- [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
