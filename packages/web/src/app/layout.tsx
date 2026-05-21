/**
 * layout.tsx — Root layout for the Next.js app
 *
 * Sets up global fonts, metadata, and the dark theme wrapper.
 *
 * @author AKBOYS Team
 * @since 2026-03-12
 */

import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'The Velvet Shadow',
  description: 'Çok oyunculu AI hikâye oyunu',
};

/**
 * Mobile responsive viewport. `viewportFit: 'cover'` lets us honour iOS
 * notch / home-bar via env(safe-area-inset-*). `userScalable: true` keeps
 * accessibility (users can still pinch-zoom). `maximumScale: 5` allows
 * useful zoom without runaway scaling that breaks layout.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#0a0a0a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
