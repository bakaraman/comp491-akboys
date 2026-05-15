/**
 * handlers.ts — Socket.IO event handlers for multiplayer sessions
 *
 * Registers all real-time event listeners: player join, actions,
 * communication, typing, rejoin, disconnect, role selection,
 * accusation voting, and game-end mechanics.
 *
 * Supports: roles (#18), NPC shared memory (#19), MP game end (#25),
 *           evidence chains (#26), evidence fix (#27), sanity (#38),
 *           NPC movement (#39), secret rooms (#40),
 *           payload validation (#53), spectator mode (#52).
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
import { toPlayerDTO, SCENARIOS, pickLang } from '@akboys/shared';
import type { SessionStore, SessionData } from '../store/SessionStore.js';
import { nextPlayerColor, serializeVotes } from '../store/SessionStore.js';
import { ActionBatcher, PLAYER_ACTION_COOLDOWN } from './action-batcher.js';
import {
  validatePayload,
  PlayerJoinSchema,
  PlayerActionSchema,
  PlayerTypingSchema,
  PlayerRejoinSchema,
  GameStartSchema,
  ScenarioSelectSchema,
  ScenarioVoteSchema,
  ScenarioConfirmSchema,
  CommRoomSchema,
  CommDirectSchema,
  EvidenceShareSchema,
  PlayerSelectRoleSchema,
  ProposeAccusationSchema,
  VoteAccusationSchema,
  StoryGenerateSchema,
  SpectatorJoinSchema,
} from './payload-schemas.js';
import {
  buildPlayerActionPrompt,
  buildOpeningPrompt,
  buildSceneContext,
  parseStructuredResponse,
  parseLegacyTextResponse,
  parseStateChanges,
  buildCombinedUserMessage,
  validateDirective,
} from './prompt-builder.js';
import {
  narratorChatStream,
  narratorStructuredResponse,
  suggestFollowUps,
  buildContextFallbacks,
} from '../middleware/openai.js';
import {
  getScenarioForSession,
  generateWorld,
  generateOpeningImageFromPrompt,
} from '../world/index.js';
import { setupVoiceHandlers, leaveVoice } from './voice-handlers.js';

type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/** Maps a socket ID to the session and player it belongs to.
 *  Exported so sibling files (voice-handlers.ts) can route by player. */
export const socketMap = new Map<string, { sessionId: string; playerId: string }>();

/** Socket IDs that joined as read-only spectators (Issue #52) */
const spectatorSockets = new Set<string>();

/**
 * Pending disconnect timers keyed by playerId. If the player reconnects within
 * DISCONNECT_GRACE_MS, we cancel the timer and the chat never sees a
 * "X disconnected" / "X reconnected" flicker.
 */
const pendingDisconnects = new Map<string, NodeJS.Timeout>();
const DISCONNECT_GRACE_MS = 15_000;

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

/** Filter session history server-side — only messages this player should see.
 *  #58: when a message carries a bilingual companion (`bilingualContent`),
 *  flatten to the receiving player's locale so the chat re-renders in their
 *  language after a reconnect, instead of falling back to the TR slice. */
