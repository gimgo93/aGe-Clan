# 성채 광장·시작 메뉴 개편

## 적용

- 설정의 `시작 화면으로`를 `게임 나가기`로 변경했습니다. 서버 연결이 있는 혼자하기와 대전은 방에서 퇴장하고 시작 메뉴로 돌아옵니다. 서버 연결이 없는 로컬 게임도 현재 게임을 초기화합니다.
- 계정 연동 진입점을 시작 화면의 별도 버튼에서 **설정 → 계정 연동**으로 옮겼습니다. 계정 창을 닫으면 아래의 설정 창으로 돌아옵니다. 업적·랭킹에서 로그인 안내로 직접 연결하는 동작은 유지합니다.
- 마을의 나무 울타리와 임시 바닥을 석조 성벽·8개 궁수 감시초소가 있는 광장 이미지로 교체했습니다. 초소와 경비병은 장식이며 추가 전투 피해를 주거나 자원을 소모하지 않습니다. 기존 훈련소·연구소의 위치와 관리 터치는 유지합니다.
- 랭킹·업적은 투명 배경의 금속 트로피·훈장으로 교체하고 게임 설명은 책 문양으로 구성했습니다. 네 가지 게임 모드도 성채·교차검·깃발·열쇠 문양과 동일한 금속 프레임을 사용합니다.
- 기존 aGe 로고는 유지했습니다. 새 이미지 세 개는 원본을 보존하고 배포용 WebP로 인코딩했습니다. 투명 아이콘의 알파 채널도 유지합니다.

## 이미지 제작

OpenAI 내장 `image_gen`으로 생성했습니다. 외부 유료 API나 별도 API 키를 사용하지 않았습니다. 생성물은 아래 프로젝트 경로에 포함되며 Flare 파생 자료와 구분됩니다.

| 파일 | 용도 | 배포 크기 |
| --- | --- | --- |
| `public/game/assets/town-courtyard-v2.webp` | 성벽과 궁수초소가 있는 마을 배경 | 596,732 bytes |
| `public/game/assets/menu-ranking-v2.webp` | 랭킹 트로피 | 43,690 bytes |
| `public/game/assets/menu-achievements-v2.webp` | 업적 훈장 | 36,050 bytes |

## 사용한 프롬프트

### 마을 — transparent_background: false

Use case: historical-scene. Asset type: seamless-feeling full screen 2D isometric medieval strategy game village courtyard background for aGe Clan. Generate a landscape image about 16:10 aspect ratio, high resolution. Realistic hand-painted pre-rendered strategy game art, muted olive, limestone gray, weathered tan, subtle bronze, grounded materials, overhead isometric orthographic view at 45 degrees down, no visible horizon. A fortified inner courtyard bordered along the BACK and SIDE perimeter by substantial crenellated stone curtain walls, eight small distinct archer watchtowers with timber platforms, ladders and tiny medieval archers along the parapets, modest burgundy banners. Stone masonry must have plausible perspective and realistic weathering. Broad OPEN pale cobblestone courtyard in the central 65% of composition and foreground, completely empty of buildings so game buildings can be overlaid. Perimeter walls well within the image, side walls frame but do not obscure the center. No trees, no forest, no giant central castle, no fountain, no text, no UI, no borders, no watermark. This is a playable map background, not cinematic concept art; fine detail yet readable at small zoom. Soft daylight from upper left, low contrast courtyard, earthy lighting matching a realistic medieval 2D tower defense. Ground fills all image edges, no black or transparent margins.

### 랭킹 — transparent_background: true

Use case: stylized-concept. Asset type: game menu icon, one isolated object on actual transparent background. An exquisite ancient bronze and aged gold victory trophy with two sculpted handles, a laurel wreath and a small medieval castle relief on its cup, broad heavy stone plinth. Realistically rendered 2D strategy game inventory art for aGe Clan, tactile hammered gold metal, olive patina in recesses, restrained warm highlights, strong silhouette, front three-quarter view, centered, fills 82% of square frame, reads clearly at 64 pixels. No lettering, no numerals, no circular background, no backdrop, no extra scattered objects, no external cast shadow, no watermark. Premium historical strategy UI icon, no cartoon outlines.

### 업적 — transparent_background: true

Use case: stylized-concept. Asset type: game menu icon, one isolated object on actual transparent background. A prestigious medieval campaign medal: a dimensional aged gold eight-point star medallion, embossed castle and shield at center, a small laurel around the center, suspended from folded deep burgundy red fabric ribbons. Realistically rendered 2D strategy game inventory art for aGe Clan, tactile metal and cloth matching ancient bronze/gold menu icons, restrained warm highlights, centered frontal view, fills 82% of square frame, reads clearly at 64 pixels. No letters, no numbers, no circular background, no backdrop, no extra objects, no external cast shadow, no watermark. Premium historical strategy UI icon, no cartoon outlines.
