/**
 * handlers.ts — Socket.IO event handlers for multiplayer sessions
 *
 * Registers all real-time event listeners: player join, actions,
 * communication, typing, rejoin, and disconnect.
 *
 * Action flow:  player:action → batcher → per-player narrator call →
 *               [RESPONSE] to actor, [OBSERVED] to same-room witnesses
 *
 * Communication flow:  comm:room / comm:direct → routed to targets only
 *                      (never touches narrator pipeline)
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
  CommMessageDTO,
} from '@akboys/shared';
import { toPlayerDTO, SCENARIOS } from '@akboys/shared';
import type { SessionStore } from '../store/SessionStore.js';
import { nextPlayerColor, serializeVotes } from '../store/SessionStore.js';
import { ActionBatcher, PLAYER_ACTION_COOLDOWN } from './action-batcher.js';
import {
  buildPlayerActionPrompt,
  buildOpeningPrompt,
  parseStructuredResponse,
  parseLegacyTextResponse,
  parseStateChanges,
  buildCombinedUserMessage,
  validateDirective,
} from './prompt-builder.js';
import { narratorChatStream, narratorStructuredResponse, suggestFollowUps } from '../middleware/openai.js';

type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/** Maps a socket ID to the session and player it belongs to */
const socketMap = new Map<string, { sessionId: string; playerId: string }>();

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getAllPlayerDTOs(store: SessionStore, sessionId: string) {
  const session = store.get(sessionId);
  if (!session) return [];
  return Array.from(session.players.values()).map(toPlayerDTO);
}

/** Filter session history server-side — only messages this player should see */
function filterHistoryForPlayer(store: SessionStore, sessionId: string, playerId: string) {
  const session = store.get(sessionId);
  if (!session) return [];

  return session.history
    .filter((m) => {
      // Global messages (no visibleTo = everyone can see: opening narration, system)
      if (!m.visibleTo || m.visibleTo.length === 0) return true;
      // Scoped messages — check audience
      return m.visibleTo.includes(playerId);
    })
    .map((m) => ({
      role: m.role,
      content: m.content,
      playerId: m.playerId,
      playerName: m.playerName,
      playerColor: m.playerColor,
      messageType: m.messageType,
    }));
}

/** Filter comm history server-side — only messages this player should see */
function filterCommHistoryForPlayer(session: { commHistory: CommMessageDTO[] }, playerId: string): CommMessageDTO[] {
  return session.commHistory.filter((m) => {
    return m.visibleTo.includes(playerId);
  });
}

/** Find socket IDs for a given player */
function findSocketsForPlayer(playerId: string): string[] {
  const sockets: string[] = [];
  for (const [socketId, mapping] of socketMap) {
    if (mapping.playerId === playerId) sockets.push(socketId);
  }
  return sockets;
}

/** Find socket IDs for all players in a specific room */
function findSocketsInRoom(store: SessionStore, sessionId: string, roomId: string, excludePlayerId?: string): string[] {
  const session = store.get(sessionId);
  if (!session) return [];
  const sockets: string[] = [];
  for (const player of session.players.values()) {
    if (player.currentRoomId === roomId && player.isConnected && player.id !== excludePlayerId) {
      sockets.push(...findSocketsForPlayer(player.id));
    }
  }
  return sockets;
}

/* ------------------------------------------------------------------ */
/*  Public: register all handlers on the io instance                   */
/* ------------------------------------------------------------------ */

