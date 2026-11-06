import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://ageclan.com'),
  title: "aGe Clan · 문명 타워 디펜스",
  description: "광산과 벌목으로 자원을 모으고, 구석기부터 현대까지 문명을 발전시켜 성채를 지키세요. 혼자 무한 방어에 도전하거나 친구들과 실시간 대전을 즐기는 aGe Clan 타워 디펜스 게임.",
  icons: {
    icon: [{ url: '/favicon.ico', sizes: 'any' }, { url: '/favicon.png', type: 'image/png', sizes: '96x96' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
};
export default function Layout({children}: {children: React.ReactNode}) { return <html lang="ko"><body>{children}</body></html>; }
