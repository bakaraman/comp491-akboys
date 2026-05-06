/**
 * SessionStore.ts — In-memory session management
 *
 * Defines the SessionData and SessionStore interfaces together with a
 * concrete MemorySessionStore implementation backed by a Map.
 * Supports both single-player (legacy) and multiplayer sessions.
 *
 * @author AKBOYS Team
 * @since 2026-03-12
 */

import { v4 as uuidv4 } from 'uuid';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type {
  ChatMessage,
  GameState,
  MultiplayerChatMessage,
  PlayerData,
  PlayerAction,
  PlayerColor,
  CommMessageDTO,
  WorldStateEvent,
  AccusationVote,
  NPCState,
  WorldData,
  ReconstructionDTO,
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
  gameState: GameState;

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

  /* Evidence shared by players in multiplayer */
  sharedEvidence: Array<{
    evidenceId: string;
    sharedByPlayerId: string;
    sharedByPlayerName: string;
    sharedByPlayerColor: string;
    timestamp: number;
  }>;

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

  /** Runtime NPC states — persistent across all player interactions (#19, #39) */
  npcStates: Map<string, NPCState>;

  /** Active accusation vote, null when no vote in progress (#25) */
  activeAccusation: AccusationVote | null;

  /** Multiplayer turn counter — incremented after each action batch (#25) */
  mpTurnCount: number;

  /* ─────────── Procedural world (Velvet Shadow v2) ─────────── */

  /** Host's theme prompt (empty = surprise) */
  hostPrompt: string;

  /** AI-generated world (null until story:generate completes) */
  world: WorldData | null;

  /** Opening atmosphere image URL (null until ready) */
  openingImageUrl: string | null;

  /** Per-room generated image URLs (null until ready) */
  roomImages: Record<string, string | null>;

  /** Per-NPC generated portrait URLs (null until ready) */
  npcPortraits: Record<string, string | null>;

  /** Whether opening is ready (image + TTS if used) — game can start */
  openingReady: boolean;

  /**
   * A.3: Cached crime-scene reconstruction. Generated lazily after the game
   * ends, on first request from the client. Cached so re-opening the
   * "Show Reconstruction" modal doesn't re-burn an LLM call.
   */
  reconstruction: ReconstructionDTO | null;
}

/** Contract every session store must satisfy */
export interface SessionStore {
  create(
    scenarioId: string,
    maxPlayers?: number,
    roomCode?: string,
    startRoomId?: string,
  ): SessionData;
  get(id: string): SessionData | undefined;
  getByRoomCode(code: string): SessionData | undefined;
  addMessage(id: string, msg: MultiplayerChatMessage): void;
  updateGameState(
    id: string,
    updates: Partial<Omit<GameState, 'conversationHistory'>>,
  ): void;
  hydrate(): Promise<void>;
  sync(sessionId: string): Promise<void>;
  delete(id: string): void;

  /* Player management */
  addPlayer(sessionId: string, player: PlayerData): void;
  removePlayer(sessionId: string, playerId: string): void;
  getPlayer(sessionId: string, playerId: string): PlayerData | undefined;
  updatePlayer(sessionId: string, playerId: string, updates: Partial<PlayerData>): void;

  /* Action queue */
  queueAction(sessionId: string, action: PlayerAction): void;
  drainActionQueue(sessionId: string): PlayerAction[];

  /* Procedural world helpers */
  setHostPrompt(sessionId: string, prompt: string): void;
  setWorld(sessionId: string, world: WorldData): void;
  setOpeningImage(sessionId: string, url: string | null): void;
  setRoomImage(sessionId: string, roomId: string, url: string | null): void;
  setNpcPortrait(sessionId: string, npcId: string, url: string | null): void;
  markOpeningReady(sessionId: string): void;

  /** A.3: Cache the reconstruction payload generated post-game. */
  setReconstruction(sessionId: string, data: ReconstructionDTO): void;
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
  protected sessions: Map<string, SessionData> = new Map();
  protected roomCodeIndex: Map<string, string> = new Map(); // roomCode -> sessionId
  protected cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private static readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // check every 5 minutes

