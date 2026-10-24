# aGe Clan — 2D / 3D 구분

| 구분 | 2D 운영 게임 | 3D 시험 게임 |
| --- | --- | --- |
| 접속 | https://ageclan.com/game/ | https://ageclan.com/3D |
| 실제 진입 파일 | `public/game/index.html` | `public/3D/index.html` |
| 실행 코드 | `public/game/` | `public/3D/` |
| 화면 렌더러 | `public/game/renderer.js` · Canvas 2D | `public/3D/world.js` · Three.js/WebGL 2 |
| 조작·메뉴 | `public/game/app.js` 등 | `public/3D/main.js`, `style.css` |
| 게임 규칙 | `public/game/game.js`, `balance.js` | `public/3D/engine/game-v1.js`, `balance.js` |
| 그래픽 자산 | `public/game/assets/` | `world.js`의 절차적 3D 모델, `vendor/` 라이브러리 |
| 서버 | `lib/`, `build/pvp-worker.js` · Cloudflare PvP | 없음 · 브라우저 내 혼자하기 |
| 계정·랭킹 | Google 연동 및 서버 기록 | 연결하지 않음 |
| 로컬 저장 키 | 기존 `age-*`, `frontier-*` 등 | `ageclan-3d-*` 전용 |
| 안내 | `public/game/README_2D.md` | `public/3D/README_3D.md` |

루트 주소는 기존 2D 게임으로 이동합니다. `/3D`는 대문자 D를 포함한 주소이며, `/3D/` 또는 `/3D/index.html`에서도 실행할 수 있습니다.

**3D를 편집할 때는 `public/3D/`에서 작업하세요.** `public/game/`나 2D 서버의 `lib/game-engine.js`를 수정할 필요가 없습니다. 3D 엔진은 2D 엔진의 고정 사본이므로 한쪽 수정이 다른 쪽에 자동 반영되지 않습니다. `tools/sync-engine.mjs`는 기존 2D 서버용이며 3D 엔진을 덮어쓰지 않습니다.

호스팅과 도메인만 함께 사용합니다. 3D 시험 파일을 배포하려면 전체 사이트를 빌드해 게시하지만 대전 Worker·운영 DB를 변경하거나 재배포하지 않습니다. 구체적인 시험판 차이는 [3D 안내](public/3D/README_3D.md)에 기록했습니다.
