/**
 * types/index.ts — Type exports hub
 *
 * Re-exports all shared types from a single entry point.
 *
 * @author AKBOYS Team
 * @since 2026-03-12
 */

export type {
  Room,
  NPC,
  Item,
  Scenario,
  GameState,
  ChatMessage,
  ActionRequest,
  ActionResponse,
  PlayerData,
  PlayerAction,
  PlayerColor,
  MultiplayerChatMessage,
  WorldStateEvent,
} from './game.js';

export { PLAYER_COLORS } from './game.js';

export type {
  PlayerDataDTO,
  CommMessageDTO,
  SessionStateDTO,
  ClientToServerEvents,
  ServerToClientEvents,
} from './socket-events.js';

export { toPlayerDTO } from './socket-events.js';
