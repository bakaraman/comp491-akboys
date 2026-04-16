/**
 * singleplayer/page.tsx — Redirect (single-player removed)
 *
 * Single-player mode has been retired in favour of multiplayer-only gameplay.
 * Any lingering link to /singleplayer now redirects to /multiplayer.
 *
 * @author AKBOYS Team
 * @since 2026-04-17
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SinglePlayerRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/multiplayer');
  }, [router]);

  return null;
}
