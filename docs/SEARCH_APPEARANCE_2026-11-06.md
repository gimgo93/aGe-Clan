# 검색 노출 설정 · 2026-11-06

운영 Sites v58 소스 01bc5400be9ce3c18280039eb0d2f5bc1a9b2a70에서 검색 관련 변경만 분리했다. 기존 메뉴 실험 checkout과 GitHub 저장소는 수정하지 않았다.

- 게임 제목·소개 메타데이터와 Open Graph, 공식 URL https://ageclan.com/game/ 및 sitemap을 정리했다. www 접속은 로그인·브라우저 저장소 경계 때문에 강제 이동하지 않는다.
- 기존 aGe 로고를 그대로 맞춘 정사각형 PNG 96px, Apple 아이콘 180px 및 ICO 16/32/48/64/128/256px을 추가했다.
- 통계 동의 창 내용은 div[data-nosnippet]로 감쌌다. 동의·철회 기능과 안내 문구는 유지한다.
- 3D HTML의 robots noindex, 정적 응답 _headers 및 프레임워크 응답 X-Robots-Tag를 추가했다. 크롤러가 noindex를 읽을 수 있도록 robots.txt에서 3D를 차단하지 않는다.
- 공개 GitHub 저장소를 GitHub 내부 검색에만 남기는 저장소별 외부 검색 차단 설정은 제공되지 않는다. 저장소 안의 robots.txt/HTML meta는 github.com의 저장소 화면에 적용되지 않는다. 공개 범위는 유지했다.

검증: production build 성공. 로컬 실제 Worker HTTP에서 /, /game/, /game/index.html은 검색 가능하며 canonical·소개·아이콘이 일치한다. /3D, /3D/, /3D/index.html 최종 HTML과 응답 헤더는 noindex다. 세 아이콘은 200·이미지 MIME·원본 바이트가 일치하고 PNG는 정사각형이다. /game/game.js, balance.js, app.js, multiplayer.js, title-travelers.js는 공개 운영본과 LF 정규화 SHA-256이 일치한다.

검색 결과의 기존 로고·문구·3D 항목은 검색엔진 재수집 후 바뀐다. 표시 여부와 시점은 검색엔진이 결정하며 즉시 제거를 보장하지 않는다.