  create(
    scenarioId: string,
    maxPlayers: number = 4,
    roomCode?: string,
    startRoomId: string = 'start',
  ): SessionData {
    const now = Date.now();
    const session: SessionData = {
      id: uuidv4(),
      scenarioId,
      roomCode,
      history: [],
      createdAt: now,
      lastActivityAt: now,
      gameState: {
        currentRoomId: startRoomId,
        inventory: [],
        visitedRooms: startRoomId === 'start' ? [] : [startRoomId],
        conversationHistory: [],
        isGameOver: false,
        status: 'playing',
        turnCount: 0,
        discoveredEvidence: [],
      },
      players: new Map(),
      actionQueue: [],
      maxPlayers,
      state: maxPlayers === 1 ? 'playing' : roomCode ? 'voting' : 'lobby',
      isStreaming: false,
      selectedScenarioId: null,
      scenarioVotes: new Map(),
      commHistory: [],
      sharedEvidence: [],
      worldStateLog: [],
      worldStateEvents: [],
      objectStates: new Map(),
      npcStates: new Map(),
      activeAccusation: null,
      mpTurnCount: 0,
      hostPrompt: '',
      world: null,
      openingImageUrl: null,
      roomImages: {},
      npcPortraits: {},
      openingReady: false,
      reconstruction: null,
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
    session.gameState.conversationHistory = [...session.history];
  }

  updateGameState(
    id: string,
    updates: Partial<Omit<GameState, 'conversationHistory'>>,
  ): void {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }

    const gameState = session.gameState;

    if (updates.currentRoomId !== undefined) {
      gameState.currentRoomId = updates.currentRoomId;
      if (!gameState.visitedRooms.includes(updates.currentRoomId)) {
        gameState.visitedRooms = [...gameState.visitedRooms, updates.currentRoomId];
      }
    }

    if (updates.inventory !== undefined) {
      gameState.inventory = [...updates.inventory];
    }

    if (updates.visitedRooms !== undefined) {
      gameState.visitedRooms = [...updates.visitedRooms];
    }

    if (updates.isGameOver !== undefined) {
      gameState.isGameOver = updates.isGameOver;
    }

    if (updates.status !== undefined) {
      gameState.status = updates.status;
    }

    if (updates.turnCount !== undefined) {
      gameState.turnCount = updates.turnCount;
    }

    if (updates.discoveredEvidence !== undefined) {
      gameState.discoveredEvidence = [...updates.discoveredEvidence];
    }

    if (updates.endReason !== undefined) {
      gameState.endReason = updates.endReason;
    }
  }

  async hydrate(): Promise<void> {
    // no-op for memory store
  }

  async sync(_sessionId: string): Promise<void> {
    // no-op for memory store
  }

  delete(id: string): void {
    const session = this.sessions.get(id);
    if (session?.roomCode) {
      this.roomCodeIndex.delete(session.roomCode);
    }
    this.sessions.delete(id);
  }

  /** Start the periodic cleanup timer if not already running */
  protected startCleanupIfNeeded(): void {
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

  /* ─────────── Procedural world helpers ─────────── */

  setHostPrompt(sessionId: string, prompt: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.hostPrompt = prompt;
    session.lastActivityAt = Date.now();
  }

  setWorld(sessionId: string, world: WorldData): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.world = world;
    // Initialize per-room / per-NPC image slots as null.
    session.roomImages = Object.fromEntries(world.rooms.map((r) => [r.id, null]));
    session.npcPortraits = Object.fromEntries(world.npcs.map((n) => [n.id, null]));
    session.lastActivityAt = Date.now();
  }

  setOpeningImage(sessionId: string, url: string | null): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.openingImageUrl = url;
    session.lastActivityAt = Date.now();
  }

  setRoomImage(sessionId: string, roomId: string, url: string | null): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.roomImages[roomId] = url;
    session.lastActivityAt = Date.now();
  }

  setNpcPortrait(sessionId: string, npcId: string, url: string | null): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.npcPortraits[npcId] = url;
    session.lastActivityAt = Date.now();
  }

  markOpeningReady(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.openingReady = true;
    session.lastActivityAt = Date.now();
  }

  setReconstruction(sessionId: string, data: ReconstructionDTO): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.reconstruction = data;
    session.lastActivityAt = Date.now();
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

