/**
 * session/[id]/page.tsx — Game session page
 *
 * Handles both single-player (SSE) and multiplayer (Socket.IO) modes.
 * Multiplayer phases: Loading → Name Entry → Voting (scenario pick) → Game.
 * Single player: Loading → Game (SSE streaming).
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
import { useMultiplayerSession } from '@/hooks/useMultiplayerSession';
import { disconnectSocket } from '@/lib/socket';
import { usePlayerName } from '@/hooks/usePlayerName';
import { NamePopup } from '@/components/NamePopup';
import { authEnabled, getAuthHeaders, subscribeToAuth } from '@/lib/firebase';

const API_BASE = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';
const DEBUG_PREFIX = '[session]';

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
    rooms?: Array<{ id: string; name: string }>;
  } | null;
  sharedEvidence?: Array<{
    evidenceId: string;
    sharedByPlayerId: string;
    sharedByPlayerName: string;
    sharedByPlayerColor: string;
    timestamp: number;
  }>;
}

interface ScenarioInfo {
  id: string;
  title: string;
  setting: string;
  synopsis: string;
}

/* ------------------------------------------------------------------ */
/*  SSE helpers (single player)                                        */
/* ------------------------------------------------------------------ */

interface SPMessage {
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  isLoadingImage?: boolean;
}

async function consumeStream(
  response: Response,
  onChunk: (text: string) => void,
): Promise<string> {
  console.debug(`${DEBUG_PREFIX} stream response`, {
    ok: response.ok,
    status: response.status,
    hasBody: !!response.body,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Streaming request failed with status ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let chunkCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'session') {
          console.debug(`${DEBUG_PREFIX} stream session`, event);
        } else if (event.type === 'chunk') {
          chunkCount += 1;
          fullText += event.content;
          if (chunkCount <= 5 || chunkCount % 25 === 0) {
            console.debug(`${DEBUG_PREFIX} stream chunk`, {
              chunkCount,
              currentLength: fullText.length,
              preview: fullText.slice(0, 120),
            });
          }
          onChunk(fullText);
        } else if (event.type === 'done' && typeof event.content === 'string') {
          fullText = event.content;
          console.debug(`${DEBUG_PREFIX} stream done`, {
            chunkCount,
            finalLength: fullText.length,
            gameState: event.gameState,
          });
          onChunk(fullText);
        }
      } catch (error) {
        console.warn(`${DEBUG_PREFIX} stream parse skip`, error);
      }
    }
  }

  console.debug(`${DEBUG_PREFIX} stream finished`, {
    chunkCount,
    finalLength: fullText.length,
  });
  return fullText;
}

async function fetchSuggestions(sessionId: string): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE}/api/chat/suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
      body: JSON.stringify({ sessionId }),
    });
    const data = await res.json();
    return data.suggestions || [];
  } catch { return []; }
}

