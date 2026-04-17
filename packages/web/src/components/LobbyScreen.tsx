/**
 * LobbyScreen.tsx — Pre-game lobby with host prompt input
 *
 * Shows the room code, connected players, and (for host) a prompt input
 * box with four preset suggestions. When the host submits, the server
 * generates the world procedurally; non-host players see a loading state.
 *
 * Fully Turkish UI. Called from session/[id]/page.tsx when the session
 * is in 'lobby' or 'voting' state.
 *
 * @author AKBOYS Team
 * @since 2026-04-17
 */

'use client';

import React, { useState } from 'react';
import { T } from '@/lib/tr';

export interface LobbyPlayer {
  id: string;
  name: string;
  color: string;
}

export interface LobbyScreenProps {
  isHost: boolean;
  roomCode: string;
  players: LobbyPlayer[];
  myPlayerId: string | null;
  maxPlayers: number;
  onGenerateStory: (prompt: string) => Promise<boolean> | void;
  storyStatus: { phase: string; message?: string } | null;
  storyReady: boolean;
  /** True when opening image is loaded. */
  imageReady: boolean;
  /** True when opening narration TTS has been pre-fetched. */
  ttsReady: boolean;
  onStartGame: () => void | Promise<unknown>;
  isStartingGame: boolean;
}

