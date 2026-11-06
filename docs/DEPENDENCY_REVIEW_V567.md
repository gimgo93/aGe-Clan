# v567 의존성 점검

2026-11-05 npm registry audit 결과와 소스·빌드 import 경로를 대조했다. 최초 Critical 1 / High 15 / Moderate 17 / Low 1에서 최종 Critical 0 / High 0 / Moderate 15 / Low 0으로 줄었다. 이 수치는 취약한 패키지와 이를 끌어오는 상위 패키지 경고를 함께 센 결과이며, 개별 공개 취약점 15개가 입증됐다는 뜻은 아니다. 새 취약점이 발견되지 않는다는 보장은 아니다.

## 처리

Next 16.4.5, React/React DOM/react-server-dom-webpack 19.2.8을 적용했다. RSC의 서버 디코더는 실제 프런트 서버 번들에 있으므로 devDependencies라는 이유로 제외하지 않았다. Vite 8.3.6, Cloudflare Vite plugin 1.67.0, Zod 4.6.7을 적용하고 Zod record의 키 스키마를 명시했다. image-size 2.0.3, sharp 0.35.5, brace-expansion 1.1.21 및 esbuild 0.28.0→0.28.2 override와 호환 범위 내 전이 의존성 갱신을 lockfile에 고정했다. 강제 audit fix나 Drizzle/ESLint의 자동 구버전 전환은 하지 않았다.

운영 PvP Worker의 import graph는 로컬 파일과 jose, cloudflare:workers만 포함한다. 위 프레임워크 패키지들은 배포된 별도 백엔드에 포함되지 않는다. 이 후속 변경은 프런트 후보이며 백엔드를 다시 배포한 것으로 기록하지 않는다.

## 남은 Moderate 15개: 원인 3개

| 원인 | 사용 경로와 남은 범위 |
|---|---|
| esbuild 0.18.20 | drizzle-kit → @esbuild-kit/esm-loader → core-utils. 개발 서버 관련 경고다. 앱 서버/별도 PvP Worker에 포함되지 않는다. 기존 DB 도구를 호환 검증 없이 강제 변경하지 않았다. 이 esbuild로 개발 서버를 열지 않는다. |
| minimatch 10.2.6 | typescript-eslint의 파일 경로 처리. 빌드된 앱 서버/별도 PvP Worker와 무관하다. 수정 버전 11 계열로의 강제 override는 하지 않았다. |
| satori 0.16.0 | Vinext → @vercel/og의 SVG 생성. 앱에 ImageResponse/next/og 또는 사용자 입력 이미지 생성 경로가 없고 현재 서버 번들에 Satori가 포함되지 않았다. 향후 OG 기능을 추가하기 전 Vinext/OG의 호환 업그레이드를 검증해야 한다. |

새 Vinext 안정판은 React 19.3 계열 등 동반 변경을 요구하므로 이번 보안 패치에 전체 프레임워크 교체를 섞지 않았다. 위 판단은 현재 앱의 도달 경로 기준이며 해당 라이브러리 자체의 취약성을 부정하지 않는다. 개발 도구/OG 의존성 정리는 미완료 항목으로 남긴다.

## 검증과 한계

14개 로컬 회귀, 최종 Sites 빌드, 격리 workerd의 HTTP/DB 경계, 새 npm start의 실제 HTTP와 2인/5인 WebSocket을 확인한다. Zod 프로토콜은 중첩 JSON 허용, 추가 필드·배열 거부, 응답 record 호환을 검증했다. 실제 브라우저 화면 QA와 Google 로그인 UI는 도구 제한으로 수행하지 못했다.

공식 보안 공지: [RSC 서버 함수 DoS](https://github.com/advisories/GHSA-wx67-qw84-cm4g), [Next OG RCE](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j), [Next SVG 이미지 최적화 RCE](https://github.com/advisories/GHSA-2464-fhr4-w9xw). Next의 해당 기능을 사용하지 않는 점과 패치 적용 사실을 구분한다.
