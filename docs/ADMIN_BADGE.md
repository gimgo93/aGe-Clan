# 관리자 이름 표식

2D 게임의 프로필·랭킹·대기방·전투/관전 이름에 금색 `(관리자)` 표식을 표시합니다. 표시용 배지이며 운영·게임 조작 권한을 부여하지 않습니다.

서버 환경 변수 `CLAN_ADMIN_ACCOUNT_IDS`에 허용할 Google 연결 계정의 내부 ID를 쉼표 또는 공백으로 구분해 설정합니다. 이 ID는 `clan_accounts.id`이며 닉네임·Google 이메일과 다릅니다. 실제 목록은 프런트엔드나 GitHub 소스에 넣지 않습니다. Cloudflare 배포 시 `--keep-vars`로 기존 설정을 보존합니다.

- Google 인증으로 연결된 계정 ID만 서버에서 대조합니다. 게스트·프로필 저장 요청의 `admin` 값은 배지에 영향을 주지 않습니다.
- API는 `admin: true/false`만 공개하고 내부 계정 ID와 허용 목록은 반환하지 않습니다.
- 닉네임을 바꾸거나 다른 기기에서 같은 Google 계정으로 로그인해도 배지가 유지됩니다. 이미 로그인한 세션도 새로 불러오면 적용됩니다.
- DB 스키마 변경은 없습니다. 허용 목록에서 ID를 제거하면 배지를 해제할 수 있습니다. 랭킹은 기존 5초 캐시가 갱신된 뒤 반영됩니다.

검증: `node tools/check-accounts.mjs`, `node tools/check-account-badges.mjs`.
