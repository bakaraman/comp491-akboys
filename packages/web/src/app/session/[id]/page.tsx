/**
 * session/[id]/page.tsx — Multiplayer game session page
 *
 * Four-phase page: Loading → Lobby (join + wait) → Game → Error.
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
import { PlayerSidebar } from '@/components/PlayerSidebar';
import { CopyLinkButton } from '@/components/CopyLinkButton';
import { useMultiplayerSession } from '@/hooks/useMultiplayerSession';
import { disconnectSocket } from '@/lib/socket';

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
  const [isStartingGame, setIsStartingGame] = useState(false);

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

  const handleStartGame = useCallback(async () => {
    if (isStartingGame) return;
    setIsStartingGame(true);
    const ok = await mp.startGame();
    if (!ok) {
      setIsStartingGame(false);
    }
  }, [isStartingGame, mp]);

  const handleLeave = useCallback(() => {
    if (!confirm('Are you sure you want to leave the game?')) return;
    disconnectSocket();
    window.location.href = '/';
  }, []);

  /* ---- Sidebar state ---- */
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /* ---- Auto-scroll ---- */
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mp.messages, mp.streamingText]);

  /* ---- Derived state ---- */
  const myPlayer = mp.players.find((p) => p.id === mp.myPlayerId);
  const isHost = mp.players.length > 0 && mp.players[0]?.id === mp.myPlayerId;
  const inLobby = mp.myPlayerId && mp.gameState === 'lobby';
  const inGame = mp.myPlayerId && mp.gameState === 'playing';

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
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%',
            border: '3px solid #2a2520', borderTopColor: '#d4a843',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px',
          }} />
          <p style={{ color: '#4a4540', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>
            Loading session...
          </p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const emoji = SCENARIO_EMOJI[sessionInfo.scenarioId] || '\uD83D\uDCD6';

  /* ================================================================ */
  /*  RENDER: Pre-join (name entry)                                    */
  /* ================================================================ */

  if (!mp.myPlayerId) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', backgroundColor: '#0a0a0a',
      }}>
        <div style={{
          width: '440px', maxWidth: '90vw', padding: '40px',
          backgroundColor: '#111', border: '1px solid #2a2520',
          borderRadius: '16px', textAlign: 'center',
        }}>
          {/* Scenario header */}
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>{emoji}</div>
          <h1 style={{
            fontSize: '24px', color: '#d4a843',
            fontFamily: 'Georgia, serif', fontStyle: 'italic',
            fontWeight: 'normal', margin: '0 0 8px',
          }}>
            {sessionInfo.scenarioTitle}
          </h1>
          <p style={{
            fontSize: '11px', color: '#4a4540',
            fontFamily: 'monospace', letterSpacing: '1.5px',
            marginBottom: '28px',
          }}>
            SESSION {sessionId.slice(0, 8)}
          </p>

          {/* Current players */}
          {mp.players.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <p style={{
                fontSize: '10px', color: '#5a5545',
                fontFamily: 'monospace', textTransform: 'uppercase',
                letterSpacing: '2px', marginBottom: '12px',
              }}>
                Waiting in lobby ({mp.players.length}/{sessionInfo.maxPlayers})
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {mp.players.map((p) => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 14px', backgroundColor: '#1a1a1a',
                    borderRadius: '20px', border: '1px solid #2a2520',
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

          {/* Divider */}
          <div style={{
            width: '60px', height: '1px',
            backgroundColor: '#2a2520', margin: '0 auto 24px',
          }} />

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
                boxSizing: 'border-box', marginBottom: '12px',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#d4a843'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#2a2520'; }}
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
                transition: 'all 0.2s',
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
              marginTop: '12px', fontSize: '11px',
              color: '#6a6050', fontFamily: 'monospace',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}>
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%',
                backgroundColor: '#8a4a4a',
                display: 'inline-block',
              }} />
              Connecting to server...
            </p>
          )}
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER: Lobby (joined, waiting for game start)                   */
  /* ================================================================ */

  if (inLobby) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', backgroundColor: '#0a0a0a',
      }}>
        <div style={{
          width: '480px', maxWidth: '90vw', padding: '40px',
          backgroundColor: '#111', border: '1px solid #2a2520',
          borderRadius: '16px', textAlign: 'center',
        }}>
          {/* Scenario header */}
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>{emoji}</div>
          <h1 style={{
            fontSize: '24px', color: '#d4a843',
            fontFamily: 'Georgia, serif', fontStyle: 'italic',
            fontWeight: 'normal', margin: '0 0 4px',
          }}>
            {sessionInfo.scenarioTitle}
          </h1>
          <p style={{
            fontSize: '11px', color: '#4a4540',
            fontFamily: 'monospace', letterSpacing: '1.5px',
            marginBottom: '28px',
          }}>
            LOBBY
          </p>

          {/* Player slots */}
          <div style={{ marginBottom: '24px' }}>
            <p style={{
              fontSize: '10px', color: '#5a5545',
              fontFamily: 'monospace', textTransform: 'uppercase',
              letterSpacing: '2px', marginBottom: '16px',
            }}>
              Players ({mp.players.length}/{sessionInfo.maxPlayers})
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {mp.players.map((p) => {
                const isMe = p.id === mp.myPlayerId;
                return (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 16px',
                    backgroundColor: isMe ? '#1a1510' : '#0d0d0d',
                    border: `1px solid ${isMe ? '#3a3020' : '#1e1e1e'}`,
                    borderRadius: '10px',
                    transition: 'all 0.2s',
                  }}>
                    {/* Avatar */}
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '50%',
                      backgroundColor: p.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '15px', fontWeight: 'bold', color: '#0a0a0a',
                      flexShrink: 0,
                    }}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>

                    {/* Name + status */}
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{
                        fontSize: '14px', color: p.color,
                        fontFamily: 'Georgia, serif', fontWeight: 'bold',
                        display: 'flex', alignItems: 'center', gap: '6px',
                      }}>
                        {p.name}
                        {isMe && (
                          <span style={{
                            fontSize: '9px', color: '#6a6050',
                            fontFamily: 'monospace', textTransform: 'uppercase',
                            letterSpacing: '1px', padding: '2px 6px',
                            backgroundColor: '#1a1a1a', borderRadius: '4px',
                          }}>
                            you
                          </span>
                        )}
                        {p.id === mp.players[0]?.id && (
                          <span style={{
                            fontSize: '9px', color: '#d4a843',
                            fontFamily: 'monospace', textTransform: 'uppercase',
                            letterSpacing: '1px', padding: '2px 6px',
                            backgroundColor: '#1a1510', borderRadius: '4px',
                            border: '1px solid #3a3020',
                          }}>
                            host
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontSize: '11px', color: '#4a8a4a',
                        fontFamily: 'monospace', marginTop: '2px',
                        display: 'flex', alignItems: 'center', gap: '4px',
                      }}>
                        <span style={{
                          width: '6px', height: '6px', borderRadius: '50%',
                          backgroundColor: '#4a8a4a',
                        }} />
                        Ready
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Empty slots */}
              {Array.from({ length: sessionInfo.maxPlayers - mp.players.length }).map((_, i) => (
                <div key={`empty-${i}`} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 16px',
                  backgroundColor: '#0a0a0a',
                  border: '1px dashed #1e1e1e',
                  borderRadius: '10px',
                }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    backgroundColor: '#151515',
                    border: '1px dashed #2a2520',
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontSize: '13px', color: '#3a3530',
                    fontFamily: 'Georgia, serif', fontStyle: 'italic',
                  }}>
                    Waiting for player...
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Copy link */}
          <div style={{ marginBottom: '16px' }}>
            <CopyLinkButton />
          </div>

          {/* Start button (host only) */}
          {isHost ? (
            <button
              onClick={handleStartGame}
              disabled={isStartingGame || mp.players.length < 1}
              style={{
                width: '100%', padding: '16px',
                backgroundColor: isStartingGame ? '#2a2010' : '#d4a843',
                color: isStartingGame ? '#5a5040' : '#0a0a0a',
                border: 'none', borderRadius: '8px',
                fontSize: '15px', fontWeight: 'bold',
                fontFamily: 'monospace', letterSpacing: '2px',
                textTransform: 'uppercase',
                cursor: isStartingGame ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {isStartingGame ? 'Starting...' : 'Start Adventure'}
            </button>
          ) : (
            <div style={{
              padding: '16px',
              backgroundColor: '#0a0a0a',
              border: '1px solid #1e1e1e',
              borderRadius: '8px',
            }}>
              <p style={{
                fontSize: '13px', color: '#6a6050',
                fontFamily: 'Georgia, serif', fontStyle: 'italic',
                margin: 0,
              }}>
                Waiting for the host to start the game...
              </p>
              <div style={{
                display: 'flex', justifyContent: 'center', gap: '4px',
                marginTop: '8px',
              }}>
                <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#4a4540', animation: 'pulse 1.4s ease-in-out infinite' }} />
                <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#4a4540', animation: 'pulse 1.4s ease-in-out 0.2s infinite' }} />
                <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#4a4540', animation: 'pulse 1.4s ease-in-out 0.4s infinite' }} />
              </div>
            </div>
          )}

          {/* Error */}
          {mp.error && (
            <p style={{
              marginTop: '12px', fontSize: '13px',
              color: '#cf5b5b', fontFamily: 'monospace',
            }}>
              {mp.error}
            </p>
          )}
        </div>

        <style>{`
          @keyframes pulse {
            0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
            40% { opacity: 1; transform: scale(1.2); }
          }
        `}</style>
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
        padding: '12px 20px', borderBottom: '1px solid #2a2520',
        backgroundColor: '#0d0d0d', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            fontSize: '16px', color: '#d4a843',
            fontFamily: 'Georgia, serif', fontStyle: 'italic',
          }}>
            {emoji}{' '}{sessionInfo.scenarioTitle}
          </span>
          <span style={{
            fontSize: '10px', color: '#3a3530', fontFamily: 'monospace',
            letterSpacing: '1px',
          }}>
            {sessionId.slice(0, 8)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Copy link (compact) */}
          <CopyLinkButton compact />

          {/* Player avatars — clickable to open sidebar */}
          <button
            onClick={() => setSidebarOpen(true)}
            title="View players"
            style={{
              display: 'flex', gap: '4px', alignItems: 'center',
              padding: '4px 8px',
              backgroundColor: 'transparent',
              border: '1px solid #2a2520',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'border-color 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4a4030'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2520'; }}
          >
            {mp.players.map((p) => (
              <div
                key={p.id}
                style={{
                  width: '24px', height: '24px', borderRadius: '50%',
                  backgroundColor: p.isConnected ? p.color : '#3a3530',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: 'bold', color: '#0a0a0a',
                  border: p.id === mp.myPlayerId ? '2px solid #e8e0d4' : '2px solid transparent',
                  opacity: p.isConnected ? 1 : 0.4,
                }}
              >
                {p.name.charAt(0).toUpperCase()}
              </div>
            ))}
          </button>

          <button
            onClick={handleLeave}
            style={{
              padding: '6px 12px', backgroundColor: 'transparent',
              border: '1px solid #2a2520', borderRadius: '6px', color: '#6a6050',
              fontSize: '11px', fontFamily: 'monospace',
              letterSpacing: '1px', textTransform: 'uppercase',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#cf5b5b';
              e.currentTarget.style.color = '#cf5b5b';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#2a2520';
              e.currentTarget.style.color = '#6a6050';
            }}
          >
            Leave
          </button>
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
            padding: '6px 0', fontFamily: 'Georgia, serif',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span style={{ display: 'flex', gap: '3px' }}>
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#4a4540', animation: 'pulse 1.4s ease-in-out infinite' }} />
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#4a4540', animation: 'pulse 1.4s ease-in-out 0.2s infinite' }} />
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#4a4540', animation: 'pulse 1.4s ease-in-out 0.4s infinite' }} />
            </span>
            {typingNames.length === 1
              ? `${typingNames[0]} is typing...`
              : `${typingNames.join(' and ')} are typing...`}
          </div>
        )}

        {/* Batch info */}
        {mp.batchInfo && !mp.isNarratorStreaming && (
          <div style={{
            color: '#6a6050', fontSize: '12px',
            padding: '8px 14px', fontFamily: 'monospace',
            backgroundColor: '#111', border: '1px solid #1e1e1e',
            borderRadius: '8px', display: 'inline-block',
            letterSpacing: '0.5px',
          }}>
            Gathering actions... ({mp.batchInfo.queueSize} queued)
          </div>
        )}

        {/* Narrator streaming indicator */}
        {mp.isNarratorStreaming && !mp.streamingText && (
          <div style={{
            color: '#4a4540', fontStyle: 'italic', fontSize: '14px',
            padding: '8px 0', display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span style={{ display: 'flex', gap: '3px' }}>
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#d4a843', animation: 'pulse 1.4s ease-in-out infinite' }} />
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#d4a843', animation: 'pulse 1.4s ease-in-out 0.2s infinite' }} />
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#d4a843', animation: 'pulse 1.4s ease-in-out 0.4s infinite' }} />
            </span>
            The narrator contemplates...
          </div>
        )}
      </div>

      {/* Follow-up suggestions */}
      {mp.suggestions.length > 0 && !mp.isNarratorStreaming && (
        <div style={{
          display: 'flex', gap: '8px', padding: '8px 20px', flexWrap: 'wrap',
          borderTop: '1px solid #1a1a1a',
        }}>
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

      {/* Input */}
      <ChatInput
        onSend={mp.sendAction}
        onTypingChange={mp.sendTyping}
        playerName={myPlayer?.name}
      />

      {/* Player sidebar */}
      <PlayerSidebar
        players={mp.players}
        myPlayerId={mp.myPlayerId}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Toast notification (rate limit, errors) */}
      {mp.toast && (
        <div style={{
          position: 'fixed', bottom: '100px', left: '50%',
          transform: 'translateX(-50%)',
          padding: '10px 20px',
          backgroundColor: '#2a1a1a',
          border: '1px solid #5a3030',
          borderRadius: '8px',
          color: '#cf8a8a',
          fontSize: '13px',
          fontFamily: 'monospace',
          zIndex: 60,
          animation: 'fadeInUp 0.3s ease',
        }}>
          {mp.toast}
        </div>
      )}

      {/* Reconnecting overlay */}
      {mp.isReconnecting && (
        <div style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 70,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              border: '3px solid #2a2520', borderTopColor: '#d4a843',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px',
            }} />
            <p style={{
              color: '#d4a843', fontSize: '14px',
              fontFamily: 'Georgia, serif', fontStyle: 'italic',
            }}>
              Reconnecting...
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateX(-50%) translateY(10px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}
