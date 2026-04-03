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
  title: 'The Velvet Shadow — Text Adventure',
  description: 'AI-powered noir detective text adventure game',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
