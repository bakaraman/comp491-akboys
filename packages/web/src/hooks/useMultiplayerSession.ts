/**
 * useMultiplayerSession.ts — React hook for multiplayer game sessions
 *
 * Manages the full Socket.IO lifecycle: connect, join/rejoin, listen
 * for events, and expose state + actions to the session page.
 *
 * Separates game actions (narrator pipeline) from communication
 * (player-to-player, never touches narrator).
 *
 * @author AKBOYS Team
 * @since 2026-03-24
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { PlayerDataDTO, CommMessageDTO } from '@/types/shared';
import { getSocket, disconnectSocket, type GameSocket } from '../lib/socket';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'observed';
  content: string;
  playerId?: string;
  playerName?: string;
  playerColor?: string;
  timestamp: number;
}

export interface BatchInfo {
  queueSize: number;
  timeRemaining: number;
}

interface StoredIdentity {
  sessionId: string;
  playerId: string;
  playerName: string;
}

/* ------------------------------------------------------------------ */
/*  localStorage helpers                                               */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'akboys_player';

function saveIdentity(identity: StoredIdentity): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(identity)); } catch { /* */ }
}

function loadIdentity(sessionId: string): StoredIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: StoredIdentity = JSON.parse(raw);
    return parsed.sessionId === sessionId ? parsed : null;
  } catch { return null; }
}

