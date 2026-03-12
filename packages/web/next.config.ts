/**
 * next.config.ts — Next.js configuration
 *
 * Enables transpilation of the shared monorepo package.
 *
 * @author AK Boys Team
 * @since 2026-03-12
 */

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@akboys/shared'],
  devIndicators: false,
};

export default nextConfig;