interface StoredSessionData {
  id: string;
  scenarioId: string;
  roomCode?: string;
  history: MultiplayerChatMessage[];
  createdAt: number;
  lastActivityAt: number;
  gameState: GameState;
  players: PlayerData[];
  actionQueue: PlayerAction[];
  maxPlayers: number;
  state: 'lobby' | 'voting' | 'playing' | 'ended';
  isStreaming: boolean;
  selectedScenarioId: string | null;
  scenarioVotes: Record<string, string[]>;
  commHistory: CommMessageDTO[];
  sharedEvidence: Array<{
    evidenceId: string;
    sharedByPlayerId: string;
    sharedByPlayerName: string;
    sharedByPlayerColor: string;
    timestamp: number;
  }>;
  worldStateLog: string[];
  worldStateEvents: WorldStateEvent[];
  objectStates: Record<string, Record<string, boolean>>;
  npcStates: Array<{ id: string; disposition: string; memories: string[]; metPlayers: string[]; currentRoomId: string }>;
  activeAccusation: { proposerId: string; proposerName: string; suspectId: string; suspectName: string; votes: Record<string, string>; startedAt: number; expiresAt: number } | null;
  mpTurnCount: number;
  hostPrompt?: string;
  world?: WorldData | null;
  openingImageUrl?: string | null;
  roomImages?: Record<string, string | null>;
  npcPortraits?: Record<string, string | null>;
  openingReady?: boolean;
  reconstruction?: ReconstructionDTO | null;
}

function serializeSession(session: SessionData): StoredSessionData {
  return {
    id: session.id,
    scenarioId: session.scenarioId,
    roomCode: session.roomCode,
    history: session.history,
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
    gameState: session.gameState,
    players: Array.from(session.players.values()),
    actionQueue: session.actionQueue,
    maxPlayers: session.maxPlayers,
    state: session.state,
    isStreaming: session.isStreaming,
    selectedScenarioId: session.selectedScenarioId,
    scenarioVotes: Object.fromEntries(
      Array.from(session.scenarioVotes.entries()).map(([key, value]) => [key, [...value]]),
    ),
    commHistory: session.commHistory,
    sharedEvidence: session.sharedEvidence,
    worldStateLog: session.worldStateLog,
    worldStateEvents: session.worldStateEvents,
    objectStates: Object.fromEntries(session.objectStates.entries()),
    npcStates: Array.from(session.npcStates.values()),
    activeAccusation: session.activeAccusation
      ? {
          proposerId: session.activeAccusation.proposerId,
          proposerName: session.activeAccusation.proposerName,
          suspectId: session.activeAccusation.suspectId,
          suspectName: session.activeAccusation.suspectName,
          votes: Object.fromEntries(session.activeAccusation.votes.entries()),
          startedAt: session.activeAccusation.startedAt,
          expiresAt: session.activeAccusation.expiresAt,
        }
      : null,
    mpTurnCount: session.mpTurnCount,
    hostPrompt: session.hostPrompt,
    world: session.world,
    openingImageUrl: session.openingImageUrl,
    roomImages: session.roomImages,
    npcPortraits: session.npcPortraits,
    openingReady: session.openingReady,
    reconstruction: session.reconstruction,
  };
}

function deserializeSession(data: StoredSessionData): SessionData {
  return {
    id: data.id,
    scenarioId: data.scenarioId,
    roomCode: data.roomCode,
    history: data.history || [],
    createdAt: data.createdAt,
    lastActivityAt: data.lastActivityAt,
    gameState: data.gameState,
    players: new Map((data.players || []).map((player) => [player.id, player])),
    actionQueue: data.actionQueue || [],
    maxPlayers: data.maxPlayers,
    state: data.state,
    isStreaming: data.isStreaming,
    selectedScenarioId: data.selectedScenarioId ?? null,
    scenarioVotes: new Map(
      Object.entries(data.scenarioVotes || {}).map(([key, value]) => [key, new Set(value)]),
    ),
    commHistory: data.commHistory || [],
    sharedEvidence: data.sharedEvidence || [],
    worldStateLog: data.worldStateLog || [],
    worldStateEvents: data.worldStateEvents || [],
    objectStates: new Map(Object.entries(data.objectStates || {})),
    npcStates: new Map((data.npcStates || []).map((npc) => [
      npc.id,
      {
        id: npc.id,
        disposition: npc.disposition as NPCState['disposition'],
        memories: npc.memories || [],
        metPlayers: npc.metPlayers || [],
        currentRoomId: npc.currentRoomId,
      },
    ])),
    activeAccusation: data.activeAccusation
      ? {
          proposerId: data.activeAccusation.proposerId,
          proposerName: data.activeAccusation.proposerName,
          suspectId: data.activeAccusation.suspectId,
          suspectName: data.activeAccusation.suspectName,
          votes: new Map(Object.entries(data.activeAccusation.votes || {})) as Map<string, 'guilty' | 'not_guilty'>,
          startedAt: data.activeAccusation.startedAt,
          expiresAt: data.activeAccusation.expiresAt,
        }
      : null,
    mpTurnCount: data.mpTurnCount || 0,
    hostPrompt: data.hostPrompt ?? '',
    world: data.world ?? null,
    openingImageUrl: data.openingImageUrl ?? null,
    roomImages: data.roomImages ?? {},
    npcPortraits: data.npcPortraits ?? {},
    openingReady: data.openingReady ?? false,
    reconstruction: data.reconstruction ?? null,
  };
}

