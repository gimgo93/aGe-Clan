# 이미지 출처 및 라이선스

## 2026-10-21 생성 이미지

- `assets/town-courtyard-v2.webp`: 성벽과 여덟 궁수 감시초소가 있는 마을 광장.
- `assets/menu-ranking-v2.webp`, `assets/menu-achievements-v2.webp`: 투명 배경 트로피·훈장.
- OpenAI 내장 이미지 생성 도구로 이 게임을 위해 생성했습니다. 원본 생성 PNG는 제작자의 로컬 생성 이미지 폴더에 보존하며 배포본은 WebP 인코딩입니다. 이 세 파일은 아래 Flare 자료에서 파생하지 않았습니다. 사용 프롬프트는 저장소의 `docs/ART_REFRESH_2026-10-21.md`에 기록했습니다.

## aGe Clan 로고

- 사용자가 제공한 `age-clan-logo.png` 원본을 사용합니다. 원본도 보관하며, `age-clan-logo-transparent.png`는 OpenAI 이미지 편집 도구로 흰 배경을 제거한 투명 버전입니다. 편집 프롬프트: 원래 aGe 글자·금속 질감·성 그림을 유지하고 흰 배경을 투명하게 제거.

## Flare 타일과 캐릭터

- 원본 프로젝트: https://github.com/flareteam/flare-game
- 상세 기여자: https://github.com/flareteam/flare-game/wiki/Credits
- 저작자: Clint Bellanger 및 Flare 기여자. 전체 명단은 `assets/FLARE-CREDITS.txt` 참조.
- 라이선스: CC BY-SA 3.0 (이 배포본의 Flare 자료 및 변형본). 전문은 `assets/FLARE-LICENSE.txt`.
- 초원 원본 안내: https://opengameart.org/content/grassland-tileset
- 동굴 원본 안내: https://opengameart.org/content/cave-tileset
- 사용한 원본 경로: `mods/fantasycore/images/tilesets/tileset_grassland.png`, `tileset_cave.png`; `images/avatar/male/`의 cloth, chain, head_short, shortbow, smith_hammer 장비 및 해당 animation 정의; `images/enemies/goblin.png` 및 animation 정의; `images/npcs/peasant_man1.png`.
- 수정: PNG 타일을 WebP로 압축하고 넓은 전장·광산 지형 WebP 4개를 Flare 타일에서 미리 렌더링했습니다. 정해진 프레임 좌표로 장비를 합성하여 광부·병사 스프라이트 아틀라스를 구성하고 UI 초상을 추출했습니다. 농부 원본의 7열 프레임을 사용하고 별도 도끼 이미지를 움직여 벌목 인부로 표시합니다. 게임 안에서 성채·포탑·조명·광석·효과를 그립니다. 이러한 Flare 파생 그래픽은 CC BY-SA 3.0으로 제공됩니다.
- 초원 기여: Clint Bellanger, Lamoot, Blender Foundation (apricot.blender.org), Lattice, p0ss, Bart K., Sindwiller 등. 전체 기여자 명단 및 상세 라이선스 링크를 위 자료와 함께 확인할 수 있습니다.

## 벌목 도끼

- `assets/woodcutter-axe.png`는 이 게임을 위해 OpenAI 이미지 생성 도구로 만든 투명 배경 도끼 이미지입니다.
- 생성 프롬프트 요약: 사실적인 2D 판타지 게임용 벌목 도끼 한 자루, 낡은 철제 날과 나뭇결 손잡이, 측면 모습, 투명 배경.

## 물약

- Melissa Krautheim (MELLE), FANTASY-potion-set
- https://opengameart.org/content/fantasy-potion-set
- 원본 파일: potion-yellow.png, potion-blue.png
- CC0: https://creativecommons.org/publicdomain/zero/1.0/
- 원본 PNG 그대로 사용. 게임 인터페이스에서 번개와 얼음 표식을 겹쳐 보여 줍니다.

참고로 제공된 문명4 스크린샷은 구도 참고에만 사용했으며 게임에 포함하지 않았습니다. 게임 UI 및 로직은 이 프로젝트를 위해 작성했습니다. 효과음과 배경 선율은 Web Audio로 합성하며 외부 음원을 사용하지 않습니다.

## 발리스타 활과 프레임

“[LPC] Siege Weapons” by bluecarrot16 (commissioned by castelonia / Herodom).
Source: https://opengameart.org/content/lpc-siege-weapons
Selected license: CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/
Files: assets/ballista.png, assets/ballista-arm.png. Originals retained; rendered with scale and color adjustment.


## 2026-10-24 글꼴·효과음

메뉴와 전장 글꼴은 Google Fonts의 Noto Serif KR을 사용하며, 연결할 수 없을 때 바탕/명조 계열 시스템 글꼴로 대체합니다. https://fonts.google.com/specimen/Noto+Serif+KR
처치·크리스탈·화면 전환·건설·강화·승패 효과음은 audio.js의 Web Audio 합성으로 제작했으며 외부 음원을 사용하지 않습니다.


## 2026-10-24 건설·광장 시설 이미지

construction-site-v1.png, lab-building-v1.png, barracks-building-v1.png는 이 게임을 위해 내장 이미지 생성 도구로 제작한 투명 PNG입니다. 외부 음원/이미지를 새로 내려받아 포함하지 않았습니다. 생성 프롬프트와 사용 범위는 docs/WORLD_PRESENTATION_2026-10-24.md에 기록합니다. 바닥과 숲은 기존 Flare 타일과 배포된 광장 이미지에서 렌더링하며 기존 출처 조건을 유지합니다.


2026-10-24: town-courtyard-v3.png는 기존 광장 배경을 내장 이미지 도구로 확장해 잘린 성벽/감시탑을 완성한 수정본입니다. 기존 v2는 보존합니다. 피격·광산 효과음은 외부 음원 없이 Web Audio로 합성합니다.
