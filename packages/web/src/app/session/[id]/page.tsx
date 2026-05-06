/**
 * session/[id]/page.tsx — Multiplayer noir session page
 *
 * Socket.IO driven. Phases: Loading → Name Entry → Lobby (host prompt +
 * procedural world gen) → Playing → Finale cinematic.
 *
 * @author AKBOYS Team
 * @since 2026-03-12
 */

'use client';

import React, { useRef, useEffect, useState, useCallback, use } from 'react';
import type { GameState } from '@/types/shared';
import { ChatMessage } from '@/components/ChatMessage';
import { ChatInput } from '@/components/ChatInput';
import { PlayerSidebar } from '@/components/PlayerSidebar';
import { CopyLinkButton } from '@/components/CopyLinkButton';
import { CommPanel } from '@/components/CommPanel';
import { LobbyScreen } from '@/components/LobbyScreen';
import { OpeningCinematic } from '@/components/OpeningCinematic';
import { FinaleCinematic } from '@/components/FinaleCinematic';
import { T } from '@/lib/tr';
import { GameMap } from '@/components/GameMap';
import type { MapRoom, MapNPC } from '@/components/GameMap';
import { useMultiplayerSession } from '@/hooks/useMultiplayerSession';
import { disconnectSocket } from '@/lib/socket';
import { usePlayerName } from '@/hooks/usePlayerName';
import { NamePopup } from '@/components/NamePopup';
import { SettingsPopover } from '@/components/SettingsPopover';
import { useAmbientLoop } from '@/hooks/useAmbientLoop';
import { useUiClickSound } from '@/lib/uiClick';
import { authEnabled, getAuthHeaders, subscribeToAuth } from '@/lib/firebase';

const API_BASE = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

interface SessionInfo {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  roomCode?: string;
  state: string;
  maxPlayers: number;
  players: Array<{ id: string; name: string; color: string; isConnected: boolean }>;
  gameState?: GameState;
  scenarioMeta?: {
    maxTurns: number;
    npcs: Array<{ id: string; name: string; description?: string; roomId?: string }>;
    evidenceItems: Array<{ id: string; name: string }>;
    items?: Array<{ id: string; name: string; description: string; roomId: string; isEvidence: boolean }>;
    rooms?: Array<{ id: string; name: string; exits?: Record<string, string> }>;
  } | null;
  sharedEvidence?: Array<{
    evidenceId: string;
    sharedByPlayerId: string;
    sharedByPlayerName: string;
    sharedByPlayerColor: string;
    timestamp: number;
  }>;
}

