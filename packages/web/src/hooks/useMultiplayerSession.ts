/**
 * useMultiplayerSession.ts — React hook for multiplayer game sessions
 *
 * Manages the full Socket.IO lifecycle: connect, join/rejoin, listen
 * for events, and expose state + actions to the session page.
 *
 * @author AK Boys Team
 * @since 2026-03-24
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { PlayerDataDTO } from '@akboys/shared';
import { getSocket, disconnectSocket, type GameSocket } from '../lib/socket';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch { /* storage full or blocked */ }
}

function loadIdentity(sessionId: string): StoredIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: StoredIdentity = JSON.parse(raw);
    return parsed.sessionId === sessionId ? parsed : null;
  } catch {
    return null;
  }
}

function clearIdentity(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useMultiplayerSession(sessionId: string) {
  /* ---- State ---- */
  const [players, setPlayers] = useState<PlayerDataDTO[]>([]);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [typingPlayers, setTypingPlayers] = useState<Map<string, string>>(new Map());
  const [isNarratorStreaming, setIsNarratorStreaming] = useState(false);
  const [batchInfo, setBatchInfo] = useState<BatchInfo | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<'lobby' | 'playing' | 'ended'>('lobby');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const socketRef = useRef<GameSocket | null>(null);
  const msgIdCounter = useRef(0);

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
    const socket = getSocket();
    socketRef.current = socket;

    /* -- Connection events -- */
    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);

      // Try to rejoin if we have a stored identity for this session
      const stored = loadIdentity(sessionId);
      if (stored) {
        setIsReconnecting(true);
        socket.emit('player:rejoin', { sessionId, playerId: stored.playerId }, (resp) => {
          setIsReconnecting(false);
          if (resp.success) {
            setMyPlayerId(stored.playerId);
          } else {
            // Identity is stale — clear it
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
        if (isTyping) {
          next.set(playerId, playerName);
        } else {
          next.delete(playerId);
        }
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

    /* -- Narrator events -- */
    socket.on('narrator:chunk', ({ fullText }) => {
      setIsNarratorStreaming(true);
      setStreamingText(fullText);
    });

    socket.on('narrator:done', ({ fullText, suggestions: sugg }) => {
      setIsNarratorStreaming(false);
      setStreamingText('');
      setBatchInfo(null);
      setSuggestions(sugg);
      addMessage({
        role: 'assistant',
        content: fullText,
        timestamp: Date.now(),
      });
    });

    /* -- Session events -- */
    socket.on('session:state', ({ session }) => {
      setPlayers(session.players);
      setGameState(session.state);
      // Rebuild message history from server state
      const restored: DisplayMessage[] = session.history.map((m, i) => ({
        id: `restored_${i}`,
        role: m.role as DisplayMessage['role'],
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
      // Show as toast for transient errors (rate limit etc.)
      setToast(message);
      setTimeout(() => setToast(null), 3000);
    });

    /* -- Game start event -- */
    socket.on('game:started', ({ players: startedPlayers }) => {
      setGameState('playing');
      setPlayers(startedPlayers);
    });

    /* -- Connect -- */
    socket.connect();

    /* -- Cleanup -- */
    return () => {
      socket.removeAllListeners();
      disconnectSocket();
      socketRef.current = null;
    };
  }, [sessionId, addMessage]);

  /* ---- Public actions ---- */

  const joinSession = useCallback(
    async (playerName: string): Promise<boolean> => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        setError('Not connected to server');
        return false;
      }

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

      socket.emit('player:action', {
        sessionId,
        playerId: myPlayerId,
        message,
      });
    },
    [sessionId, myPlayerId],
  );

  const startGame = useCallback(
    async (): Promise<boolean> => {
      const socket = socketRef.current;
      if (!socket?.connected || !myPlayerId) {
        setError('Not connected to server');
        return false;
      }

      return new Promise((resolve) => {
        socket.emit('game:start', { sessionId, playerId: myPlayerId }, (resp) => {
          if (resp.success) {
            setError(null);
            resolve(true);
          } else {
            setError(resp.error || 'Failed to start game');
            resolve(false);
          }
        });
      });
    },
    [sessionId, myPlayerId],
  );

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      const socket = socketRef.current;
      if (!socket?.connected || !myPlayerId) return;

      socket.emit('player:typing', {
        sessionId,
        playerId: myPlayerId,
        isTyping,
      });
    },
    [sessionId, myPlayerId],
  );

  /* ---- Return ---- */

  return {
    // State
    players,
    messages,
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

    // Actions
    joinSession,
    startGame,
    sendAction,
    sendTyping,
  };
}
