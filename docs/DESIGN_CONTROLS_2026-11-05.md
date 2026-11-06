# 게임 제어 화면 디자인 변경

기존 aGe Clan의 숲색·석조 성채·황동·아이보리와 타이틀 삽화를 보존했다. 새 타이틀/튜토리얼/첫 플레이 안내 개편은 제외한다. 별도 이미지 생성이나 자산 교체는 없다.

`public/game/fortress-controls.css`는 기존 화면 위의 공통 토큰과 상태 스타일이다. 설정/계정 창 표면·헤더·본문 대비를 통일하고, 설정 설명을 14px로 높이며, 키보드 포커스와 주요 버튼 44px 터치 영역을 적용했다. 계정 동작은 넓은 화면 2열/작은 화면 1열이며 삭제 버튼에 별도 경계를 둔다. 통계 제어 창은 safe area·가로/세로 크기·스크롤·동작 줄이기를 고려하고 삭제 중/실패/완료를 문장으로 알린다. HUD는 숫자 폭과 주요 제어의 조작 영역을 정리했다.

통계 제어는 native dialog의 top layer를 사용해 이미 열린 설정 창 위에서도 조작할 수 있게 했다. 브라우저 저장이 거부되면 현재 탭에서 즉시 수집을 중단하고 메모리 재시도를 유지하며, 정보가 이 탭에만 남는다는 점을 표시한다. 이전 통계 POST가 끝나지 않아도 삭제 요청과 10초 취소 타이머를 바로 시작한다.

참고한 GitHub 지침: [Vercel web-design-guidelines skill](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines), [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md). 기존 타이틀의 [Hallmark 작업 이력](2D_HALLMARK_TITLE_2026-10-30.md)은 문맥으로 보존하며, 새 페이지 전체 재설계 절차를 다시 실행하지 않았다. 외부 skill 코드를 앱 런타임에 추가하지 않았다.

시각 검증 계획: 390×844 세로, 844×390 가로, 1366×768 데스크톱에서 설정·계정·통계 실패/재시도 창, 포커스·스크롤·겹침·가로 넘침 확인. 사용자는 브라우저 설정과 계정이 맞다고 확인했지만, 새 제어 세션에서도 `Local browser use is disabled in Work settings` 오류와 빈 브라우저 목록이 반환됐다. 따라서 현재 채팅의 브라우저 접근 오류로 기록하며 설정이 꺼져 있다고 단정하지 않는다. 실제 화면 QA와 스크린샷은 미완료다. 기존 DOM/오디오/업적/시작 동작 회귀 통과가 화면 검증을 대신하지 않는다.
