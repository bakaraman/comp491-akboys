/**
 * socket-events.ts — Socket.IO event type definitions
 *
 * Shared type contracts for real-time multiplayer communication
 * between the server (socket.io) and web client (socket.io-client).
 *
 * @author AKBOYS Team
 * @since 2026-03-23
 */

import type { PlayerData, PlayerRole } from './game.js';

/* ------------------------------------------------------------------ */
/*  DTOs (Data Transfer Objects)                                       */
/* ------------------------------------------------------------------ */

/** Player data sent over the wire (serialisable, no Map/Timer) */
export interface PlayerDataDTO {
  id: string;
  name: string;
  role?: string;
  sanity: number;
  maxSanity: number;
  currentRoomId: string;
  inventory: string[];
  visitedRooms: string[];
  isConnected: boolean;
  color: string;
}

/** A communication message between players (NOT narrator) */
export interface CommMessageDTO {
  id: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  content: string;
  timestamp: number;
  mode: 'room' | 'direct';
  /** For direct messages: the target player id */
  targetPlayerId?: string;
  targetPlayerName?: string;
  /** The room the sender was in when sending (for room messages) */
  roomId: string;
  /** Audience snapshot — player IDs who should see this on reconnect */
  visibleTo: string[];
}

/** Full session state sent on reconnect */
export interface SessionStateDTO {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  roomCode?: string;
  players: PlayerDataDTO[];
  history: Array<{
    role: string;
    content: string;
    playerId?: string;
    playerName?: string;
    playerColor?: string;
  }>;
  state: 'lobby' | 'voting' | 'playing' | 'ended';
  selectedScenarioId?: string | null;
  scenarioVotes?: Record<string, string[]>;
  commHistory?: CommMessageDTO[];
  sharedEvidence?: Array<{
    evidenceId: string;
    sharedByPlayerId: string;
    sharedByPlayerName: string;
    sharedByPlayerColor: string;
    timestamp: number;
  }>;
}

/* ------------------------------------------------------------------ */
/*  Client → Server events                                             */
/* ------------------------------------------------------------------ */

export interface ClientToServerEvents {
  'player:join': (
    data: { sessionId: string; playerName: string },
    callback: (response: { success: boolean; playerId?: string; error?: string }) => void,
  ) => void;

  'player:action': (data: {
    sessionId: string;
    playerId: string;
    message: string;
  }) => void;

  'player:typing': (data: {
    sessionId: string;
    playerId: string;
    isTyping: boolean;
  }) => void;

  'player:rejoin': (
    data: { sessionId: string; playerId: string },
    callback: (response: { success: boolean; error?: string }) => void,
  ) => void;

  'game:start': (
    data: { sessionId: string; playerId: string },
    callback: (response: { success: boolean; error?: string }) => void,
  ) => void;

  'scenario:select': (data: {
    sessionId: string;
    playerId: string;
    scenarioId: string;
  }) => void;

  'scenario:vote': (data: {
    sessionId: string;
    playerId: string;
    scenarioId: string;
  }) => void;

  'scenario:confirm': (
    data: { sessionId: string; playerId: string; scenarioId: string },
    callback: (response: { success: boolean; error?: string }) => void,
  ) => void;

  /** Room chat: message to all players in sender's current room */
  'comm:room': (data: {
    sessionId: string;
    playerId: string;
    content: string;
  }) => void;

  /** Direct message: targeted to a specific player, any room */
  'comm:direct': (data: {
    sessionId: string;
    playerId: string;
    targetPlayerId: string;
    content: string;
  }) => void;

  /** Share discovered evidence with the team (multiplayer) */
  'evidence:share': (data: {
    sessionId: string;
    playerId: string;
    evidenceId: string;
  }) => void;

  /** Select a player role (#18) */
  'player:select-role': (
    data: { sessionId: string; playerId: string; role: PlayerRole },
    callback: (response: { success: boolean; error?: string }) => void,
  ) => void;

  /** Propose an accusation in multiplayer (#25) */
  'player:propose-accusation': (
    data: { sessionId: string; playerId: string; suspectId: string },
    callback: (response: { success: boolean; error?: string }) => void,
  ) => void;

  /** Vote on an active accusation (#25) */
  'player:vote-accusation': (
    data: { sessionId: string; playerId: string; vote: 'guilty' | 'not_guilty' },
    callback: (response: { success: boolean; error?: string }) => void,
  ) => void;

  /** Host triggers procedural world generation (Velvet Shadow v2) */
  'story:generate': (
    data: { sessionId: string; playerId: string; hostPrompt: string },
    callback: (response: { success: boolean; error?: string }) => void,
  ) => void;
}

/* ------------------------------------------------------------------ */
/*  Server → Client events                                             */
/* ------------------------------------------------------------------ */

export interface ServerToClientEvents {
  'game:started': (data: {
    sessionId: string;
    scenarioTitle: string;
    players: PlayerDataDTO[];
  }) => void;

