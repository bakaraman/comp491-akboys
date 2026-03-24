/**
 * page.tsx — Home page with scenario picker and multiplayer setup
 *
 * Player picks a story, selects player count (2-4), creates a session,
 * then gets redirected to /session/[uuid] lobby.
 *
 * @author AK Boys Team
 * @since 2026-03-12
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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

export default function HomePage() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/chat/scenarios`)
      .then((r) => r.json())
      .then((data) => setScenarios(data.scenarios || []))
      .catch(() => {});
  }, []);

  async function handleStart() {
    if (!selected || isStarting) return;
    setIsStarting(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat/new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: selected, maxPlayers }),
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
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', backgroundColor: '#0a0a0a',
      padding: '24px', overflowY: 'auto',
    }}>
      <div style={{ textAlign: 'center', maxWidth: '720px', marginTop: '48px', width: '100%' }}>
        {/* Title */}
        <h1 style={{
          fontSize: '36px', color: '#d4a843', fontFamily: 'Georgia, serif',
          fontWeight: 'normal', fontStyle: 'italic', marginBottom: '8px',
        }}>
          Choose Your Story
        </h1>
        <p style={{
          fontSize: '14px', color: '#6a6050', fontFamily: 'monospace',
          letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '40px',
        }}>
          Multiplayer AI-Powered Text Adventure
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
                  position: 'relative', overflow: 'hidden',
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
                  transition: 'color 0.2s',
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

        {/* Selected scenario detail panel */}
        {selectedScenario && (
          <div style={{
            backgroundColor: '#111', border: '1px solid #2a2520',
            borderRadius: '12px', padding: '28px 32px',
            marginBottom: '32px', textAlign: 'left',
            animation: 'fadeIn 0.3s ease',
          }}>
            {/* Synopsis */}
            <p style={{
              fontSize: '15px', color: '#9a9080', lineHeight: '1.8',
              marginBottom: '28px', fontFamily: 'Georgia, serif', fontStyle: 'italic',
            }}>
              {selectedScenario.synopsis}
            </p>

            {/* Player count selector */}
            <div style={{ marginBottom: '28px' }}>
              <p style={{
                fontSize: '11px', color: '#6a6050',
                fontFamily: 'monospace', textTransform: 'uppercase',
                letterSpacing: '1.5px', marginBottom: '12px',
              }}>
                Number of Players
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[2, 3, 4].map((n) => {
                  const isActive = maxPlayers === n;
                  return (
                    <button
                      key={n}
                      onClick={() => setMaxPlayers(n)}
                      style={{
                        flex: 1, padding: '12px 0',
                        backgroundColor: isActive ? '#d4a843' : '#0a0a0a',
                        color: isActive ? '#0a0a0a' : '#6a6050',
                        border: `1px solid ${isActive ? '#d4a843' : '#2a2520'}`,
                        borderRadius: '8px', cursor: 'pointer',
                        fontSize: '14px', fontFamily: 'monospace',
                        fontWeight: isActive ? 'bold' : 'normal',
                        letterSpacing: '0.5px',
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
                      {n} {n === 2 ? 'Players' : 'Players'}
                    </button>
                  );
                })}
              </div>
              <p style={{
                fontSize: '11px', color: '#4a4540',
                fontFamily: 'monospace', marginTop: '8px',
                lineHeight: '1.5',
              }}>
                Share the session link with friends to join your game
              </p>
            </div>

            {/* Start button */}
            <button
              onClick={handleStart}
              disabled={isStarting}
              style={{
                width: '100%', padding: '16px',
                backgroundColor: isStarting ? '#2a2010' : '#d4a843',
                color: isStarting ? '#5a5040' : '#0a0a0a',
                border: 'none', borderRadius: '8px', fontSize: '16px',
                fontWeight: 'bold', fontFamily: 'monospace',
                letterSpacing: '2px', textTransform: 'uppercase',
                cursor: isStarting ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {isStarting ? 'Creating Session...' : 'Create Game'}
            </button>
          </div>
        )}

        <p style={{
          marginTop: '32px', fontSize: '12px',
          color: '#3a3530', fontFamily: 'monospace',
        }}>
          COMP 491 — AK Boys — Spring 2026
        </p>
      </div>
    </div>
  );
}
