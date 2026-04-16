/**
 * handlers.ts — Socket.IO event handlers for multiplayer sessions
 *
 * Registers all real-time event listeners: player join, actions,
 * communication, typing, rejoin, disconnect, role selection,
 * accusation voting, and game-end mechanics.
 *
 * Supports: roles (#18), NPC shared memory (#19), MP game end (#25),
 *           evidence chains (#26), evidence fix (#27), sanity (#38),
 *           NPC movement (#39), secret rooms (#40).
 *
 * @author AKBOYS Team
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
  NPCState,
  Scenario,
} from '@akboys/shared';
import { toPlayerDTO, SCENARIOS } from '@akboys/shared';
import type { SessionStore, SessionData } from '../store/SessionStore.js';
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

/** Active accusation vote timers — stored separately so they survive serialization */
const accusationTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
/*  #25: Accusation vote resolution helper                             */
/* ------------------------------------------------------------------ */

function resolveAccusationVote(io: GameServer, store: SessionStore, sessionId: string): void {
  const session = store.get(sessionId);
  if (!session || !session.activeAccusation) return;

  const accusation = session.activeAccusation;

  // Clear timer
  const timerId = accusationTimers.get(sessionId);
  if (timerId) {
    clearTimeout(timerId);
    accusationTimers.delete(sessionId);
  }

  // Tally votes
  let guiltyCount = 0;
  let notGuiltyCount = 0;
  const voteRecord: Record<string, 'guilty' | 'not_guilty'> = {};

  for (const [pid, vote] of accusation.votes) {
    voteRecord[pid] = vote;
    if (vote === 'guilty') guiltyCount++;
    else notGuiltyCount++;
  }

  const result: 'guilty' | 'not_guilty' = guiltyCount > notGuiltyCount ? 'guilty' : 'not_guilty';

  if (result === 'guilty') {
    // Check if accusation is correct
    const scenario = SCENARIOS[session.scenarioId];
    if (!scenario) return;

    const isCorrectSuspect = accusation.suspectId === scenario.solution.culpritId;

    // Check if team has found all required evidence (combined inventories + discovered)
    const teamInventory = new Set<string>();
    for (const p of session.players.values()) {
      for (const item of p.inventory) teamInventory.add(item);
    }
    for (const eid of session.gameState.discoveredEvidence) {
      teamInventory.add(eid);
    }

    const hasAllEvidence = scenario.solution.requiredEvidenceIds.every(
      id => teamInventory.has(id),
    );

    const isCorrect = isCorrectSuspect && hasAllEvidence;

    io.to(sessionId).emit('accusation:vote-result', {
      result: 'guilty',
      votes: voteRecord,
      isCorrect,
      summary: isCorrect
        ? `The team correctly identified ${accusation.suspectName} as the culprit!`
        : `The team accused ${accusation.suspectName}, but the case was not proven.`,
    });

    // End game
    session.state = 'ended';
    store.updateGameState(sessionId, {
      isGameOver: true,
      status: isCorrect ? 'won' : 'lost',
      endReason: isCorrect ? 'solved' : 'wrong_accusation',
    });

    io.to(sessionId).emit('session:gameover', {
      status: isCorrect ? 'won' : 'lost',
      endReason: isCorrect ? 'solved' : 'wrong_accusation',
      summary: isCorrect
        ? `Congratulations! ${accusation.suspectName} was indeed the culprit. Case closed.`
        : `Wrong accusation! ${accusation.suspectName} was not the culprit. The real criminal escapes.`,
    });
  } else {
    // Not guilty — game continues
    io.to(sessionId).emit('accusation:vote-result', {
      result: 'not_guilty',
      votes: voteRecord,
      summary: 'The team voted not guilty. The investigation continues.',
    });
  }

  // Clear active accusation
  session.activeAccusation = null;
  void store.sync(sessionId);

  console.log(`[accusation] vote resolved for session ${sessionId.slice(0, 8)}: ${result} (${guiltyCount} guilty, ${notGuiltyCount} not guilty)`);
}

/* ------------------------------------------------------------------ */
/*  #39: Periodic NPC movement helper                                  */
/* ------------------------------------------------------------------ */