function filterHistoryForPlayer(store: SessionStore, sessionId: string, playerId: string) {
  const session = store.get(sessionId);
  if (!session) return [];

  const player = session.players.get(playerId);
  const locale = player?.locale ?? 'tr';

  return session.history
    .filter((m) => {
      // Global messages (no visibleTo = everyone can see: opening narration, system)
      if (!m.visibleTo || m.visibleTo.length === 0) return true;
      // Scoped messages — check audience
      return m.visibleTo.includes(playerId);
    })
    .map((m) => ({
      role: m.role,
      content: m.bilingualContent ? pickLang(m.bilingualContent, locale) : m.content,
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

/**
 * Resolve an accusation vote.
 *
 * Rules (Velvet Shadow v2):
 *   - Unanimity required: EVERY connected player must vote "guilty" for accusation to proceed.
 *   - Any "not_guilty" OR missing vote (timeout) → accusation rejected, game CONTINUES.
 *   - Unanimous "guilty" → backend checks correctness:
 *       * Correct culprit + correct evidence + all required evidence collected → WIN
 *       * Anything else → INSTANT LOSS (one shot rule)
 */
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

  const voteRecord: Record<string, 'guilty' | 'not_guilty'> = {};
  for (const [pid, vote] of accusation.votes) voteRecord[pid] = vote;

  const connectedPlayers = Array.from(session.players.values()).filter((p) => p.isConnected);
  const allVoted = connectedPlayers.every((p) => accusation.votes.has(p.id));
  const unanimousGuilty = allVoted && connectedPlayers.every((p) => accusation.votes.get(p.id) === 'guilty');

  // Clear active accusation first (no matter the outcome)
  session.activeAccusation = null;

  if (!unanimousGuilty) {
    // REJECTED — game continues
    io.to(sessionId).emit('accusation:vote-result', {
      result: 'not_guilty',
      votes: voteRecord,
      summary: allVoted
        ? `Takım hemfikir olamadı. Soruşturma devam ediyor.`
        : `Oylama zamanında tamamlanmadı. Soruşturma devam ediyor.`,
    });
    void store.sync(sessionId);
    console.log(`[accusation] rejected for ${sessionId.slice(0, 8)} (unanimous=${unanimousGuilty})`);
    return;
  }

  // UNANIMOUS GUILTY — now check correctness
  const scenario = getScenarioForSession(session);
  if (!scenario) return;

  const isCorrectSuspect = accusation.suspectId === scenario.solution.culpritId;

  // Accusation is correct iff the suspect matches the culprit.
  // No evidence-gating — it's up to the team to have deduced narratively.
  const isCorrect = isCorrectSuspect;

  const roomSockets = io.sockets.adapter.rooms.get(sessionId);
  console.log(`[accusation] emitting vote-result+gameover to room ${sessionId.slice(0, 8)}: ${roomSockets?.size ?? 0} sockets`);

  // End game — win if correct, instant loss if wrong (state change first)
  session.state = 'ended';
  store.updateGameState(sessionId, {
    isGameOver: true,
    status: isCorrect ? 'won' : 'lost',
    endReason: isCorrect ? 'solved' : 'wrong_accusation',
  });

  // Emit GAMEOVER FIRST (the outcome the UI most cares about)
  io.to(sessionId).emit('session:gameover', {
    status: isCorrect ? 'won' : 'lost',
    endReason: isCorrect ? 'solved' : 'wrong_accusation',
    summary: isCorrect
      ? `Dava kapandı. ${accusation.suspectName} gerçekten katildi.`
      : `${accusation.suspectName} katil değildi. Gerçek katil kaçtı.`,
  });

  // Then vote-result for UI ribbon / transition cue
  io.to(sessionId).emit('accusation:vote-result', {
    result: 'guilty',
    votes: voteRecord,
    isCorrect,
    summary: isCorrect
      ? `Takım oybirliğiyle ${accusation.suspectName}'i suçladı. Kanıtlar yerinde.`
      : `Takım oybirliğiyle ${accusation.suspectName}'i suçladı. Ama kanıtlar tutmadı.`,
  });

  void store.sync(sessionId);
  console.log(`[accusation] resolved ${sessionId.slice(0, 8)}: ${isCorrect ? 'WON' : 'LOST'} (suspect=${accusation.suspectName})`);
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

/**
 * Maps spectator socket ID → sessionId so we can count per-session.
 * Cleaned up on disconnect.
 */
const spectatorSessionMap = new Map<string, string>();

/** Count spectators currently watching a session */
function countSpectators(sessionId: string): number {
  let n = 0;
  for (const sid of spectatorSessionMap.values()) {
    if (sid === sessionId) n++;
  }
  return n;
}

export function registerSocketHandlers(io: GameServer, store: SessionStore): void {

  /* ---- Queue-state broadcaster ---- */
  function emitQueueState(
    sessionId: string,
    processing: PlayerAction | null,
    remainingInBatch: PlayerAction[] = [],
  ): void {
    const session = store.get(sessionId);
    if (!session) return;
    const waiting = [...remainingInBatch, ...session.actionQueue].map((a) => {
      const p = session.players.get(a.playerId);
      return {
        playerId: a.playerId,
        playerName: a.playerName,
        playerColor: p?.color ?? '#888',
        message: a.message,
      };
    });
    io.to(sessionId).emit('session:queue', {
      waiting,
      processingPlayerId: processing?.playerId ?? null,
      processingPlayerName: processing?.playerName ?? null,
    });
  }

  /* ---- Action batcher: fires per-player narrator calls ---- */
  const batcher = new ActionBatcher(store, async (sessionId, actions) => {
    const session = store.get(sessionId);
    if (!session) return;

    const scenario = getScenarioForSession(session);
    if (!scenario) return;

    session.isStreaming = true;

    // Process each action sequentially for canonical state consistency
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      // Broadcast: this player is now being processed; anyone after is still waiting.
      emitQueueState(sessionId, action, actions.slice(i + 1));

      const player = store.getPlayer(sessionId, action.playerId);
      if (!player) continue;

      // Build per-player prompt with current canonical state + world context
      const systemPrompt = buildPlayerActionPrompt(scenario, session, action.playerName, action.roomId, session.world ?? null);
      const actionMsg = `[${action.playerName} / ${action.roomId}] "${action.message}"`;

      // Store action in history (chat-private — Velvet Shadow v3 isolation).
      //
      // Pre-v3 the actor's typed action was also visible to same-room
      // witnesses so co-op players saw each other's prompts. v3 walks that
      // back: each player only ever sees their own typed input + their own
      // narrator response in chat. World state (MOVE, NPC moves, items)
      // stays shared, so the narrator can still tell witnesses about the
      // consequences in their own next turn.
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
      // v3 isolation: narrator chunks AND the typed action emit are both
      // actor-only. Witnesses get their own queue/typing indicators via
      // the unchanged session:queue / player:typing-update broadcasts.

      // Primary: structured JSON response (no streaming, but guaranteed schema)
      // Fallback: streaming text response with legacy parsing
      let privateResponse: { tr: string; en: string };
      let observedLine: { tr: string; en: string };
      let directives: ReturnType<typeof parseStructuredResponse>['directives'];

      // #58: helper to flatten a bilingual block for one specific player's socket
      const flattenFor = (
        targetPlayerId: string,
        bilingual: { tr: string; en: string },
      ): string => {
        const targetPlayer = session.players.get(targetPlayerId);
        const targetLocale = targetPlayer?.locale ?? 'tr';
        return pickLang(bilingual, targetLocale);
      };

      // #65 + #58: structured-call retry once on null. Catches both transient
      // API errors and LLM outputs that fail JSON-contamination check.
      // #60: pass session.world so the schema can enum-restrict target to
      // real room IDs (kills "travelling stuck"). sessionId threaded for usage log.
      let structuredResult = await narratorStructuredResponse(systemPrompt, session.history, sessionId, session.world);
      if (!structuredResult) {
        console.warn(`[narrator-structured] first attempt returned null for ${action.playerName}, retrying...`);
        structuredResult = await narratorStructuredResponse(systemPrompt, session.history, sessionId, session.world);
        if (!structuredResult) {
          console.error(`[narrator-structured] both attempts failed for ${action.playerName}, falling back to legacy text`);
        }
      }

      if (structuredResult) {
        // Structured path succeeded — parse with schema validation
        const parsed = parseStructuredResponse(structuredResult, action.playerName, action.message);
        privateResponse = parsed.privateResponse;
        observedLine = parsed.observedLine;
        directives = parsed.directives;

        // #58: narrator response is ACTOR-ONLY. In bilingual MP, witnesses
        // were receiving the actor's narrator translated into their own
        // locale, which read as a second-person ("sen / you") message and
        // looked like the witness's own action — extremely confusing. The
        // witness still sees the actor's typed action message (stored above
        // with same-room visibleTo) so co-op context is not lost; only the
        // narrator's prose is private to the actor.
        const flat = flattenFor(action.playerId, privateResponse);
        const actorSocketIds = findSocketsForPlayer(action.playerId);
        for (const sid of actorSocketIds) {
          io.to(sid).emit('narrator:chunk', {
            content: flat,
            fullText: flat,
            targetPlayerId: action.playerId,
          });
        }

        console.log(`[batcher] structured response for ${action.playerName}`);
      } else {
        // Fallback: streaming text response with legacy tag parsing.
        // Legacy path is single-language (Turkish). Stream as-is to the
        // existing fan-out; locale fidelity is lost for the fallback, which
        // is acceptable because it only fires when the structured path errors.
        console.log(`[batcher] falling back to streaming for ${action.playerName}`);
        let fullText = '';

        try {
          for await (const chunk of narratorChatStream(systemPrompt, session.history, sessionId)) {
            fullText += chunk;
            // #58: legacy fallback is also actor-only — same reasoning as the
            // structured path (witnesses don't see second-person prose).
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
        let result = validateDirective(directive, session, scenario, action.playerId, action.roomId);

        // Layer B: fuzzy match recovery — if MOVE target doesn't match a room ID,
        // try case-insensitive comparison against room names as a safety net.
        if (!result.valid && directive.type === 'MOVE' && session.world) {
          const needle = directive.target.toLowerCase();
          const matched = scenario.rooms.filter((r) => r.name.toLowerCase() === needle);
          if (matched.length === 1) {
            const originalTarget = directive.target;
            directive.target = matched[0].id;
            result = validateDirective(directive, session, scenario, action.playerId, action.roomId);
            if (result.valid) {
              console.log(`[directive] FUZZY_MATCHED MOVE ${directive.playerName} -> ${originalTarget} → ${directive.target}`);
            } else {
              // re-validation failed (shouldn't happen, but restore and fall through)
              directive.target = originalTarget;
            }
          }
        }

        if (!result.valid) {
          console.log(`[directive] REJECTED: ${directive.type} ${directive.playerName} -> ${directive.target}: ${result.reason}`);
          for (const sid of actorSockets) {
            io.to(sid).emit('directive:rejected', {
              playerId: action.playerId,
              type: directive.type,
              target: directive.target,
              reason: result.reason ?? 'Unknown',
            });
          }
          continue;
        }

        // Apply validated state mutation — only MOVE is tracked now.
        // Everything else (inventory, evidence, sanity, NPC mood) lives in
        // narrative only; the narrator is sole authority.
        if (directive.type === 'MOVE') {
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
        }

        if (result.worldLogEntry) {
          session.worldStateLog.push(result.worldLogEntry);
        }
        if (result.worldStateEvent) {
          session.worldStateEvents.push(result.worldStateEvent);
        }
        console.log(`[directive] APPLIED: ${directive.type} ${directive.playerName} -> ${directive.target}`);
      }

      // Also append a narrator-response preview line to the world log so the
      // finale prompt has real story context (since we don't track pickups).
      // #58: log the TR slice — finale prompt reads world log as TR context.
      {
        const preview = privateResponse.tr.replace(/\n+/g, ' ').slice(0, 200);
        session.worldStateLog.push(
          `Turn ${session.gameState.turnCount}: ${action.playerName} in ${action.roomId} — "${action.message.slice(0, 80)}" → ${preview}`,
        );
      }

      // #58: narrator response is ACTOR-ONLY (see emit block above for why).
      // The actor's typed action message is already visible to same-room
      // witnesses (stored earlier with a same-room visibleTo); witnesses
      // read what was done but not the second-person prose addressed to
      // the actor.
      store.addMessage(sessionId, {
        role: 'assistant',
        content: privateResponse.tr,
        bilingualContent: privateResponse,
        playerId: action.playerId,
        playerName: action.playerName,
        timestamp: Date.now(),
        messageType: 'private',
        visibleTo: [action.playerId],
      });

      // Generate scoped suggestions for the actor (witnesses don't get suggestions —
      // they read along but don't take actions on behalf of the actor).
      // C.2: pass scene context so suggestions reference real NPCs / items / exits
      // for the actor's CURRENT room (which may have changed mid-action via MOVE).
      const updatedActor = store.getPlayer(sessionId, action.playerId);
      const actorRoomId = updatedActor?.currentRoomId ?? action.roomId;
      const sceneCtx = buildSceneContext(scenario, session, actorRoomId);
      const actorLocale = updatedActor?.locale ?? 'tr';
      let suggestionsBilingual: Array<{ tr: string; en: string }>;
      try {
        suggestionsBilingual = await suggestFollowUps(privateResponse.tr, sceneCtx, sessionId);
      } catch {
        // Use the scene-aware fallback rather than scattered hardcoded tuples.
        suggestionsBilingual = buildContextFallbacks(sceneCtx);
      }
      const actorSuggestions = suggestionsBilingual.map((s) => pickLang(s, actorLocale));

      // Issue #64: emit players:updated BEFORE narrator:done so the map
      // reflects the new position before narrator text describing the move
      // appears. (Order matters: position-first, then narration.)
      void store.sync(sessionId);
      const updatedPlayersAfterAction = Array.from(session.players.values()).map(toPlayerDTO);
      io.to(sessionId).emit('players:updated', { players: updatedPlayersAfterAction });

      // #58: narrator:done is ACTOR-ONLY (matches the actor-only narrator:chunk
      // path above). Witnesses do not receive the second-person narrator prose
      // because in bilingual MP it translates as if it were addressed to them,
      // which is confusing. They still see the actor's typed action message.
      const actorDoneSockets = findSocketsForPlayer(action.playerId);
      const actorFlat = flattenFor(action.playerId, privateResponse);
      for (const sid of actorDoneSockets) {
        io.to(sid).emit('narrator:done', {
          fullText: actorFlat,
          suggestions: actorSuggestions,
          targetPlayerId: action.playerId,
        });
      }

      // No observed-summary emit anymore — removed in Velvet Shadow v2.
      // observedLine is unused; we leave parser compatibility but ignore output.
      void observedLine;

      console.log(`[batcher] narrator done for ${action.playerName} (${directives.length} directives)`);
    }

    // ---- #25: Increment MP turn counter after each batch ----
    session.mpTurnCount++;

    // ---- C.4: Broadcast turn update so clients can render the counter ----
    io.to(sessionId).emit('turn:updated', {
      turnCount: session.mpTurnCount,
      maxTurns: scenario.maxTurns,
    });

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

    // Batch complete — any remaining actions in session.actionQueue are
    // from late-arrivers and will be processed in the next batch.
    emitQueueState(sessionId, null, []);
  });

  io.on('connection', (socket: GameSocket) => {
    console.log(`[socket] connected: ${socket.id}`);

    /* ---- Voice chat signaling (V-key walkie-talkie, #48) ---- */
    setupVoiceHandlers(io, socket);

    /* ---- spectator:join (#52)
     *
     * #58 follow-up: spectator carries its own locale so the server can
     * flatten the bilingual companion on each message and pick the right
     * scenario title slice. Without this the spectator's session:state
     * always showed the TR slice regardless of their UI language.
     */
    socket.on('spectator:join' as never, (data: unknown) => {
      const v = validatePayload(SpectatorJoinSchema, data, 'spectator:join');
      if (!v.ok) { socket.emit('session:error', { message: 'INVALID_PAYLOAD' }); return; }
      const { sessionId, locale } = v.data;
      const spectatorLocale = locale ?? 'tr';
      const session = store.get(sessionId);
      if (!session) { socket.emit('session:error', { message: 'SESSION_NOT_FOUND' }); return; }
      spectatorSockets.add(socket.id);
      spectatorSessionMap.set(socket.id, sessionId);
      socket.join(sessionId);
      // Send current session state (full history visible to spectators)
      const spectatorScenario = getScenarioForSession(session, spectatorLocale);
      const spectatorPlayers = getAllPlayerDTOs(store, sessionId);
      socket.emit('session:state', {
        session: {
          id: session.id,
          scenarioId: session.scenarioId,
          scenarioTitle: spectatorScenario?.title || 'Unknown',
          roomCode: session.roomCode,
          players: spectatorPlayers,
          history: session.history.map((m) => ({
            role: m.role,
            // #58: flatten bilingual companion to the spectator's locale when
            // present; otherwise fall back to the legacy single-language slice.
            content: m.bilingualContent ? pickLang(m.bilingualContent, spectatorLocale) : m.content,
            playerId: m.playerId,
            playerName: m.playerName,
            playerColor: m.playerColor,
            messageType: m.messageType,
          })),
          state: session.state,
          selectedScenarioId: session.selectedScenarioId,
          scenarioVotes: serializeVotes(session),
          commHistory: [],
          sharedEvidence: session.sharedEvidence || [],
          turnCount: session.mpTurnCount,
          maxTurns: spectatorScenario?.maxTurns,
          spectatorCount: countSpectators(sessionId),
        },
      });
      console.log(`[socket] spectator joined session ${sessionId.slice(0, 8)} (locale=${spectatorLocale})`);
    });

    /* ---- player:join ---- */
    socket.on('player:join', (data, callback) => {
      const v = validatePayload(PlayerJoinSchema, data, 'player:join');
      if (!v.ok) { callback({ success: false, error: 'Invalid payload' }); return; }
      const { sessionId, playerName, locale } = v.data;

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

      const scenario = getScenarioForSession(session);
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
        locale: locale ?? 'tr', // #58: optional from older clients → TR default
        joinedAt: Date.now(),
        lastActiveAt: 0,
      };

      store.addPlayer(sessionId, player);
      // #58: drop any stale socket mappings for the same playerId so a
      // refresh during the disconnect grace window doesn't double-emit
      // narrator chunks to two sockets simultaneously.
      for (const [sid, mapping] of socketMap) {
        if (mapping.playerId === playerId && sid !== socket.id) socketMap.delete(sid);
      }
      socketMap.set(socket.id, { sessionId, playerId });
      socket.join(sessionId);

      const allPlayers = getAllPlayerDTOs(store, sessionId);
      callback({ success: true, playerId });
      io.to(sessionId).emit('player:joined', { player: toPlayerDTO(player), allPlayers });

      // Send filtered session state to the joining player (server-side visibility)
      const joinScenario = getScenarioForSession(session);
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
          // C.4: turn counter for reload/late-join sync
          turnCount: session.mpTurnCount,
          maxTurns: joinScenario?.maxTurns,
        },
      });

      void store.sync(sessionId);

      console.log(`[socket] ${trimmedName} joined session ${sessionId.slice(0, 8)} (${session.players.size}/${session.maxPlayers})`);
    });

    /* ---- player:action ---- */
    socket.on('player:action', (data) => {
      // Spectators must not be able to send actions (#52)
      if (spectatorSockets.has(socket.id)) return;

      const v = validatePayload(PlayerActionSchema, data, 'player:action');
      if (!v.ok) { socket.emit('session:error', { message: 'INVALID_PAYLOAD' }); return; }
      const { sessionId, playerId, message } = v.data;

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

      // v3 chat isolation: action:queued is what the client uses to append
      // the typed action to chat. We only emit it to the acting player's
      // own sockets so witnesses never see the actor's prompt in their chat.
      // The session-wide queue/turn UI keeps working because it's driven by
      // the unchanged session:queue broadcast below.
      const actingSocketIds = findSocketsForPlayer(playerId);
      for (const sid of actingSocketIds) {
        io.to(sid).emit('action:queued', {
          playerId,
          playerName: player.name,
          playerColor: player.color,
          message: action.message,
          queueSize: batcher.queueSize(sessionId),
          timeRemaining,
        });
      }

      // Broadcast queue state to EVERYONE in the session so teammates can
      // see who's waiting and in what order. (processing state, if any, will
      // be re-emitted by the batcher loop's next iteration.)
      emitQueueState(sessionId, null, []);

      console.log(`[socket] ${player.name} queued action in session ${sessionId.slice(0, 8)}`);
    });

    /* ---- player:typing ---- */
    socket.on('player:typing', (data) => {
      if (spectatorSockets.has(socket.id)) return;
      const v = validatePayload(PlayerTypingSchema, data, 'player:typing');
      if (!v.ok) return;
      const { sessionId, playerId, isTyping } = v.data;
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
      if (spectatorSockets.has(socket.id)) { callback({ success: false, error: 'Spectators cannot act' }); return; }
      const v = validatePayload(PlayerSelectRoleSchema, data, 'player:select-role');
      if (!v.ok) { callback({ success: false, error: 'Invalid payload' }); return; }
      const { sessionId, playerId, role } = v.data;
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

    /**
     * Evidence Board (Velvet Shadow v2): comm:room and comm:direct now both
     * broadcast to every connected player in the session. The original
     * room-only / direct-only distinction was retired when the team chat
     * was repurposed as a shared notepad for evidence theories. Wire
     * protocol kept the same so older clients still work.
     *
     * Hardened with Serdar's spectator guard + Zod payload validation
     * (#53) — spectators cannot post; malformed payloads are rejected
     * instead of corrupting state.
     */
    function broadcastEvidenceNote(
      sessionId: string,
      playerId: string,
      content: string,
    ): void {
      const session = store.get(sessionId);
      if (!session) return;

      const player = store.getPlayer(sessionId, playerId);
      if (!player) return;

      const audience: string[] = [];
      for (const p of session.players.values()) {
        if (p.isConnected) audience.push(p.id);
      }
      if (!audience.includes(playerId)) audience.push(playerId);

      const msg: CommMessageDTO = {
        id: uuidv4(),
        senderId: playerId,
        senderName: player.name,
        senderColor: player.color,
        content: content.trim(),
        timestamp: Date.now(),
        mode: 'room',
        roomId: player.currentRoomId,
        visibleTo: audience,
      };

      session.commHistory.push(msg);
      session.lastActivityAt = Date.now();
      void store.sync(sessionId);

      const targetSids = new Set<string>();
      for (const pid of audience) {
        for (const sid of findSocketsForPlayer(pid)) targetSids.add(sid);
      }
      for (const sid of targetSids) {
        io.to(sid).emit('comm:message', msg);
      }

      console.log(`[evidence-board] ${player.name}: "${content.slice(0, 40)}" (audience ${audience.length})`);
    }

    socket.on('comm:room', (data) => {
      if (spectatorSockets.has(socket.id)) return;
      const v = validatePayload(CommRoomSchema, data, 'comm:room');
      if (!v.ok) { socket.emit('session:error', { message: 'INVALID_PAYLOAD' }); return; }
      broadcastEvidenceNote(v.data.sessionId, v.data.playerId, v.data.content);
    });

    socket.on('comm:direct', (data) => {
      // Direct distinction retired — broadcast to the whole session.
      // targetPlayerId is ignored; validation still ensures the payload shape is sane.
      if (spectatorSockets.has(socket.id)) return;
      const v = validatePayload(CommDirectSchema, data, 'comm:direct');
      if (!v.ok) { socket.emit('session:error', { message: 'INVALID_PAYLOAD' }); return; }
      broadcastEvidenceNote(v.data.sessionId, v.data.playerId, v.data.content);
    });

    /* ================================================================ */
    /*  EVIDENCE SHARING (multiplayer)                                  */
    /* ================================================================ */

    socket.on('evidence:share', (data) => {
      if (spectatorSockets.has(socket.id)) return;
      const v = validatePayload(EvidenceShareSchema, data, 'evidence:share');
      if (!v.ok) { socket.emit('session:error', { message: 'INVALID_PAYLOAD' }); return; }
      const { sessionId, playerId, evidenceId } = v.data;
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
      if (spectatorSockets.has(socket.id)) return;
      const v = validatePayload(ScenarioSelectSchema, data, 'scenario:select');
      if (!v.ok) return;
      const { sessionId, playerId, scenarioId } = v.data;
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
      if (spectatorSockets.has(socket.id)) return;
      const v = validatePayload(ScenarioVoteSchema, data, 'scenario:vote');
      if (!v.ok) return;
      const { sessionId, playerId, scenarioId } = v.data;
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
      if (spectatorSockets.has(socket.id)) { callback({ success: false, error: 'Spectators cannot act' }); return; }
      const v = validatePayload(ScenarioConfirmSchema, data, 'scenario:confirm');
      if (!v.ok) { callback({ success: false, error: 'Invalid payload' }); return; }
      const { sessionId, playerId, scenarioId } = v.data;
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

    /* ================================================================ */
    /*  STORY:GENERATE — procedural world generation (Velvet Shadow v2) */
    /* ================================================================ */

    socket.on('story:generate', async (data, callback) => {
      if (spectatorSockets.has(socket.id)) { callback({ success: false, error: 'Spectators cannot act' }); return; }
      const v = validatePayload(StoryGenerateSchema, data, 'story:generate');
      if (!v.ok) { callback({ success: false, error: 'Invalid payload' }); return; }
      const { sessionId, playerId, hostPrompt } = v.data;

      const session = store.get(sessionId);
      if (!session) { callback({ success: false, error: 'Session not found' }); return; }
      if (session.state === 'playing') { callback({ success: false, error: 'Game already started' }); return; }
      if (session.world) { callback({ success: false, error: 'Story already generated' }); return; }
      if (session.players.size < 1) { callback({ success: false, error: 'Need at least one player' }); return; }

      const firstPlayer = Array.from(session.players.values())[0];
      if (firstPlayer.id !== playerId) { callback({ success: false, error: 'Only the host can generate the story' }); return; }

      callback({ success: true });
      store.setHostPrompt(sessionId, hostPrompt);
      io.to(sessionId).emit('story:status', { phase: 'queued' });

      const sid = sessionId.slice(0, 8);
      const tStoryStart = Date.now();
      console.log(`[story ${sid}] ▶ start prompt="${hostPrompt.slice(0, 60)}" playerCount=${session.players.size}`);

      // Kick off opening image in PARALLEL with world gen — uses just the host
      // prompt + a generic noir style hint so we don't have to wait for world text.
      const tImgEarlyStart = Date.now();
      const openingImagePromise = generateOpeningImageFromPrompt(hostPrompt).then((url) => {
        const ms = Date.now() - tImgEarlyStart;
        if (url) {
          store.setOpeningImage(sessionId, url);
          io.to(sessionId).emit('story:image-ready', {
            kind: 'opening',
            id: 'opening',
            url,
          });
          console.log(`[story ${sid}] ✓ opening image ready (${ms}ms, ${(url.length / 1024).toFixed(0)}KB) [parallel]`);
        } else {
          console.warn(`[story ${sid}] ✗ opening image failed (${ms}ms)`);
        }
      });

      try {
        // #58: do NOT send a localized `message` string from the server.
        // The client maps `phase` → its own locale-aware label (see LobbyScreen
        // and useMultiplayerSession). Sending a TR string here leaked into
        // EN clients' lobby UI.
        io.to(sessionId).emit('story:status', { phase: 'generating' });
        const playerCount = session.players.size;

        const tWorldStart = Date.now();
        const result = await generateWorld({ hostPrompt, playerCount, sessionId });
        const worldMs = Date.now() - tWorldStart;
        store.setWorld(sessionId, result.world);
        console.log(`[story ${sid}] ✓ world ready (${worldMs}ms) title="${pickLang(result.world.meta.title, 'tr')}" rooms=${result.world.rooms.length} npcs=${result.world.npcs.length} items=${result.world.items.length} fallback=${result.usedFallback} genre=${result.genreTag}`);
        console.log(`[story ${sid}]   openingNarration: ${pickLang(result.world.openingNarration, 'tr').slice(0, 240)}...`);
        console.log(`[story ${sid}]   culprit: ${result.world.npcs.find((n) => n.isCulprit)?.name}`);

        // Also set scenarioId to our synthetic marker so downstream code knows.
        const sess = store.get(sessionId);
        if (sess) {
          sess.scenarioId = '__generated';
          sess.detectedGenre = result.genreTag;
        }
        void store.sync(sessionId);

        // Assign players to entry scenes BEFORE emitting story:ready
        const freshSession = store.get(sessionId);
        if (freshSession) {
          const entries = result.world.entryScenes;
          const players = Array.from(freshSession.players.values());
          players.forEach((p, i) => {
            const entry = entries[i % entries.length];
            store.updatePlayer(sessionId, p.id, {
              currentRoomId: entry.roomId,
              visitedRooms: [entry.roomId],
            });
          });
        }

        // Prepare broadcast payload
        const rooms = result.world.rooms.map((r) => ({
          id: r.id,
          name: r.name,
          exits: r.exits as Record<string, string | null>,
        }));
        const npcs = result.world.npcs.map((n) => ({
          id: n.id,
          name: n.name,
          role: n.role,
        }));
        const evidenceItems = result.world.items
          .filter((i) => i.isEvidence)
          .map((i) => ({ id: i.id, name: i.name }));

        // If image finished BEFORE world gen, include it directly in story:ready
        // so clients that haven't seen the earlier story:image-ready (because
        // worldMeta was null) still get it. Clients also listen for a later
        // story:image-ready if the image arrives after.
        const alreadyReadyImageUrl = store.get(sessionId)?.openingImageUrl ?? null;
        io.to(sessionId).emit('story:ready', {
          openingImageUrl: alreadyReadyImageUrl,
          world: {
            title: result.world.meta.title,
            setting: result.world.meta.setting,
            openingNarration: result.world.openingNarration,
          },
          rooms,
          npcs,
          evidenceItems,
        });
        if (alreadyReadyImageUrl) {
          console.log(`[story ${sid}]   (opening image was already ready, included in story:ready)`);
        }
        store.markOpeningReady(sessionId);
        console.log(`[story ${sid}] ✓ emit story:ready (total=${Date.now() - tStoryStart}ms) — opening image running in parallel`);
        void openingImagePromise;

        // NOTE: per-room and per-NPC images intentionally NOT generated.
        // Only the single opening cinematic image matters; skipping these
        // saves ~7-8 image API calls per session and keeps us under the 5/min rate limit.
      } catch (err) {
        console.error(`[story ${sid}] ✗ failed:`, err);
        // #58: phase-only emit. Client uses T.errors.generating for the
        // user-facing label; we log the raw error server-side instead.
        io.to(sessionId).emit('story:status', { phase: 'failed' });
      }
    });

    socket.on('game:start', async (data, callback) => {
      if (spectatorSockets.has(socket.id)) { callback({ success: false, error: 'Spectators cannot act' }); return; }
      const v = validatePayload(GameStartSchema, data, 'game:start');
      if (!v.ok) { callback({ success: false, error: 'Invalid payload' }); return; }
      const { sessionId, playerId } = v.data;

      const session = store.get(sessionId);
      if (!session) { callback({ success: false, error: 'Session not found' }); return; }
      if (session.state === 'playing') { callback({ success: false, error: 'Game already started' }); return; }
      if (!session.world) { callback({ success: false, error: 'Story not generated yet' }); return; }
      if (session.players.size < 1) { callback({ success: false, error: 'Need at least one player' }); return; }

      const firstPlayer = Array.from(session.players.values())[0];
      if (firstPlayer.id !== playerId) { callback({ success: false, error: 'Only the host can start the game' }); return; }

      session.state = 'playing';
      session.mpTurnCount = 0;

      const scenario = getScenarioForSession(session);
      if (!scenario) { callback({ success: false, error: 'Unknown scenario' }); return; }

      // Initialize NPC states from scenario rooms
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
      const sessionWorld = session.world;
      io.to(sessionId).emit('game:started', {
        sessionId,
        // #58: scenarioTitle is bilingual when sourced from world.meta, fallback
        // to plain string for pre-i18n scenarios.
        scenarioTitle: sessionWorld?.meta.title ?? scenario.title,
        players: allPlayers,
        // #58: bilingual opening narration; clients pickLang in their locale.
        openingNarration: sessionWorld?.openingNarration,
      });

      // C.4: Initial turn counter broadcast (turn 0 of N)
      io.to(sessionId).emit('turn:updated', {
        turnCount: session.mpTurnCount,
        maxTurns: scenario.maxTurns,
      });

      // C.1: Persist the shared opening narration to history BEFORE per-player
      // entry hooks. visibleTo is left empty so filterHistoryForPlayer treats
      // it as a global message — every player (including reconnects and late
      // joiners) sees it as the first narrator entry in chat.
      //
      // #58 follow-up: do NOT set a localized playerName here. Pre-#58 we
      // hardcoded "Anlatıcı" which then leaked through to EN clients in
      // the replay timeline ("Anlatıcı" instead of "Narrator"). Clients
      // render the narrator label themselves via T.game.narratorLabel
      // when playerName is absent.
      const world = session.world;
      const openingNarrationTr = pickLang(world.openingNarration, 'tr');
      if (openingNarrationTr && openingNarrationTr.trim().length > 0) {
        store.addMessage(sessionId, {
          role: 'assistant',
          content: openingNarrationTr,
          bilingualContent: world.openingNarration,
          timestamp: Date.now(),
          messageType: 'global',
        });
      }

      // Emit per-player entry scene narration as the opening.
      // Each player gets ONE narrator chunk that is scoped to them (their entry hook).
      // #58: server-side flatten by player.locale so the narrator wire stays string.
      const entries = world.entryScenes;
      const playerList = Array.from(session.players.values());
      for (let i = 0; i < playerList.length; i++) {
        const p = playerList[i];
        const entry = entries[i % entries.length];
        const hookBilingual = entry.narrativeHook;
        const hook = pickLang(hookBilingual, p.locale);
        const suggestions = p.locale === 'en'
          ? ['Look around', 'Examine the room', 'Move on']
          : ['Etrafına bak', 'Odayı incele', 'İleri git'];

        // Store as a private message visible only to this player.
        // Persist the TR slice as primary content (legacy) and the bilingual
        // companion so future reconnects/replays can re-render in any locale.
        store.addMessage(sessionId, {
          role: 'assistant',
          content: pickLang(hookBilingual, 'tr'),
          bilingualContent: hookBilingual,
          playerId: p.id,
          playerName: p.name,
          timestamp: Date.now(),
          messageType: 'private',
          visibleTo: [p.id],
        });

        // Find all sockets for this player — emit narrator:done directly
        const actorSocketIds = findSocketsForPlayer(p.id);
        for (const sid of actorSocketIds) {
          io.to(sid).emit('narrator:chunk', {
            content: hook,
            fullText: hook,
            targetPlayerId: p.id,
          });
          io.to(sid).emit('narrator:done', {
            fullText: hook,
            suggestions,
            targetPlayerId: p.id,
          });
        }
      }

      console.log(`[game:start] per-player entry scenes delivered for ${sessionId.slice(0, 8)}`);
    });

    /* ================================================================ */
    /*  #25: MULTIPLAYER ACCUSATION / VOTING                            */
    /* ================================================================ */

    socket.on('player:propose-accusation', (data, callback) => {
      if (spectatorSockets.has(socket.id)) { callback({ success: false, error: 'Spectators cannot act' }); return; }
      const v = validatePayload(ProposeAccusationSchema, data, 'player:propose-accusation');
      if (!v.ok) { callback({ success: false, error: 'Invalid payload' }); return; }
      const { sessionId, playerId, suspectId } = v.data;
      const session = store.get(sessionId);
      if (!session) { callback({ success: false, error: 'Session not found' }); return; }
      if (session.state !== 'playing') { callback({ success: false, error: 'Game not in progress' }); return; }
      if (session.activeAccusation) { callback({ success: false, error: 'A vote is already in progress' }); return; }

      const player = store.getPlayer(sessionId, playerId);
      if (!player) { callback({ success: false, error: 'Player not found' }); return; }

      const scenario = getScenarioForSession(session);
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
      if (spectatorSockets.has(socket.id)) { callback({ success: false, error: 'Spectators cannot vote' }); return; }
      const v = validatePayload(VoteAccusationSchema, data, 'player:vote-accusation');
      if (!v.ok) { callback({ success: false, error: 'Invalid payload' }); return; }
      const { sessionId, playerId, vote } = v.data;
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
      const voteCount = session.activeAccusation.votes.size;

      if (allVoted) {
        // Defer so the triggering socket has completed its handler cycle
        // before broadcast emits fan out (ensures all sockets, including the
        // last voter's own, receive the subsequent events).
        setImmediate(() => resolveAccusationVote(io, store, sessionId));
      }

      console.log(`[accusation] ${playerId.slice(0, 8)} voted ${vote} (${voteCount}/${connectedPlayers.length})`);
    });

    /* ================================================================ */
    /*  REJOIN / DISCONNECT                                             */
    /* ================================================================ */

    socket.on('player:rejoin', (data, callback) => {
      const v = validatePayload(PlayerRejoinSchema, data, 'player:rejoin');
      if (!v.ok) { callback({ success: false, error: 'Invalid payload' }); return; }
      const { sessionId, playerId } = v.data;

      const session = store.get(sessionId);
      if (!session) { callback({ success: false, error: 'Session not found' }); return; }

      const player = store.getPlayer(sessionId, playerId);
      if (!player) { callback({ success: false, error: 'Player not found in session' }); return; }

      // Cancel any pending disconnect timer — the player is back.
      const graceTimer = pendingDisconnects.get(playerId);
      const wasInGrace = !!graceTimer;
      if (graceTimer) {
        clearTimeout(graceTimer);
        pendingDisconnects.delete(playerId);
      }

      store.updatePlayer(sessionId, playerId, { isConnected: true, lastActiveAt: Date.now() });
      // #58: drop any stale socket mappings for the same playerId so a
      // refresh during the disconnect grace window doesn't double-emit.
      for (const [sid, mapping] of socketMap) {
        if (mapping.playerId === playerId && sid !== socket.id) socketMap.delete(sid);
      }
      socketMap.set(socket.id, { sessionId, playerId });
      socket.join(sessionId);

      const scenario = getScenarioForSession(session);
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
          // C.4: turn counter for reload sync
          turnCount: session.mpTurnCount,
          maxTurns: scenario?.maxTurns,
        },
      });

      callback({ success: true });
      void store.sync(sessionId);

      // Only broadcast "reconnected" if the disconnect actually went public
      // (grace timer expired and fired). Brief in-grace reconnects are silent.
      if (!wasInGrace) {
        socket.to(sessionId).emit('player:reconnected', {
          playerId,
          playerName: player.name,
          allPlayers,
        });
        console.log(`[socket] ${player.name} reconnected to session ${sessionId.slice(0, 8)}`);
      } else {
        console.log(`[socket] ${player.name} reconnected inside grace period — silent`);
      }
    });

    socket.on('disconnect', () => {
      // Clean up spectator tracking
      if (spectatorSockets.has(socket.id)) {
        spectatorSockets.delete(socket.id);
        spectatorSessionMap.delete(socket.id);
        console.log(`[socket] spectator disconnected: ${socket.id}`);
        return;
      }

      const mapping = socketMap.get(socket.id);
      if (!mapping) return;

      const { sessionId, playerId } = mapping;
      socketMap.delete(socket.id);

      const player = store.getPlayer(sessionId, playerId);
      if (!player) return;

      // Voice cleanup: if no other socket of this player remains, remove
      // them from the voice mesh so peers tear down their connections.
      // (Multi-tab still keeps voice alive on the other tabs.)
      if (findSocketsForPlayer(playerId).length === 0) {
        leaveVoice(io, sessionId, playerId);
      }

      // If the player has ANOTHER socket still open (multi-tab), don't mark
      // them as disconnected at all.
      if (findSocketsForPlayer(playerId).length > 0) {
        console.log(`[socket] ${player.name} closed one tab but still has other sockets`);
        return;
      }

      // Grace period: wait DISCONNECT_GRACE_MS before broadcasting. If the
      // player rejoins in the meantime, the timer is cancelled and no chat
      // "disconnected"/"reconnected" flicker is shown.
      const existing = pendingDisconnects.get(playerId);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        pendingDisconnects.delete(playerId);

        // If they already reconnected on another socket, nothing to do.
        if (findSocketsForPlayer(playerId).length > 0) return;

        const stillHere = store.getPlayer(sessionId, playerId);
        if (!stillHere) return;

        store.updatePlayer(sessionId, playerId, { isConnected: false });
        const allPlayers = getAllPlayerDTOs(store, sessionId);
        io.to(sessionId).emit('player:left', {
          playerId,
          playerName: stillHere.name,
          allPlayers,
        });
        console.log(`[socket] ${stillHere.name} disconnected from session ${sessionId.slice(0, 8)} (after ${DISCONNECT_GRACE_MS}ms grace)`);
      }, DISCONNECT_GRACE_MS);

      pendingDisconnects.set(playerId, timer);
      console.log(`[socket] ${player.name} disconnect pending (${DISCONNECT_GRACE_MS}ms grace)`);
    });
  });
}
