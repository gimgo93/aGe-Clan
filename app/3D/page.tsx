import { redirect } from 'next/navigation';
export const metadata = { robots: { index: false, follow: true } };
export default function ThreeDTrial() { redirect('/3D/index.html'); }
