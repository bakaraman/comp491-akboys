/**
 * AuthGuard.tsx — Optional auth gate for protected pages
 *
 * Redirects to /login when Firebase auth is enabled and no user is present.
 * When auth is disabled via env, it simply renders children.
 *
 * @author AKBOYS Team
 * @since 2026-04-03
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from 'firebase/auth';
import { authEnabled, subscribeToAuth } from '@/lib/firebase';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(authEnabled() ? undefined : null);

  useEffect(() => {
    if (!authEnabled()) {
      setUser(null);
      return;
    }

    const unsubscribe = subscribeToAuth((firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
      } else {
        setUser(null);
        router.replace('/login');
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [router]);

  if (!authEnabled()) {
    return <>{children}</>;
  }

  if (user === undefined) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0a0a0a',
      }}>
        <p style={{ color: '#4a4540', fontStyle: 'italic' }}>Checking identity...</p>
      </div>
    );
  }

  if (user === null) {
    return null;
  }

  return <>{children}</>;
}
