/**
 * SessionStore.ts — In-memory session management
 *
 * Defines the SessionData and SessionStore interfaces together with a
 * concrete MemorySessionStore implementation backed by a Map.
 * Supports both single-player (legacy) and multiplayer sessions.
 *
 * @author AK Boys Team
 * @since 2026-03-12
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ChatMessage,
  MultiplayerChatMessage,
  PlayerData,
  PlayerAction,
  PlayerColor,
} from '@akboys/shared';
import { PLAYER_COLORS } from '@akboys/shared';

/* ------------------------------------------------------------------ */
/*  Interfaces                                                        */
/* ------------------------------------------------------------------ */

/** Data held for a single game session (multiplayer-capable) */
export interface SessionData {
  id: string;
  scenarioId: string;
  history: MultiplayerChatMessage[];
  createdAt: number;
  lastActivityAt: number;

  /* Multiplayer fields */
  players: Map<string, PlayerData>;
  actionQueue: PlayerAction[];
  maxPlayers: number;
  state: 'lobby' | 'playing' | 'ended';
  isStreaming: boolean;
}

/** Contract every session store must satisfy */
export interface SessionStore {
  create(scenarioId: string, maxPlayers?: number): SessionData;
  get(id: string): SessionData | undefined;
  addMessage(id: string, msg: MultiplayerChatMessage): void;
  delete(id: string): void;

  /* Player management */
  addPlayer(sessionId: string, player: PlayerData): void;
  removePlayer(sessionId: string, playerId: string): void;
  getPlayer(sessionId: string, playerId: string): PlayerData | undefined;
  updatePlayer(sessionId: string, playerId: string, updates: Partial<PlayerData>): void;

  /* Action queue */
  queueAction(sessionId: string, action: PlayerAction): void;
  drainActionQueue(sessionId: string): PlayerAction[];
}

/* ------------------------------------------------------------------ */
/*  Implementation                                                    */
/* ------------------------------------------------------------------ */

/** In-memory session store using a Map */
export class MemorySessionStore implements SessionStore {
  private sessions: Map<string, SessionData> = new Map();

  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private static readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // check every 5 minutes

  create(scenarioId: string, maxPlayers: number = 4): SessionData {
    const now = Date.now();
    const session: SessionData = {
      id: uuidv4(),
      scenarioId,
      history: [],
      createdAt: now,
      lastActivityAt: now,
      players: new Map(),
      actionQueue: [],
      maxPlayers,
      state: 'lobby',
      isStreaming: false,
    };

    this.sessions.set(session.id, session);
    this.startCleanupIfNeeded();
    return session;
  }

  /** Start the periodic cleanup timer if not already running */
  private startCleanupIfNeeded(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;
      for (const [id, session] of this.sessions) {
        if (now - session.lastActivityAt > MemorySessionStore.INACTIVITY_TIMEOUT) {
          this.sessions.delete(id);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        console.log(`[cleanup] removed ${cleaned} inactive session(s), ${this.sessions.size} remaining`);
      }
      // Stop timer if no sessions left
      if (this.sessions.size === 0 && this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }
    }, MemorySessionStore.CLEANUP_INTERVAL);
  }

  get(id: string): SessionData | undefined {
    return this.sessions.get(id);
  }

  addMessage(id: string, msg: MultiplayerChatMessage): void {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }
    session.history.push(msg);
    session.lastActivityAt = Date.now();
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }

  /* -------------------------------------------------------------- */
  /*  Player management                                              */
  /* -------------------------------------------------------------- */

  addPlayer(sessionId: string, player: PlayerData): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (session.players.size >= session.maxPlayers) {
      throw new Error(`Session is full (${session.maxPlayers}/${session.maxPlayers} players)`);
    }
    session.players.set(player.id, player);
    session.lastActivityAt = Date.now();
  }

  removePlayer(sessionId: string, playerId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.players.delete(playerId);
  }

  getPlayer(sessionId: string, playerId: string): PlayerData | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    return session.players.get(playerId);
  }

  updatePlayer(sessionId: string, playerId: string, updates: Partial<PlayerData>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const player = session.players.get(playerId);
    if (!player) return;

    session.players.set(playerId, { ...player, ...updates });
  }

  /* -------------------------------------------------------------- */
  /*  Action queue                                                   */
  /* -------------------------------------------------------------- */

  queueAction(sessionId: string, action: PlayerAction): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.actionQueue.push(action);
  }

  drainActionQueue(sessionId: string): PlayerAction[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const actions = [...session.actionQueue];
    session.actionQueue = [];
    return actions;
  }
}

/* ------------------------------------------------------------------ */
/*  Helper: assign next available color to a new player               */
/* ------------------------------------------------------------------ */

export function nextPlayerColor(session: SessionData): PlayerColor {
  const usedColors = new Set(
    Array.from(session.players.values()).map((p) => p.color),
  );
  const available = PLAYER_COLORS.find((c) => !usedColors.has(c));
  return available ?? PLAYER_COLORS[session.players.size % PLAYER_COLORS.length];
}