function clearIdentity(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useMultiplayerSession(sessionId: string, enabled: boolean = true) {
  /* ---- State ---- */
  const [players, setPlayers] = useState<PlayerDataDTO[]>([]);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [commMessages, setCommMessages] = useState<CommMessageDTO[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [typingPlayers, setTypingPlayers] = useState<Map<string, string>>(new Map());
  const [isNarratorStreaming, setIsNarratorStreaming] = useState(false);
  const [batchInfo, setBatchInfo] = useState<BatchInfo | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<'lobby' | 'voting' | 'playing' | 'ended'>('lobby');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [scenarioVotes, setScenarioVotes] = useState<Record<string, string[]>>({});
  const [unreadComm, setUnreadComm] = useState(0);
  const [sharedEvidence, setSharedEvidence] = useState<Array<{
    evidenceId: string;
    sharedByPlayerId: string;
    sharedByPlayerName: string;
    sharedByPlayerColor: string;
    timestamp: number;
  }>>([]);
  const [activeVote, setActiveVote] = useState<{
    proposerId: string;
    proposerName: string;
    suspectId: string;
    suspectName: string;
    expiresAt: number;
    myVote?: 'guilty' | 'not_guilty';
  } | null>(null);
  const [gameOver, setGameOver] = useState<{
    status: 'won' | 'lost';
    endReason: 'solved' | 'wrong_accusation' | 'turn_limit' | 'sanity_death';
    summary: string;
  } | null>(null);
  const [storyStatus, setStoryStatus] = useState<{
    phase: 'queued' | 'generating' | 'validating' | 'image' | 'ready' | 'failed';
    message?: string;
  } | null>(null);
  const [worldMeta, setWorldMeta] = useState<{
    title: string;
    setting: string;
    centralMystery: string;
    openingNarration: string;
    ambientTrack: string;
    tone: string;
    openingImageUrl: string | null;
    rooms: Array<{ id: string; name: string; exits: Record<string, string | null> }>;
    npcs: Array<{ id: string; name: string; role: string }>;
    evidenceItems: Array<{ id: string; name: string }>;
  } | null>(null);
  const [roomImages, setRoomImages] = useState<Record<string, string>>({});
  const [npcPortraits, setNpcPortraits] = useState<Record<string, string>>({});

  const socketRef = useRef<GameSocket | null>(null);
  const msgIdCounter = useRef(0);
  const myPlayerIdRef = useRef<string | null>(null);

  // Keep ref in sync
  useEffect(() => { myPlayerIdRef.current = myPlayerId; }, [myPlayerId]);

  /* ---- Helpers ---- */

  const nextMsgId = useCallback(() => {
    msgIdCounter.current += 1;
    return `msg_${msgIdCounter.current}`;
  }, []);

  const addMessage = useCallback(
    (msg: Omit<DisplayMessage, 'id'>) => {
      setMessages((prev) => [...prev, { ...msg, id: nextMsgId() }]);
    },
    [nextMsgId],
  );

  /* ---- Socket setup & event listeners ---- */

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const socket = getSocket();
    socketRef.current = socket;

    /* -- Connection events -- */
    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);

      const stored = loadIdentity(sessionId);
      if (stored) {
        setIsReconnecting(true);
        socket.emit('player:rejoin', { sessionId, playerId: stored.playerId }, (resp) => {
          setIsReconnecting(false);
          if (resp.success) {
            setMyPlayerId(stored.playerId);
          } else {
            clearIdentity();
          }
        });
      }
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    /* -- Player events -- */
    socket.on('player:joined', ({ player, allPlayers }) => {
      setPlayers(allPlayers);
      addMessage({
        role: 'system',
        content: `**${player.name}** joined the session.`,
        timestamp: Date.now(),
      });
    });

    socket.on('player:left', ({ playerName, allPlayers }) => {
      setPlayers(allPlayers);
      addMessage({
        role: 'system',
        content: `**${playerName}** disconnected.`,
        timestamp: Date.now(),
      });
    });

    socket.on('player:reconnected', ({ playerName, allPlayers }) => {
      setPlayers(allPlayers);
      addMessage({
        role: 'system',
        content: `**${playerName}** reconnected.`,
        timestamp: Date.now(),
      });
    });

    socket.on('player:typing-update', ({ playerId, playerName, isTyping }) => {
      setTypingPlayers((prev) => {
        const next = new Map(prev);
        if (isTyping) next.set(playerId, playerName);
        else next.delete(playerId);
        return next;
      });
    });

    /* -- Action / batch events -- */
    socket.on('action:queued', ({ playerName, playerColor, message, queueSize, timeRemaining }) => {
      setBatchInfo({ queueSize, timeRemaining });
      addMessage({
        role: 'user',
        content: message,
        playerName,
        playerColor,
        timestamp: Date.now(),
      });
    });

    /* -- Narrator events (scoped) -- */
    socket.on('narrator:chunk', ({ fullText, targetPlayerId }) => {
      // Only show streaming if it's for me or for everyone (no target = opening)
      const me = myPlayerIdRef.current;
      if (!targetPlayerId || targetPlayerId === me) {
        setIsNarratorStreaming(true);
        setStreamingText(fullText);
      }
    });

    socket.on('narrator:done', ({ fullText, suggestions: sugg, targetPlayerId }) => {
      const me = myPlayerIdRef.current;
      if (!targetPlayerId || targetPlayerId === me) {
        setIsNarratorStreaming(false);
        setStreamingText('');
        setBatchInfo(null);
        setSuggestions(sugg);
        addMessage({
          role: 'assistant',
          content: fullText,
          timestamp: Date.now(),
        });
      }
    });

    /* -- Observed narration (same-room witness) -- */
    socket.on('narrator:observed', ({ text, actorName }) => {
      addMessage({
        role: 'observed',
        content: text,
        playerName: actorName,
        timestamp: Date.now(),
      });
    });

    /* -- Session events -- */
    socket.on('session:state', ({ session }) => {
      setPlayers(session.players);
      setGameState(session.state);
      if (session.selectedScenarioId !== undefined) setSelectedScenarioId(session.selectedScenarioId ?? null);
      if (session.scenarioVotes) setScenarioVotes(session.scenarioVotes);
      if (session.commHistory) setCommMessages(session.commHistory);
      if (session.sharedEvidence) setSharedEvidence(session.sharedEvidence);

      // Rebuild message history — server already filtered for this player
      const restored: DisplayMessage[] = session.history.map((m, i) => ({
        id: `restored_${i}`,
        role: ((m as any).messageType === 'observed' ? 'observed' : m.role) as DisplayMessage['role'],
        content: m.content,
        playerId: m.playerId,
        playerName: m.playerName,
        playerColor: m.playerColor,
        timestamp: Date.now(),
      }));
      setMessages(restored);
      msgIdCounter.current = restored.length;
    });

    socket.on('session:error', ({ message }) => {
      setError(message);
      setToast(message);
      setTimeout(() => setToast(null), 3000);
    });

    /* -- Game start event -- */
    socket.on('game:started', ({ players: startedPlayers }) => {
      setGameState('playing');
      setPlayers(startedPlayers);
    });

    /* -- Scenario voting events -- */
    socket.on('scenario:updated', ({ selectedScenarioId: sel, votes }) => {
      setSelectedScenarioId(sel);
      setScenarioVotes(votes);
    });

    /* -- Communication events -- */
    socket.on('comm:message', (msg: CommMessageDTO) => {
      setCommMessages((prev) => [...prev, msg]);
      setUnreadComm((prev) => prev + 1);
    });

    /* -- Player state updates (after MOVE/PICKUP directives) -- */
    socket.on('players:updated', ({ players: updatedPlayers }) => {
      setPlayers(updatedPlayers);
    });

    /* -- Evidence sharing events -- */
    socket.on('evidence:shared', (entry) => {
      setSharedEvidence((prev) => {
        if (prev.some((s) => s.evidenceId === entry.evidenceId)) return prev;
        return [...prev, entry];
      });
    });

    /* -- Accusation voting events (#25) -- */
    socket.on('accusation:vote-started', ({ proposerId, proposerName, suspectId, suspectName, expiresAt }) => {
      setActiveVote({ proposerId, proposerName, suspectId, suspectName, expiresAt });
      addMessage({
        role: 'system',
        content: `**${proposerName}** proposed accusing **${suspectName}**. All players must vote.`,
        timestamp: Date.now(),
      });
    });

    socket.on('accusation:vote-result', ({ result, isCorrect, summary }) => {
      setActiveVote(null);
      const label = result === 'guilty' ? 'GUILTY' : 'NOT GUILTY';
      const verdict = summary ?? `Vote result: ${label}.`;
      addMessage({
        role: 'system',
        content: isCorrect === undefined
          ? verdict
          : `${verdict} ${isCorrect ? '— The team was right.' : '— The team was wrong.'}`,
        timestamp: Date.now(),
      });
    });

    /* -- Game over (#25) -- */
    socket.on('session:gameover', ({ status, endReason, summary }) => {
      setGameOver({ status, endReason, summary });
      setGameState('ended');
    });

    /* -- Procedural story generation events (Velvet Shadow v2) -- */
    socket.on('story:status', (data) => {
      setStoryStatus(data);
    });

    socket.on('story:ready', (data) => {
      setWorldMeta({
        title: data.world.title,
        setting: data.world.setting,
        centralMystery: data.world.centralMystery,
        openingNarration: data.world.openingNarration,
        ambientTrack: data.world.ambientTrack,
        tone: data.world.tone,
        openingImageUrl: data.openingImageUrl,
        rooms: data.rooms,
        npcs: data.npcs,
        evidenceItems: data.evidenceItems,
      });
    });

    socket.on('story:image-ready', (data) => {
      if (data.kind === 'room') {
        setRoomImages((prev) => ({ ...prev, [data.id]: data.url }));
      } else if (data.kind === 'npc') {
        setNpcPortraits((prev) => ({ ...prev, [data.id]: data.url }));
      }
    });

    /* -- Connect -- */
    socket.connect();

    /* -- Cleanup -- */
    return () => {
      socket.removeAllListeners();
      disconnectSocket();
      socketRef.current = null;
    };
  }, [sessionId, addMessage, enabled]);

  /* ---- Public actions ---- */

  const joinSession = useCallback(
    async (playerName: string): Promise<boolean> => {
      const socket = socketRef.current;
      if (!socket?.connected) { setError('Not connected to server'); return false; }

      return new Promise((resolve) => {
        socket.emit('player:join', { sessionId, playerName }, (resp) => {
          if (resp.success && resp.playerId) {
            setMyPlayerId(resp.playerId);
            saveIdentity({ sessionId, playerId: resp.playerId, playerName });
            setError(null);
            resolve(true);
          } else {
            setError(resp.error || 'Failed to join session');
            resolve(false);
          }
        });
      });
    },
    [sessionId],
  );

  const sendAction = useCallback(
    (message: string) => {
      const socket = socketRef.current;
      if (!socket?.connected || !myPlayerId) return;
      socket.emit('player:action', { sessionId, playerId: myPlayerId, message });
    },
    [sessionId, myPlayerId],
  );

  const sendRoomMessage = useCallback(
    (content: string) => {
      const socket = socketRef.current;
      if (!socket?.connected || !myPlayerId) return;
      socket.emit('comm:room', { sessionId, playerId: myPlayerId, content });
    },
    [sessionId, myPlayerId],
  );

  const sendDirectMessage = useCallback(
    (targetPlayerId: string, content: string) => {
      const socket = socketRef.current;
      if (!socket?.connected || !myPlayerId) return;
      socket.emit('comm:direct', { sessionId, playerId: myPlayerId, targetPlayerId, content });
    },
    [sessionId, myPlayerId],
  );

  const clearUnreadComm = useCallback(() => {
    setUnreadComm(0);
  }, []);

  const selectScenario = useCallback(
    (scenarioId: string) => {
      const socket = socketRef.current;
      if (!socket?.connected || !myPlayerId) return;
      socket.emit('scenario:select', { sessionId, playerId: myPlayerId, scenarioId });
    },
    [sessionId, myPlayerId],
  );

  const voteScenario = useCallback(
    (scenarioId: string) => {
      const socket = socketRef.current;
      if (!socket?.connected || !myPlayerId) return;
      socket.emit('scenario:vote', { sessionId, playerId: myPlayerId, scenarioId });
    },
    [sessionId, myPlayerId],
  );

  const confirmScenario = useCallback(
    async (scenarioId: string): Promise<boolean> => {
      const socket = socketRef.current;
      if (!socket?.connected || !myPlayerId) { setError('Not connected to server'); return false; }
      return new Promise((resolve) => {
        socket.emit('scenario:confirm', { sessionId, playerId: myPlayerId, scenarioId }, (resp) => {
          if (resp.success) { setError(null); resolve(true); }
          else { setError(resp.error || 'Failed to confirm scenario'); resolve(false); }
        });
      });
    },
    [sessionId, myPlayerId],
  );

  const startGame = useCallback(
    async (): Promise<boolean> => {
      const socket = socketRef.current;
      if (!socket?.connected || !myPlayerId) { setError('Not connected to server'); return false; }
      return new Promise((resolve) => {
        socket.emit('game:start', { sessionId, playerId: myPlayerId }, (resp) => {
          if (resp.success) { setError(null); resolve(true); }
          else { setError(resp.error || 'Failed to start game'); resolve(false); }
        });
      });
    },
    [sessionId, myPlayerId],
  );

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      const socket = socketRef.current;
      if (!socket?.connected || !myPlayerId) return;
      socket.emit('player:typing', { sessionId, playerId: myPlayerId, isTyping });
    },
    [sessionId, myPlayerId],
  );

  const shareEvidence = useCallback(
    (evidenceId: string) => {
      const socket = socketRef.current;
      if (!socket?.connected || !myPlayerId) return;
      socket.emit('evidence:share', { sessionId, playerId: myPlayerId, evidenceId });
    },
    [sessionId, myPlayerId],
  );

  const proposeAccusation = useCallback(
    async (suspectId: string): Promise<boolean> => {
      const socket = socketRef.current;
      if (!socket?.connected || !myPlayerId) { setError('Not connected to server'); return false; }
      return new Promise((resolve) => {
        socket.emit('player:propose-accusation', { sessionId, playerId: myPlayerId, suspectId }, (resp) => {
          if (resp.success) { setError(null); resolve(true); }
          else { setError(resp.error || 'Failed to propose accusation'); setToast(resp.error || 'Failed to propose accusation'); setTimeout(() => setToast(null), 3000); resolve(false); }
        });
      });
    },
    [sessionId, myPlayerId],
  );

  const voteAccusation = useCallback(
    async (vote: 'guilty' | 'not_guilty'): Promise<boolean> => {
      const socket = socketRef.current;
      if (!socket?.connected || !myPlayerId) return false;
      setActiveVote((prev) => (prev ? { ...prev, myVote: vote } : prev));
      return new Promise((resolve) => {
        socket.emit('player:vote-accusation', { sessionId, playerId: myPlayerId, vote }, (resp) => {
          resolve(resp.success);
        });
      });
    },
    [sessionId, myPlayerId],
  );

  const generateStory = useCallback(
    async (hostPrompt: string): Promise<boolean> => {
      const socket = socketRef.current;
      if (!socket?.connected || !myPlayerId) { setError('Sunucuya bağlı değil'); return false; }
      return new Promise((resolve) => {
        socket.emit('story:generate', { sessionId, playerId: myPlayerId, hostPrompt }, (resp) => {
          if (resp.success) { setError(null); resolve(true); }
          else {
            setError(resp.error || 'Hikaye oluşturulamadı');
            setToast(resp.error || 'Hikaye oluşturulamadı');
            setTimeout(() => setToast(null), 3000);
            resolve(false);
          }
        });
      });
    },
    [sessionId, myPlayerId],
  );

  /* ---- Return ---- */

  return {
    players,
    messages,
    commMessages,
    suggestions,
    streamingText,
    typingPlayers,
    isNarratorStreaming,
    batchInfo,
    isConnected,
    error,
    myPlayerId,
    gameState,
    isReconnecting,
    toast,
    selectedScenarioId,
    scenarioVotes,
    unreadComm,
    sharedEvidence,
    activeVote,
    gameOver,
    storyStatus,
    worldMeta,
    roomImages,
    npcPortraits,

    joinSession,
    selectScenario,
    voteScenario,
    confirmScenario,
    startGame,
    sendAction,
    sendRoomMessage,
    sendDirectMessage,
    clearUnreadComm,
    sendTyping,
    shareEvidence,
    proposeAccusation,
    voteAccusation,
    generateStory,
  };
}
