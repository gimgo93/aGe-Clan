# 시작 화면 메뉴 개편안 · 승인 대기

운영 v567 / Sites 58 / 소스 01bc5400be9ce3c18280039eb0d2f5bc1a9b2a70 기준의 별도 로컬 브랜치다. 사용자가 실제 브라우저 화면을 본 뒤 승인하도록 요청했으므로 소스 push·Sites 버전 저장·배포를 하지 않았다. 과거의 포괄 배포 승인으로 이번 디자인 승인 절차를 대신하지 않는다.

## 이미지에서 관찰한 것

다른 게임을 실행하지 않고 아래의 공개된 메뉴 캡처 네 장을 직접 확인했다. 대형 퍼블리셔 사례(EA/PopCap, Xbox)와 디펜스 장르 전문 스튜디오 사례(Ninja Kiwi, Ironhide)를 구분한다. 모두 최신판의 현재 메뉴라고 단정하지 않는다. 영상 검색은 보조 탐색으로 사용했으며 전체 영상을 시청했다고 주장하지 않는다.

| 사례와 이미지 출처 | 실제 관찰 | aGe Clan에 적용한 판단 |
|---|---|---|
| [Plants vs. Zombies · Steam 커뮤니티 메뉴 캡처](https://steamcommunity.com/sharedfiles/filedetails/?id=2526994761) / [EA 배포 공식 설명서](https://akamai.cdn.ea.com/eadownloads/u/f/manuals/GAME-PVZ/en_US_readme.html) | 큰 묘비 안에서 Adventure를 최상단·가장 큰 글자로 표시. 설정·도움말·업적은 주변 사물에 분리 | 주 행동인 혼자하기를 크기와 색으로 강조. 부가 기록 버튼은 하단 유지. 묘비나 타사 자산을 가져오지는 않음 |
| [Bloons TD 6 · Play Social이 보이는 Steam 가이드 캡처](https://steamcommunity.com/sharedfiles/filedetails/?id=2838871585) / [Ninja Kiwi 공식 지원](https://support.ninjakiwi.com/hc/en-us/articles/4429135549329-If-I-m-playing-Bloons-TD-6-can-I-play-co-op-with-someone-on-the-normal-version-of-the-game) | 중앙 섬 풍경을 살리고, 하단에 큰 Play와 Play Social을 나란히 배치. 참고 캡처의 빨간 화살표는 가이드 작성자가 추가한 표시 | 친구 관련 행동을 하나의 상위 메뉴로 묶음. Bloons는 협동이지만 aGe Clan은 경쟁 대전이므로 친구와 대전으로 명시 |
| [Kingdom Rush · 브라우저판 타이틀 캡처](https://cdn.mobygames.com/screenshots/11785793-kingdom-rush-browser-title-screen.jpg) | 로고 바로 아래에 큰 START, 아래 작은 CREDITS. 쇠사슬·목재·돌과 배경의 방어 탑이 같은 세계관 | 금색 주 명령과 절제한 금속 테두리를 사용. 화면 전체에 동급 카드 네 장을 두는 방식에서 벗어남 |
| [Age of Empires IV · 공식 포럼의 2025년 캡처](https://forums.ageofempires.com/uploads/default/original/3X/7/b/7bbe8351639f059a6db8c71afbef68dd6557e0e3.jpeg) | 왼쪽에 Single Player·Multiplayer·Proving Grounds를 세로로 묶고 중앙의 인물·전장 풍경을 남김 | 왼쪽 명령 메뉴와 오른쪽 성채의 구도를 채택. 서비스에 없는 뉴스·일일 과제·가짜 보상 패널을 추가하지 않음 |

[Netflix의 Bloons TD 6 안내](https://help.netflix.com/en/node/533318367040100)는 초대방 생성과 코드 입장 두 경로를 설명한다. 이를 aGe Clan에 맞게 해석해 하나의 친구 대전 창에서 두 행동을 전환하게 했다. 관찰한 구성에서 효과를 추론한 것이며 전환율·사용성 실험 결과는 아니다.

## 제안한 최종 흐름

- 혼자하기: 가장 큰 금색 명령. 기존 혼자하기 안내와 시작 동작을 유지.
- 대전 찾기: 기존 5인 일반 매칭. 참가자 수와 규칙을 그대로 표시.
- 친구와 대전: 하나의 창 안에 방 만들기 / 코드로 입장 선택. 기존 2~5인 초대방 API·코드 길이·방장 시작 규칙 유지.

상위 버튼을 선택하면 네트워크 요청부터 보내지 않고 기존 입장 창을 먼저 연다. 실제 생성·참가는 명시적인 하단 버튼에서 실행한다. 요청 중 방식 전환을 막고, 대기방에 들어간 뒤에는 입장 방식 버튼을 숨긴다. 잘못된 코드 수정 후 오래된 검증 오류도 정리한다. 기존 키보드 Enter·Escape 및 native dialog 동작을 유지한다.

## 범위와 보존

변경 파일은 public/game/index.html, multiplayer.js의 입장 UI, 새 title-command.css다. 기존 타이틀 삽화·title-hallmark.css·게임 자산을 보존하고 새 CSS 층을 추가했다. 게임 엔진·밸런스·API·DB·인증·배포 설정은 바꾸지 않았다. 타사 캡처는 참고용 work/references에만 있고 게임에 포함하지 않는다. 기존 소스와 Git 이력으로 이전 메뉴를 복구할 수 있다.

원본의 짧은 가로 화면 레이아웃 규칙을 새 메뉴보다 우선 적용해 버튼이 커지는 충돌을 브라우저에서 발견해, 세 명령과 하단 탐색을 한 화면에 넣도록 수정했다. 세로 화면은 전체 폭의 세 명령, 짧은 가로 화면은 제목 왼쪽·명령 오른쪽 구성을 쓴다.

## 검증과 승인 경계

14개 기존 회귀 검사 및 최종 빌드 통과. loopback 로컬 DB·Worker로 초대방 생성·코드 입력 전환·입력 오류·퇴장을 확인한다. 브라우저의 1366×768 / 390×844 / 844×390 배치와 키보드 동작을 확인하고 실제 PNG를 제공한다. 이는 전체 기기·접근성 인증이나 전환율 검증이 아니다.

승인 전 운영 ageclan.com은 v567 / Sites 58을 유지한다. 화면 제안에 대한 승인과 운영 배포 승인을 받은 후에만 기존 Sites 원격의 최신 변경을 다시 확인하고 공식 helper로 검증·push·패키징·저장·배포한다.
