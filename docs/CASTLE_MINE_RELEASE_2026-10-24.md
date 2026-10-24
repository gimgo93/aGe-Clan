# 성벽·성 피격·광산 오디오 / 2026-10-24

Sites v26 배포 성공: 651d8b0393b68cb156f1942d7ade4b79a50b268f.
Deployment: appgdep_6adc98cbe1548191bc03a3a0a3d5cb0a.
https://ageclan.com/game/

## 광장 성벽

[새 광장 이미지](../public/game/assets/town-courtyard-v3.png)는 기존v2를 참조해 내장 image_gen으로 수정했습니다.
잘린 좌우 성벽/감시탑을 완성하고 주변 포장석을 연결했습니다. 원본v2도 보존합니다.
광장만 기본 카메라의 가로/세로 여유를 계산해 전체 배경이 HUD와하단 패널 사이에 들어오도록 했습니다.
기본/축소 시 성벽 전체가 보이며, 사용자가 직접 확대/이동하면 화면 밖으로 나가는 것은 정상입니다.

## 성 피격

성HP의실제 감소를 관찰해 전용충격음(저음 충격+짧은 파열음), 큰 충격파/불빛/파편/피해숫자,
화면가장자리경고를 표시합니다. 기존 일반파괴음 대신 전용음의최대구성음gain0.12를 사용하며 전체음량과효과음토글을 따릅니다.
피격흔들림은 최대8px로 강화했습니다. 흔들림 끄기와동작줄이기를 존중하며, 동작줄이기에서는파편이동을 생략합니다.
첫 스냅샷/새 방/시간 초기화는 기준만 잡고 수리나중복스냅샷은 새피격으로 처리하지 않습니다.
광산/광장에 있어도 성피해에 대한 화면경고와음성효과가 작동합니다.

## 광산

광산 음악bus는0.55→0.165로, 다른 지역의30%진폭이 되도록 부드럽게 낮춥니다. 떠나면 원래값으로 돌아갑니다.
배경음악토글과전체음량을 유지하며음악감쇠가효과음bus를 줄이지 않습니다.
실제누적채굴횟수strikes가 증가할 때 금속성곡괭이/광석충격의3음채굴음을 재생합니다.
광산에서만 재생하고 처음 접속한누적치/중복스냅샷/다른지역채굴/일시정지는 새채굴음을 만들지 않습니다.
기존frame의약한채굴음호출은 제거해 두번재생하지 않습니다.

## 검증

- unit: 광산/일반/음악끄기 gain, 채굴/피격 증가분과중복/수리/다른지역, 기존효과음음소거/노드정리.
- unit: 성피격의기준/HP감소/수리/새방, 모바일·PC광장배경의HUD/화면경계맞춤.
- check-ui-audio, check-world-presentation, check-tower-balance, production build 통과.
- 로컬실제renderer에서성벽전체/피격충격파·경고/광산채굴을 실행하고브라우저오류없음을 확인했습니다.
  실제스피커의청감품질은 자동검사만으로 평가하지 않습니다.
- 실제배포audio.js/renderer.js/app.js/새PNG해시와HTML의버전연결 확인.
- 게임규칙/피해량/시설비용/시간/음량설정저장형식/서버DB/Cloudflare게임서버는 바꾸지 않았습니다.

## 생성 프롬프트

도구: 내장 image_gen 편집. 참조 public/game/assets/town-courtyard-v2.webp, 투명배경false. CLI/API미사용.

Edit this existing medieval game courtyard background to fix visibly cropped ramparts. Preserve the rustic beige limestone, isometric top-down perspective, warm muted colors, red banners, central gate and broad EMPTY cobblestone courtyard. Pull the framing outward and complete the entire left and right curtain walls and every watchtower, including their roofs and outer bases. Nothing architectural may touch or be cropped by any image edge. Keep at least 12% clear cobblestone margin around ALL wall/tower extremities, especially at left/right and above gate. Show a complete U-shaped fortified courtyard with an open foreground (no front wall), no new buildings or people in the central playing area. All the canvas outside the completed U-shaped walls continues the same plain cobblestone paving, no sky, no empty solid-color areas, no text or UI. Make the perimeter visually coherent and complete rather than slicing towers at the border. Keep generous usable courtyard space for placing two game buildings later.
