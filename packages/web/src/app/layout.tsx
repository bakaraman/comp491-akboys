/**
 * layout.tsx — Root layout for the Next.js app
 *
 * Sets up global fonts, metadata, and the dark theme wrapper.
 *
 * @author AKBOYS Team
 * @since 2026-03-12
 */

import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'The Velvet Shadow',
  description: 'Çok oyunculu AI hikâye oyunu',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
