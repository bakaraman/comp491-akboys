/**
 * game.ts — Core game type definitions
 *
 * All shared types for the text adventure game.
 * Used by both server and web packages.
 *
 * @author AK Boys Team
 * @since 2026-03-12
 */

/** A single room in the game world */
export interface Room {
  id: string;
  name: string;
  description: string;
  exits: Record<string, string>;   // direction -> roomId
  items: string[];
  npcs: string[];
}

/** A non-player character */
export interface NPC {
  id: string;
  name: string;
  description: string;
  roomId: string;
  dialogue: string[];
}

/** An item in the game world */
export interface Item {
  id: string;
  name: string;
  description: string;
  roomId: string;
  isEvidence: boolean;
}

/** The full scenario generated before a game session */
export interface Scenario {
  title: string;
  setting: string;
  rooms: Room[];
  npcs: NPC[];
  items: Item[];
  synopsis: string;
  maxTurns: number;
  solution: {
    culpritId: string;
    evidenceId: string;
    requiredEvidenceIds: string[];
  };
}

/** Player state during a game session */
export interface GameState {
  currentRoomId: string;
  inventory: string[];
  visitedRooms: string[];
  conversationHistory: ChatMessage[];
  isGameOver: boolean;
  status: 'playing' | 'won' | 'lost';
  turnCount: number;
  discoveredEvidence: string[];
  endReason?: 'solved' | 'wrong_accusation' | 'turn_limit' | 'fatal_choice';
}

/** A single chat message between player and narrator */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

/** API request to send a player action */
export interface ActionRequest {
  sessionId: string;
  message: string;
}

/** API response from the narrator */
export interface ActionResponse {
  narrative: string;
  gameState: GameState;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Multiplayer types                                                  */
/* ------------------------------------------------------------------ */

/** Predefined player colors for visual distinction */
export const PLAYER_COLORS = [
  '#d4a843', // gold
  '#5ba3cf', // blue
  '#cf5b5b', // red
  '#5bcf7f', // green
] as const;

export type PlayerColor = (typeof PLAYER_COLORS)[number];

/** A single player within a multiplayer session */
export interface PlayerData {
  id: string;
  name: string;
  currentRoomId: string;
  inventory: string[];
  visitedRooms: string[];
  isConnected: boolean;
  color: PlayerColor;
  joinedAt: number;
  lastActiveAt: number;
}

/** A player action queued for batching */
export interface PlayerAction {
  playerId: string;
  playerName: string;
  message: string;
  timestamp: number;
  roomId: string;
}

/** Extended ChatMessage for multiplayer: knows who sent it */
export interface MultiplayerChatMessage extends ChatMessage {
  playerId?: string;
  playerName?: string;
  playerColor?: string;
  /** IDs of players who should see this message on reconnect */
  visibleTo?: string[];
  /** Sub-role for scoped rendering (observed, private, global) */
  messageType?: 'private' | 'observed' | 'global' | 'action';
}

/* ------------------------------------------------------------------ */
/*  World state event types                                            */
/* ------------------------------------------------------------------ */

/** Structured state mutation reported by the narrator */
export interface WorldStateEvent {
  type: 'move' | 'pickup' | 'open' | 'close' | 'unlock' | 'break' | 'reveal' | 'use' | 'remove' | 'state_change';
  playerName: string;
  targetId: string;
  detail?: string;
  roomId: string;
  timestamp: number;
}
