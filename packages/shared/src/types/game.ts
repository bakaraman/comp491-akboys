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
}

/** Player state during a game session */
export interface GameState {
  currentRoomId: string;
  inventory: string[];
  visitedRooms: string[];
  conversationHistory: ChatMessage[];
  isGameOver: boolean;
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
