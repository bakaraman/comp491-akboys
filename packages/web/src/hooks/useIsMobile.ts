/**
 * useIsMobile.ts — SSR-safe viewport breakpoint hook
 *
 * Returns true when the viewport width is at or below the mobile
 * breakpoint (default 768px). Designed to avoid Next.js hydration
 * mismatches: the initial render (SSR + first client render) always
 * yields `false`, then the value updates after mount once we can read
 * window.matchMedia. The cost is a single re-render on mobile devices,
 * which is acceptable for layout-fork decisions (single-column vs
 * two-column, modal vs full-screen, header collapse).
 *
 * Pair with `@media (max-width: 768px)` blocks in globals.css for
 * style-only adjustments that don't need a re-render.
 *
 * @author AKBOYS Team
 * @since 2026-05-21
 */

'use client';

import { useEffect, useState } from 'react';

const DEFAULT_BREAKPOINT_PX = 768;

export function useIsMobile(breakpointPx: number = DEFAULT_BREAKPOINT_PX): boolean {
  // Start `false` on every render path so SSR and the first client render
  // agree. We only flip to true after mount on devices that actually need
  // it — a one-frame layout shift on phones, never any hydration warning.
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const apply = () => setIsMobile(mql.matches);
    apply();
    // Safari <14 only supports the deprecated addListener API.
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', apply);
      return () => mql.removeEventListener('change', apply);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const legacy = mql as any;
    legacy.addListener(apply);
    return () => legacy.removeListener(apply);
  }, [breakpointPx]);

  return isMobile;
}
