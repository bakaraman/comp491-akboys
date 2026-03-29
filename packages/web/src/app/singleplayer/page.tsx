/**
 * singleplayer/page.tsx — Single player scenario picker
 *
 * Player picks a story, creates a single-player session,
 * and gets redirected to /session/[uuid] for the SSE-based game.
 *
 * @author AK Boys Team
 * @since 2026-03-24
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/AuthGuard';
import { usePlayerName } from '@/hooks/usePlayerName';
import { ProfileButton } from '@/components/ProfileButton';
import { getAuthHeaders } from '@/lib/firebase';

const API_BASE = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

const SCENARIO_EMOJI: Record<string, string> = {
  noir: '\uD83D\uDD75\uFE0F',
  haunted: '\uD83D\uDC7B',
  space: '\uD83D\uDE80',
  pirate: '\uD83C\uDFF4\u200D\u2620\uFE0F',
  western: '\uD83E\uDD20',
  cyberpunk: '\uD83C\uDF03',
};

interface ScenarioInfo {
  id: string;
  title: string;
  setting: string;
  synopsis: string;
}

export default function SinglePlayerPage() {
  const router = useRouter();
  const { name: playerName, setName: setPlayerName } = usePlayerName();
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/chat/scenarios`, {
          headers: await getAuthHeaders(),
        });
        const data = await res.json();
        setScenarios(data.scenarios || []);
      } catch {
        // ignore bootstrap fetch errors
      }
    })();
  }, []);

  async function handleStart() {
    if (!selected || isStarting) return;
    setIsStarting(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat/new`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({ scenarioId: selected, mode: 'singleplayer' }),
      });
      const data = await res.json();
      if (data.sessionId) {
        router.push(`/session/${data.sessionId}`);
      }
    } catch {
      setIsStarting(false);
    }
  }

  const selectedScenario = scenarios.find((s) => s.id === selected);

  return (
    <AuthGuard>
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', backgroundColor: '#0a0a0a',
      padding: '24px', overflowY: 'auto',
    }}>
      {playerName && <ProfileButton name={playerName} onNameChange={setPlayerName} />}

      <div style={{ textAlign: 'center', maxWidth: '720px', marginTop: '40px', width: '100%' }}>
        {/* Back + Title */}
        <button
          onClick={() => router.push('/')}
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
          fontSize: '32px', color: '#d4a843', fontFamily: 'Georgia, serif',
          fontWeight: 'normal', fontStyle: 'italic', marginBottom: '8px',
        }}>
          Choose Your Story
        </h1>
        <p style={{
          fontSize: '13px', color: '#5a5545', fontFamily: 'monospace',
          letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '36px',
        }}>
          Single Player
        </p>

        {/* Scenario cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
          gap: '12px', marginBottom: '32px', textAlign: 'left',
        }}>
          {scenarios.map((s) => {
            const isSelected = selected === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSelected(s.id)}
                style={{
                  padding: '20px',
                  backgroundColor: isSelected ? '#1a1510' : '#111',
                  border: `2px solid ${isSelected ? '#d4a843' : '#1a1a1a'}`,
                  borderRadius: '12px', cursor: 'pointer',
                  textAlign: 'left', transition: 'all 0.25s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = '#3a3020';
                    e.currentTarget.style.backgroundColor = '#151210';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = '#1a1a1a';
                    e.currentTarget.style.backgroundColor = '#111';
                  }
                }}
              >
                <div style={{ fontSize: '32px', marginBottom: '10px' }}>
                  {SCENARIO_EMOJI[s.id] || '\uD83D\uDCD6'}
                </div>
                <div style={{
                  fontSize: '15px',
                  color: isSelected ? '#d4a843' : '#b0a080',
                  fontFamily: 'Georgia, serif', fontWeight: 'bold', marginBottom: '6px',
                }}>
                  {s.title}
                </div>
                <div style={{
                  fontSize: '12px', color: '#5a5545',
                  fontFamily: 'monospace', lineHeight: '1.5',
                }}>
                  {s.setting}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected scenario detail + start */}
        {selectedScenario && (
          <div style={{
            backgroundColor: '#111', border: '1px solid #2a2520',
            borderRadius: '12px', padding: '28px 32px',
            marginBottom: '32px', textAlign: 'left',
          }}>
            <p style={{
              fontSize: '15px', color: '#9a9080', lineHeight: '1.8',
              marginBottom: '24px', fontFamily: 'Georgia, serif', fontStyle: 'italic',
            }}>
              {selectedScenario.synopsis}
            </p>
            <button
              onClick={handleStart}
              disabled={isStarting}
              style={{
                width: '100%', padding: '16px',
                backgroundColor: isStarting ? '#2a2010' : '#d4a843',
                color: isStarting ? '#5a5040' : '#0a0a0a',
                border: 'none', borderRadius: '8px', fontSize: '15px',
                fontWeight: 'bold', fontFamily: 'monospace',
                letterSpacing: '2px', textTransform: 'uppercase',
                cursor: isStarting ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {isStarting ? 'Starting...' : 'Begin Adventure'}
            </button>
          </div>
        )}
      </div>
    </div>
    </AuthGuard>
  );
}
