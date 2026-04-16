/**
 * page.tsx — Main menu: choose Single Player or Multiplayer
 *
 * Landing page with two mode cards. Shows a name popup on first visit.
 * Profile button in top-right to change name anytime.
 *
 * @author AKBOYS Team
 * @since 2026-03-12
 */

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/AuthGuard';
import { usePlayerName } from '@/hooks/usePlayerName';
import { NamePopup } from '@/components/NamePopup';
import { ProfileButton } from '@/components/ProfileButton';
import { authEnabled, signOutUser } from '@/lib/firebase';

export default function HomePage() {
  const router = useRouter();
  const { name, loaded, setName, clearName } = usePlayerName();

  async function handleSignOut() {
    clearName();
    if (authEnabled()) {
      await signOutUser();
    }
    router.replace('/login');
  }

  // Don't render until localStorage is read
  if (!loaded) return null;

  return (
    <AuthGuard>
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#0a0a0a', padding: '24px',
    }}>
      {/* First-time name popup */}
      {!name && (
        <NamePopup onSave={setName} />
      )}

      {authEnabled() && (
        <button
          onClick={handleSignOut}
          style={{
            position: 'fixed',
            top: '16px',
            right: name ? '190px' : '16px',
            padding: '10px 14px',
            backgroundColor: '#111',
            border: '1px solid #2a2520',
            borderRadius: '24px',
            color: '#d88b73',
            cursor: 'pointer',
            zIndex: 30,
            fontFamily: 'monospace',
            fontSize: '12px',
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}
        >
          Sign out
        </button>
      )}

      {/* Profile button (only when name is set) */}
      {name && (
        <ProfileButton
          name={name}
          onNameChange={setName}
          onSignOut={handleSignOut}
        />
      )}

      <div style={{ textAlign: 'center', maxWidth: '600px', width: '100%' }}>
        {/* Title */}
        <h1 style={{
          fontSize: '42px', color: '#d4a843',
          fontFamily: 'Georgia, serif', fontStyle: 'italic',
          fontWeight: 'normal', marginBottom: '8px',
          letterSpacing: '-0.5px',
        }}>
          The Velvet Shadow
        </h1>
        <p style={{
          fontSize: '13px', color: '#5a5545',
          fontFamily: 'monospace', letterSpacing: '3px',
          textTransform: 'uppercase', marginBottom: '48px',
        }}>
          AI-Powered Text Adventure
        </p>

        {/* Start game — multiplayer only */}
        <div style={{ marginBottom: '48px' }}>
          <button
            onClick={() => router.push('/multiplayer')}
            style={{
              padding: '36px 24px',
              width: '100%',
              backgroundColor: '#111',
              border: '1px solid #1e1e1e',
              borderRadius: '14px',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#d4a843';
              e.currentTarget.style.backgroundColor = '#141210';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#1e1e1e';
              e.currentTarget.style.backgroundColor = '#111';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '14px' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d4a843" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div style={{
              fontSize: '20px', color: '#e8e0d4',
              fontFamily: 'Georgia, serif', fontWeight: 'bold',
              marginBottom: '8px',
            }}>
              Start a Session
            </div>
            <div style={{
              fontSize: '12px', color: '#5a5545',
              fontFamily: 'monospace', lineHeight: '1.5',
            }}>
              Play with 2-5 detectives in real-time
            </div>
          </button>
        </div>

        <p style={{
          fontSize: '11px', color: '#2a2520',
          fontFamily: 'monospace',
        }}>
          COMP 491 — AKBOYS — Spring 2026
        </p>
      </div>
    </div>
    </AuthGuard>
  );
}
