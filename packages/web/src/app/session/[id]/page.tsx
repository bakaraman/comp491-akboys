/**
 * session/[id]/page.tsx — Multiplayer game session page
 *
 * Three-phase page: Loading → Lobby (name entry) → Game.
 * Uses Socket.IO for all real-time communication via the
 * useMultiplayerSession hook.
 *
 * @author AK Boys Team
 * @since 2026-03-12
 */

'use client';

import React, { useRef, useEffect, useState, useCallback, use } from 'react';
import { ChatMessage } from '@/components/ChatMessage';
import { ChatInput } from '@/components/ChatInput';
import { useMultiplayerSession } from '@/hooks/useMultiplayerSession';
import Markdown from 'react-markdown';

const API_BASE = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

const SCENARIO_EMOJI: Record<string, string> = {
  noir: '\uD83D\uDD75\uFE0F',
  haunted: '\uD83D\uDC7B',
  space: '\uD83D\uDE80',
  pirate: '\uD83C\uDFF4\u200D\u2620\uFE0F',
  western: '\uD83E\uDD20',
  cyberpunk: '\uD83C\uDF03',
};

interface SessionInfo {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  state: string;
  maxPlayers: number;
  players: Array<{ id: string; name: string; color: string; isConnected: boolean }>;
}

/* ------------------------------------------------------------------ */
/*  Main page component                                                */
/* ------------------------------------------------------------------ */

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = use(params);

  /* ---- Session info from REST API ---- */
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/chat/session/${sessionId}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setSessionInfo(data);
      })
      .catch(() => {
        if (!cancelled) setFetchError(true);
      });
    return () => { cancelled = true; };
  }, [sessionId]);

  /* ---- Multiplayer hook ---- */
  const mp = useMultiplayerSession(sessionId);

  /* ---- Lobby state ---- */
  const [nameInput, setNameInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const handleJoin = useCallback(async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || isJoining) return;
    setIsJoining(true);
    setJoinError(null);
    const ok = await mp.joinSession(trimmed);
    if (!ok) {
      setJoinError(mp.error || 'Failed to join');
    }
    setIsJoining(false);
  }, [nameInput, isJoining, mp]);

  /* ---- Auto-scroll ---- */
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mp.messages, mp.streamingText]);

  /* ---- Find my player info ---- */
  const myPlayer = mp.players.find((p) => p.id === mp.myPlayerId);

  /* ================================================================ */
  /*  RENDER: Error                                                    */
  /* ================================================================ */

  if (fetchError) {
    return (
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a',
      }}>
        <p style={{ color: '#6a6050', fontSize: '16px', marginBottom: '24px' }}>
          Session not found
        </p>
        <a href="/" style={{
          padding: '12px 32px', backgroundColor: '#d4a843', color: '#0a0a0a',
          borderRadius: '8px', textDecoration: 'none', fontFamily: 'monospace',
          fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase',
        }}>
          Back to Home
        </a>
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER: Loading                                                  */
  /* ================================================================ */

  if (!sessionInfo) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', backgroundColor: '#0a0a0a',
      }}>
        <p style={{ color: '#4a4540', fontStyle: 'italic' }}>Loading session...</p>
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER: Lobby (not joined yet)                                   */
  /* ================================================================ */

  if (!mp.myPlayerId) {
    const emoji = SCENARIO_EMOJI[sessionInfo.scenarioId] || '\uD83D\uDCD6';

    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', backgroundColor: '#0a0a0a',
      }}>
        <div style={{
          width: '420px', padding: '40px',
          backgroundColor: '#111', border: '1px solid #2a2520',
          borderRadius: '12px', textAlign: 'center',
        }}>
          {/* Scenario title */}
          <div style={{
            fontSize: '28px', marginBottom: '4px',
          }}>
            {emoji}
          </div>
          <h1 style={{
            fontSize: '22px', color: '#d4a843',
            fontFamily: 'Georgia, serif', fontStyle: 'italic',
            fontWeight: 'normal', margin: '0 0 8px',
          }}>
            {sessionInfo.scenarioTitle}
          </h1>
          <p style={{
            fontSize: '12px', color: '#4a4540',
            fontFamily: 'monospace', letterSpacing: '1px',
            marginBottom: '24px',
          }}>
            SESSION {sessionId.slice(0, 8)}
          </p>

          {/* Current players */}
          {mp.players.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <p style={{
                fontSize: '11px', color: '#6a6050',
                fontFamily: 'monospace', textTransform: 'uppercase',
                letterSpacing: '1.5px', marginBottom: '12px',
              }}>
                Players in session
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {mp.players.map((p) => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 12px', backgroundColor: '#1a1a1a',
                    borderRadius: '16px', border: '1px solid #2a2520',
                  }}>
                    <span style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      backgroundColor: p.isConnected ? p.color : '#4a4540',
                    }} />
                    <span style={{
                      fontSize: '13px', color: p.color,
                      fontFamily: 'Georgia, serif',
                    }}>
                      {p.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Name input */}
          <form onSubmit={(e) => { e.preventDefault(); handleJoin(); }}>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Enter your name..."
              autoFocus
              maxLength={20}
              style={{
                width: '100%', padding: '14px 18px',
                backgroundColor: '#0a0a0a', border: '1px solid #2a2520',
                borderRadius: '8px', color: '#e8e0d4',
                fontSize: '15px', fontFamily: 'Georgia, serif',
                outline: 'none', textAlign: 'center',
                boxSizing: 'border-box',
                marginBottom: '12px',
              }}
            />
            <button
              type="submit"
              disabled={!nameInput.trim() || isJoining}
              style={{
                width: '100%', padding: '14px',
                backgroundColor: !nameInput.trim() || isJoining ? '#1a1510' : '#d4a843',
                color: !nameInput.trim() || isJoining ? '#5a5040' : '#0a0a0a',
                border: 'none', borderRadius: '8px',
                fontSize: '14px', fontWeight: 'bold',
                fontFamily: 'monospace', letterSpacing: '1px',
                textTransform: 'uppercase',
                cursor: !nameInput.trim() || isJoining ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s',
              }}
            >
              {isJoining ? 'Joining...' : 'Join Game'}
            </button>
          </form>

          {/* Errors */}
          {(joinError || mp.error) && (
            <p style={{
              marginTop: '12px', fontSize: '13px',
              color: '#cf5b5b', fontFamily: 'monospace',
            }}>
              {joinError || mp.error}
            </p>
          )}

          {/* Connection status */}
          {!mp.isConnected && (
            <p style={{
              marginTop: '12px', fontSize: '12px',
              color: '#6a6050', fontFamily: 'monospace',
            }}>
              Connecting to server...
            </p>
          )}
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER: Game                                                     */
  /* ================================================================ */

  const typingNames = Array.from(mp.typingPlayers.values());

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      backgroundColor: '#0a0a0a',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px', borderBottom: '1px solid #2a2520',
        backgroundColor: '#0d0d0d', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{
            fontSize: '18px', color: '#d4a843',
            fontFamily: 'Georgia, serif', fontStyle: 'italic',
          }}>
            {SCENARIO_EMOJI[sessionInfo.scenarioId] || '\uD83D\uDCD6'}{' '}{sessionInfo.scenarioTitle}
          </span>
          <span style={{
            fontSize: '11px', color: '#4a4540', fontFamily: 'monospace',
            letterSpacing: '1px',
          }}>
            SESSION {sessionId.slice(0, 8)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Player avatars */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {mp.players.map((p) => (
              <div
                key={p.id}
                title={`${p.name}${p.isConnected ? '' : ' (offline)'}`}
                style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  backgroundColor: p.isConnected ? p.color : '#3a3530',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 'bold', color: '#0a0a0a',
                  border: p.id === mp.myPlayerId ? '2px solid #e8e0d4' : '2px solid transparent',
                  opacity: p.isConnected ? 1 : 0.5,
                }}
              >
                {p.name.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
          <a
            href="/"
            style={{
              padding: '8px 16px', backgroundColor: 'transparent',
              border: '1px solid #2a2520', borderRadius: '6px', color: '#6a6050',
              fontSize: '12px', fontFamily: 'monospace', textDecoration: 'none',
              letterSpacing: '1px', textTransform: 'uppercase',
            }}
          >
            Leave
          </a>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {mp.messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            role={msg.role}
            content={msg.content}
            playerName={msg.playerName}
            playerColor={msg.playerColor}
          />
        ))}

        {/* Streaming narrator text */}
        {mp.isNarratorStreaming && mp.streamingText && (
          <ChatMessage role="assistant" content={mp.streamingText} />
        )}

        {/* Typing indicator */}
        {typingNames.length > 0 && (
          <div style={{
            color: '#4a4540', fontStyle: 'italic', fontSize: '13px',
            padding: '4px 0', fontFamily: 'Georgia, serif',
          }}>
            {typingNames.length === 1
              ? `${typingNames[0]} is typing...`
              : `${typingNames.join(' and ')} are typing...`}
          </div>
        )}

        {/* Batch info */}
        {mp.batchInfo && !mp.isNarratorStreaming && (
          <div style={{
            color: '#4a4540', fontStyle: 'italic', fontSize: '13px',
            padding: '4px 0', fontFamily: 'Georgia, serif',
          }}>
            The narrator is gathering actions... ({mp.batchInfo.queueSize} queued)
          </div>
        )}

        {/* Narrator streaming indicator */}
        {mp.isNarratorStreaming && !mp.streamingText && (
          <div style={{
            color: '#4a4540', fontStyle: 'italic', fontSize: '14px',
            padding: '8px 0',
          }}>
            The narrator contemplates...
          </div>
        )}
      </div>

      {/* Follow-up suggestions */}
      {mp.suggestions.length > 0 && !mp.isNarratorStreaming && (
        <div style={{ display: 'flex', gap: '8px', padding: '8px 24px', flexWrap: 'wrap' }}>
          {mp.suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => mp.sendAction(s)}
              style={{
                padding: '8px 16px', backgroundColor: 'transparent',
                border: '1px solid #2a2520', borderRadius: '20px', color: '#b0a080',
                fontSize: '13px', fontFamily: 'Georgia, serif', fontStyle: 'italic',
                cursor: 'pointer', transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#d4a843'; e.currentTarget.style.color = '#d4a843'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2520'; e.currentTarget.style.color = '#b0a080'; }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input — always active */}
      <ChatInput
        onSend={mp.sendAction}
        onTypingChange={mp.sendTyping}
        playerName={myPlayer?.name}
      />
    </div>
  );
}