export function registerSocketHandlers(io: GameServer, store: SessionStore): void {

  /* ---- Action batcher: fires per-player narrator calls ---- */
  const batcher = new ActionBatcher(store, async (sessionId, actions) => {
    const session = store.get(sessionId);
    if (!session) return;

    const scenario = SCENARIOS[session.scenarioId];
    if (!scenario) return;

    session.isStreaming = true;

    // Process each action sequentially for canonical state consistency
    for (const action of actions) {
      const player = store.getPlayer(sessionId, action.playerId);
      if (!player) continue;

      // Build per-player prompt with current canonical state
      const systemPrompt = buildPlayerActionPrompt(scenario, session, action.playerName, action.roomId);
      const actionMsg = `[${action.playerName} / ${action.roomId}] "${action.message}"`;

      // Store action in history (scoped to actor)
      store.addMessage(sessionId, {
        role: 'user',
        content: actionMsg,
        playerId: action.playerId,
        playerName: action.playerName,
        timestamp: Date.now(),
        messageType: 'action',
        visibleTo: [action.playerId],
      });

      const actorSockets = findSocketsForPlayer(action.playerId);

      // Primary: structured JSON response (no streaming, but guaranteed schema)
      // Fallback: streaming text response with legacy parsing
      let privateResponse: string;
      let observedLine: string;
      let directives: ReturnType<typeof parseStructuredResponse>['directives'];

      const structuredResult = await narratorStructuredResponse(systemPrompt, session.history);

      if (structuredResult) {
        // Structured path succeeded — parse with schema validation
        const parsed = parseStructuredResponse(structuredResult, action.playerName, action.message);
        privateResponse = parsed.privateResponse;
        observedLine = parsed.observedLine;
        directives = parsed.directives;

        // Emit the completed response immediately (no streaming for structured)
        for (const sid of actorSockets) {
          io.to(sid).emit('narrator:chunk', {
            content: privateResponse,
            fullText: privateResponse,
            targetPlayerId: action.playerId,
          });
        }

        console.log(`[batcher] structured response for ${action.playerName}`);
      } else {
        // Fallback: streaming text response with legacy tag parsing
        console.log(`[batcher] falling back to streaming for ${action.playerName}`);
        let fullText = '';

        try {
          for await (const chunk of narratorChatStream(systemPrompt, session.history)) {
            fullText += chunk;
            for (const sid of actorSockets) {
              io.to(sid).emit('narrator:chunk', {
                content: chunk,
                fullText,
                targetPlayerId: action.playerId,
              });
            }
          }
        } catch (err) {
          console.error(`[batcher] OpenAI stream error for ${action.playerName}:`, err);
          fullText = fullText || '*The narrator hesitates, lost in thought...*';
        }

        const parsed = parseLegacyTextResponse(fullText, action.playerName, action.message);
        privateResponse = parsed.privateResponse;
        observedLine = parsed.observedLine;
        directives = parsed.directives;
      }

      // Validate and apply directives against canonical server state
      for (const directive of directives) {
        const result = validateDirective(directive, session, scenario, action.playerId, action.roomId);

        if (!result.valid) {
          console.log(`[directive] REJECTED: ${directive.type} ${directive.playerName} -> ${directive.target}: ${result.reason}`);
          continue;
        }

        // Apply validated state mutation
        switch (directive.type) {
          case 'MOVE': {
            const p = Array.from(session.players.values()).find((pl) => pl.name === directive.playerName);
            if (p) {
              store.updatePlayer(sessionId, p.id, { currentRoomId: directive.target });
              if (!p.visitedRooms.includes(directive.target)) p.visitedRooms.push(directive.target);
            }
            break;
          }
          case 'PICKUP': {
            const p = Array.from(session.players.values()).find((pl) => pl.name === directive.playerName);
            if (p && !p.inventory.includes(directive.target)) {
              p.inventory.push(directive.target);
            }
            break;
          }
          // Extended directives: update canonical objectStates
          case 'OPEN': {
            const key = `${action.roomId}:${directive.target}`;
            const current = session.objectStates.get(key) || {};
            session.objectStates.set(key, { ...current, open: true, closed: false });
            break;
          }
          case 'CLOSE': {
            const key = `${action.roomId}:${directive.target}`;
            const current = session.objectStates.get(key) || {};
            session.objectStates.set(key, { ...current, open: false, closed: true });
            break;
          }
          case 'UNLOCK': {
            const key = `${action.roomId}:${directive.target}`;
            const current = session.objectStates.get(key) || {};
            session.objectStates.set(key, { ...current, locked: false, unlocked: true });
            break;
          }
          case 'BREAK': {
            const key = `${action.roomId}:${directive.target}`;
            const current = session.objectStates.get(key) || {};
            session.objectStates.set(key, { ...current, broken: true });
            break;
          }
          case 'REVEAL': {
            const key = `${action.roomId}:${directive.target}`;
            const current = session.objectStates.get(key) || {};
            session.objectStates.set(key, { ...current, revealed: true, hidden: false });
            break;
          }
          case 'USE':
          case 'REMOVE': {
            const key = `${action.roomId}:${directive.target}`;
            const current = session.objectStates.get(key) || {};
            session.objectStates.set(key, { ...current, used: true, removed: directive.type === 'REMOVE' });
            break;
          }
          case 'STATE': {
            // Generic state change — store with the target as key
            const key = `${action.roomId}:${directive.target.replace(/\s+/g, '_').slice(0, 50)}`;
            session.objectStates.set(key, { changed: true });
            break;
          }
          default:
            break;
        }

        // Log to world state (both human-readable and structured)
        if (result.worldLogEntry) {
          session.worldStateLog.push(result.worldLogEntry);
        }
        if (result.worldStateEvent) {
          session.worldStateEvents.push(result.worldStateEvent);
        }

        console.log(`[directive] APPLIED: ${directive.type} ${directive.playerName} -> ${directive.target}`);
      }

      // Store private response in history (scoped to actor)
      store.addMessage(sessionId, {
        role: 'assistant',
        content: privateResponse,
        playerId: action.playerId,
        playerName: action.playerName,
        timestamp: Date.now(),
        messageType: 'private',
        visibleTo: [action.playerId],
      });

      // Generate scoped suggestions from private response only
      let suggestions: string[];
      try {
        suggestions = await suggestFollowUps(privateResponse);
      } catch {
        suggestions = ['Look around', 'Talk to someone', 'Move to another room'];
      }

      // Send narrator:done to actor only
      for (const sid of actorSockets) {
        io.to(sid).emit('narrator:done', {
          fullText: privateResponse,
          suggestions,
          targetPlayerId: action.playerId,
        });
      }

      // Compute observed audience snapshot (same-room witnesses at this moment)
      const witnessIds: string[] = [];
      for (const p of session.players.values()) {
        if (p.currentRoomId === action.roomId && p.isConnected && p.id !== action.playerId) {
          witnessIds.push(p.id);
        }
      }

      // Store observed in history with audience snapshot
      if (witnessIds.length > 0) {
        store.addMessage(sessionId, {
          role: 'assistant',
          content: observedLine,
          playerName: action.playerName,
          timestamp: Date.now(),
          messageType: 'observed',
          visibleTo: witnessIds,
        });
      }

      // Send observed to same-room witnesses
      const witnessSockets = findSocketsInRoom(store, sessionId, action.roomId, action.playerId);
      for (const sid of witnessSockets) {
        io.to(sid).emit('narrator:observed', {
          text: observedLine,
          actorName: action.playerName,
          roomId: action.roomId,
        });
      }

      void store.sync(sessionId);

      console.log(`[batcher] narrator done for ${action.playerName} (${directives.length} directives, ${witnessIds.length} witnesses)`);
    }

    session.isStreaming = false;
    void store.sync(sessionId);
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

      const nameExists = Array.from(session.players.values()).some(
        (p) => p.name.toLowerCase() === trimmedName.toLowerCase(),
      );
      if (nameExists) {
        callback({ success: false, error: 'A player with that name is already in this session' });
        return;
      }

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
        lastActiveAt: 0,
      };

      store.addPlayer(sessionId, player);
      socketMap.set(socket.id, { sessionId, playerId });
      socket.join(sessionId);

      const allPlayers = getAllPlayerDTOs(store, sessionId);
      callback({ success: true, playerId });
      io.to(sessionId).emit('player:joined', { player: toPlayerDTO(player), allPlayers });

      // Send filtered session state to the joining player (server-side visibility)
      const joinScenario = SCENARIOS[session.scenarioId];
      socket.emit('session:state', {
        session: {
          id: session.id,
          scenarioId: session.scenarioId,
          scenarioTitle: joinScenario?.title || 'Unknown',
          roomCode: session.roomCode,
          players: allPlayers,
          history: filterHistoryForPlayer(store, sessionId, playerId),
          state: session.state,
          selectedScenarioId: session.selectedScenarioId,
          scenarioVotes: serializeVotes(session),
          commHistory: filterCommHistoryForPlayer(session, playerId),
        },
      });

      void store.sync(sessionId);

      console.log(`[socket] ${trimmedName} joined session ${sessionId.slice(0, 8)} (${session.players.size}/${session.maxPlayers})`);
    });

    /* ---- player:action ---- */
    socket.on('player:action', (data) => {
      const { sessionId, playerId, message } = data;

      const session = store.get(sessionId);
      if (!session) return;

      const player = store.getPlayer(sessionId, playerId);
      if (!player) return;

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

      // Only notify the acting player that their action was queued
      socket.emit('action:queued', {
        playerId,
        playerName: player.name,
        playerColor: player.color,
        message: action.message,
        queueSize: batcher.queueSize(sessionId),
        timeRemaining,
      });

      console.log(`[socket] ${player.name} queued action in session ${sessionId.slice(0, 8)}`);
    });

    /* ---- player:typing ---- */
    socket.on('player:typing', (data) => {
      const { sessionId, playerId, isTyping } = data;
      const player = store.getPlayer(sessionId, playerId);
      if (!player) return;

      socket.to(sessionId).emit('player:typing-update', {
        playerId,
        playerName: player.name,
        isTyping,
      });
    });

    /* ================================================================ */
    /*  COMMUNICATION HANDLERS (separate from narrator pipeline)        */
    /* ================================================================ */

    /* ---- comm:room — message to all players in sender's room ---- */
    socket.on('comm:room', (data) => {
      const { sessionId, playerId, content } = data;
      const session = store.get(sessionId);
      if (!session) return;

      const player = store.getPlayer(sessionId, playerId);
      if (!player) return;

      // Compute audience snapshot: all players in the same room right now
      const roomAudience: string[] = [playerId]; // sender always sees it
      for (const p of session.players.values()) {
        if (p.id !== playerId && p.currentRoomId === player.currentRoomId && p.isConnected) {
          roomAudience.push(p.id);
        }
      }

      const msg: CommMessageDTO = {
        id: uuidv4(),
        senderId: playerId,
        senderName: player.name,
        senderColor: player.color,
        content: content.trim(),
        timestamp: Date.now(),
        mode: 'room',
        roomId: player.currentRoomId,
        visibleTo: roomAudience,
      };

      // Store in comm history
      session.commHistory.push(msg);
      session.lastActivityAt = Date.now();
      void store.sync(sessionId);

      // Send to audience sockets
      const targetSids = new Set<string>();
      for (const pid of roomAudience) {
        for (const sid of findSocketsForPlayer(pid)) targetSids.add(sid);
      }
      for (const sid of targetSids) {
        io.to(sid).emit('comm:message', msg);
      }

      console.log(`[comm:room] ${player.name} in ${player.currentRoomId}: "${content.slice(0, 40)}"`);
    });

    /* ---- comm:direct — targeted message to a specific player ---- */
    socket.on('comm:direct', (data) => {
      const { sessionId, playerId, targetPlayerId, content } = data;
      const session = store.get(sessionId);
      if (!session) return;

      const sender = store.getPlayer(sessionId, playerId);
      if (!sender) return;

      const target = store.getPlayer(sessionId, targetPlayerId);
      if (!target) {
        socket.emit('session:error', { message: 'Target player not found' });
        return;
      }

      const msg: CommMessageDTO = {
        id: uuidv4(),
        senderId: playerId,
        senderName: sender.name,
        senderColor: sender.color,
        content: content.trim(),
        timestamp: Date.now(),
        mode: 'direct',
        targetPlayerId,
        targetPlayerName: target.name,
        roomId: sender.currentRoomId,
        visibleTo: [playerId, targetPlayerId],
      };

      // Store in comm history
      session.commHistory.push(msg);
      session.lastActivityAt = Date.now();
      void store.sync(sessionId);

      // Send to sender + target only
      const targetSids = new Set<string>();
      for (const sid of findSocketsForPlayer(playerId)) targetSids.add(sid);
      for (const sid of findSocketsForPlayer(targetPlayerId)) targetSids.add(sid);

      for (const sid of targetSids) {
        io.to(sid).emit('comm:message', msg);
      }

      console.log(`[comm:direct] ${sender.name} -> ${target.name}: "${content.slice(0, 40)}"`);
    });

    /* ================================================================ */
    /*  SCENARIO VOTING                                                 */
    /* ================================================================ */

    socket.on('scenario:select', (data) => {
      const { sessionId, playerId, scenarioId } = data;
      const session = store.get(sessionId);
      if (!session || session.state !== 'voting') return;

      const firstPlayer = Array.from(session.players.values())[0];
      if (!firstPlayer || firstPlayer.id !== playerId) return;

      session.selectedScenarioId = scenarioId;
      session.lastActivityAt = Date.now();
      void store.sync(sessionId);

      io.to(sessionId).emit('scenario:updated', {
        selectedScenarioId: session.selectedScenarioId,
        votes: serializeVotes(session),
      });
    });

    socket.on('scenario:vote', (data) => {
      const { sessionId, playerId, scenarioId } = data;
      const session = store.get(sessionId);
      if (!session || session.state !== 'voting') return;

      if (!session.scenarioVotes.has(scenarioId)) {
        session.scenarioVotes.set(scenarioId, new Set());
      }

      for (const [sid, voters] of session.scenarioVotes) {
        if (sid !== scenarioId) voters.delete(playerId);
      }

      const voters = session.scenarioVotes.get(scenarioId)!;
      if (voters.has(playerId)) {
        voters.delete(playerId);
      } else {
        voters.add(playerId);
      }

      session.lastActivityAt = Date.now();
      void store.sync(sessionId);

      io.to(sessionId).emit('scenario:updated', {
        selectedScenarioId: session.selectedScenarioId,
        votes: serializeVotes(session),
      });
    });

    socket.on('scenario:confirm', (data, callback) => {
      const { sessionId, playerId, scenarioId } = data;
      const session = store.get(sessionId);
      if (!session) { callback({ success: false, error: 'Session not found' }); return; }
      if (session.state !== 'voting') { callback({ success: false, error: 'Not in voting phase' }); return; }

      const firstPlayer = Array.from(session.players.values())[0];
      if (!firstPlayer || firstPlayer.id !== playerId) { callback({ success: false, error: 'Only the host can confirm' }); return; }

      const scenario = SCENARIOS[scenarioId];
      if (!scenario) { callback({ success: false, error: 'Unknown scenario' }); return; }

      session.scenarioId = scenarioId;
      session.selectedScenarioId = scenarioId;
      session.lastActivityAt = Date.now();
      void store.sync(sessionId);
      callback({ success: true });
    });

    /* ================================================================ */
    /*  GAME START                                                      */
    /* ================================================================ */

    socket.on('game:start', async (data, callback) => {
      const { sessionId, playerId } = data;

      const session = store.get(sessionId);
      if (!session) { callback({ success: false, error: 'Session not found' }); return; }
      if (session.state === 'playing') { callback({ success: false, error: 'Game already started' }); return; }
      if (session.scenarioId === '__pending') { callback({ success: false, error: 'Please select a scenario first' }); return; }
      if (session.players.size < 1) { callback({ success: false, error: 'Need at least one player' }); return; }

      const firstPlayer = Array.from(session.players.values())[0];
      if (firstPlayer.id !== playerId) { callback({ success: false, error: 'Only the host can start the game' }); return; }

      session.state = 'playing';
      void store.sync(sessionId);
      callback({ success: true });

      const scenario = SCENARIOS[session.scenarioId];
      if (!scenario) return;

      const allPlayers = getAllPlayerDTOs(store, sessionId);
      io.to(sessionId).emit('game:started', { sessionId, scenarioTitle: scenario.title, players: allPlayers });

      // Opening narration — goes to all players (not scoped)
      const systemPrompt = buildOpeningPrompt(scenario, session);
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
        console.error(`[game:start] OpenAI error:`, err);
        fullText = fullText || '*The narrator clears their throat and begins...*';
      }

      const { moves, pickups, cleanText } = parseStateChanges(fullText);

      for (const move of moves) {
        const p = Array.from(session.players.values()).find((pl) => pl.name === move.playerName);
        if (p) {
          store.updatePlayer(sessionId, p.id, { currentRoomId: move.roomId });
          if (!p.visitedRooms.includes(move.roomId)) p.visitedRooms.push(move.roomId);
        }
      }

      for (const pickup of pickups) {
        const p = Array.from(session.players.values()).find((pl) => pl.name === pickup.playerName);
        if (p && !p.inventory.includes(pickup.itemId)) p.inventory.push(pickup.itemId);
      }

      store.addMessage(sessionId, { role: 'assistant', content: cleanText, timestamp: Date.now() });

      let suggestions: string[];
      try { suggestions = await suggestFollowUps(cleanText); }
      catch { suggestions = ['Look around', 'Talk to someone', 'Move to another room']; }

      io.to(sessionId).emit('narrator:done', { fullText: cleanText, suggestions });
      session.isStreaming = false;
      void store.sync(sessionId);

      console.log(`[game:start] opening narration complete for session ${sessionId.slice(0, 8)}`);
    });

    /* ================================================================ */
    /*  REJOIN / DISCONNECT                                             */
    /* ================================================================ */

    socket.on('player:rejoin', (data, callback) => {
      const { sessionId, playerId } = data;

      const session = store.get(sessionId);
      if (!session) { callback({ success: false, error: 'Session not found' }); return; }

      const player = store.getPlayer(sessionId, playerId);
      if (!player) { callback({ success: false, error: 'Player not found in session' }); return; }

      store.updatePlayer(sessionId, playerId, { isConnected: true, lastActiveAt: Date.now() });
      socketMap.set(socket.id, { sessionId, playerId });
      socket.join(sessionId);

      const scenario = SCENARIOS[session.scenarioId];
      const allPlayers = getAllPlayerDTOs(store, sessionId);

      socket.emit('session:state', {
        session: {
          id: session.id,
          scenarioId: session.scenarioId,
          scenarioTitle: scenario?.title || 'Unknown',
          roomCode: session.roomCode,
          players: allPlayers,
          history: filterHistoryForPlayer(store, sessionId, playerId),
          state: session.state,
          selectedScenarioId: session.selectedScenarioId,
          scenarioVotes: serializeVotes(session),
          commHistory: filterCommHistoryForPlayer(session, playerId),
        },
      });

      callback({ success: true });
      void store.sync(sessionId);

      socket.to(sessionId).emit('player:reconnected', {
        playerId,
        playerName: player.name,
        allPlayers,
      });

      console.log(`[socket] ${player.name} reconnected to session ${sessionId.slice(0, 8)}`);
    });

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
