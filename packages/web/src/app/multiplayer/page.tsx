/**
 * multiplayer/page.tsx — Multiplayer hub: Host or Join a game
 *
 * Two options: create a new room (Host) or enter a room code (Join).
 *
 * @author AK Boys Team
 * @since 2026-03-24
 */

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePlayerName } from '@/hooks/usePlayerName';
import { ProfileButton } from '@/components/ProfileButton';

const API_BASE = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

export default function MultiplayerPage() {
  const router = useRouter();
  const { name: playerName, setName: setPlayerName } = usePlayerName();
  const [mode, setMode] = useState<'choice' | 'host' | 'join'>('choice');
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleHost() {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/chat/new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'multiplayer', maxPlayers }),
      });
      const data = await res.json();
      if (data.sessionId) {
        router.push(`/session/${data.sessionId}`);
      } else {
        setError('Failed to create room');
        setIsLoading(false);
      }
    } catch {
      setError('Could not connect to server');
      setIsLoading(false);
    }
  }

  async function handleJoin() {
    const code = roomCodeInput.trim().toUpperCase();
    if (code.length !== 6 || isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/chat/room/${code}`);
      if (!res.ok) {
        setError('Room not found. Check the code and try again.');
        setIsLoading(false);
        return;
      }
      const data = await res.json();
      if (data.sessionId) {
        router.push(`/session/${data.sessionId}`);
      }
    } catch {
      setError('Could not connect to server');
      setIsLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#0a0a0a', padding: '24px',
    }}>
      {playerName && <ProfileButton name={playerName} onNameChange={setPlayerName} />}

      <div style={{ textAlign: 'center', maxWidth: '480px', width: '100%' }}>
        {/* Back button */}
        <button
          onClick={() => mode === 'choice' ? router.push('/') : setMode('choice')}
          style={{
            background: 'none', border: 'none', color: '#5a5545',
            fontSize: '13px', fontFamily: 'monospace', cursor: 'pointer',
            marginBottom: '24px', display: 'flex', alignItems: 'center',
            gap: '6px', margin: '0 auto 24px',
            transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#d4a843'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#5a5545'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          BACK
        </button>

        <h1 style={{
          fontSize: '28px', color: '#d4a843', fontFamily: 'Georgia, serif',
          fontStyle: 'italic', fontWeight: 'normal', marginBottom: '8px',
        }}>
          Multiplayer
        </h1>
        <p style={{
          fontSize: '12px', color: '#5a5545', fontFamily: 'monospace',
          letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '36px',
        }}>
          Play with friends
        </p>

        {/* ---- Choice screen ---- */}
        {mode === 'choice' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <button
              onClick={() => setMode('host')}
              style={{
                padding: '32px 20px',
                backgroundColor: '#111',
                border: '1px solid #1e1e1e',
                borderRadius: '14px',
                cursor: 'pointer', textAlign: 'center',
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
              <div style={{ marginBottom: '12px' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d4a843" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              </div>
              <div style={{
                fontSize: '16px', color: '#e8e0d4',
                fontFamily: 'Georgia, serif', fontWeight: 'bold',
                marginBottom: '6px',
              }}>
                Host Game
              </div>
              <div style={{
                fontSize: '11px', color: '#5a5545',
                fontFamily: 'monospace', lineHeight: '1.5',
              }}>
                Create a room and invite friends
              </div>
            </button>

            <button
              onClick={() => setMode('join')}
              style={{
                padding: '32px 20px',
                backgroundColor: '#111',
                border: '1px solid #1e1e1e',
                borderRadius: '14px',
                cursor: 'pointer', textAlign: 'center',
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
              <div style={{ marginBottom: '12px' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d4a843" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
              </div>
              <div style={{
                fontSize: '16px', color: '#e8e0d4',
                fontFamily: 'Georgia, serif', fontWeight: 'bold',
                marginBottom: '6px',
              }}>
                Join Room
              </div>
              <div style={{
                fontSize: '11px', color: '#5a5545',
                fontFamily: 'monospace', lineHeight: '1.5',
              }}>
                Enter a room code to join
              </div>
            </button>
          </div>
        )}

        {/* ---- Host screen ---- */}
        {mode === 'host' && (
          <div style={{
            backgroundColor: '#111', border: '1px solid #2a2520',
            borderRadius: '14px', padding: '32px',
          }}>
            <p style={{
              fontSize: '10px', color: '#5a5545',
              fontFamily: 'monospace', textTransform: 'uppercase',
              letterSpacing: '2px', marginBottom: '16px',
            }}>
              Number of Players
            </p>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
              {[2, 3, 4].map((n) => {
                const isActive = maxPlayers === n;
                return (
                  <button
                    key={n}
                    onClick={() => setMaxPlayers(n)}
                    style={{
                      flex: 1, padding: '14px 0',
                      backgroundColor: isActive ? '#d4a843' : '#0a0a0a',
                      color: isActive ? '#0a0a0a' : '#6a6050',
                      border: `1px solid ${isActive ? '#d4a843' : '#2a2520'}`,
                      borderRadius: '8px', cursor: 'pointer',
                      fontSize: '15px', fontFamily: 'monospace',
                      fontWeight: isActive ? 'bold' : 'normal',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = '#4a4030';
                        e.currentTarget.style.color = '#9a9080';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = '#2a2520';
                        e.currentTarget.style.color = '#6a6050';
                      }
                    }}
                  >
                    {n}
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleHost}
              disabled={isLoading}
              style={{
                width: '100%', padding: '16px',
                backgroundColor: isLoading ? '#2a2010' : '#d4a843',
                color: isLoading ? '#5a5040' : '#0a0a0a',
                border: 'none', borderRadius: '8px', fontSize: '15px',
                fontWeight: 'bold', fontFamily: 'monospace',
                letterSpacing: '2px', textTransform: 'uppercase',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {isLoading ? 'Creating...' : 'Create Room'}
            </button>
          </div>
        )}

        {/* ---- Join screen ---- */}
        {mode === 'join' && (
          <div style={{
            backgroundColor: '#111', border: '1px solid #2a2520',
            borderRadius: '14px', padding: '32px',
          }}>
            <p style={{
              fontSize: '10px', color: '#5a5545',
              fontFamily: 'monospace', textTransform: 'uppercase',
              letterSpacing: '2px', marginBottom: '16px',
            }}>
              Enter Room Code
            </p>
            <form onSubmit={(e) => { e.preventDefault(); handleJoin(); }}>
              <input
                type="text"
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="ABC123"
                autoFocus
                maxLength={6}
                style={{
                  width: '100%', padding: '18px',
                  backgroundColor: '#0a0a0a', border: '1px solid #2a2520',
                  borderRadius: '8px', color: '#e8e0d4',
                  fontSize: '28px', fontFamily: 'monospace',
                  fontWeight: 'bold', letterSpacing: '8px',
                  textAlign: 'center', outline: 'none',
                  boxSizing: 'border-box', marginBottom: '16px',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#d4a843'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#2a2520'; }}
              />
              <button
                type="submit"
                disabled={roomCodeInput.trim().length !== 6 || isLoading}
                style={{
                  width: '100%', padding: '16px',
                  backgroundColor: roomCodeInput.trim().length !== 6 || isLoading ? '#1a1510' : '#d4a843',
                  color: roomCodeInput.trim().length !== 6 || isLoading ? '#5a5040' : '#0a0a0a',
                  border: 'none', borderRadius: '8px', fontSize: '15px',
                  fontWeight: 'bold', fontFamily: 'monospace',
                  letterSpacing: '2px', textTransform: 'uppercase',
                  cursor: roomCodeInput.trim().length !== 6 || isLoading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {isLoading ? 'Joining...' : 'Join Room'}
              </button>
            </form>
          </div>
        )}

        {/* Error */}
        {error && (
          <p style={{
            marginTop: '16px', fontSize: '13px',
            color: '#cf5b5b', fontFamily: 'monospace',
          }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