async function fetchGameState(sessionId: string): Promise<GameState | null> {
  try {
    const res = await fetch(`${API_BASE}/api/chat/session/${sessionId}/gamestate`, {
      headers: await getAuthHeaders(),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
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

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/chat/session/${sessionId}`, {
          headers: await getAuthHeaders(),
        });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!cancelled) setSessionInfo(data);
      } catch {
        if (!cancelled) setFetchError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [authReady, sessionId]);

  const isMultiplayer = sessionInfo ? sessionInfo.maxPlayers > 1 : false;

  /* ---- Player name from localStorage ---- */
  const { name: storedName, loaded: nameLoaded, setName: setStoredName } = usePlayerName();

  /* ---- Multiplayer hook (always called, but only used if multiplayer) ---- */
  const mp = useMultiplayerSession(sessionId, isMultiplayer);

  /* ---- Single player state ---- */
  const [spMessages, setSpMessages] = useState<SPMessage[]>([]);
  const [spLoading, setSpLoading] = useState(false);
  const [spSuggestions, setSpSuggestions] = useState<string[]>([]);
  const [spGameState, setSpGameState] = useState<GameState | null>(null);
  const [isAccuseOpen, setIsAccuseOpen] = useState(false);
  const [isJournalOpen, setIsJournalOpen] = useState(false);
  const [selectedSuspect, setSelectedSuspect] = useState('');
  const [spStatusMessage, setSpStatusMessage] = useState<string | null>(null);

  const attachSceneImage = useCallback(async (text: string, messageIndex: number) => {
    const roomMatch = text.match(/##\s+\**([^\n*]+)\**/);
    if (!roomMatch) return;

    const roomName = roomMatch[1].trim();

    setSpMessages((prev) => {
      const updated = [...prev];
      if (updated[messageIndex]) {
        updated[messageIndex] = { ...updated[messageIndex], isLoadingImage: true };
      }
      return updated;
    });

    try {
      const res = await fetch(`${API_BASE}/api/chat/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ sessionId, roomName }),
      });
      const data = await res.json();
      setSpMessages((prev) => {
        const updated = [...prev];
        if (updated[messageIndex]) {
          updated[messageIndex] = {
            ...updated[messageIndex],
            isLoadingImage: false,
            imageUrl: data.imageUrl || undefined,
          };
        }
        return updated;
      });
    } catch {
      setSpMessages((prev) => {
        const updated = [...prev];
        if (updated[messageIndex]) {
          updated[messageIndex] = { ...updated[messageIndex], isLoadingImage: false };
        }
        return updated;
      });
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionInfo || isMultiplayer) return;
    let active = true;
    const controller = new AbortController();

    async function init() {
      console.debug(`${DEBUG_PREFIX} init singleplayer start`, {
        sessionId,
        scenarioId: sessionInfo.scenarioId,
      });

      const r = await fetch(`${API_BASE}/api/chat/session/${sessionId}`, {
        headers: await getAuthHeaders(),
        signal: controller.signal,
      });
      const data = await r.json();
      console.debug(`${DEBUG_PREFIX} session payload`, {
        sessionId,
        messageCount: data.messages?.length || 0,
        gameState: data.gameState,
      });

      if (active) {
        setSpGameState(data.gameState || null);
      }
      const visible = (data.messages || []).filter(
        (m: SPMessage) => m.role !== 'user' || m.content !== 'Start the game. Describe where I am.',
      );
      if (visible.length > 0) {
        console.debug(`${DEBUG_PREFIX} reusing existing visible messages`, {
          sessionId,
          visibleCount: visible.length,
        });
        if (active) {
          setSpMessages(visible);
          fetchSuggestions(sessionId).then(setSpSuggestions);
        }
      } else {
        console.debug(`${DEBUG_PREFIX} no visible messages, requesting /start stream`, { sessionId });
        if (active) {
          setSpLoading(true);
          setSpMessages([{ role: 'assistant', content: '' }]);
        }
        const streamRes = await fetch(`${API_BASE}/api/chat/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
          body: JSON.stringify({ sessionId }),
          signal: controller.signal,
        });
        const fullText = await consumeStream(streamRes, (text) => {
          if (active) {
            setSpMessages([{ role: 'assistant', content: text }]);
          }
        });
        if (active) {
          setSpLoading(false);
          fetchSuggestions(sessionId).then(setSpSuggestions);
          fetchGameState(sessionId).then(setSpGameState);
          attachSceneImage(fullText, 0);
        }
      }
    }
    init().catch((error) => {
      if ((error as Error).name === 'AbortError') {
        console.debug(`${DEBUG_PREFIX} singleplayer init aborted`, { sessionId });
        return;
      }
      console.error(`${DEBUG_PREFIX} singleplayer init failed`, error);
      if (active) {
        setSpLoading(false);
        setSpStatusMessage('Failed to load the session stream.');
      }
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [attachSceneImage, sessionInfo, isMultiplayer, sessionId]);

  useEffect(() => {
    if (!sessionInfo || isMultiplayer) return;
    console.debug(`${DEBUG_PREFIX} singleplayer state`, {
      sessionId,
      messageCount: spMessages.length,
      loading: spLoading,
      lastMessagePreview: spMessages.at(-1)?.content?.slice(0, 120),
    });
  }, [isMultiplayer, sessionId, sessionInfo, spLoading, spMessages]);

  const spSend = useCallback(async (text: string) => {
    if (spLoading || spGameState?.status !== 'playing') return;
    setSpMessages((prev) => [...prev, { role: 'user', content: text }]);
    setSpLoading(true); setSpSuggestions([]);
    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ sessionId, message: text }),
      });
      setSpMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
      const assistantIndex = spMessages.length + 1;
      const fullText = await consumeStream(res, (t) => {
        setSpMessages((prev) => { const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: t }; return u; });
      });
      fetchSuggestions(sessionId).then(setSpSuggestions);
      fetchGameState(sessionId).then(setSpGameState);
      attachSceneImage(fullText, assistantIndex);
    } catch { setSpMessages((prev) => [...prev, { role: 'assistant', content: 'The narrator falls silent...' }]); }
    finally { setSpLoading(false); }
  }, [attachSceneImage, sessionId, spGameState?.status, spLoading, spMessages.length]);

  const handleAccuse = useCallback(async () => {
    if (!selectedSuspect) return;
    try {
      const res = await fetch(`${API_BASE}/api/chat/accuse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({
          sessionId,
          suspectId: selectedSuspect,
        }),
      });
      const data = await res.json();
      if (data.summary) {
        setSpMessages((prev) => [...prev, { role: 'assistant', content: data.summary }]);
      }
      if (data.gameState) {
        setSpGameState(data.gameState);
      } else {
        fetchGameState(sessionId).then(setSpGameState);
      }
      setIsAccuseOpen(false);
      setSelectedSuspect('');
    } catch {
      setSpStatusMessage('Accusation failed. Please try again.');
    }
  }, [selectedSuspect, sessionId]);

  const handlePlayAgain = useCallback(async () => {
    if (!sessionInfo) return;
    const res = await fetch(`${API_BASE}/api/chat/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
      body: JSON.stringify({ scenarioId: sessionInfo.scenarioId, mode: 'singleplayer' }),
    });
    const data = await res.json();
    if (data.sessionId) {
      window.location.href = `/session/${data.sessionId}`;
    }
  }, [sessionInfo]);

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
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commOpen, setCommOpen] = useState(false);

  // Fetch scenarios for voting
  useEffect(() => {
    if (!isMultiplayer) return;
    fetch(`${API_BASE}/api/chat/scenarios`)
      .then((r) => r.json())
      .then((data) => setScenarios(data.scenarios || []))
      .catch(() => {});
  }, [isMultiplayer]);

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
    if (isStartingGame || !mp.selectedScenarioId) return;
    setIsStartingGame(true);
    const confirmed = await mp.confirmScenario(mp.selectedScenarioId);
    if (confirmed) {
      const ok = await mp.startGame();
      if (!ok) setIsStartingGame(false);
    } else {
      setIsStartingGame(false);
    }
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
  }, [mp.messages, mp.streamingText, spMessages]);

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
  /*  RENDER: Single Player                                            */
  /* ================================================================ */
  if (!isMultiplayer) {
    const emoji = SCENARIO_EMOJI[sessionInfo.scenarioId] || '\uD83D\uDCD6';
    const turnsLeft = Math.max(
      0,
      (sessionInfo.scenarioMeta?.maxTurns || 0) - (spGameState?.turnCount || 0),
    );
    const isGameOver = spGameState?.status && spGameState.status !== 'playing';
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0a' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #2a2520', backgroundColor: '#0d0d0d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '16px', color: '#d4a843', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
              {emoji} {sessionInfo.scenarioTitle}
            </span>
            {sessionInfo.scenarioMeta && (
              <span style={{
                padding: '4px 10px',
                borderRadius: '999px',
                border: '1px solid #2a2520',
                color: turnsLeft <= 2 ? '#d46868' : '#9a9080',
                fontSize: '11px',
                fontFamily: 'monospace',
                letterSpacing: '1px',
              }}>
                TURNS LEFT {turnsLeft}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {spGameState?.status === 'playing' && (
              <button
                onClick={() => setIsJournalOpen(true)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'transparent',
                  border: '1px solid #2a3a2a',
                  borderRadius: '6px',
                  color: '#8aaa70',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#8aaa70'; e.currentTarget.style.color = '#b0d090'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a3a2a'; e.currentTarget.style.color = '#8aaa70'; }}
              >
                Journal
              </button>
            )}
            {spGameState?.status === 'playing' && sessionInfo.scenarioMeta && (
              <button
                onClick={() => setIsAccuseOpen(true)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'transparent',
                  border: '1px solid #7a3232',
                  borderRadius: '6px',
                  color: '#d46868',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Accuse
              </button>
            )}
            <a href="/" style={{ padding: '6px 12px', backgroundColor: 'transparent', border: '1px solid #2a2520', borderRadius: '6px', color: '#6a6050', fontSize: '11px', fontFamily: 'monospace', textDecoration: 'none', letterSpacing: '1px', textTransform: 'uppercase' }}>
              New Game
            </a>
          </div>
        </div>
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {spMessages.map((msg, i) => (
            <ChatMessage
              key={i}
              role={msg.role}
              content={msg.content}
              imageUrl={msg.imageUrl}
              isLoadingImage={msg.isLoadingImage}
            />
          ))}
          {spLoading && <div style={{ color: '#4a4540', fontStyle: 'italic', fontSize: '14px', padding: '8px 0' }}>The narrator contemplates...</div>}
        </div>
        {spSuggestions.length > 0 && !spLoading && spGameState?.status === 'playing' && (
          <div style={{ display: 'flex', gap: '8px', padding: '8px 20px', flexWrap: 'wrap', borderTop: '1px solid #1a1a1a' }}>
            {spSuggestions.map((s, i) => (
              <button key={i} onClick={() => spSend(s)} style={{ padding: '8px 16px', backgroundColor: 'transparent', border: '1px solid #2a2520', borderRadius: '20px', color: '#b0a080', fontSize: '13px', fontFamily: 'Georgia, serif', fontStyle: 'italic', cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#d4a843'; e.currentTarget.style.color = '#d4a843'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2520'; e.currentTarget.style.color = '#b0a080'; }}
              >{s}</button>
            ))}
          </div>
        )}
        {spStatusMessage && (
          <div style={{ padding: '10px 20px', color: '#cf8a8a', fontSize: '12px', fontFamily: 'monospace' }}>
            {spStatusMessage}
          </div>
        )}
        <ChatInput onSend={spSend} disabled={spLoading || isGameOver} />

        {isAccuseOpen && sessionInfo.scenarioMeta && (
          <div style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.72)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60,
          }}>
            <div style={{
              width: '100%', maxWidth: '460px', backgroundColor: '#111', border: '1px solid #2a2520',
              borderRadius: '14px', padding: '28px',
            }}>
              <h2 style={{ color: '#d4a843', fontFamily: 'Georgia, serif', fontStyle: 'italic', marginTop: 0, marginBottom: '6px' }}>
                Final Accusation
              </h2>
              <p style={{ color: '#9a9080', fontSize: '13px', lineHeight: '1.6', marginBottom: '20px' }}>
                Who committed the crime? Choose wisely — a wrong accusation ends the case.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                {sessionInfo.scenarioMeta.npcs.filter((npc) => (spGameState?.visitedRooms || []).includes(npc.roomId || '')).map((npc) => {
                  const isSelected = selectedSuspect === npc.id;
                  return (
                    <button
                      key={npc.id}
                      onClick={() => setSelectedSuspect(npc.id)}
                      style={{
                        padding: '14px 16px',
                        backgroundColor: isSelected ? '#1a1510' : '#0d0d0d',
                        border: `2px solid ${isSelected ? '#d4a843' : '#1e1e1e'}`,
                        borderRadius: '10px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.2s',
                        display: 'flex', alignItems: 'center', gap: '12px',
                      }}
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.borderColor = '#3a3530'; }}
                      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.borderColor = '#1e1e1e'; }}
                    >
                      <div style={{
                        width: '36px', height: '36px', borderRadius: '50%',
                        backgroundColor: isSelected ? '#d4a843' : '#1a1815',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '16px', flexShrink: 0,
                        transition: 'all 0.2s',
                      }}>
                        {isSelected ? '\u2713' : '\uD83D\uDC64'}
                      </div>
                      <div>
                        <div style={{
                          fontSize: '14px', fontFamily: 'Georgia, serif',
                          color: isSelected ? '#d4a843' : '#b0a080',
                          transition: 'color 0.2s',
                        }}>
                          {npc.name}
                        </div>
                        {npc.description && (
                          <div style={{ fontSize: '11px', color: '#5a5545', fontFamily: 'monospace', marginTop: '2px' }}>
                            {npc.description}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  onClick={() => { setIsAccuseOpen(false); setSelectedSuspect(''); }}
                  style={{ padding: '10px 20px', backgroundColor: 'transparent', border: '1px solid #2a2520', borderRadius: '8px', color: '#6a6050', fontFamily: 'monospace', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAccuse}
                  disabled={!selectedSuspect}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: selectedSuspect ? '#7a2020' : '#1a1815',
                    border: `1px solid ${selectedSuspect ? '#d46868' : '#2a2520'}`,
                    borderRadius: '8px',
                    color: selectedSuspect ? '#e8e0d4' : '#3a3530',
                    fontFamily: 'monospace', fontWeight: 'bold',
                    cursor: selectedSuspect ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s',
                  }}
                >
                  Confirm Accusation
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Evidence Board (SP) */}
        {(() => {
          const meta = sessionInfo.scenarioMeta;
          const roomMap = Object.fromEntries((meta?.rooms || []).map((r) => [r.id, r.name]));
          const allEvidence: EvidenceItem[] = (meta?.items || [])
            .filter((i) => i.isEvidence)
            .map((i) => ({ ...i, roomName: roomMap[i.roomId] || i.roomId }));
          const visitedRooms = spGameState?.visitedRooms || [];
          const suspects: SuspectInfo[] = (meta?.npcs || [])
            .filter((npc) => visitedRooms.includes(npc.roomId || ''))
            .map((npc) => ({
              id: npc.id,
              name: npc.name,
              description: npc.description || '',
              roomId: npc.roomId || '',
              roomName: npc.roomId ? (roomMap[npc.roomId] || npc.roomId) : '',
              visited: true,
            }));
          const discoveredIds = [
            ...(spGameState?.discoveredEvidence || []),
            ...(spGameState?.inventory || []),
          ].filter((id, idx, arr) => arr.indexOf(id) === idx);
          return (
            <EvidenceBoard
              mode="singleplayer"
              isOpen={isJournalOpen}
              onClose={() => setIsJournalOpen(false)}
              allEvidence={allEvidence}
              discoveredIds={discoveredIds}
              suspects={suspects}
              onAccuse={(suspectId) => {
                setSelectedSuspect(suspectId);
                setIsJournalOpen(false);
                setIsAccuseOpen(true);
              }}
            />
          );
        })()}

        {isGameOver && (
          <div style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.82)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
          }}>
            <div style={{ textAlign: 'center', maxWidth: '480px', padding: '24px' }}>
              <h1 style={{
                color: spGameState?.status === 'won' ? '#d4a843' : '#d46868',
                fontFamily: 'Georgia, serif',
                fontStyle: 'italic',
                fontSize: '40px',
                marginBottom: '10px',
              }}>
                {spGameState?.status === 'won' ? 'Mystery Solved' : 'Game Over'}
              </h1>
              <p style={{ color: '#9a9080', fontFamily: 'Georgia, serif', fontSize: '16px', lineHeight: '1.7', marginBottom: '24px' }}>
                {spGameState?.endReason === 'solved' && 'You found the truth and closed the case.'}
                {spGameState?.endReason === 'wrong_accusation' && 'The accusation was wrong. The case slipped through your hands.'}
                {spGameState?.endReason === 'turn_limit' && 'Time ran out before the case could be solved.'}
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                <a
                  href="/"
                  style={{ padding: '12px 18px', backgroundColor: 'transparent', border: '1px solid #2a2520', borderRadius: '8px', color: '#b0a080', textDecoration: 'none', fontFamily: 'monospace' }}
                >
                  Home
                </a>
                <button
                  onClick={handlePlayAgain}
                  style={{ padding: '12px 18px', backgroundColor: '#d4a843', border: 'none', borderRadius: '8px', color: '#0a0a0a', fontFamily: 'monospace', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Play Again
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ================================================================ */
  /*  MULTIPLAYER RENDERS BELOW                                        */
  /* ================================================================ */

  const emoji = SCENARIO_EMOJI[sessionInfo.scenarioId] || '\uD83D\uDCD6';
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
  /*  RENDER: Voting phase (scenario selection)                        */
  /* ================================================================ */
  if (mp.gameState === 'voting') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#0a0a0a', padding: '24px', overflowY: 'auto' }}>
        <div style={{ textAlign: 'center', maxWidth: '760px', width: '100%', marginTop: '24px' }}>

          {/* Room code header */}
          <div style={{ marginBottom: '8px' }}>
            <p style={{ fontSize: '10px', color: '#5a5545', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '6px' }}>Room Code</p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', padding: '10px 20px', backgroundColor: '#111', border: '1px solid #2a2520', borderRadius: '10px' }}>
              <span style={{ fontSize: '24px', fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: '5px', color: '#d4a843' }}>{roomCode}</span>
              <button
                onClick={() => { navigator.clipboard.writeText(roomCode); }}
                title="Copy code"
                style={{ background: 'none', border: 'none', color: '#5a5545', cursor: 'pointer', padding: '4px', transition: 'color 0.2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#d4a843'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#5a5545'; }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            </div>
          </div>

          {/* Players bar */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '28px', flexWrap: 'wrap' }}>
            {mp.players.map((p) => {
              const isMe = p.id === mp.myPlayerId;
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', backgroundColor: '#111', borderRadius: '20px', border: `1px solid ${isMe ? '#3a3020' : '#1e1e1e'}` }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: p.color }} />
                  <span style={{ fontSize: '12px', color: p.color, fontFamily: 'monospace' }}>
                    {p.name}
                    {isMe && <span style={{ color: '#5a5545', marginLeft: '4px' }}>(you)</span>}
                    {p.id === mp.players[0]?.id && <span style={{ color: '#d4a843', marginLeft: '4px' }}>★</span>}
                  </span>
                </div>
              );
            })}
            {/* Empty slots */}
            {Array.from({ length: sessionInfo.maxPlayers - mp.players.length }).map((_, i) => (
              <div key={`e-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', backgroundColor: '#0a0a0a', borderRadius: '20px', border: '1px dashed #1e1e1e' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#1e1e1e' }} />
                <span style={{ fontSize: '12px', color: '#3a3530', fontFamily: 'monospace' }}>waiting...</span>
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: '24px', color: '#d4a843', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 'normal', marginBottom: '6px' }}>
            {isHost ? 'Choose a Story' : 'Vote for a Story'}
          </h2>
          <p style={{ fontSize: '12px', color: '#5a5545', fontFamily: 'monospace', letterSpacing: '1px', marginBottom: '28px' }}>
            {isHost ? 'Click to select, then start the adventure' : "Click to show your preference — the host decides"}
          </p>

          {/* Scenario grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', marginBottom: '28px', textAlign: 'left' }}>
            {scenarios.map((s) => {
              const isHostSelected = mp.selectedScenarioId === s.id;
              const voters = mp.scenarioVotes[s.id] || [];
              const iVoted = voters.includes(myPlayer?.name || '');

              return (
                <button
                  key={s.id}
                  onClick={() => isHost ? mp.selectScenario(s.id) : mp.voteScenario(s.id)}
                  style={{
                    padding: '20px', position: 'relative',
                    backgroundColor: isHostSelected ? '#1a1510' : iVoted ? '#12150f' : '#111',
                    border: `2px solid ${isHostSelected ? '#d4a843' : iVoted ? '#3a5a3a' : '#1a1a1a'}`,
                    borderRadius: '12px', cursor: 'pointer',
                    textAlign: 'left', transition: 'all 0.25s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isHostSelected) { e.currentTarget.style.borderColor = '#3a3020'; e.currentTarget.style.backgroundColor = '#151210'; }
                  }}
                  onMouseLeave={(e) => {
                    if (!isHostSelected && !iVoted) { e.currentTarget.style.borderColor = '#1a1a1a'; e.currentTarget.style.backgroundColor = '#111'; }
                    else if (iVoted && !isHostSelected) { e.currentTarget.style.borderColor = '#3a5a3a'; e.currentTarget.style.backgroundColor = '#12150f'; }
                  }}
                >
                  {/* Host selection badge */}
                  {isHostSelected && (
                    <div style={{ position: 'absolute', top: '10px', right: '10px', padding: '2px 8px', backgroundColor: '#d4a843', borderRadius: '4px', fontSize: '9px', fontFamily: 'monospace', fontWeight: 'bold', color: '#0a0a0a', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      HOST PICK
                    </div>
                  )}

                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>{SCENARIO_EMOJI[s.id] || '\uD83D\uDCD6'}</div>
                  <div style={{ fontSize: '15px', color: isHostSelected ? '#d4a843' : '#b0a080', fontFamily: 'Georgia, serif', fontWeight: 'bold', marginBottom: '4px' }}>{s.title}</div>
                  <div style={{ fontSize: '11px', color: '#5a5545', fontFamily: 'monospace', lineHeight: '1.5', marginBottom: voters.length > 0 ? '10px' : '0' }}>{s.setting}</div>

                  {/* Voter badges */}
                  {voters.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {voters.map((name) => {
                        const voter = mp.players.find((p) => p.name === name);
                        return (
                          <span key={name} style={{ padding: '2px 8px', backgroundColor: '#1a1a1a', borderRadius: '10px', fontSize: '10px', color: voter?.color || '#6a6050', fontFamily: 'monospace', border: '1px solid #2a2520' }}>
                            {name}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Start button (host) or waiting message (guest) */}
          {isHost ? (
            <button
              onClick={handleStartGame}
              disabled={!mp.selectedScenarioId || isStartingGame}
              style={{
                padding: '16px 48px',
                backgroundColor: !mp.selectedScenarioId || isStartingGame ? '#1a1510' : '#d4a843',
                color: !mp.selectedScenarioId || isStartingGame ? '#5a5040' : '#0a0a0a',
                border: 'none', borderRadius: '8px', fontSize: '15px',
                fontWeight: 'bold', fontFamily: 'monospace',
                letterSpacing: '2px', textTransform: 'uppercase',
                cursor: !mp.selectedScenarioId || isStartingGame ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {isStartingGame ? 'Starting...' : 'Start Adventure'}
            </button>
          ) : (
            <div style={{ padding: '16px', backgroundColor: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: '8px', display: 'inline-block' }}>
              <p style={{ fontSize: '13px', color: '#6a6050', fontFamily: 'Georgia, serif', fontStyle: 'italic', margin: 0 }}>
                {mp.selectedScenarioId
                  ? `Host is considering: ${scenarios.find((s) => s.id === mp.selectedScenarioId)?.title || '...'}`
                  : 'Waiting for host to choose a story...'}
              </p>
            </div>
          )}

          {mp.error && <p style={{ marginTop: '12px', fontSize: '13px', color: '#cf5b5b', fontFamily: 'monospace' }}>{mp.error}</p>}
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER: Multiplayer Game                                         */
  /* ================================================================ */
  const typingNames = Array.from(mp.typingPlayers.values());
  const gameScenarioTitle = scenarios.find((s) => s.id === sessionInfo.scenarioId)?.title || sessionInfo.scenarioTitle;
  const gameEmoji = SCENARIO_EMOJI[sessionInfo.scenarioId] || (mp.selectedScenarioId ? SCENARIO_EMOJI[mp.selectedScenarioId] : '') || '\uD83D\uDCD6';

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

      <style>{`
        @keyframes pulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.2); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
      `}</style>
    </div>
  );
}
