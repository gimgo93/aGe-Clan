# 변경 후 추가 검토 — aGe Clan

2026-10-19. 기존 sealed scan **d70ca74b-e5d6-40ed-b3ff-b054e7b9a36c는 수정 전 스냅샷의 결과**다. 기존 보고서와 finding 상태는 변경하지 않았다. 이 문서는 이후 현재 작업 중 소스에 대한 제한된 정적 추가 검토다. 새 전체 스캔, 배포 보안 인증, 운영 부하 테스트 또는 취약점 동적 재현 결과가 아니다. 이 검토자는 소스를 수정하거나 외부 요청을 실행하지 않았다.

## 현재 소스에서 확인한 개선

| 영역 | 현재 소스 근거 | 정적 확인 결과 |
| --- | --- | --- |
| WebSocket ingress | `lib/clan-room.js` message listener와 message | enqueue 전 30 messages/second, WS pending 40 제한; watch/resync 500ms 제한. 최초 무제한 full snapshot 경로를 직접 완화한다. |
| HTTP room ingress | `lib/clan-room.js` fetch 시작 | serial queue 이전 방 전체 35회/초, identity별 12회/초 제한. 생성 제한만으로 막을 수 없던 HTTP poll/action flooding을 완화한다. |
| 방 생성/입장 | `lib/realtime-router.js`, `lib/pvp-gateway.js` | gateway가 신뢰하는 ingress IP의 hash를 새로 전달하며 entering 12회/분 quota. 브라우저의 임의 x-clan-ingress는 전달하지 않는다. 만료 limit 및 오래된 D1 directory 행을 청소한다. |
| 버려진 DO 저장소 | `lib/clan-room.js` alarm | cold start에서도 storage.get('room')에서 id를 복구한 후 D1 행을 먼저 삭제하고 DO deleteAll을 실행한다. 알람 id 미복구 문제에 대응한다. |
| 피드백 | `app/api/feedback/route.ts` | cookie와 독립적인 D1 quota 2회/분과 같은 Sites DB에서 expires 청소가 추가됐다. cookie 생략만으로 제출 제한을 우회하는 최초 경로를 완화한다. |
| Checkpoint/ack | `lib/clan-room.js` checkpoint, persist, message | put과 setAlarm 모두 allowUnconfirmed:true 및 allowConcurrency:true 사용. 명령 응답에서 persist 완료를 직접 기다리지 않고 약 2초 주기의 checkpoint를 수행한다. 사용자 승인한 반응 우선 tradeoff라는 것은 작업 담당자에게 전달받은 맥락이다. |
| 랭킹 읽기 | `lib/realtime-router.js` leaderboard | 결과를 isolate 메모리에 5초 cache한다. D1 반복 조회 비용을 줄이며 query는 SQL bind 또는 고정 SQL이다. |

## 랭킹 무결성 및 개인정보

`lib/clan-room.js`, `lib/match-engine.js`, `lib/room-state.js`, `drizzle/0002_rankings.sql`, `public/game/chronicle.js`를 읽었다. 공개 랭킹은 서버 시뮬레이션의 completed 값만 저장하며 클라이언트 score 제출 op는 없다. 기존 최고 wave보다 높은 경우만 UPSERT한다. 사용자 이름은 서버에서 제어문자 및 꺾쇠를 제거하고 16자로 제한하며 avatar는 0~7 범위로 제한한다. 브라우저 랭킹 이름·점수 표시는 textContent다. 이 경로에서 점수 직접 제출이나 이름 XSS는 발견하지 못했다. 이는 익명 cookie 기반 기록이며 별도 계정 인증, 다중 세션 방지 또는 봇 플레이 탐지의 증명은 아니다.

Game.setSpeed와 Game.setPaused는 multiplayer 상태에서 거부한다. 따라서 PvP 클라이언트가 해당 명령으로 자기 시뮬레이션을 정지·가속하는 경로는 검토한 코드에서 차단된다.

## 운영 시 남는 한계와 후속 확인

