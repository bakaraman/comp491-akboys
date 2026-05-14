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
/*  Locale (#58 — bilingual support)                                   */
/* ------------------------------------------------------------------ */

/** Player's chosen UI/narration language. Locked at game start. */
export type Locale = 'tr' | 'en';

/**
 * A field produced by the LLM in BOTH languages so any player can read
 * it in their own locale without re-translating. Strings are also
 * accepted for backward compatibility with pre-i18n session data — they
 * render the same in any locale.
 */
export type Bilingual<T = string> = T | { tr: T; en: T };

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
  /**
   * Single-language body. For narrator-generated messages this is the
   * Turkish slice; the bilingual companion (`MultiplayerChatMessage
   * .bilingualContent`) carries both languages when present.
   */
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
  /**
   * UI + narration language for this player (#58). Picked at join time
   * and locked when the game transitions out of lobby. Defaults to 'tr'
   * for pre-i18n sessions during deserialisation.
   */
  locale: Locale;
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
  /**
   * #58 — bilingual companion payload. When present, wire emits that
   * target a specific player should use pickLang(bilingualContent,
   * player.locale) instead of the single-language `content`. Internal
   * narrator pipeline produces both fields in lockstep.
   */
  bilingualContent?: Bilingual;
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

/* ------------------------------------------------------------------ */
/*  Crime scene reconstruction (A.3 / Issue #36)                       */
/* ------------------------------------------------------------------ */

/**
 * One step in the post-game timeline shown by ReconstructionReplay.
 *
 * The AI is constrained to emit only `roomId` and `actorNpcId` from
 * enums the server hands it (drawn from the live world), so it can
 * never invent a room or character that doesn't exist. Display names
 * (`roomName`, `actorName`, `actorRole`) are server-enriched from the
 * authoritative WorldData — they do NOT come from the AI.
 *
 * `actorNpcId === ''` means "no specific actor" (atmospheric beat,
 * environmental change, off-screen victim moment, etc.).
 */
export interface ReconstructionEvent {
  /** In-game turn this beat happened on (informational, not enforced). */
  turn: number;
  /** In-fiction clock time, e.g. "23:14". */
  time: string;
  /** Room ID — must match an existing world.rooms[].id. */
  roomId: string;
  /** Display name for the room (server-enriched, single proper noun). */
  roomName: string;
  /** NPC ID — must match world.npcs[].id, or '' for "no actor". */
  actorNpcId: string;
  /** Display name for the actor (server-enriched, single proper noun). */
  actorName: string;
  /** Actor's role from world.npcs (bilingual after #58). */
  actorRole: Bilingual;
  /** 1-2 sentence beat description (bilingual after #58). */
  description: Bilingual;
  /** True if this is the culprit doing something pivotal — UI highlights. */
  isCulpritAction: boolean;
}

/** Full reconstruction payload sent from the server to the client. */
export interface ReconstructionDTO {
  /** Case title (bilingual after #58). */
  title: Bilingual;
  events: ReconstructionEvent[];
  /** 2-3 sentence summary of what really happened (bilingual after #58). */
  conclusion: Bilingual;
  /** Generation timestamp; allows the client to detect regenerations. */
  generatedAt: number;
}