function performNPCMovement(session: SessionData, scenario: Scenario): void {
  if (!scenario) return;

  for (const npc of scenario.npcs) {
    const npcState = session.npcStates.get(npc.id);
    if (!npcState) continue;

    // 15% chance per turn to move
    if (Math.random() < 0.15) {
      const currentRoom = scenario.rooms.find(r => r.id === npcState.currentRoomId);
      if (currentRoom) {
        const exits = Object.values(currentRoom.exits);
        // Filter out hidden rooms
        const validExits = exits.filter(exitId => {
          const room = scenario.rooms.find(r => r.id === exitId);
          return room && !room.isHidden;
        });
        if (validExits.length > 0) {
          const newRoomId = validExits[Math.floor(Math.random() * validExits.length)];
          npcState.currentRoomId = newRoomId;
          session.worldStateLog.push(`${npc.name} wandered to ${newRoomId}`);
        }
      }
    }
  }
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
              const newVisited = p.visitedRooms.includes(directive.target)
                ? p.visitedRooms
                : [...p.visitedRooms, directive.target];
              store.updatePlayer(sessionId, p.id, {
                currentRoomId: directive.target,
                visitedRooms: newVisited,
              });
            }
            break;
          }
          case 'PICKUP': {
            const p = Array.from(session.players.values()).find((pl) => pl.name === directive.playerName);
            if (p && !p.inventory.includes(directive.target)) {
              store.updatePlayer(sessionId, p.id, {
                inventory: [...p.inventory, directive.target],
              });
            }
            break;
          }
          case 'DISCOVER': {
            // #27 — Explicit evidence discovery
            if (!session.gameState.discoveredEvidence.includes(directive.target)) {
              session.gameState.discoveredEvidence.push(directive.target);
            }
            // Also add to player inventory so they "have" it
            const p = Array.from(session.players.values()).find((pl) => pl.name === directive.playerName);
            if (p && !p.inventory.includes(directive.target)) {
              p.inventory.push(directive.target);
            }
            break;
          }
          case 'SANITY': {
            // #38 — Sanity change
            const p = Array.from(session.players.values()).find((pl) => pl.name === directive.playerName);
            if (p) {
              const delta = parseInt(directive.target, 10);
              if (!isNaN(delta)) {
                // Doctor role gets 50% sanity damage reduction (#18)
                const actualDelta = (delta < 0 && p.role === 'doctor')
                  ? Math.ceil(delta / 2)
                  : delta;
                const newSanity = Math.max(0, Math.min(p.maxSanity, p.sanity + actualDelta));
                store.updatePlayer(sessionId, p.id, { sanity: newSanity });

                // Notify the player
                const playerSockets = findSocketsForPlayer(p.id);
                for (const sid of playerSockets) {
                  io.to(sid).emit('player:sanity-update', {
                    playerId: p.id,
                    sanity: newSanity,
                    delta: actualDelta,
                  });
                }

                // Game over if sanity reaches 0
                if (newSanity <= 0) {
                  for (const sid of playerSockets) {
                    io.to(sid).emit('session:error', {
                      message: 'Your mind shatters under the weight of what you have witnessed.',
                    });
                  }
                  // In single-player, end the game
                  if (session.maxPlayers === 1) {
                    session.state = 'ended';
                    store.updateGameState(sessionId, {
                      isGameOver: true,
                      status: 'lost',
                      endReason: 'fatal_choice',
                    });
                    io.to(sessionId).emit('session:gameover', {
                      status: 'lost',
                      endReason: 'sanity_death',
                      summary: `${p.name}'s mind could not withstand the horrors encountered. The investigation ends.`,
                    });
                  }
                }
              }
            }
            break;
          }
          case 'NPC_MOOD': {
            // #19 — NPC disposition change
            const npcState = session.npcStates.get(directive.target);
            if (npcState && directive.detail) {
              npcState.disposition = directive.detail as NPCState['disposition'];
              // Also record who caused it
              if (!npcState.metPlayers.includes(action.playerName)) {
                npcState.metPlayers.push(action.playerName);
              }
            }
            break;
          }
          case 'NPC_MEMORY': {
            // #19 — NPC memory addition
            const npcState = session.npcStates.get(directive.target);
            if (npcState && directive.detail) {
              npcState.memories.push(directive.detail);
              // Keep max 20 memories per NPC
              if (npcState.memories.length > 20) {
                npcState.memories = npcState.memories.slice(-20);
              }
              if (!npcState.metPlayers.includes(action.playerName)) {
                npcState.metPlayers.push(action.playerName);
              }
            }
            break;
          }
          case 'NPC_MOVE': {
            // #39 — NPC moves to a new room
            const parts = directive.target.split(':');
            if (parts.length === 2) {
              const [npcId, newRoomId] = parts;
              const npcState = session.npcStates.get(npcId);
              if (npcState) {
                npcState.currentRoomId = newRoomId;
              }
            }
            break;
          }
          case 'DISCOVER_EXIT': {
            // #40 — Discover hidden passage
            const parts = directive.target.split(':');
            if (parts.length === 2) {
              const [roomId, exitDir] = parts;
              const key = `${roomId}:hidden_exit:${exitDir}`;
              session.objectStates.set(key, { discovered: true });
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

      // Fallback evidence detection: scan narrative for item names (like SP does)
      // This catches cases where the AI describes finding an item but omits the PICKUP directive
      const actingPlayer = store.getPlayer(sessionId, action.playerId);
      if (actingPlayer) {
        // Combined team knowledge for prerequisite checks (#26)
        const teamKnowledge = new Set<string>();
        for (const p of session.players.values()) {
          for (const invId of p.inventory) teamKnowledge.add(invId);
        }
        for (const eid of session.gameState.discoveredEvidence) teamKnowledge.add(eid);

        const lowerResponse = privateResponse.toLowerCase();
        const lowerAction = action.message.toLowerCase();
        const evidenceItems = scenario.items.filter((i) => i.isEvidence);
        // Only trigger fallback if the player's action actually suggests interacting with the item
        const lookVerbs = /\b(take|pick|grab|collect|find|examine|investigate|search|look|inspect|check|open|read)\b/;
        const playerIntendsPickup = lookVerbs.test(lowerAction);
        for (const item of evidenceItems) {
          if (actingPlayer.inventory.includes(item.id)) continue;
          // #26: skip locked items whose prerequisites aren't satisfied
          if (item.prerequisites && item.prerequisites.length > 0) {
            const prereqsMet = item.prerequisites.every((p) => teamKnowledge.has(p));
            if (!prereqsMet) continue;
          }
          // Only trigger on player intent (avoid auto-pickup on casual mentions)
          if (!playerIntendsPickup) continue;
          const itemName = item.name.toLowerCase();
          const itemIdWords = item.id.replace(/_/g, ' ').toLowerCase();
          if (lowerResponse.includes(itemName) || lowerResponse.includes(itemIdWords)) {
            const currentInv = store.getPlayer(sessionId, action.playerId)?.inventory || [];
            if (!currentInv.includes(item.id)) {
              store.updatePlayer(sessionId, action.playerId, {
                inventory: [...currentInv, item.id],
              });
              session.worldStateLog.push(`Turn ${session.gameState.turnCount}: ${item.id} discovered by ${action.playerName} in ${action.roomId}`);
              console.log(`[evidence-fallback] ${action.playerName} discovered ${item.id} via narrative mention`);
            }
          }
        }

        // Also detect room movement from narrative if no MOVE directive was issued
        if (!directives.some((d) => d.type === 'MOVE')) {
          const isMovement = /\b(go|walk|move|head|enter|leave|travel|climb)\b/.test(lowerAction);
          if (isMovement) {
            const freshPlayer = store.getPlayer(sessionId, action.playerId);
            if (freshPlayer) {
              const currentRoom = scenario.rooms.find((r) => r.id === freshPlayer.currentRoomId);
              const dirMatch = lowerAction.match(/\b(north|south|east|west|up|down)\b/);
              if (currentRoom && dirMatch) {
                const nextRoomId = currentRoom.exits[dirMatch[1]];
                if (nextRoomId) {
                  const newVisited = freshPlayer.visitedRooms.includes(nextRoomId)
                    ? freshPlayer.visitedRooms
                    : [...freshPlayer.visitedRooms, nextRoomId];
                  store.updatePlayer(sessionId, action.playerId, {
                    currentRoomId: nextRoomId,
                    visitedRooms: newVisited,
                  });
                  session.worldStateLog.push(`Turn ${session.gameState.turnCount}: ${action.playerName} moved to ${nextRoomId}`);
                  console.log(`[move-fallback] ${action.playerName} moved to ${nextRoomId} via action text`);
                }
              }
            }
          }
        }
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

      // Always broadcast updated player state after each action resolves
      const updatedPlayersAfterAction = Array.from(session.players.values()).map(toPlayerDTO);
      io.to(sessionId).emit('players:updated', { players: updatedPlayersAfterAction });

      console.log(`[batcher] narrator done for ${action.playerName} (${directives.length} directives, ${witnessIds.length} witnesses)`);
    }

    // ---- #25: Increment MP turn counter after each batch ----
    session.mpTurnCount++;

    if (scenario && session.mpTurnCount >= scenario.maxTurns && session.state === 'playing') {
      session.state = 'ended';
      store.updateGameState(sessionId, {
        isGameOver: true,
        status: 'lost',
        endReason: 'turn_limit',
      });
      io.to(sessionId).emit('session:gameover', {
        status: 'lost',
        endReason: 'turn_limit',
        summary: `Time's up! The investigation ran out of turns after ${scenario.maxTurns} rounds.`,
      });
      console.log(`[game] session ${sessionId.slice(0, 8)} ended: turn limit reached (${session.mpTurnCount}/${scenario.maxTurns})`);
    }

    // ---- #39: Periodic NPC movement after each batch ----
    performNPCMovement(session, scenario);

    session.isStreaming = false;
    void store.sync(sessionId);

    // Always broadcast final player state after all actions resolve
    const finalPlayers = Array.from(session.players.values()).map(toPlayerDTO);
    io.to(sessionId).emit('players:updated', { players: finalPlayers });
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
        role: undefined,       // #18: no role until selected
        sanity: 100,           // #38: start at full sanity
        maxSanity: 100,
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
          sharedEvidence: session.sharedEvidence || [],
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
      if (session.state !== 'playing') return; // #25: no actions when game ended

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
    /*  #18: ROLE SELECTION                                              */
    /* ================================================================ */

    socket.on('player:select-role', (data, callback) => {
      const { sessionId, playerId, role } = data;
      const session = store.get(sessionId);
      if (!session) { callback({ success: false, error: 'Session not found' }); return; }
      if (session.state === 'playing') { callback({ success: false, error: 'Cannot change role during game' }); return; }

      // Check role not taken already
      const roleTaken = Array.from(session.players.values()).some(
        p => p.id !== playerId && p.role === role,
      );
      if (roleTaken) { callback({ success: false, error: 'Role already taken by another player' }); return; }

      store.updatePlayer(sessionId, playerId, { role });
      callback({ success: true });

      const player = store.getPlayer(sessionId, playerId);
      const allPlayers = getAllPlayerDTOs(store, sessionId);
      io.to(sessionId).emit('player:role-updated', {
        playerId,
        playerName: player?.name || 'Unknown',
        role,
        allPlayers,
      });

      void store.sync(sessionId);
      console.log(`[socket] ${player?.name} selected role: ${role}`);
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
    /*  EVIDENCE SHARING (multiplayer)                                  */
    /* ================================================================ */

    socket.on('evidence:share', (data) => {
      const { sessionId, playerId, evidenceId } = data;
      const session = store.get(sessionId);
      if (!session || session.state !== 'playing') return;

      const player = store.getPlayer(sessionId, playerId);
      if (!player) return;

      // Verify player actually has this item in their inventory
      if (!player.inventory.includes(evidenceId)) {
        socket.emit('session:error', { message: 'You do not have this evidence' });
        return;
      }

      // Check if already shared
      if (session.sharedEvidence.some((s) => s.evidenceId === evidenceId)) {
        return; // Already shared, no-op
      }

      const entry = {
        evidenceId,
        sharedByPlayerId: playerId,
        sharedByPlayerName: player.name,
        sharedByPlayerColor: player.color,
        timestamp: Date.now(),
      };

      session.sharedEvidence.push(entry);
      session.lastActivityAt = Date.now();
      void store.sync(sessionId);

      // Broadcast to all players in the session
      io.to(sessionId).emit('evidence:shared', entry);

      console.log(`[evidence:share] ${player.name} shared ${evidenceId}`);
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
      session.mpTurnCount = 0; // #25: reset turn counter

      const scenario = SCENARIOS[session.scenarioId];
      if (!scenario) { callback({ success: false, error: 'Unknown scenario' }); return; }

      // #19: Initialize NPC states from scenario
      for (const npc of scenario.npcs) {
        session.npcStates.set(npc.id, {
          id: npc.id,
          disposition: 'neutral',
          memories: [],
          metPlayers: [],
          currentRoomId: npc.roomId,
        });
      }

      void store.sync(sessionId);
      callback({ success: true });

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
    /*  #25: MULTIPLAYER ACCUSATION / VOTING                            */
    /* ================================================================ */

    socket.on('player:propose-accusation', (data, callback) => {
      const { sessionId, playerId, suspectId } = data;
      const session = store.get(sessionId);
      if (!session) { callback({ success: false, error: 'Session not found' }); return; }
      if (session.state !== 'playing') { callback({ success: false, error: 'Game not in progress' }); return; }
      if (session.activeAccusation) { callback({ success: false, error: 'A vote is already in progress' }); return; }

      const player = store.getPlayer(sessionId, playerId);
      if (!player) { callback({ success: false, error: 'Player not found' }); return; }

      // #18: Only detective role can propose (if roles are in use)
      const rolesInUse = Array.from(session.players.values()).some(p => p.role);
      if (rolesInUse && player.role !== 'detective') {
        callback({ success: false, error: 'Only the Detective can propose accusations' });
        return;
      }

      const scenario = SCENARIOS[session.scenarioId];
      if (!scenario) { callback({ success: false, error: 'Scenario not found' }); return; }

      const suspect = scenario.npcs.find(n => n.id === suspectId);
      if (!suspect) { callback({ success: false, error: 'Invalid suspect' }); return; }

      const VOTE_DURATION = 120_000; // 2 minutes
      const expiresAt = Date.now() + VOTE_DURATION;

      session.activeAccusation = {
        proposerId: playerId,
        proposerName: player.name,
        suspectId,
        suspectName: suspect.name,
        votes: new Map(),
        startedAt: Date.now(),
        expiresAt,
      };

      // Auto-resolve timer
      const timerId = setTimeout(() => {
        resolveAccusationVote(io, store, sessionId);
      }, VOTE_DURATION);
      accusationTimers.set(sessionId, timerId);

      callback({ success: true });

      io.to(sessionId).emit('accusation:vote-started', {
        proposerId: playerId,
        proposerName: player.name,
        suspectId,
        suspectName: suspect.name,
        expiresAt,
      });

      void store.sync(sessionId);
      console.log(`[accusation] ${player.name} proposes: ${suspect.name} is guilty (session ${sessionId.slice(0, 8)})`);
    });

    socket.on('player:vote-accusation', (data, callback) => {
      const { sessionId, playerId, vote } = data;
      const session = store.get(sessionId);
      if (!session) { callback({ success: false, error: 'Session not found' }); return; }
      if (!session.activeAccusation) { callback({ success: false, error: 'No active vote' }); return; }
      if (session.activeAccusation.votes.has(playerId)) {
        callback({ success: false, error: 'Already voted — votes cannot be changed' });
        return;
      }

      session.activeAccusation.votes.set(playerId, vote);
      callback({ success: true });

      // Check if all connected players have voted
      const connectedPlayers = Array.from(session.players.values()).filter(p => p.isConnected);
      const allVoted = connectedPlayers.every(p => session.activeAccusation!.votes.has(p.id));

      if (allVoted) {
        resolveAccusationVote(io, store, sessionId);
      }

      console.log(`[accusation] ${playerId.slice(0, 8)} voted ${vote} (${session.activeAccusation.votes.size}/${connectedPlayers.length})`);
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
          sharedEvidence: session.sharedEvidence || [],
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
