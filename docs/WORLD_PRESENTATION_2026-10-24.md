# 건설·지역 전환·확장 배경 / 2026-10-24

Sites v25 배포 성공. 소스0e98b614c55a07ffb964c733cfaf6cdecf7ebc99.
Deployment: appgdep_6adc9394739081918d2c066c62478271.
https://ageclan.com/game/

## 새 이미지

내장 image_gen으로 생성했고 CLI/OpenAI API를 호출하지 않았습니다. 투명 PNG 원본을 그대로 배포했습니다.

- [공사 중 시설](../public/game/assets/construction-site-v1.png): 포탑과 연구소/훈련소의 공사 중 목재 비계·석재 기초 표시.
- [연구소](../public/game/assets/lab-building-v1.png): 완공 외형.
- [훈련소](../public/game/assets/barracks-building-v1.png): 완공 외형.
- [생성 프롬프트 원문](WORLD_IMAGE_PROMPTS_2026-10-24.json).

OpenGameArt의중세 아이소메트릭 자료도 검색했으나 새 외부 이미지를 다운로드해 포함하지 않았습니다.
기존 Flare 출처/라이선스를 유지하며 town-courtyard-v2.webp는 기존 운영 사이트에서 만든 광장 배경을 그대로 재사용합니다.
이미지는 public/game/assets에 실제 보존하며 외부 생성 폴더만 참조하지 않습니다.

## 전환

전장/광산/광장의 모든 방향에 동일한 sceneTransitionStyle과SceneTransition을 사용합니다.
이전의 광장 강제 슬라이드 조건을 제거했습니다. 설정의 화면 넘김에서 페이드/슬라이드를 선택하면 지역에 관계없이 적용됩니다.
페이드는 이전 장면의 투명도를 낮추고, 슬라이드는 이전 장면을 밀어내며 새 장면을 드러냅니다.
단색 덮개를 사용하지 않습니다. 동작 줄이기에서는 즉시 전환하고 전환음도 재생하지 않습니다.
연속 선택 시 이전 애니메이션을 취소하고 완료된 snapshot/animation을 해제합니다.

## 바깥 배경

- 광장: 기존 광장 이미지의 중앙 포장석을 재사용한 반복 바닥으로 이어집니다.
- 광산: 기존 cave 바닥 타일이 화면 끝까지 반복됩니다.
- 전장: 기존 grassland 바닥이 이어지고 바깥으로 갈수록 짙어지는 장식 숲으로 연결됩니다.

고정된3300×4800그림 바깥을 단색으로 채우던 방법 대신 현재 viewport/카메라/확대율/흔들림을 역변환해 필요한 전체 영역을 채웁니다.
작은 바닥3종과숲 패턴은 최초 로딩 시 캐시해 이동할 때 새 대형 이미지를 만들지 않습니다.
기존 적·성·시설·채집 장소는 그대로 그리며 장식 숲을game.setTreeSites에 추가하지 않습니다.
광산의 실제 구조물/벽 그림자는 남아 있지만 화면 바깥을 검은 단색으로 채우지는 않습니다.

## 검증과 범위

- check-world-presentation: 모바일/PC크기, 확대·축소, 카메라 이동/흔들림에서 viewport 덮임, 캐시 재사용,
  전환 설정/취소/완료 해제/동작 줄이기, 이미지 파일 존재 검증.
- check-ui-audio, check-client-commands, check-pvp, check-tower-balance, check-forest-start 통과.
- 로컬 실제 renderer에서 세 지역의 기본 보기/최대축소/지도 끝, 공사/완공, 페이드/슬라이드를 확인했습니다.
  오프라인 검증 화면은 .sites-runtime에만 두고 배포하지 않았습니다.
- production build 성공. 실제 도메인의 JS/CSS와 생성PNG3개의해시가 배포 소스와 일치하며 새 HTML 연결을 확인했습니다.
- 운영 방/매칭/전투를 만들거나 서버 DB를 변경하지 않았습니다. Cloudflare게임 서버는 재배포하지 않았습니다.
- 게임 규칙/공격력/건설시간/비용/채집 가능한 나무 배치와 ML 상태는 바꾸지 않았습니다. 기존3D·날씨 기능도 보존했습니다.

GitHub에는 현재 광장 렌더러의 필수 배경 이미지를 함께 보존해 새 렌더러가 누락된 이미지를 요청하지 않도록 했습니다.
