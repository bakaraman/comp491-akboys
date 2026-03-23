/**
 * types/index.ts — Type exports hub
 *
 * Re-exports all shared types from a single entry point.
 *
 * @author AK Boys Team
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
} from './game';

export { PLAYER_COLORS } from './game';

export type {
  PlayerDataDTO,
  SessionStateDTO,
  ClientToServerEvents,
  ServerToClientEvents,
} from './socket-events';

export { toPlayerDTO } from './socket-events';
