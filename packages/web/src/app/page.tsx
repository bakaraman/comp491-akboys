/**
 * page.tsx — Single landing page: create or join a room
 *
 * Combined home + multiplayer into one clean, generic page. Both actions
 * (create / join-by-code) live side by side. No noir-specific styling.
 *
 * @author AKBOYS Team
 * @since 2026-04-17
 */

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/AuthGuard';
import { usePlayerName } from '@/hooks/usePlayerName';
import { NamePopup } from '@/components/NamePopup';
import { ProfileButton } from '@/components/ProfileButton';
import { SettingsPopover } from '@/components/SettingsPopover';
import { useAmbientLoop } from '@/hooks/useAmbientLoop';
import { useUiClickSound } from '@/lib/uiClick';
import { authEnabled, signOutUser, getAuthHeaders } from '@/lib/firebase';
import { T } from '@/lib/tr';

const API_BASE = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';
const MAX_PLAYERS = 10;

export default function HomePage() {
  const router = useRouter();
  const { name, loaded, setName, clearName } = usePlayerName();
  const [roomCode, setRoomCode] = useState('');
  const [loadingAction, setLoadingAction] = useState<null | 'create' | 'join'>(null);
  const [error, setError] = useState<string | null>(null);

  // A.2: Lobby ambient music on the landing page + global UI click sound.
  useUiClickSound();
  useAmbientLoop('/ambient/ambient-lobby.mp3', true);

  async function handleSignOut() {
    clearName();
    if (authEnabled()) await signOutUser();
    router.replace('/login');
  }

  async function handleCreate() {
    if (loadingAction) return;
    setLoadingAction('create');
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/chat/new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ mode: 'multiplayer', maxPlayers: MAX_PLAYERS }),
      });
      const data = await res.json();
      if (data.sessionId) {
        router.push(`/session/${data.sessionId}`);
        return;
      }
      setError(T.errors.generic);
    } catch {
      setError(T.errors.networkError);
    }
    setLoadingAction(null);
  }

  async function handleJoin(e?: React.FormEvent) {
    e?.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (code.length !== 6) {
      setError(T.multiplayer.invalidCode);
      return;
    }
    if (loadingAction) return;
    setLoadingAction('join');
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/chat/room/${code}`, {
        headers: await getAuthHeaders(),
      });
      if (!res.ok) {
        setError(T.multiplayer.noRoom);
        setLoadingAction(null);
        return;
      }
      const data = await res.json();
      if (data.sessionId) {
        router.push(`/session/${data.sessionId}`);
        return;
      }
      setError(T.errors.generic);
    } catch {
      setError(T.errors.networkError);
    }
    setLoadingAction(null);
  }

  if (!loaded) return null;

  return (
    <AuthGuard>
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0a0a0a',
          padding: '24px',
          position: 'relative',
        }}
      >
        {/* First-time name popup */}
        {!name && <NamePopup onSave={setName} />}

        {/* Sign-out button */}
        {authEnabled() && (
          <button
            onClick={handleSignOut}
            style={{
              position: 'fixed',
              top: '16px',
              right: name ? '190px' : '16px',
              padding: '9px 14px',
              backgroundColor: '#0f0f0f',
              border: '1px solid #1e1a14',
              borderRadius: '20px',
              color: '#7a6a50',
              cursor: 'pointer',
              zIndex: 30,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: '12px',
              letterSpacing: '0.5px',
            }}
          >
            {T.home.signOut}
          </button>
        )}

        {name && <ProfileButton name={name} onNameChange={setName} onSignOut={handleSignOut} />}

        {/* A.2: Audio settings — fixed top-left so it never collides with
            ProfileButton (top-right) regardless of name length. align="left"
            makes the panel grow rightward so it never spills off-screen. */}
        <div style={{ position: 'fixed', top: '16px', left: '16px', zIndex: 30 }}>
          <SettingsPopover align="left" />
        </div>

        <div style={{ width: '100%', maxWidth: '560px', textAlign: 'center' }}>
          {/* Title */}
          <h1
            style={{
              fontSize: '46px',
              color: '#d4a843',
              fontFamily: 'Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 'normal',
              letterSpacing: '-0.5px',
              marginBottom: '10px',
            }}
          >
            {T.app.title}
          </h1>
          <p
            style={{
              fontSize: '13px',
              color: '#7a6a50',
              fontFamily: 'monospace',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              marginBottom: '10px',
            }}
          >
            {T.app.subtitle}
          </p>
          <p
            style={{
              fontSize: '12px',
              color: '#4a4030',
              fontFamily: 'Georgia, serif',
              fontStyle: 'italic',
              marginBottom: '48px',
            }}
          >
            {T.app.tagline}
          </p>

          {/* Actions grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: '14px',
              textAlign: 'left',
            }}
          >
            {/* Create room card */}
            <div
              style={{
                padding: '24px',
                backgroundColor: '#0f0f0f',
                border: '1px solid #1e1a14',
                borderRadius: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    backgroundColor: '#15100a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4a843" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', color: '#e8e0d4', fontWeight: 600 }}>
                    {T.home.createTitle}
                  </div>
                  <div style={{ fontSize: '12px', color: '#7a6a50', marginTop: '2px' }}>
                    {T.home.createHint}
                  </div>
                </div>
              </div>
              <button
                onClick={handleCreate}
                disabled={loadingAction !== null}
                style={{
                  width: '100%',
                  padding: '13px',
                  backgroundColor: loadingAction ? '#1a1510' : '#d4a843',
                  color: loadingAction ? '#3a3530' : '#0a0a0a',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  letterSpacing: '0.5px',
                  cursor: loadingAction ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {loadingAction === 'create' ? T.home.creating : T.home.createButton}
              </button>
            </div>

            {/* Join room card */}
            <div
              style={{
                padding: '24px',
                backgroundColor: '#0f0f0f',
                border: '1px solid #1e1a14',
                borderRadius: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    backgroundColor: '#15100a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4a843" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', color: '#e8e0d4', fontWeight: 600 }}>
                    {T.home.joinTitle}
                  </div>
                  <div style={{ fontSize: '12px', color: '#7a6a50', marginTop: '2px' }}>
                    {T.home.joinHint}
                  </div>
                </div>
              </div>
              <form onSubmit={handleJoin} style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => {
                    setError(null);
                    setRoomCode(e.target.value.toUpperCase().slice(0, 6));
                  }}
                  placeholder={T.home.joinPlaceholder}
                  maxLength={6}
                  style={{
                    flex: 1,
                    padding: '13px 14px',
                    backgroundColor: '#0a0a0a',
                    border: '1px solid #1e1a14',
                    borderRadius: '8px',
                    color: '#e8e0d4',
                    fontSize: '18px',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontWeight: 600,
                    letterSpacing: '4px',
                    textAlign: 'center',
                    outline: 'none',
                    transition: 'border-color 0.15s',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#d4a843')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#1e1a14')}
                />
                <button
                  type="submit"
                  disabled={roomCode.trim().length !== 6 || loadingAction !== null}
                  style={{
                    padding: '13px 22px',
                    backgroundColor:
                      roomCode.trim().length !== 6 || loadingAction ? '#1a1510' : '#d4a843',
                    color:
                      roomCode.trim().length !== 6 || loadingAction ? '#5a5040' : '#0a0a0a',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    letterSpacing: '0.5px',
                    cursor:
                      roomCode.trim().length !== 6 || loadingAction ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {loadingAction === 'join' ? T.home.joining : T.home.joinButton}
                </button>
              </form>
            </div>
          </div>

          {/* Error line */}
          {error && (
            <p
              style={{
                marginTop: '16px',
                fontSize: '13px',
                color: '#e07878',
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}
            >
              {error}
            </p>
          )}

          {/* Footer */}
          <p
            style={{
              marginTop: '48px',
              fontSize: '11px',
              color: '#2a2520',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              letterSpacing: '0.5px',
            }}
          >
            {T.home.courseNote}
          </p>
        </div>
      </div>
    </AuthGuard>
  );
}