/* ------------------------------------------------------------------ */
/*  Main page component                                                */
/* ------------------------------------------------------------------ */

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = use(params);
  const [authReady, setAuthReady] = useState(!authEnabled());

  useEffect(() => {
    if (!authEnabled()) return;
    const unsubscribe = subscribeToAuth((user) => {
      if (user) {
        setAuthReady(true);
      } else {
        window.location.href = '/login';
      }
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  /* ---- Session info from REST API ---- */
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [fetchError, setFetchError] = useState(false);

  const refreshSessionInfo = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/chat/session/${sessionId}`, {
        headers: await getAuthHeaders(),
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setSessionInfo(data);
    } catch {
      setFetchError(true);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!authReady) return;
    void refreshSessionInfo();
  }, [authReady, refreshSessionInfo]);

  const isMultiplayer = sessionInfo ? sessionInfo.maxPlayers > 1 : false;

  /* ---- Player name from localStorage ---- */
  const { name: storedName, loaded: nameLoaded, setName: setStoredName } = usePlayerName();

  /* ---- Multiplayer hook (always called, but only used if multiplayer) ---- */
  const mp = useMultiplayerSession(sessionId, isMultiplayer);

  /* Music lives only inside OpeningCinematic + FinaleCinematic overlays */

  /* Auto-refresh session info when MP game transitions to playing state
     (scenario is confirmed, title/meta becomes available) */
  const prevGameStateRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isMultiplayer) return;
    const prev = prevGameStateRef.current;
    if (mp.gameState === 'playing' && prev !== 'playing') {
      void refreshSessionInfo();
    }
    prevGameStateRef.current = mp.gameState;
  }, [mp.gameState, isMultiplayer, refreshSessionInfo]);

  /* ---- UI overlays ---- */
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isAccuseOpen, setIsAccuseOpen] = useState(false);
  const [openingDismissed, setOpeningDismissed] = useState(false);

  /* ---- A.2: Audio side effects ----
   * Three independent ambient layers must never overlap:
   *   - lobby ambient (this hook): pre-game phase
   *   - cinematic ambient (managed by Opening/FinaleCinematic, untouched):
   *     plays under TTS during opening + finale overlays
   *   - in-game ambient (this hook): mid-game between cinematics
   * The booleans below derive from existing render conditions further down
   * so the audio state machine is the single source of truth for the page.
   */
  useUiClickSound();
  const cinematicMounted =
    (mp.gameState === 'playing' && !!mp.worldMeta && !openingDismissed && !mp.gameOver)
    || !!mp.gameOver;
  const lobbyAmbientActive = mp.gameState === 'lobby' || mp.gameState === 'voting';
  const inGameAmbientActive = mp.gameState === 'playing' && openingDismissed && !mp.gameOver;
  useAmbientLoop('/ambient/ambient-lobby.mp3', lobbyAmbientActive && !cinematicMounted);
  useAmbientLoop('/ambient/ambient-game.mp3', inGameAmbientActive && !cinematicMounted);

  /* ---- Pre-fetch opening narration TTS as soon as story is ready ---- */
  const [openingTtsUrl, setOpeningTtsUrl] = useState<string | null>(null);
  const ttsPrefetchedFor = useRef<string | null>(null);
  useEffect(() => {
    const narration = mp.worldMeta?.openingNarration;
    if (!narration || narration.length < 20) return;
    if (ttsPrefetchedFor.current === narration) return;
    ttsPrefetchedFor.current = narration;

    const t0 = Date.now();
    console.log('[session] TTS pre-fetch start (voice=ash, chars=' + narration.length + ')');
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/chat/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
          body: JSON.stringify({ text: narration, voice: 'ash' }),
        });
        if (!res.ok) {
          console.error('[session] TTS pre-fetch HTTP ' + res.status);
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        console.log(`[session] TTS pre-fetched (${Date.now() - t0}ms, ${blob.size} bytes)`);
        setOpeningTtsUrl(url);
      } catch (err) {
        console.error('[session] TTS pre-fetch failed', err);
      }
    })();
  }, [mp.worldMeta?.openingNarration]);

  /* ---- Multiplayer lobby/voting state ---- */
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [showNamePopup, setShowNamePopup] = useState(false);
  const [autoJoinAttempted, setAutoJoinAttempted] = useState(false);

  // Auto-join with stored name when connected
  useEffect(() => {
    if (!isMultiplayer || !mp.isConnected || mp.myPlayerId || autoJoinAttempted || !nameLoaded) return;
    if (storedName) {
      setAutoJoinAttempted(true);
      setIsJoining(true);
      mp.joinSession(storedName).then((ok) => {
        setIsJoining(false);
        if (!ok) {
          // Name might be taken in this session, show popup to pick a different one
          setJoinError(mp.error || 'Name already taken, please choose another');
          setShowNamePopup(true);
        }
      });
    } else {
      // No stored name, show popup
      setShowNamePopup(true);
    }
  }, [isMultiplayer, mp.isConnected, mp.myPlayerId, storedName, nameLoaded, autoJoinAttempted]);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commOpen, setCommOpen] = useState(false);

  const handleJoinWithName = useCallback(async (playerName: string) => {
    if (isJoining) return;
    setIsJoining(true); setJoinError(null);
    setStoredName(playerName);
    const ok = await mp.joinSession(playerName);
    if (!ok) {
      setJoinError(mp.error || 'Failed to join');
    } else {
      setShowNamePopup(false);
    }
    setIsJoining(false);
  }, [isJoining, mp, setStoredName]);

  const handleStartGame = useCallback(async () => {
    if (isStartingGame) return;
    setIsStartingGame(true);
    const ok = await mp.startGame();
    if (!ok) setIsStartingGame(false);
  }, [isStartingGame, mp]);

  const handleLeave = useCallback(() => {
    if (!confirm('Are you sure you want to leave?')) return;
    disconnectSocket();
    window.location.href = '/';
  }, []);

  /* ---- Auto-scroll ---- */
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [mp.messages, mp.streamingText]);

  /* ---- Derived ---- */
  const myPlayer = mp.players.find((p) => p.id === mp.myPlayerId);
  const isHost = mp.players.length > 0 && mp.players[0]?.id === mp.myPlayerId;

  /* ================================================================ */
  /*  RENDER: Error                                                    */
  /* ================================================================ */
  if (fetchError) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a' }}>
        <p style={{ color: '#6a6050', fontSize: '16px', marginBottom: '24px' }}>Session not found</p>
        <a href="/" style={{ padding: '12px 32px', backgroundColor: '#d4a843', color: '#0a0a0a', borderRadius: '8px', textDecoration: 'none', fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>Back to Home</a>
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER: Loading                                                  */
  /* ================================================================ */
  if (!sessionInfo) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '3px solid #2a2520', borderTopColor: '#d4a843', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#4a4540', fontStyle: 'italic' }}>Loading session...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }


  /* ================================================================ */
  /*  MULTIPLAYER RENDERS BELOW                                        */
  /* ================================================================ */

  const roomCode = sessionInfo.roomCode || '';

  /* ================================================================ */
  /*  RENDER: Joining / Name entry (pre-join)                          */
  /* ================================================================ */
  if (!mp.myPlayerId) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a' }}>
        <div style={{ textAlign: 'center' }}>
          {isJoining && (
            <>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '3px solid #2a2520', borderTopColor: '#d4a843', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
              <p style={{ color: '#4a4540', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>
                Joining as {storedName}...
              </p>
            </>
          )}
          {!isJoining && !mp.isConnected && (
            <p style={{ color: '#4a4540', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>
              Connecting to server...
            </p>
          )}
        </div>

        {/* Name popup */}
        {showNamePopup && !isJoining && (
          <NamePopup
            currentName={storedName}
            onSave={handleJoinWithName}
          />
        )}

        {/* Error overlay */}
        {joinError && !showNamePopup && (
          <div style={{ position: 'fixed', bottom: '40px', left: '50%', transform: 'translateX(-50%)', padding: '12px 24px', backgroundColor: '#2a1a1a', border: '1px solid #5a3030', borderRadius: '8px', color: '#cf8a8a', fontSize: '13px', fontFamily: 'monospace', zIndex: 60 }}>
            {joinError}
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER: Lobby phase (host types a prompt, AI generates world)   */
  /* ================================================================ */
  if (mp.gameState === 'voting' || mp.gameState === 'lobby') {
    return (
      <LobbyScreen
        isHost={isHost}
        roomCode={roomCode}
        players={mp.players.map((p) => ({ id: p.id, name: p.name, color: p.color }))}
        myPlayerId={mp.myPlayerId}
        maxPlayers={sessionInfo.maxPlayers}
        onGenerateStory={(prompt) => mp.generateStory(prompt)}
        storyStatus={mp.storyStatus}
        storyReady={mp.worldMeta !== null}
        imageReady={!!mp.worldMeta?.openingImageUrl}
        ttsReady={openingTtsUrl !== null}
        onStartGame={handleStartGame}
        isStartingGame={isStartingGame}
      />
    );
  }


  /* ================================================================ */
  /*  RENDER: Multiplayer Game                                         */
  /* ================================================================ */
  const typingNames = Array.from(mp.typingPlayers.values());
  const gameScenarioTitle = mp.worldMeta?.title || sessionInfo.scenarioTitle;
  const gameEmoji = '\uD83D\uDD75\uFE0F';

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0a' }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #2a2520', backgroundColor: '#0d0d0d', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '16px', color: '#d4a843', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
            {gameEmoji} {gameScenarioTitle}
          </span>
          {roomCode && <span style={{ fontSize: '10px', color: '#3a3530', fontFamily: 'monospace', letterSpacing: '1px' }}>{roomCode}</span>}
          {/* C.4: Turn counter badge — color shifts as turns run out */}
          {mp.turnInfo && (() => {
            const { turnCount, maxTurns } = mp.turnInfo;
            const remaining = maxTurns - turnCount;
            const color = remaining <= 4 ? '#cf5b5b' : remaining <= 9 ? '#d4a843' : '#7a9ab8';
            return (
              <span
                title={`${remaining} tur kaldı`}
                style={{
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  letterSpacing: '1px',
                  color,
                  padding: '3px 8px',
                  border: `1px solid ${color}`,
                  borderRadius: '4px',
                  textTransform: 'uppercase',
                }}
              >
                {T.game.turnsLabel} {turnCount}/{maxTurns}
              </span>
            );
          })()}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CopyLinkButton compact />
          {/* A.2: Audio settings — ambient + SFX volume/mute, persisted */}
          <SettingsPopover />
          {/* Communication button */}
          <button
            onClick={() => setCommOpen(true)}
            title="Communication"
            style={{
              position: 'relative', display: 'flex', alignItems: 'center', gap: '5px',
              padding: '6px 12px', backgroundColor: 'transparent',
              border: '1px solid #2a2520', borderRadius: '6px',
              color: '#6a6050', fontSize: '11px', fontFamily: 'monospace',
              letterSpacing: '0.5px', cursor: 'pointer', transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#5ba3cf'; e.currentTarget.style.color = '#5ba3cf'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2520'; e.currentTarget.style.color = '#6a6050'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Chat
            {mp.unreadComm > 0 && (
              <span style={{
                position: 'absolute', top: '-4px', right: '-4px',
                width: '16px', height: '16px', borderRadius: '50%',
                backgroundColor: '#5ba3cf', color: '#0a0a0a',
                fontSize: '9px', fontWeight: 'bold',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {mp.unreadComm > 9 ? '9+' : mp.unreadComm}
              </span>
            )}
          </button>
          <button onClick={() => setSidebarOpen(true)} title="View players"
            style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '4px 8px', backgroundColor: 'transparent', border: '1px solid #2a2520', borderRadius: '6px', cursor: 'pointer', transition: 'border-color 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4a4030'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2520'; }}
          >
            {mp.players.map((p) => (
              <div key={p.id} style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: p.isConnected ? p.color : '#3a3530', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', color: '#0a0a0a', border: p.id === mp.myPlayerId ? '2px solid #e8e0d4' : '2px solid transparent', opacity: p.isConnected ? 1 : 0.4 }}>
                {p.name.charAt(0).toUpperCase()}
              </div>
            ))}
          </button>
          <button
            onClick={() => setIsMapOpen(true)}
            style={{ padding: '6px 12px', backgroundColor: 'transparent', border: '1px solid #2a3540', borderRadius: '6px', color: '#7a9ab8', fontSize: '11px', fontFamily: 'monospace', letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#7a9ab8'; e.currentTarget.style.color = '#9ab8d0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a3540'; e.currentTarget.style.color = '#7a9ab8'; }}
          >Map</button>
          <button
            onClick={() => setIsAccuseOpen(true)}
            style={{ padding: '6px 12px', backgroundColor: 'transparent', border: '1px solid #7a3232', borderRadius: '6px', color: '#d46868', fontSize: '11px', fontFamily: 'monospace', letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#d46868'; e.currentTarget.style.color = '#e88080'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#7a3232'; e.currentTarget.style.color = '#d46868'; }}
          >{T.game.accuse}</button>
          <button onClick={handleLeave} style={{ padding: '6px 12px', backgroundColor: 'transparent', border: '1px solid #2a2520', borderRadius: '6px', color: '#6a6050', fontSize: '11px', fontFamily: 'monospace', letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#cf5b5b'; e.currentTarget.style.color = '#cf5b5b'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2520'; e.currentTarget.style.color = '#6a6050'; }}
          >Leave</button>
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
            messageType={msg.messageType}
          />
        ))}
        {mp.isNarratorStreaming && mp.streamingText && <ChatMessage role="assistant" content={mp.streamingText} />}
        {typingNames.length > 0 && (
          <div style={{ color: '#4a4540', fontStyle: 'italic', fontSize: '13px', padding: '6px 0', fontFamily: 'Georgia, serif', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ display: 'flex', gap: '3px' }}>
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#4a4540', animation: 'pulse 1.4s ease-in-out infinite' }} />
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#4a4540', animation: 'pulse 1.4s ease-in-out 0.2s infinite' }} />
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#4a4540', animation: 'pulse 1.4s ease-in-out 0.4s infinite' }} />
            </span>
            {typingNames.length === 1 ? `${typingNames[0]} is typing...` : `${typingNames.join(' and ')} are typing...`}
          </div>
        )}
        {(mp.actionQueue.waiting.length > 0 || mp.actionQueue.processingPlayerId) && (
          <QueueBanner queue={mp.actionQueue} myPlayerId={mp.myPlayerId} />
        )}
        {mp.isNarratorStreaming && !mp.streamingText && (
          <div style={{ color: '#4a4540', fontStyle: 'italic', fontSize: '14px', padding: '8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ display: 'flex', gap: '3px' }}>
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#d4a843', animation: 'pulse 1.4s ease-in-out infinite' }} />
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#d4a843', animation: 'pulse 1.4s ease-in-out 0.2s infinite' }} />
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#d4a843', animation: 'pulse 1.4s ease-in-out 0.4s infinite' }} />
            </span>
            The narrator contemplates...
          </div>
        )}
      </div>

      {/* Suggestions */}
      {mp.suggestions.length > 0 && !mp.isNarratorStreaming && (
        <div style={{ display: 'flex', gap: '8px', padding: '8px 20px', flexWrap: 'wrap', borderTop: '1px solid #1a1a1a' }}>
          {mp.suggestions.map((s, i) => (
            <button key={i} onClick={() => mp.sendAction(s)} style={{ padding: '8px 16px', backgroundColor: 'transparent', border: '1px solid #2a2520', borderRadius: '20px', color: '#b0a080', fontSize: '13px', fontFamily: 'Georgia, serif', fontStyle: 'italic', cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#d4a843'; e.currentTarget.style.color = '#d4a843'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2520'; e.currentTarget.style.color = '#b0a080'; }}
            >{s}</button>
          ))}
        </div>
      )}

      <ChatInput onSend={mp.sendAction} onTypingChange={mp.sendTyping} playerName={myPlayer?.name} />

      <PlayerSidebar players={mp.players} myPlayerId={mp.myPlayerId} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <CommPanel
        isOpen={commOpen}
        onClose={() => setCommOpen(false)}
        messages={mp.commMessages}
        players={mp.players}
        myPlayerId={mp.myPlayerId}
        onSendRoom={mp.sendRoomMessage}
        onSendDirect={mp.sendDirectMessage}
        onOpened={mp.clearUnreadComm}
      />

      {/* Accuse modal — simple suspect picker */}
      {isAccuseOpen && (
        <AccuseModal
          suspects={(sessionInfo?.scenarioMeta?.npcs || []).filter(
            (n) => (myPlayer?.visitedRooms || []).includes(n.roomId || ''),
          )}
          onCancel={() => setIsAccuseOpen(false)}
          onAccuse={(suspectId) => {
            setIsAccuseOpen(false);
            void mp.proposeAccusation(suspectId);
          }}
        />
      )}

      {/* Game Map (MP) */}
      {(() => {
        const meta = sessionInfo?.scenarioMeta;
        const mapRooms: MapRoom[] = (meta?.rooms || []).map((r) => ({
          id: r.id,
          name: r.name,
          exits: r.exits || {},
        }));
        const mapNpcs: MapNPC[] = (meta?.npcs || []).map((n) => ({
          id: n.id,
          name: n.name,
          roomId: n.roomId || '',
        }));
        const teammates = mp.players
          .filter((p) => p.id !== mp.myPlayerId)
          .map((p) => ({
            id: p.id,
            name: p.name,
            color: p.color,
            currentRoomId: p.currentRoomId,
            isConnected: p.isConnected,
          }));
        return (
          <GameMap
            isOpen={isMapOpen}
            onClose={() => setIsMapOpen(false)}
            scenarioId={sessionInfo?.scenarioId || ''}
            rooms={mapRooms}
            npcs={mapNpcs}
            currentRoomId={myPlayer?.currentRoomId || ''}
            visitedRooms={myPlayer?.visitedRooms || []}
            mode="multiplayer"
            teammates={teammates}
            myName={myPlayer?.name}
            myColor={myPlayer?.color}
            onTravel={(roomName) => {
              mp.sendAction(`${roomName} odasına gidiyorum.`);
            }}
            disabled={mp.isNarratorStreaming}
          />
        );
      })()}

      {mp.toast && (
        <div style={{ position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)', padding: '10px 20px', backgroundColor: '#2a1a1a', border: '1px solid #5a3030', borderRadius: '8px', color: '#cf8a8a', fontSize: '13px', fontFamily: 'monospace', zIndex: 60, animation: 'fadeInUp 0.3s ease' }}>
          {mp.toast}
        </div>
      )}

      {mp.isReconnecting && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '3px solid #2a2520', borderTopColor: '#d4a843', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <p style={{ color: '#d4a843', fontSize: '14px', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>Reconnecting...</p>
          </div>
        </div>
      )}

      {/* Accusation Vote Banner (#25) */}
      {mp.activeVote && (
        <AccusationVoteBanner
          vote={mp.activeVote}
          isProposer={mp.activeVote.proposerId === mp.myPlayerId}
          onVote={mp.voteAccusation}
        />
      )}

      {/* Opening Cinematic — shown once per playing session */}
      {mp.gameState === 'playing' && mp.worldMeta && !openingDismissed && !mp.gameOver && (
        <OpeningCinematic
          title={mp.worldMeta.title}
          openingNarration={mp.worldMeta.openingNarration}
          openingImageUrl={mp.worldMeta.openingImageUrl}
          ttsAudioUrl={openingTtsUrl}
          onStart={() => setOpeningDismissed(true)}
        />
      )}

      {/* Multiplayer Finale Cinematic (Velvet Shadow v2) */}
      {mp.gameOver && (
        <FinaleCinematic
          sessionId={sessionId}
          outcome={
            mp.gameOver.endReason === 'solved'
              ? 'won'
              : mp.gameOver.endReason === 'wrong_accusation'
              ? 'lost_wrong'
              : 'lost_timeout'
          }
          summary={mp.gameOver.summary}
          onHome={() => { window.location.href = '/'; }}
          onPlayAgain={() => { window.location.href = '/'; }}
        />
      )}

      <style>{`
        @keyframes pulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.2); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
      `}</style>
    </div>
  );
}

/* ================================================================== */
/*  AccusationVoteBanner component (#25)                               */
/* ================================================================== */

function AccusationVoteBanner({
  vote,
  isProposer,
  onVote,
}: {
  vote: { proposerName: string; suspectName: string; expiresAt: number; myVote?: 'guilty' | 'not_guilty' };
  isProposer: boolean;
  onVote: (v: 'guilty' | 'not_guilty') => Promise<boolean>;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const secondsLeft = Math.max(0, Math.ceil((vote.expiresAt - now) / 1000));
  const hasVoted = vote.myVote !== undefined;

  return (
    <div style={{
      position: 'fixed', top: '72px', left: '50%', transform: 'translateX(-50%)',
      backgroundColor: '#1a1510', border: '1px solid #d4a843',
      borderRadius: '12px', padding: '16px 22px', zIndex: 60,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
      minWidth: '360px', maxWidth: '520px',
      animation: 'fadeInUp 0.3s ease',
    }}>
      <div style={{
        fontFamily: 'monospace', fontSize: '10px', color: '#6a6050',
        letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px',
      }}>
        Accusation Vote · {secondsLeft}s
      </div>
      <div style={{
        fontFamily: 'Georgia, serif', fontSize: '16px', color: '#e8e0d4',
        marginBottom: '14px', lineHeight: '1.5',
      }}>
        <strong style={{ color: '#d4a843' }}>{vote.proposerName}</strong> accuses{' '}
        <strong style={{ color: '#d46868' }}>{vote.suspectName}</strong>.
        {isProposer ? ' Waiting for your teammates to vote.' : ' Cast your vote.'}
      </div>
      {hasVoted ? (
        <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#8a8070', textAlign: 'center' }}>
          You voted: <strong style={{ color: vote.myVote === 'guilty' ? '#d46868' : '#5ba3cf' }}>{vote.myVote === 'guilty' ? 'GUILTY' : 'NOT GUILTY'}</strong> — waiting for others.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            onClick={() => void onVote('guilty')}
            style={{
              flex: 1, padding: '10px 18px', backgroundColor: '#2a1515',
              border: '1px solid #d46868', borderRadius: '8px',
              color: '#d46868', fontFamily: 'monospace', fontWeight: 'bold',
              letterSpacing: '1.5px', textTransform: 'uppercase', fontSize: '12px',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#d46868'; e.currentTarget.style.color = '#0a0a0a'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2a1515'; e.currentTarget.style.color = '#d46868'; }}
          >
            Guilty
          </button>
          <button
            onClick={() => void onVote('not_guilty')}
            style={{
              flex: 1, padding: '10px 18px', backgroundColor: '#102030',
              border: '1px solid #5ba3cf', borderRadius: '8px',
              color: '#5ba3cf', fontFamily: 'monospace', fontWeight: 'bold',
              letterSpacing: '1.5px', textTransform: 'uppercase', fontSize: '12px',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#5ba3cf'; e.currentTarget.style.color = '#0a0a0a'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#102030'; e.currentTarget.style.color = '#5ba3cf'; }}
          >
            Not Guilty
          </button>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  AccuseModal — simple suspect picker                                 */
/* ================================================================== */

interface AccuseSuspect {
  id: string;
  name: string;
  description?: string;
  roomId?: string;
}

function AccuseModal({
  suspects,
  onCancel,
  onAccuse,
}: {
  suspects: AccuseSuspect[];
  onCancel: () => void;
  onAccuse: (suspectId: string) => void;
}) {
  const [selected, setSelected] = useState<string>('');

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.78)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 75,
    }}>
      <div style={{
        width: '100%', maxWidth: '460px', backgroundColor: '#111',
        border: '1px solid #2a2520', borderRadius: '14px', padding: '28px',
        margin: '0 16px',
      }}>
        <h2 style={{ color: '#d46868', fontFamily: 'Georgia, serif', fontStyle: 'italic', marginTop: 0, marginBottom: '6px' }}>
          {T.accuse.title}
        </h2>
        <p style={{ color: '#9a9080', fontSize: '13px', lineHeight: '1.6', marginBottom: '20px' }}>
          {T.accuse.unanimousRequired}
        </p>

        {suspects.length === 0 ? (
          <p style={{ color: '#6a6050', fontSize: '13px', fontStyle: 'italic', fontFamily: 'Georgia, serif', marginBottom: '20px' }}>
            Henüz kimseyle karşılaşmadın.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
            {suspects.map((npc) => {
              const isSelected = selected === npc.id;
              return (
                <button
                  key={npc.id}
                  onClick={() => setSelected(npc.id)}
                  style={{
                    padding: '14px 16px',
                    backgroundColor: isSelected ? '#1a1510' : '#0d0d0d',
                    border: `2px solid ${isSelected ? '#d4a843' : '#1e1e1e'}`,
                    borderRadius: '10px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{
                    fontSize: '14px', fontFamily: 'Georgia, serif',
                    color: isSelected ? '#d4a843' : '#b0a080',
                  }}>
                    {npc.name}
                  </div>
                  {npc.description && (
                    <div style={{ fontSize: '11px', color: '#5a5545', fontFamily: 'monospace', marginTop: '4px' }}>
                      {npc.description}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            onClick={onCancel}
            style={{ padding: '10px 20px', backgroundColor: 'transparent', border: '1px solid #2a2520', borderRadius: '8px', color: '#6a6050', fontFamily: 'monospace', cursor: 'pointer' }}
          >
            {T.accuse.cancel}
          </button>
          <button
            onClick={() => selected && onAccuse(selected)}
            disabled={!selected}
            style={{
              padding: '10px 20px',
              backgroundColor: selected ? '#7a2020' : '#1a1815',
              border: `1px solid ${selected ? '#d46868' : '#2a2520'}`,
              borderRadius: '8px',
              color: selected ? '#e8e0d4' : '#3a3530',
              fontFamily: 'monospace', fontWeight: 'bold',
              cursor: selected ? 'pointer' : 'not-allowed',
            }}
          >
            {T.accuse.propose}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  QueueBanner — shows who's waiting, who's being processed           */
/* ================================================================== */

interface QueueEntry {
  playerId: string;
  playerName: string;
  playerColor: string;
  message: string;
}

function QueueBanner({
  queue,
  myPlayerId,
}: {
  queue: {
    waiting: QueueEntry[];
    processingPlayerId: string | null;
    processingPlayerName: string | null;
  };
  myPlayerId: string | null;
}) {
  const myWaitIndex = queue.waiting.findIndex((w) => w.playerId === myPlayerId);
  const iAmProcessing = queue.processingPlayerId === myPlayerId;

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '10px 14px',
        backgroundColor: '#111',
        border: '1px solid #1e1e1e',
        borderRadius: '8px',
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#8a8070',
        margin: '8px 0',
      }}
    >
      {queue.processingPlayerId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#d4a843',
              animation: 'pulse 1.2s ease-in-out infinite',
              flexShrink: 0,
            }}
          />
          <span>
            {iAmProcessing ? (
              <>Anlatıcı <strong style={{ color: '#d4a843' }}>sana</strong> yazıyor…</>
            ) : (
              <>Anlatıcı <strong style={{ color: '#d4a843' }}>{queue.processingPlayerName}</strong>'e yazıyor…</>
            )}
          </span>
        </div>
      )}
      {queue.waiting.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ color: '#5a5545' }}>Sırada:</span>
          {queue.waiting.map((w, i) => {
            const isMe = w.playerId === myPlayerId;
            return (
              <span
                key={`${w.playerId}-${i}`}
                style={{
                  padding: '3px 10px',
                  borderRadius: '12px',
                  backgroundColor: isMe ? '#1a1510' : '#0d0d0d',
                  border: `1px solid ${isMe ? '#d4a843' : '#1e1e1e'}`,
                  color: isMe ? '#d4a843' : w.playerColor,
                  fontSize: '11px',
                  fontWeight: isMe ? 'bold' : 'normal',
                }}
              >
                {isMe ? `SEN (#${myWaitIndex + (queue.processingPlayerId ? 2 : 1)})` : w.playerName}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
