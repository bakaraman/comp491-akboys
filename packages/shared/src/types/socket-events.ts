/**
 * socket-events.ts — Socket.IO event type definitions
 *
 * Shared type contracts for real-time multiplayer communication
 * between the server (socket.io) and web client (socket.io-client).
 *
 * @author AK Boys Team
 * @since 2026-03-23
 */

import type { PlayerData } from './game';

/* ------------------------------------------------------------------ */
/*  DTOs (Data Transfer Objects)                                       */
/* ------------------------------------------------------------------ */

/** Player data sent over the wire (serialisable, no Map/Timer) */
export interface PlayerDataDTO {
  id: string;
  name: string;
  currentRoomId: string;
  inventory: string[];
  visitedRooms: string[];
  isConnected: boolean;
  color: string;
}

/** Full session state sent on reconnect */
export interface SessionStateDTO {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  players: PlayerDataDTO[];
  history: Array<{
    role: string;
    content: string;
    playerId?: string;
    playerName?: string;
    playerColor?: string;
  }>;
  state: 'lobby' | 'playing' | 'ended';
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

  'narrator:chunk': (data: {
    content: string;
    fullText: string;
  }) => void;

  'narrator:done': (data: {
    fullText: string;
    suggestions: string[];
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
}

/* ------------------------------------------------------------------ */
/*  Helper: convert PlayerData → PlayerDataDTO                         */
/* ------------------------------------------------------------------ */

export function toPlayerDTO(p: PlayerData): PlayerDataDTO {
  return {
    id: p.id,
    name: p.name,
    currentRoomId: p.currentRoomId,
    inventory: [...p.inventory],
    visitedRooms: [...p.visitedRooms],
    isConnected: p.isConnected,
    color: p.color,
  };
}
