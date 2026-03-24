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
  CommMessageDTO,
  WorldStateEvent,
} from '@akboys/shared';
import { PLAYER_COLORS } from '@akboys/shared';

/* ------------------------------------------------------------------ */
/*  Interfaces                                                        */
/* ------------------------------------------------------------------ */

/** Data held for a single game session (multiplayer-capable) */
export interface SessionData {
  id: string;
  scenarioId: string;
  roomCode?: string;
  history: MultiplayerChatMessage[];
  createdAt: number;
  lastActivityAt: number;

  /* Multiplayer fields */
  players: Map<string, PlayerData>;
  actionQueue: PlayerAction[];
  maxPlayers: number;
  state: 'lobby' | 'voting' | 'playing' | 'ended';
  isStreaming: boolean;

  /* Scenario voting */
  selectedScenarioId: string | null;
  scenarioVotes: Map<string, Set<string>>;

  /* Communication history (player-to-player, not narrator) */
  commHistory: CommMessageDTO[];

  /* World state log for narrator consistency — human-readable entries */
  worldStateLog: string[];

  /* Structured world state events — for validation and richer tracking */
  worldStateEvents: WorldStateEvent[];

  /**
   * Canonical object/room state flags.
   * Key: "roomId:objectId" or "roomId:__room" for room-level flags.
   * Value: Record of flags, e.g. { open: true, broken: true }
   */
  objectStates: Map<string, Record<string, boolean>>;
}

/** Contract every session store must satisfy */
export interface SessionStore {
  create(scenarioId: string, maxPlayers?: number, roomCode?: string): SessionData;
  get(id: string): SessionData | undefined;
  getByRoomCode(code: string): SessionData | undefined;
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
/*  Room code generator                                                */
/* ------------------------------------------------------------------ */

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion

export function generateRoomCode(existingCodes: Set<string>): string {
  let code: string;
  let attempts = 0;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
    attempts++;
  } while (existingCodes.has(code) && attempts < 100);
  return code;
}

/* ------------------------------------------------------------------ */
/*  Implementation                                                    */
/* ------------------------------------------------------------------ */

/** In-memory session store using a Map */
export class MemorySessionStore implements SessionStore {
  private sessions: Map<string, SessionData> = new Map();
  private roomCodeIndex: Map<string, string> = new Map(); // roomCode -> sessionId
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private static readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // check every 5 minutes

  create(scenarioId: string, maxPlayers: number = 4, roomCode?: string): SessionData {
    const now = Date.now();
    const session: SessionData = {
      id: uuidv4(),
      scenarioId,
      roomCode,
      history: [],
      createdAt: now,
      lastActivityAt: now,
      players: new Map(),
      actionQueue: [],
      maxPlayers,
      state: roomCode ? 'voting' : 'lobby',
      isStreaming: false,
      selectedScenarioId: null,
      scenarioVotes: new Map(),
      commHistory: [],
      worldStateLog: [],
      worldStateEvents: [],
      objectStates: new Map(),
    };

    this.sessions.set(session.id, session);

    if (roomCode) {
      this.roomCodeIndex.set(roomCode, session.id);
    }

    this.startCleanupIfNeeded();
    return session;
  }

  get(id: string): SessionData | undefined {
    return this.sessions.get(id);
  }

  getByRoomCode(code: string): SessionData | undefined {
    const sessionId = this.roomCodeIndex.get(code.toUpperCase());
    if (!sessionId) return undefined;
    return this.sessions.get(sessionId);
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
    const session = this.sessions.get(id);
    if (session?.roomCode) {
      this.roomCodeIndex.delete(session.roomCode);
    }
    this.sessions.delete(id);
  }

  /** Start the periodic cleanup timer if not already running */
  private startCleanupIfNeeded(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;
      for (const [id, session] of this.sessions) {
        if (now - session.lastActivityAt > MemorySessionStore.INACTIVITY_TIMEOUT) {
          if (session.roomCode) {
            this.roomCodeIndex.delete(session.roomCode);
          }
          this.sessions.delete(id);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        console.log(`[cleanup] removed ${cleaned} inactive session(s), ${this.sessions.size} remaining`);
      }
      if (this.sessions.size === 0 && this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }
    }, MemorySessionStore.CLEANUP_INTERVAL);
  }

  /** Get set of existing room codes (for collision check) */
  get existingRoomCodes(): Set<string> {
    return new Set(this.roomCodeIndex.keys());
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

/* ------------------------------------------------------------------ */
/*  Helper: serialize scenario votes for broadcasting                  */
/* ------------------------------------------------------------------ */

export function serializeVotes(
  session: SessionData,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [scenarioId, playerIds] of session.scenarioVotes) {
    const names: string[] = [];
    for (const pid of playerIds) {
      const player = session.players.get(pid);
      if (player) names.push(player.name);
    }
    result[scenarioId] = names;
  }
  return result;
}
