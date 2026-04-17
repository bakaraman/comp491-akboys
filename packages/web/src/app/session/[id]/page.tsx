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
import { EvidenceBoard } from '@/components/EvidenceBoard';
import type { EvidenceItem, SuspectInfo } from '@/components/EvidenceBoard';
import { LobbyScreen } from '@/components/LobbyScreen';
import { FinaleCinematic } from '@/components/FinaleCinematic';
import { useAmbientMusic } from '@/hooks/useAmbientMusic';
import { T } from '@/lib/tr';
import { GameMap } from '@/components/GameMap';
import type { MapRoom, MapNPC } from '@/components/GameMap';
import { useMultiplayerSession } from '@/hooks/useMultiplayerSession';
import { disconnectSocket } from '@/lib/socket';
import { usePlayerName } from '@/hooks/usePlayerName';
import { NamePopup } from '@/components/NamePopup';
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

  // Ambient noir music — louder during opening/finale, quieter mid-game
  const ambientActive =
    isMultiplayer &&
    (mp.gameState === 'lobby' ||
      mp.gameState === 'voting' ||
      mp.gameState === 'playing' ||
      mp.gameState === 'ended');
  const ambientBoost =
    mp.gameState === 'ended' || mp.worldMeta !== null && mp.gameState !== 'playing';
  useAmbientMusic(ambientActive, ambientBoost ? 0.18 : 0.05);

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

  /* ---- UI overlays (used by MP evidence/map) ---- */
  const [isJournalOpen, setIsJournalOpen] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);

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
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CopyLinkButton compact />
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
            onClick={() => setIsJournalOpen(true)}
            style={{ padding: '6px 12px', backgroundColor: 'transparent', border: '1px solid #2a3a2a', borderRadius: '6px', color: '#8aaa70', fontSize: '11px', fontFamily: 'monospace', letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#8aaa70'; e.currentTarget.style.color = '#b0d090'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a3a2a'; e.currentTarget.style.color = '#8aaa70'; }}
          >Journal</button>
          <button onClick={handleLeave} style={{ padding: '6px 12px', backgroundColor: 'transparent', border: '1px solid #2a2520', borderRadius: '6px', color: '#6a6050', fontSize: '11px', fontFamily: 'monospace', letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#cf5b5b'; e.currentTarget.style.color = '#cf5b5b'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2520'; e.currentTarget.style.color = '#6a6050'; }}
          >Leave</button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {mp.messages.map((msg) => (
          <ChatMessage key={msg.id} role={msg.role} content={msg.content} playerName={msg.playerName} playerColor={msg.playerColor} />
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
        {mp.batchInfo && !mp.isNarratorStreaming && (
          <div style={{ color: '#6a6050', fontSize: '12px', padding: '8px 14px', fontFamily: 'monospace', backgroundColor: '#111', border: '1px solid #1e1e1e', borderRadius: '8px', display: 'inline-block' }}>
            Gathering actions... ({mp.batchInfo.queueSize} queued)
          </div>
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

      {/* Evidence Board (MP) */}
      {(() => {
        const meta = sessionInfo?.scenarioMeta;
        const roomMap = Object.fromEntries((meta?.rooms || []).map((r) => [r.id, r.name]));
        const allEvidence: EvidenceItem[] = (meta?.items || [])
          .filter((i) => i.isEvidence)
          .map((i) => ({ ...i, roomName: roomMap[i.roomId] || i.roomId }));
        const mpVisitedRooms = myPlayer?.visitedRooms || [];
        const suspects: SuspectInfo[] = (meta?.npcs || [])
          .filter((npc) => mpVisitedRooms.includes(npc.roomId || ''))
          .map((npc) => ({
            id: npc.id,
            name: npc.name,
            description: npc.description || '',
            roomId: npc.roomId || '',
            roomName: npc.roomId ? (roomMap[npc.roomId] || npc.roomId) : '',
            visited: true,
          }));
        const myInventory = myPlayer?.inventory || [];
        const discoveredIds = myInventory.filter((id) =>
          allEvidence.some((e) => e.id === id),
        );
        return (
          <EvidenceBoard
            mode="multiplayer"
            isOpen={isJournalOpen}
            onClose={() => setIsJournalOpen(false)}
            allEvidence={allEvidence}
            discoveredIds={discoveredIds}
            suspects={suspects}
            sharedEvidence={mp.sharedEvidence}
            onShareEvidence={mp.shareEvidence}
            onProposeAccusation={(suspectId) => {
              setIsJournalOpen(false);
              void mp.proposeAccusation(suspectId);
            }}
          />
        );
      })()}

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
              // Include direction for clearer AI interpretation
              const currentRoom = mapRooms.find((r) => r.id === myPlayer?.currentRoomId);
              const targetRoom = mapRooms.find((r) => r.name === roomName);
              let direction: string | null = null;
              if (currentRoom && targetRoom) {
                for (const [dir, roomId] of Object.entries(currentRoom.exits)) {
                  if (roomId === targetRoom.id) {
                    direction = dir;
                    break;
                  }
                }
              }
              const command = direction
                ? `I go ${direction} to the ${roomName}.`
                : `I go to the ${roomName}.`;
              mp.sendAction(command);
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
          onPlayAgain={() => { window.location.href = '/multiplayer'; }}
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