export function LobbyScreen({
  isHost,
  roomCode,
  players,
  myPlayerId,
  maxPlayers,
  onGenerateStory,
  storyStatus,
  storyReady,
  imageReady,
  ttsReady,
  onStartGame,
  isStartingGame,
}: LobbyScreenProps) {
  const [prompt, setPrompt] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const generationInFlight =
    !!storyStatus && storyStatus.phase !== 'ready' && storyStatus.phase !== 'failed' && !storyReady;
  const generationFailed = storyStatus?.phase === 'failed';

  const promptReady = prompt.trim().length >= 5;

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!isHost || submitted || generationInFlight || !promptReady) return;
    setSubmitted(true);
    try {
      await onGenerateStory(prompt.trim());
    } catch {
      setSubmitted(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        backgroundColor: '#0a0a0a',
        padding: '24px',
        overflowY: 'auto',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '720px', width: '100%', marginTop: '24px' }}>
        {/* Room code */}
        <div style={{ marginBottom: '20px' }}>
          <p
            style={{
              fontSize: '10px',
              color: '#5a5545',
              fontFamily: 'monospace',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              marginBottom: '6px',
            }}
          >
            {T.lobby.roomCodeLabel}
          </p>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 20px',
              backgroundColor: '#111',
              border: '1px solid #2a2520',
              borderRadius: '10px',
            }}
          >
            <span
              style={{
                fontSize: '24px',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                letterSpacing: '5px',
                color: '#d4a843',
              }}
            >
              {roomCode}
            </span>
            <button
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  navigator.clipboard.writeText(roomCode).catch(() => {});
                }
              }}
              title={T.lobby.shareLink}
              style={{
                background: 'none',
                border: 'none',
                color: '#5a5545',
                cursor: 'pointer',
                padding: '4px',
                transition: 'color 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#d4a843')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#5a5545')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>
        </div>

        {/* Player list */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '28px',
            flexWrap: 'wrap',
          }}
        >
          {players.map((p, idx) => {
            const isMe = p.id === myPlayerId;
            const isHostSlot = idx === 0;
            return (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  backgroundColor: '#111',
                  borderRadius: '20px',
                  border: `1px solid ${isMe ? '#3a3020' : '#1e1e1e'}`,
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: p.color }} />
                <span style={{ fontSize: '12px', color: p.color, fontFamily: 'monospace' }}>
                  {p.name}
                  {isMe && <span style={{ color: '#5a5545', marginLeft: '4px' }}>{T.lobby.youLabel}</span>}
                  {isHostSlot && <span style={{ color: '#d4a843', marginLeft: '4px' }}>★</span>}
                </span>
              </div>
            );
          })}
          {Array.from({ length: Math.max(0, maxPlayers - players.length) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                backgroundColor: '#0a0a0a',
                borderRadius: '20px',
                border: '1px dashed #1e1e1e',
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#1e1e1e' }} />
              <span style={{ fontSize: '12px', color: '#3a3530', fontFamily: 'monospace' }}>
                {T.lobby.waitingForPlayers}
              </span>
            </div>
          ))}
        </div>

        {/* Title + hint */}
        <h2
          style={{
            fontSize: '26px',
            color: '#d4a843',
            fontFamily: 'Georgia, serif',
            fontStyle: 'italic',
            fontWeight: 'normal',
            marginBottom: '6px',
          }}
        >
          {isHost ? T.lobby.promptTitle : T.lobby.waitingForHost}
        </h2>
        <p
          style={{
            fontSize: '12px',
            color: '#5a5545',
            fontFamily: 'monospace',
            letterSpacing: '1px',
            marginBottom: '28px',
          }}
        >
          {isHost ? T.lobby.promptSubtitle : ''}
        </p>

        {/* Host prompt input */}
        {isHost && !storyReady && (
          <form
            onSubmit={handleSubmit}
            style={{
              backgroundColor: '#111',
              border: '1px solid #2a2520',
              borderRadius: '14px',
              padding: '24px',
              textAlign: 'left',
            }}
          >
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={T.lobby.promptPlaceholder}
              rows={3}
              disabled={generationInFlight || submitted}
              style={{
                width: '100%',
                padding: '14px 16px',
                backgroundColor: '#0a0a0a',
                border: '1px solid #2a2520',
                borderRadius: '8px',
                color: '#e8e0d4',
                fontSize: '14px',
                fontFamily: 'Georgia, serif',
                lineHeight: '1.5',
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#d4a843')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#2a2520')}
            />

            {/* Preset chips */}
            <div
              style={{
                marginTop: '14px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              {T.lobby.presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setPrompt(preset)}
                  disabled={generationInFlight || submitted}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#1a1510',
                    border: '1px solid #2a2520',
                    borderRadius: '16px',
                    color: '#b0a080',
                    fontSize: '11px',
                    fontFamily: 'Georgia, serif',
                    cursor: generationInFlight || submitted ? 'default' : 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (generationInFlight || submitted) return;
                    e.currentTarget.style.borderColor = '#d4a843';
                    e.currentTarget.style.color = '#d4a843';
                  }}
                  onMouseLeave={(e) => {
                    if (generationInFlight || submitted) return;
                    e.currentTarget.style.borderColor = '#2a2520';
                    e.currentTarget.style.color = '#b0a080';
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={generationInFlight || submitted || !promptReady}
              style={{
                width: '100%',
                marginTop: '20px',
                padding: '16px',
                backgroundColor: generationInFlight || submitted || !promptReady ? '#2a2010' : '#d4a843',
                color: generationInFlight || submitted || !promptReady ? '#5a5040' : '#0a0a0a',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 'bold',
                fontFamily: 'monospace',
                letterSpacing: '2px',
                textTransform: 'uppercase',
                cursor: generationInFlight || submitted || !promptReady ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {generationInFlight
                ? storyStatus?.message || T.lobby.generating
                : T.lobby.createStory}
            </button>

            {generationFailed && (
              <p
                style={{
                  marginTop: '12px',
                  fontSize: '13px',
                  color: '#cf5b5b',
                  fontFamily: 'monospace',
                  textAlign: 'center',
                }}
              >
                {storyStatus?.message || T.errors.generating}
              </p>
            )}
          </form>
        )}

        {/* Non-host waiting view */}
        {!isHost && !storyReady && (
          <div
            style={{
              backgroundColor: '#111',
              border: '1px solid #2a2520',
              borderRadius: '14px',
              padding: '32px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '13px',
                color: '#b0a080',
                fontFamily: 'Georgia, serif',
                fontStyle: 'italic',
                lineHeight: '1.6',
              }}
            >
              {generationInFlight
                ? storyStatus?.message || T.lobby.generating
                : T.lobby.waitingForHost}
            </div>
            {generationInFlight && (
              <div
                style={{
                  marginTop: '20px',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  border: '3px solid #2a2520',
                  borderTopColor: '#d4a843',
                  animation: 'spin 1.2s linear infinite',
                  margin: '20px auto 0',
                }}
              />
            )}
          </div>
        )}

        {/* Story ready — Start button (gated on TTS only; image is best-effort) */}
        {storyReady && (() => {
          const gateReady = ttsReady;
          void imageReady;
          return (
            <div
              style={{
                marginTop: '24px',
                backgroundColor: '#111',
                border: `1px solid ${gateReady ? '#d4a843' : '#2a2520'}`,
                borderRadius: '14px',
                padding: '32px',
              }}
            >
              <p
                style={{
                  fontSize: '15px',
                  color: '#d4a843',
                  fontFamily: 'Georgia, serif',
                  fontStyle: 'italic',
                  marginBottom: '8px',
                }}
              >
                Hikaye hazır. Perde açılıyor.
              </p>

              {!gateReady && (
                <p
                  style={{
                    fontSize: '11px',
                    color: '#7a6a50',
                    fontFamily: 'monospace',
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    marginBottom: '18px',
                  }}
                >
                  Ses hazırlanıyor...
                </p>
              )}
              {gateReady && <div style={{ marginBottom: '18px' }} />}

              {isHost && (
                <button
                  onClick={() => onStartGame()}
                  disabled={isStartingGame || !gateReady}
                  style={{
                    padding: '16px 48px',
                    backgroundColor: isStartingGame || !gateReady ? '#2a2010' : '#d4a843',
                    color: isStartingGame || !gateReady ? '#5a5040' : '#0a0a0a',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '15px',
                    fontWeight: 'bold',
                    fontFamily: 'monospace',
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                    cursor: isStartingGame || !gateReady ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {isStartingGame
                    ? T.opening.loading
                    : !gateReady
                    ? 'Hazırlanıyor…'
                    : 'Perdeyi Aç'}
                </button>
              )}
              {!isHost && (
                <p
                  style={{
                    fontSize: '12px',
                    color: '#5a5545',
                    fontFamily: 'monospace',
                    letterSpacing: '1px',
                  }}
                >
                  {T.lobby.waitingForHost}
                </p>
              )}
            </div>
          );
        })()}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