  /** Scoped narrator streaming — only the target player receives it */
  'narrator:chunk': (data: {
    content: string;
    fullText: string;
    targetPlayerId?: string;
  }) => void;

  /** Scoped narrator done — each player gets their own text + suggestions */
  'narrator:done': (data: {
    fullText: string;
    suggestions: string[];
    targetPlayerId?: string;
  }) => void;

  /** Room observation — third-person line for same-room witnesses */
  'narrator:observed': (data: {
    text: string;
    actorName: string;
    roomId: string;
  }) => void;

  'narrator:error': (data: { message: string }) => void;

  'player:joined': (data: {
    player: PlayerDataDTO;
    allPlayers: PlayerDataDTO[];
  }) => void;

  'player:left': (data: {
    playerId: string;
    playerName: string;
    allPlayers: PlayerDataDTO[];
  }) => void;

  'player:reconnected': (data: {
    playerId: string;
    playerName: string;
    allPlayers: PlayerDataDTO[];
  }) => void;

  'player:typing-update': (data: {
    playerId: string;
    playerName: string;
    isTyping: boolean;
  }) => void;

  'action:queued': (data: {
    playerId: string;
    playerName: string;
    playerColor: string;
    message: string;
    queueSize: number;
    timeRemaining: number;
  }) => void;

  'action:batch-countdown': (data: {
    timeRemaining: number;
    queueSize: number;
  }) => void;

  'session:state': (data: { session: SessionStateDTO }) => void;

  'session:error': (data: { message: string }) => void;

  'scenario:updated': (data: {
    selectedScenarioId: string | null;
    votes: Record<string, string[]>;
  }) => void;

  /** Communication message delivery */
  'comm:message': (data: CommMessageDTO) => void;

  /** Broadcast updated player list after state changes (MOVE, PICKUP, etc.) */
  'players:updated': (data: { players: PlayerDataDTO[] }) => void;

  /** Evidence shared by a teammate */
  'evidence:shared': (data: {
    evidenceId: string;
    sharedByPlayerId: string;
    sharedByPlayerName: string;
    sharedByPlayerColor: string;
    timestamp: number;
  }) => void;

  /** Player role updated (#18) */
  'player:role-updated': (data: {
    playerId: string;
    playerName: string;
    role: string;
    allPlayers: PlayerDataDTO[];
  }) => void;

  /** Accusation vote started (#25) */
  'accusation:vote-started': (data: {
    proposerId: string;
    proposerName: string;
    suspectId: string;
    suspectName: string;
    expiresAt: number;
  }) => void;

  /** Accusation vote result (#25) */
  'accusation:vote-result': (data: {
    result: 'guilty' | 'not_guilty';
    votes: Record<string, 'guilty' | 'not_guilty'>;
    isCorrect?: boolean;
    summary?: string;
  }) => void;

  /** Game over (#25) */
  'session:gameover': (data: {
    status: 'won' | 'lost';
    endReason: 'solved' | 'wrong_accusation' | 'turn_limit' | 'sanity_death';
    summary: string;
  }) => void;

  /** Sanity update (#38) */
  'player:sanity-update': (data: {
    playerId: string;
    sanity: number;
    delta: number;
  }) => void;

  /** Story generation progress updates (procedural world) */
  'story:status': (data: {
    phase: 'queued' | 'generating' | 'validating' | 'image' | 'ready' | 'failed';
    message?: string;
  }) => void;

  /** Full world payload ready (all text content, images may still be loading) */
  'story:ready': (data: {
    openingImageUrl: string | null;
    world: {
      title: string;
      setting: string;
      centralMystery: string;
      openingNarration: string;
      ambientTrack: string;
      tone: string;
    };
    /** Roster of rooms for the minimap. */
    rooms: Array<{
      id: string;
      name: string;
      exits: Record<string, string | null>;
    }>;
    /** Roster of NPCs. */
    npcs: Array<{ id: string; name: string; role: string }>;
    /** Roster of all evidence items (for accuse modal). */
    evidenceItems: Array<{ id: string; name: string }>;
  }) => void;

  /** An async-loaded image finished (opening, room, or NPC portrait) */
  'story:image-ready': (data: {
    kind: 'opening' | 'room' | 'npc';
    id: string;
    url: string;
  }) => void;
}

/* ------------------------------------------------------------------ */
/*  Helper: convert PlayerData → PlayerDataDTO                         */
/* ------------------------------------------------------------------ */

export function toPlayerDTO(p: PlayerData): PlayerDataDTO {
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    sanity: p.sanity,
    maxSanity: p.maxSanity,
    currentRoomId: p.currentRoomId,
    inventory: [...p.inventory],
    visitedRooms: [...p.visitedRooms],
    isConnected: p.isConnected,
    color: p.color,
  };
}
