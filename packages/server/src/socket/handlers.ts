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
  PlayerAction,
} from '@akboys/shared';
import { toPlayerDTO, SCENARIOS } from '@akboys/shared';
import type { SessionStore } from '../store/SessionStore.js';
import { nextPlayerColor } from '../store/SessionStore.js';
import { ActionBatcher, PLAYER_ACTION_COOLDOWN } from './action-batcher.js';
import {
  buildMultiplayerSystemPrompt,
  buildCombinedUserMessage,
  parseStateChanges,
} from './prompt-builder.js';
import { narratorChatStream, suggestFollowUps } from '../middleware/openai.js';

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
  /* ---- Action batcher: fires when the batch timer expires ---- */
  const batcher = new ActionBatcher(store, async (sessionId, actions) => {
    const session = store.get(sessionId);
    if (!session) return;

    const scenario = SCENARIOS[session.scenarioId];
    if (!scenario) return;

    // Build the combined user message from all batched actions
    const combinedMessage = buildCombinedUserMessage(actions);

    // Store as a single user message in history
    store.addMessage(sessionId, {
      role: 'user',
      content: combinedMessage,
      timestamp: Date.now(),
    });

    // Build the multiplayer system prompt with current player states
    const systemPrompt = buildMultiplayerSystemPrompt(scenario, session);

    // Mark session as streaming
    session.isStreaming = true;

    let fullText = '';

    try {
      // Stream narrator response via OpenAI
      for await (const chunk of narratorChatStream(systemPrompt, session.history)) {
        fullText += chunk;
        io.to(sessionId).emit('narrator:chunk', { content: chunk, fullText });
      }
    } catch (err) {
      console.error(`[batcher] OpenAI streaming error for session ${sessionId.slice(0, 8)}:`, err);
      fullText = fullText || '*The narrator hesitates, lost in thought...*';
    }

    // Parse state changes ([MOVE:], [PICKUP:]) from the narrator response
    const { moves, pickups, cleanText } = parseStateChanges(fullText);

    // Apply moves — update player room
    for (const move of moves) {
      const player = Array.from(session.players.values()).find(
        (p) => p.name === move.playerName,
      );
      if (player) {
        store.updatePlayer(sessionId, player.id, { currentRoomId: move.roomId });
        if (!player.visitedRooms.includes(move.roomId)) {
          player.visitedRooms.push(move.roomId);
        }
        console.log(`[state] ${move.playerName} moved to ${move.roomId}`);
      }
    }

    // Apply pickups — add item to player inventory
    for (const pickup of pickups) {
      const player = Array.from(session.players.values()).find(
        (p) => p.name === pickup.playerName,
      );
      if (player && !player.inventory.includes(pickup.itemId)) {
        player.inventory.push(pickup.itemId);
        console.log(`[state] ${pickup.playerName} picked up ${pickup.itemId}`);
      }
    }

    // Store the clean narrator response (without directives)
    store.addMessage(sessionId, {
      role: 'assistant',
      content: cleanText,
      timestamp: Date.now(),
    });

    // Generate follow-up suggestions
    let suggestions: string[];
    try {
      suggestions = await suggestFollowUps(cleanText);
    } catch {
      suggestions = ['Look around', 'Talk to someone', 'Move to another room'];
    }

    // Emit done event with clean text and suggestions
    io.to(sessionId).emit('narrator:done', {
      fullText: cleanText,
      suggestions,
    });

    session.isStreaming = false;

    console.log(`[batcher] narrator response complete for session ${sessionId.slice(0, 8)} (${moves.length} moves, ${pickups.length} pickups)`);
  });

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
        lastActiveAt: 0,  // 0 so the first action is never rate-limited
      };

      store.addPlayer(sessionId, player);
      socketMap.set(socket.id, { sessionId, playerId });
      socket.join(sessionId);

      const allPlayers = getAllPlayerDTOs(store, sessionId);
      callback({ success: true, playerId });
      io.to(sessionId).emit('player:joined', { player: toPlayerDTO(player), allPlayers });

      console.log(`[socket] ${trimmedName} joined session ${sessionId.slice(0, 8)} (${session.players.size}/${session.maxPlayers})`);
    });

    /* ---- player:action ---- */
    socket.on('player:action', (data) => {
      const { sessionId, playerId, message } = data;

      const session = store.get(sessionId);
      if (!session) return;

      const player = store.getPlayer(sessionId, playerId);
      if (!player) return;

      // Rate limit: one action per PLAYER_ACTION_COOLDOWN ms
      const now = Date.now();
      if (now - player.lastActiveAt < PLAYER_ACTION_COOLDOWN) {
        socket.emit('session:error', { message: 'Please wait a moment before your next action.' });
        return;
      }

      store.updatePlayer(sessionId, playerId, { lastActiveAt: now });

      const action: PlayerAction = {
        playerId,
        playerName: player.name,
        message: message.trim(),
        timestamp: now,
        roomId: player.currentRoomId,
      };

      const timeRemaining = batcher.enqueue(sessionId, action);

      // Notify everyone in the session
      io.to(sessionId).emit('action:queued', {
        playerId,
        playerName: player.name,
        message: action.message,
        queueSize: batcher.queueSize(sessionId),
        timeRemaining,
      });

      console.log(`[socket] ${player.name} queued action in session ${sessionId.slice(0, 8)} (queue: ${batcher.queueSize(sessionId)}, fires in ${timeRemaining}ms)`);
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

    /* ---- game:start ---- */
    socket.on('game:start', async (data, callback) => {
      const { sessionId, playerId } = data;

      const session = store.get(sessionId);
      if (!session) {
        callback({ success: false, error: 'Session not found' });
        return;
      }

      if (session.state === 'playing') {
        callback({ success: false, error: 'Game already started' });
        return;
      }

      if (session.players.size < 1) {
        callback({ success: false, error: 'Need at least one player' });
        return;
      }

      // Only the first player (host) can start
      const firstPlayer = Array.from(session.players.values())[0];
      if (firstPlayer.id !== playerId) {
        callback({ success: false, error: 'Only the host can start the game' });
        return;
      }

      // Transition to playing
      session.state = 'playing';
      callback({ success: true });

      const scenario = SCENARIOS[session.scenarioId];
      if (!scenario) return;

      // Notify all players
      const allPlayers = getAllPlayerDTOs(store, sessionId);
      io.to(sessionId).emit('game:started', {
        sessionId,
        scenarioTitle: scenario.title,
        players: allPlayers,
      });

      // Stream opening narration
      const systemPrompt = buildMultiplayerSystemPrompt(scenario, session);

      // Build a start message listing all players
      const playerNames = Array.from(session.players.values()).map((p) => p.name);
      const startMsg = `Start the game. The players are: ${playerNames.join(', ')}. Describe the scene and welcome them.`;

      store.addMessage(sessionId, { role: 'user', content: startMsg, timestamp: Date.now() });

      session.isStreaming = true;
      let fullText = '';

      try {
        for await (const chunk of narratorChatStream(systemPrompt, session.history)) {
          fullText += chunk;
          io.to(sessionId).emit('narrator:chunk', { content: chunk, fullText });
        }
      } catch (err) {
        console.error(`[game:start] OpenAI streaming error for session ${sessionId.slice(0, 8)}:`, err);
        fullText = fullText || '*The narrator clears their throat and begins...*';
      }

      const { moves, pickups, cleanText } = parseStateChanges(fullText);

      for (const move of moves) {
        const player = Array.from(session.players.values()).find((p) => p.name === move.playerName);
        if (player) {
          store.updatePlayer(sessionId, player.id, { currentRoomId: move.roomId });
          if (!player.visitedRooms.includes(move.roomId)) player.visitedRooms.push(move.roomId);
        }
      }

      for (const pickup of pickups) {
        const player = Array.from(session.players.values()).find((p) => p.name === pickup.playerName);
        if (player && !player.inventory.includes(pickup.itemId)) player.inventory.push(pickup.itemId);
      }

      store.addMessage(sessionId, { role: 'assistant', content: cleanText, timestamp: Date.now() });

      let suggestions: string[];
      try {
        suggestions = await suggestFollowUps(cleanText);
      } catch {
        suggestions = ['Look around', 'Talk to someone', 'Move to another room'];
      }

      io.to(sessionId).emit('narrator:done', { fullText: cleanText, suggestions });
      session.isStreaming = false;

      console.log(`[game:start] opening narration complete for session ${sessionId.slice(0, 8)}`);
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
