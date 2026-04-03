/**
 * login/page.tsx — Login page for Firebase Auth
 *
 * Supports Google sign-in when auth is enabled.
 *
 * @author AKBOYS Team
 * @since 2026-04-03
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  authEnabled,
  signInWithGoogle,
  subscribeToAuth,
} from '@/lib/firebase';

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authEnabled()) {
      router.replace('/');
      return;
    }

    const unsubscribe = subscribeToAuth((user) => {
      if (user) {
        router.replace('/');
      }
    });
    return () => {
      unsubscribe?.();
    };
  }, [router]);

  if (!authEnabled()) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0a0a0a',
      }}>
        <p style={{ color: '#4a4540', fontStyle: 'italic' }}>Redirecting...</p>
      </div>
    );
  }

  async function handleGoogleSignIn() {
    setIsLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      router.replace('/');
    } catch (err) {
      console.error('[login] sign-in error:', err);
      setError('Sign-in failed. Please try again.');
      setIsLoading(false);
    }
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#0a0a0a', padding: '24px',
    }}>
      <div style={{ textAlign: 'center', maxWidth: '420px', width: '100%' }}>
        <h1 style={{
          fontSize: '36px', color: '#d4a843', fontFamily: 'Georgia, serif',
          fontWeight: 'normal', fontStyle: 'italic', marginBottom: '8px',
        }}>
          AKBOYS
        </h1>
        <p style={{
          fontSize: '13px', color: '#6a6050', fontFamily: 'monospace',
          letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '40px',
        }}>
          Sign in to continue
        </p>

        <div style={{
          backgroundColor: '#111', border: '1px solid #2a2520',
          borderRadius: '16px', padding: '36px 28px',
        }}>
          <p style={{
            fontSize: '15px', color: '#9a9080', fontFamily: 'Georgia, serif',
            marginBottom: '28px', lineHeight: '1.6',
          }}>
            Sign in with Google to keep your identity and session ownership.
          </p>

          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            style={{
              width: '100%', padding: '14px 24px',
              backgroundColor: isLoading ? '#1a1510' : '#ffffff',
              color: isLoading ? '#5a5040' : '#1a1a1a',
              border: 'none', borderRadius: '8px',
              fontSize: '15px', fontWeight: 'bold',
              fontFamily: 'monospace', letterSpacing: '1px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {isLoading ? 'Signing in...' : 'Continue with Google'}
          </button>

          {error && (
            <p style={{
              marginTop: '16px', fontSize: '13px',
              color: '#c0503a', fontFamily: 'monospace',
            }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
