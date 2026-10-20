# aGe Clan

플레이: **https://ageclan.com/game/** · 보조 주소: https://www.ageclan.com/game/

기존 주소 https://age-clan.elatedbadge256.chatgpt.site/game/ 도 유지됩니다.
저장소: https://github.com/gimgo93/aGe-Clan

Canvas 2D 문명 발전 타워 디펜스입니다. 혼자하기 무한 웨이브, 5인 일반 매칭,
친구 코드로 입장하는 2~5인 대전을 제공합니다. 혼자하기도 서버 판정이므로 인터넷 연결이 필요합니다.

## 현재 운영 상태 (2026-10-20)

- 화면·API 입구: Sites v15. 게임 소스 기준 f36942654d98e39693923fe39b322765d41c94d5.
- 도메인: ageclan.com과 www.ageclan.com DNS·HTTPS 연결 완료.
- 대전: Cloudflare Worker → 방마다 별도 Durable Object → WebSocket 변경분 전송.
- D1: 방 검색·입장 메타데이터·서버 랭킹 저장. 매 전투 명령의 응답에서 D1을 기다리지 않습니다.
- 명령은 메모리에 먼저 반영해 응답하고 약2초마다 복구 상태를 저장합니다. 비정상 종료나 저장 장애 시 최근 진행이 되돌아갈 수 있습니다.
- 새 도메인에서 실제 2인·5인 연결, 설치 승인, 중복 요청 방지, 관전, 재접속 검증 통과.
- 방당 정원은 5명입니다. 서버 전체의 안정적인 동시접속 상한은 아직 측정하지 않았습니다.

[출시 연결·운영 현황](docs/OPERATIONS_2026-10-20.md) ·
[피드백 반영](docs/FEEDBACK_RELEASE_2026-10-19.md) ·
[보안 검토 범위](docs/SECURITY_RELEASE_2026-10-19.md)

## 편집과 배포

[실행·독립 배포 안내](docs/GITHUB_AND_DEPLOYMENT.md)를 먼저 읽으세요.

- public/game/balance.js: 밸런스. public/game/game.js: 원본 게임 규칙.
- public/game/index.html, style.css, renderer.js, app.js: 화면과 입력.
- lib/match-engine.js, clan-room.js, realtime-router.js: 서버 판정과 방 관리.
- npm run build가 원본 엔진을 lib/game-engine.js로 동기화합니다. 생성본만 수정하지 마세요.

GitHub에 push하는 것만으로 Sites나 대전 Worker가 자동 배포되지는 않습니다.
프런트와 서버의 규칙 버전을 맞추고 각각 배포해야 합니다.
기존 Sites project_id, D1, 서버 secret은 유지하고 비밀 키·DB 데이터·가상환경은 Git에 올리지 마세요.

정적 파일만 GitHub Pages에 올리면 현재 혼자하기와 대전이 모두 정상 작동하지 않습니다.
Worker, D1, Durable Object와 API 연결이 필요합니다.

## 게임과 기록

처음30게임초 후 첫 웨이브, 진행 웨이브가 모두 끝나면20초 후 다음 웨이브가 시작됩니다.
20웨이브 이후에도 계속 진행하며 PvP에서는 군사로 상대방을 공격합니다. 혼자하기에는 훈련소가 없습니다.
최신 수치는 public/game/balance.js와 피드백 문서를 기준으로 확인하세요.

프로필·업적은 브라우저 저장소, 랭킹 기록은 서버가 관리합니다.
로그인 계정과 기기 간 동기화는 없습니다. 주소·브라우저 변경이나 쿠키 삭제 시 별개 참가자로 취급될 수 있습니다.
친구에게는 같은 기본 주소 https://ageclan.com/game/ 를 공유하세요.

## 머신러닝

[ML 작업 폴더](ml/README.md)는 연결 지점을 설명하는 준비 공간입니다.
학습 코드·데이터·최종 모델은 현재 저장본에 없습니다. 학습된 AI가 작동하고 있다는 뜻이 아닙니다.

## 이미지와 라이선스

[출처와 라이선스](public/game/ASSET_CREDITS.md)를 유지하세요.
Flare 파생 그래픽(CC BY-SA 3.0), 발리스타(CC BY 4.0), 물약(CC0) 등이 포함됩니다.
저장소 공개가 모든 이미지의 권리 포기를 의미하지는 않습니다.
