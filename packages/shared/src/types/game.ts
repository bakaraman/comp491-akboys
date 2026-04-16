/**
 * game.ts — Core game type definitions
 *
 * All shared types for the text adventure game.
 * Used by both server and web packages.
 *
 * @author AKBOYS Team
 * @since 2026-03-12
 */

/* ------------------------------------------------------------------ */
/*  Player roles (#18)                                                 */
/* ------------------------------------------------------------------ */

/** Available player roles */
export type PlayerRole = 'detective' | 'thief' | 'doctor' | 'journalist';

export interface RoleAbility {
  id: PlayerRole;
  name: string;
  description: string;
  /** Passive bonuses applied automatically */
  passiveEffects: string[];
}

export const PLAYER_ROLES: Record<PlayerRole, RoleAbility> = {
  detective: {
    id: 'detective',
    name: 'Detective',
    description: 'Can propose accusations and gets extra deduction hints',
    passiveEffects: ['can_accuse'],
  },
  thief: {
    id: 'thief',
    name: 'Thief',
    description: 'Can discover hidden rooms and pick locks',
    passiveEffects: ['find_hidden_rooms', 'pick_locks'],
  },
  doctor: {
    id: 'doctor',
    name: 'Doctor',
    description: 'Resists sanity damage and can heal teammates',
    passiveEffects: ['sanity_resistance', 'heal_others'],
  },
  journalist: {
    id: 'journalist',
    name: 'Journalist',
    description: 'Gets extra information from NPCs',
    passiveEffects: ['npc_bonus_info'],
  },
};

/* ------------------------------------------------------------------ */
/*  Game world types                                                   */
/* ------------------------------------------------------------------ */

/** Hidden exit configuration for secret passages (#40) */
export interface HiddenExit {
  targetRoomId: string;
  /** How to discover: 'search' | 'item_required' | 'thief_only' */
  discoverMethod: 'search' | 'item_required' | 'thief_only';
  /** Item ID required (if discoverMethod === 'item_required') */
  requiredItemId?: string;
  /** Description when discovered */
  discoverDescription?: string;
}

/** A single room in the game world */
export interface Room {
  id: string;
  name: string;
  description: string;
  exits: Record<string, string>;   // direction -> roomId
  /** Exits that are hidden until discovered (#40) */
  hiddenExits?: Record<string, HiddenExit>;
  /** Is this room hidden until reached via a hidden exit? (#40) */
  isHidden?: boolean;
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

/** Runtime NPC state — persistent across all player interactions (#19) */
export interface NPCState {
  id: string;
  disposition: 'friendly' | 'neutral' | 'hostile' | 'scared';
  /** Key events that happened with this NPC */
  memories: string[];
  /** Which player names have talked to this NPC */
  metPlayers: string[];
  /** Current room — can change during gameplay (#39) */
  currentRoomId: string;
}

/** An item in the game world */
export interface Item {
  id: string;
  name: string;
  description: string;
  roomId: string;
  isEvidence: boolean;
  /** Evidence IDs that must be discovered before this item can be found (#26) */
  prerequisites?: string[];
  /** Description shown when prerequisites aren't met (#26) */
  lockedDescription?: string;
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
  '#b87ed4', // violet
  '#e89a5a', // orange
  '#6ac9c9', // teal
  '#d46a9c', // rose
  '#a8c95b', // lime
  '#c9c96a', // mustard
] as const;

export type PlayerColor = (typeof PLAYER_COLORS)[number];

/** A single player within a multiplayer session */
export interface PlayerData {
  id: string;
  name: string;
  /** Player's chosen role (#18) */
  role?: PlayerRole;
  /** Current sanity points, 0-100 (#38) */
  sanity: number;
  /** Maximum sanity (#38) */
  maxSanity: number;
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
/*  Accusation / voting types (#25)                                    */
/* ------------------------------------------------------------------ */

/** Active accusation vote in a multiplayer session */
export interface AccusationVote {
  proposerId: string;
  proposerName: string;
  suspectId: string;
  suspectName: string;
  votes: Map<string, 'guilty' | 'not_guilty'>;
  startedAt: number;
  expiresAt: number;
}

/* ------------------------------------------------------------------ */
/*  World state event types                                            */
/* ------------------------------------------------------------------ */

/** Structured state mutation reported by the narrator */
export interface WorldStateEvent {
  type:
    | 'move' | 'pickup' | 'open' | 'close' | 'unlock' | 'break'
    | 'reveal' | 'use' | 'remove' | 'state_change'
    | 'discover' | 'sanity' | 'npc_mood' | 'npc_memory' | 'npc_move'
    | 'discover_exit';
  playerName: string;
  targetId: string;
  detail?: string;
  roomId: string;
  timestamp: number;
}
