/**
 * page.tsx — Home page with scenario picker
 *
 * Player picks a story, session is created, then redirected to /session/[uuid].
 *
 * @author AK Boys Team
 * @since 2026-03-12
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE = 'http://localhost:3001/api/chat';

const SCENARIO_EMOJI: Record<string, string> = {
  noir: '🕵️',
  haunted: '👻',
  space: '🚀',
  pirate: '🏴‍☠️',
  western: '🤠',
  cyberpunk: '🌃',
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
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/scenarios`)
      .then((r) => r.json())
      .then((data) => setScenarios(data.scenarios || []))
      .catch(() => {});
  }, []);

  async function handleStart() {
    if (!selected || isStarting) return;
    setIsStarting(true);

    try {
      const res = await fetch(`${API_BASE}/new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: selected }),
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
      height: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', backgroundColor: '#0a0a0a',
      padding: '24px', overflowY: 'auto',
    }}>
      <div style={{ textAlign: 'center', maxWidth: '700px', marginTop: '48px' }}>
        <h1 style={{
          fontSize: '36px', color: '#d4a843', fontFamily: 'Georgia, serif',
          fontWeight: 'normal', fontStyle: 'italic', marginBottom: '8px',
        }}>
          Choose Your Story
        </h1>
        <p style={{
          fontSize: '14px', color: '#6a6050', fontFamily: 'monospace',
          letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '32px',
        }}>
          AI-Powered Text Adventure
        </p>

        {/* Scenario cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '12px', marginBottom: '32px', textAlign: 'left',
        }}>
          {scenarios.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s.id)}
              style={{
                padding: '16px',
                backgroundColor: selected === s.id ? '#1a1510' : '#111',
                border: `2px solid ${selected === s.id ? '#d4a843' : '#1a1a1a'}`,
                borderRadius: '12px', cursor: 'pointer',
                textAlign: 'left', transition: 'all 0.2s',
              }}
            >
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>
                {SCENARIO_EMOJI[s.id] || '📖'}
              </div>
              <div style={{
                fontSize: '15px',
                color: selected === s.id ? '#d4a843' : '#b0a080',
                fontFamily: 'Georgia, serif', fontWeight: 'bold', marginBottom: '4px',
              }}>
                {s.title}
              </div>
              <div style={{
                fontSize: '12px', color: '#6a6050',
                fontFamily: 'monospace', lineHeight: '1.4',
              }}>
                {s.setting}
              </div>
            </button>
          ))}
        </div>

        {/* Selected scenario detail + start button */}
        {selectedScenario && (
          <div style={{ marginBottom: '32px' }}>
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
                padding: '16px 48px',
                backgroundColor: isStarting ? '#2a2010' : '#d4a843',
                color: isStarting ? '#5a5040' : '#0a0a0a',
                border: 'none', borderRadius: '8px', fontSize: '16px',
                fontWeight: 'bold', fontFamily: 'monospace',
                letterSpacing: '2px', textTransform: 'uppercase',
                cursor: isStarting ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {isStarting ? 'Starting...' : 'Begin'}
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
