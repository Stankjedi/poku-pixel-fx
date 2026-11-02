import type { Metadata } from 'next';
import './home.css';

export const metadata: Metadata = {
  title: 'POKU Pixel FX',
  description: '픽셀 이펙트를 살펴보고 작품을 공유하세요.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ko"><body>{children}</body></html>;
}