export class FirestoreSessionStore extends MemorySessionStore {
  private db = (() => {
    if (getApps().length === 0) {
      initializeApp({
        credential: applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    }
    const firestore = getFirestore();
    firestore.settings({ ignoreUndefinedProperties: true });
    return firestore;
  })();

  private collectionName = 'sessions';

  async hydrate(): Promise<void> {
    const snapshot = await this.db.collection(this.collectionName).get();
    this.sessions.clear();
    this.roomCodeIndex.clear();

    snapshot.forEach((doc) => {
      const session = deserializeSession(doc.data() as StoredSessionData);
      this.sessions.set(session.id, session);
      if (session.roomCode) {
        this.roomCodeIndex.set(session.roomCode, session.id);
      }
    });

    if (this.sessions.size > 0) {
      this.startCleanupIfNeeded();
    }
  }

  async sync(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      await this.db.collection(this.collectionName).doc(sessionId).delete().catch(() => {});
      return;
    }

    await this.db.collection(this.collectionName).doc(sessionId).set(serializeSession(session));
  }

  override create(
    scenarioId: string,
    maxPlayers: number = 4,
    roomCode?: string,
    startRoomId: string = 'start',
  ): SessionData {
    const session = super.create(scenarioId, maxPlayers, roomCode, startRoomId);
    void this.sync(session.id);
    return session;
  }

  override addMessage(id: string, msg: MultiplayerChatMessage): void {
    super.addMessage(id, msg);
    void this.sync(id);
  }

  override updateGameState(
    id: string,
    updates: Partial<Omit<GameState, 'conversationHistory'>>,
  ): void {
    super.updateGameState(id, updates);
    void this.sync(id);
  }

  override delete(id: string): void {
    super.delete(id);
    void this.sync(id);
  }

  override addPlayer(sessionId: string, player: PlayerData): void {
    super.addPlayer(sessionId, player);
    void this.sync(sessionId);
  }

  override removePlayer(sessionId: string, playerId: string): void {
    super.removePlayer(sessionId, playerId);
    void this.sync(sessionId);
  }

  override updatePlayer(sessionId: string, playerId: string, updates: Partial<PlayerData>): void {
    super.updatePlayer(sessionId, playerId, updates);
    void this.sync(sessionId);
  }

  override queueAction(sessionId: string, action: PlayerAction): void {
    super.queueAction(sessionId, action);
    void this.sync(sessionId);
  }

  override drainActionQueue(sessionId: string): PlayerAction[] {
    const actions = super.drainActionQueue(sessionId);
    void this.sync(sessionId);
    return actions;
  }

  override setHostPrompt(sessionId: string, prompt: string): void {
    super.setHostPrompt(sessionId, prompt);
    void this.sync(sessionId);
  }

  override setWorld(sessionId: string, world: WorldData): void {
    super.setWorld(sessionId, world);
    void this.sync(sessionId);
  }

  override setOpeningImage(sessionId: string, url: string | null): void {
    super.setOpeningImage(sessionId, url);
    void this.sync(sessionId);
  }

  override setRoomImage(sessionId: string, roomId: string, url: string | null): void {
    super.setRoomImage(sessionId, roomId, url);
    void this.sync(sessionId);
  }

  override setNpcPortrait(sessionId: string, npcId: string, url: string | null): void {
    super.setNpcPortrait(sessionId, npcId, url);
    void this.sync(sessionId);
  }

  override markOpeningReady(sessionId: string): void {
    super.markOpeningReady(sessionId);
    void this.sync(sessionId);
  }

  override setReconstruction(sessionId: string, data: ReconstructionDTO): void {
    super.setReconstruction(sessionId, data);
    void this.sync(sessionId);
  }
}
