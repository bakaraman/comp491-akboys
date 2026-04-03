/**
 * next.config.ts — Next.js configuration
 *
 * Keeps the frontend config intentionally small for App Hosting.
 *
 * @author AKBOYS Team
 * @since 2026-03-12
 */

import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,
  output: 'standalone',
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
};

export default nextConfig;