- HTTP fetch의 this.queuedMessages 검사는 현재 카운터가 WS enqueue에서만 증감되므로 HTTP pending queue 자체를 40으로 제한하는 보장은 아니다. HTTP에는 위 35/초·12/초 제한이 적용된다. HTTP queue 상한을 문서에 주장하려면 HTTP enqueue에도 카운터 증감과 finally 해제가 필요하다.
- 5초 랭킹 cache는 isolate별이다. 모든 지역·동시 cold isolate에서 D1 조회가 단 한 번만 일어난다는 보장은 아니다. 별도 조회 rate limit이나 global admission은 현재 확인하지 않았다.
- 생성 제한은 신뢰 ingress identity 단위다. 여러 IP를 쓰는 공격자의 전체 할당량을 제한하는 전역 비용 상한·봇 탐지 체계까지 구현된 것은 아니다. 같은 학교·가정처럼 NAT를 공유하면 생성 quota도 함께 쓴다.
- feedback 메시지와 랭킹의 장기 보관 정책은 아직 확인하지 않았다. raw IP를 이 코드가 저장하지 않더라도 IP hash와 세션 hash는 운영상 식별 데이터로 취급하는 편이 적절하다.
- ack 먼저 보내는 방식은 서버 강제 종료·저장 실패 시 이미 화면에 반영된 최근 진행이 되돌아갈 수 있다. 정확히 최대 2초 손실이라고 보장하지 않는다. 저장 지연·재시도와 schedule 지연도 영향을 준다. 이 검토는 storage-free 지연 개선 수치를 측정하지 않았다.
- 담당자가 2인·5인 실제 로컬 WebSocket, reconnect, spectator, idempotency 테스트 통과를 전달했다. 이 검토자는 해당 실행을 직접 수행하지 않았으며 로컬 기능 통과가 운영 동시 접속 한도를 뜻하지 않는다.
- Sites DB와 PvP DB 양쪽 migration 적용, 운영 Cloudflare ingress header 신뢰성, 최종 배포 artifact 동일성, WAF/TLS/계정 MFA 및 실제 수용량은 이번 정적 검토로 확인하지 않았다.

## 검토 시점 소스 식별

Git 기반 commit: `81ba514491b752f6ca7397b5c07a976801b0bc6a`. 아래는 해당 커밋 이후 작업 중 파일의 재독 시점 SHA-256이며 이후 수정되면 다시 확인해야 한다.

| 파일 | SHA-256 |
| --- | --- |
| lib/clan-room.js | 4CB82972F5E3FA8840BC898FAA269111F95D7D9F91447B0FEC9F3DDED8A4E012 |
| lib/realtime-router.js | 0E8BAFE9F32B148E4B8A63F6FD835043DFC0525F4DFECF93960424C1F2A46C5D |
| lib/room-state.js | F3224A9951F5F10D6C2417483282725656564F379271665B0FD02D7F43141928 |
| lib/match-engine.js | 2671ADB9F3FC5A97D2C7C0ECE4A17B771EFADB39ADF6A155126FA37987F60E07 |
| lib/pvp-gateway.js | 9F68BD350703C6C61F6314DE59AE737352E9301D19A46CB39ED0CE9CACCED508 |
| app/api/feedback/route.ts | 00F022BE6FF756A024564B5E71767713FD053E0CC41A72FB1DAC531EB5523F27 |
| drizzle/0002_rankings.sql | C4CDE3C8F766202162136DF2B1E33968963E65CF137AAA4B2DC79D9E7BDC573E |

최종 추가 수정: HTTP fetch도 queuedMessages를 입구에서 증가하고 finally에서 감소하여 WS와 pending 상한을 공유합니다. check-checkpoint.mjs와 실제 2/5 WebSocket·서버 혼자하기 통합 검증을 통과했습니다. 운영 WAF/MFA/TLS 설정, 대규모 부하 및 계정 기반 동일인 식별은 검증 범위 밖입니다.
