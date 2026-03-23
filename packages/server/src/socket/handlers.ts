/**
 * handlers.ts — Socket.IO event handlers for multiplayer sessions
 *
 * Registers all real-time event listeners: player join, typing,
 * rejoin, and disconnect. Each session is a Socket.IO room keyed
 * by the session UUID.
 *
 * @author AK Boys Team
 * @since 2026-03-23
 */

import { v4 as uuidv4 } from 'uuid';
import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  PlayerData,
} from '@akboys/shared';
import { toPlayerDTO, SCENARIOS } from '@akboys/shared';
import type { SessionStore } from '../store/SessionStore.js';
import { nextPlayerColor } from '../store/SessionStore.js';

type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/** Maps a socket ID to the session and player it belongs to */
const socketMap = new Map<string, { sessionId: string; playerId: string }>();

/* ------------------------------------------------------------------ */
/*  Helper: get all players as DTOs                                    */
/* ------------------------------------------------------------------ */

function getAllPlayerDTOs(store: SessionStore, sessionId: string) {
  const session = store.get(sessionId);
  if (!session) return [];
  return Array.from(session.players.values()).map(toPlayerDTO);
}

/* ------------------------------------------------------------------ */
/*  Public: register all handlers on the io instance                   */
/* ------------------------------------------------------------------ */

export function registerSocketHandlers(io: GameServer, store: SessionStore): void {
  io.on('connection', (socket: GameSocket) => {
    console.log(`[socket] connected: ${socket.id}`);

    /* ---- player:join ---- */
    socket.on('player:join', (data, callback) => {
      const { sessionId, playerName } = data;

      const session = store.get(sessionId);
      if (!session) {
        callback({ success: false, error: 'Session not found' });
        return;
      }

      if (session.players.size >= session.maxPlayers) {
        callback({ success: false, error: `Session is full (${session.maxPlayers}/${session.maxPlayers} players)` });
        return;
      }

      const trimmedName = playerName.trim();
      if (trimmedName.length === 0) {
        callback({ success: false, error: 'Player name is required' });
        return;
      }

      // Prevent duplicate names in the same session
      const nameExists = Array.from(session.players.values()).some(
        (p) => p.name.toLowerCase() === trimmedName.toLowerCase(),
      );
      if (nameExists) {
        callback({ success: false, error: 'A player with that name is already in this session' });
        return;
      }

      // Determine starting room from scenario
      const scenario = SCENARIOS[session.scenarioId];
      const startRoom = scenario?.rooms[0]?.id || 'start';

      const playerId = uuidv4();
      const player: PlayerData = {
        id: playerId,
        name: trimmedName,
        currentRoomId: startRoom,
        inventory: [],
        visitedRooms: [startRoom],
        isConnected: true,
        color: nextPlayerColor(session),
        joinedAt: Date.now(),
        lastActiveAt: Date.now(),
      };

      store.addPlayer(sessionId, player);
      socketMap.set(socket.id, { sessionId, playerId });
      socket.join(sessionId);

      const allPlayers = getAllPlayerDTOs(store, sessionId);
      callback({ success: true, playerId });
      io.to(sessionId).emit('player:joined', { player: toPlayerDTO(player), allPlayers });

      console.log(`[socket] ${trimmedName} joined session ${sessionId.slice(0, 8)} (${session.players.size}/${session.maxPlayers})`);
    });

    /* ---- player:typing ---- */
    socket.on('player:typing', (data) => {
      const { sessionId, playerId, isTyping } = data;
      const player = store.getPlayer(sessionId, playerId);
      if (!player) return;

      // Broadcast to others in the room (not back to sender)
      socket.to(sessionId).emit('player:typing-update', {
        playerId,
        playerName: player.name,
        isTyping,
      });
    });

    /* ---- player:rejoin ---- */
    socket.on('player:rejoin', (data, callback) => {
      const { sessionId, playerId } = data;

      const session = store.get(sessionId);
      if (!session) {
        callback({ success: false, error: 'Session not found' });
        return;
      }

      const player = store.getPlayer(sessionId, playerId);
      if (!player) {
        callback({ success: false, error: 'Player not found in session' });
        return;
      }

      // Reconnect
      store.updatePlayer(sessionId, playerId, { isConnected: true, lastActiveAt: Date.now() });
      socketMap.set(socket.id, { sessionId, playerId });
      socket.join(sessionId);

      // Send full state to the reconnecting player
      const scenario = SCENARIOS[session.scenarioId];
      const allPlayers = getAllPlayerDTOs(store, sessionId);

      socket.emit('session:state', {
        session: {
          id: session.id,
          scenarioId: session.scenarioId,
          scenarioTitle: scenario?.title || 'Unknown',
          players: allPlayers,
          history: session.history.map((m) => ({
            role: m.role,
            content: m.content,
            playerId: m.playerId,
            playerName: m.playerName,
            playerColor: m.playerColor,
          })),
          state: session.state,
        },
      });

      callback({ success: true });

      // Notify others
      socket.to(sessionId).emit('player:reconnected', {
        playerId,
        playerName: player.name,
        allPlayers,
      });

      console.log(`[socket] ${player.name} reconnected to session ${sessionId.slice(0, 8)}`);
    });

    /* ---- disconnect ---- */
    socket.on('disconnect', () => {
      const mapping = socketMap.get(socket.id);
      if (!mapping) return;

      const { sessionId, playerId } = mapping;
      socketMap.delete(socket.id);

      const player = store.getPlayer(sessionId, playerId);
      if (!player) return;

      store.updatePlayer(sessionId, playerId, { isConnected: false });

      const allPlayers = getAllPlayerDTOs(store, sessionId);
      io.to(sessionId).emit('player:left', {
        playerId,
        playerName: player.name,
        allPlayers,
      });

      console.log(`[socket] ${player.name} disconnected from session ${sessionId.slice(0, 8)}`);
    });
  });
}
