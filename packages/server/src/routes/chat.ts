/**
 * chat.ts — Chat route handler with SSE streaming
 *
 * POST /api/chat            — Stream narrator response via Server-Sent Events
 * POST /api/chat/new        — Start a new game session (also streams)
 * POST /api/chat/suggestions — Get follow-up action suggestions
 * GET  /api/chat/scenarios   — List available scenarios
 *
 * @author AKBOYS Team
 * @since 2026-03-12
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  generateSceneImage,
  narratorChatStream,
  suggestFollowUps,
  buildContextFallbacks,
} from '../middleware/openai.js';
import { buildSceneContext } from '../socket/prompt-builder.js';
import { requireAuth } from '../middleware/auth.js';
import { SCENARIOS } from '@akboys/shared';
import type { Locale, Scenario, ReconstructionDTO } from '@akboys/shared';
import {
  FirestoreSessionStore,
  MemorySessionStore,
  generateRoomCode,
} from '../store/SessionStore.js';
import { toPlayerDTO } from '@akboys/shared';
import {
  getScenarioForSession,
  generateWorld,
  generateOpeningImage,
  generateAllRoomImages,
  generateAllNpcPortraits,
  streamTts,
  generateBilingualFinale,
  generateReconstruction,
  type FinaleOutcome,
} from '../world/index.js';
import { renderCaseFilePdf } from '../pdf/render.js';

export const chatRouter = Router();

/** Session store — shared with socket handlers via export */
export const store =
  process.env.SESSION_STORE === 'firestore'
    ? new FirestoreSessionStore()
    : new MemorySessionStore();
export const storeReady = store.hydrate();

const imageCache = new Map<string, string>();
const DEBUG_PREFIX = '[chat]';

const SCENARIO_STYLES: Record<string, string> = {
  noir: '1920s noir comic book art style, high contrast, dark shadows, sepia tones, moody atmospheric scene of ',
  haunted: 'Gothic horror painting, candle-lit, eerie fog, Victorian macabre scene of ',
  space: 'Cinematic sci-fi concept art, cold blue light, high-tech atmospheric scene of ',
  pirate: '18th-century nautical adventure painting, dramatic sea-lit scene of ',
  western: 'Spaghetti western concept art, dusty frontier realism scene of ',
  cyberpunk: 'Neon-drenched cyberpunk concept art, rainy city, hyper-detailed scene of ',
};

/** Build the system prompt from any scenario */
function buildSystemPrompt(scenario: Scenario): string {
  const roomList = scenario.rooms
    .map((r) => `- ${r.name} (${r.id}): ${r.description} Exits: ${Object.entries(r.exits).map(([dir, id]) => `${dir}->${id}`).join(', ')}`)
    .join('\n');
  const npcList = scenario.npcs
    .map((n) => `- ${n.name} (in ${n.roomId}): ${n.description}`)
    .join('\n');
  const itemList = scenario.items
    .map((i) => `- ${i.name} (in ${i.roomId}): ${i.description}${i.isEvidence ? ' [EVIDENCE]' : ''}`)
    .join('\n');

  const startRoom = scenario.rooms[0]?.id || 'start';

  return `You are the narrator of a text adventure game called "${scenario.title}".
Setting: ${scenario.setting}
Story: ${scenario.synopsis}

ROOMS:
${roomList}

NPCs:
${npcList}

ITEMS:
${itemList}

RULES:
- The player starts in "${startRoom}".
- Use second person ("You walk into...").
- Use simple, clear English. Short sentences. Easy words.
- Keep answers 2-4 paragraphs max.
- When the player talks to an NPC, use their lines but add mood.
- When the player looks at items, show details in a dramatic way.
- Remember which rooms the player has been to and what items they found.
- Stay in character. You are the narrator, not an AI helper.
- If the player tries something that can't work, describe the failure.

FORMAT:
- Use markdown in your answers. It will be shown in a styled chat UI.
- Use **bold** for important names, places, and key items.
- Use *italic* for sounds, feelings, and inner thoughts.
- Use ## headings when the player enters a new room or meets someone new.
- Use bullet points (- item) when listing things the player can see or do.
- Use > blockquotes for NPC speech or written notes the player finds.
- Use --- to separate scene changes.`;
}

/** Set up SSE headers and stream narrator response chunk by chunk */
async function streamResponse(
  res: Response,
  sessionId: string,
  scenario: Scenario,
  playerAction: string,
): Promise<void> {
  const session = store.get(sessionId)!;
  console.log(`${DEBUG_PREFIX} stream:start`, {
    sessionId,
    scenarioId: session.scenarioId,
    historyLengthBefore: session.history.length,
    playerAction,
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'session', sessionId })}\n\n`);

  let fullText = '';
  let chunkCount = 0;

  try {
    for await (const chunk of narratorChatStream(buildSystemPrompt(scenario), session.history, sessionId)) {
      chunkCount += 1;
      fullText += chunk;
      if (chunkCount <= 5 || chunkCount % 25 === 0) {
        console.log(`${DEBUG_PREFIX} stream:chunk`, {
          sessionId,
          chunkCount,
          currentLength: fullText.length,
        });
      }
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
    }
  } catch (err) {
    const message = (err as Error).message || 'stream interrupted';
    console.error(`${DEBUG_PREFIX} stream:error`, { sessionId, message });
    res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
    res.end();
    return;
  }

  store.addMessage(sessionId, { role: 'assistant', content: fullText, timestamp: Date.now() });
  console.log(`${DEBUG_PREFIX} stream:assistant-saved`, {
    sessionId,
    chunkCount,
    finalLength: fullText.length,
    historyLengthAfter: store.get(sessionId)?.history.length,
  });

  // (SP-only regex-heuristic state extraction removed — MP uses AI directives only)

  res.write(
    `data: ${JSON.stringify({
      type: 'done',
      content: fullText,
      gameState: store.get(sessionId)?.gameState,
    })}\n\n`,
  );
  console.log(`${DEBUG_PREFIX} stream:done`, {
    sessionId,
    historyLengthFinal: store.get(sessionId)?.history.length,
    gameStateConversationLength: store.get(sessionId)?.gameState.conversationHistory.length,
  });
  res.end();
}

/** GET /api/chat/scenarios — List all available scenarios */
chatRouter.get('/scenarios', (_req: Request, res: Response) => {
  const list = Object.entries(SCENARIOS).map(([id, s]) => ({
    id,
    title: s.title,
    setting: s.setting,
    synopsis: s.synopsis,
  }));
  res.json({ scenarios: list });
});

/** GET /api/chat/session/:id — Get session info, history, and players
 *
 * #58: accepts `?locale=en|tr` to flatten bilingual scenario metadata
 * (NPC descriptions, room descriptions, item descriptions, scenario title)
 * to the caller's preferred language. Defaults to 'tr' when absent so
 * pre-#58 callers keep their existing behaviour.
 */
chatRouter.get('/session/:id', requireAuth, (req: Request<{ id: string }>, res: Response) => {
  const session = store.get(req.params.id);
  if (!session) {
    console.warn(`${DEBUG_PREFIX} session:get missing`, { sessionId: req.params.id });
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const locale: Locale = req.query.locale === 'en' ? 'en' : 'tr';
  const scenario = getScenarioForSession(session, locale);
  console.log(`${DEBUG_PREFIX} session:get`, {
    sessionId: session.id,
    historyLength: session.history.length,
    conversationLength: session.gameState.conversationHistory.length,
    state: session.state,
    maxPlayers: session.maxPlayers,
    locale,
  });
  res.json({
    id: session.id,
    scenarioId: session.scenarioId,
    scenarioTitle: scenario?.title || 'Unknown',
    roomCode: session.roomCode,
    createdAt: session.createdAt,
    messages: session.history.map((m) => ({
      role: m.role,
      content: m.content,
      playerId: m.playerId,
      playerName: m.playerName,
      playerColor: m.playerColor,
    })),
    players: Array.from(session.players.values()).map(toPlayerDTO),
    state: session.state,
    maxPlayers: session.maxPlayers,
    gameState: session.gameState,
    scenarioMeta: scenario ? {
      maxTurns: scenario.maxTurns,
      npcs: scenario.npcs.map((npc) => ({
        id: npc.id, name: npc.name,
        description: npc.description, roomId: npc.roomId,
      })),
      evidenceItems: scenario.items
        .filter((item) => item.isEvidence)
        .map((item) => ({ id: item.id, name: item.name })),
      items: scenario.items.map((item) => ({
        id: item.id, name: item.name, description: item.description,
        roomId: item.roomId, isEvidence: item.isEvidence,
      })),
      rooms: scenario.rooms.map((room) => ({
        id: room.id, name: room.name,
        exits: { ...room.exits },
      })),
    } : null,
    sharedEvidence: session.sharedEvidence || [],
  });
});

/** GET /api/chat/session/:id/gamestate — Get current game state only */
chatRouter.get('/session/:id/gamestate', requireAuth, (req: Request<{ id: string }>, res: Response) => {
  const session = store.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  res.json(session.gameState);
});

/** GET /api/chat/room/:code — Look up a session by its 6-char room code
 *
 * #58: same `?locale=en|tr` contract as /session/:id — drives the
 * scenarioTitle slice returned to the caller.
 */
chatRouter.get('/room/:code', requireAuth, (req: Request<{ code: string }>, res: Response) => {
  const session = store.getByRoomCode(req.params.code);
  if (!session) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }
  const locale: Locale = req.query.locale === 'en' ? 'en' : 'tr';
  const scenario = getScenarioForSession(session, locale);
  res.json({
    sessionId: session.id,
    scenarioId: session.scenarioId,
    scenarioTitle: scenario?.title || 'Unknown',
    roomCode: session.roomCode,
    state: session.state,
    playerCount: session.players.size,
    maxPlayers: session.maxPlayers,
  });
});

/** POST /api/chat — Send a message and stream narrator response */
chatRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sessionId, message } = req.body as { sessionId?: string; message?: string };

    if (!message || message.trim().length === 0) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }

    const session = store.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const scenario = getScenarioForSession(session);
    if (!scenario) {
      res.status(400).json({ error: 'Unknown scenario' });
      return;
    }

    if (session.maxPlayers === 1 && session.gameState.status !== 'playing') {
      res.status(400).json({ error: 'Game is already over' });
      return;
    }

    if (session.maxPlayers === 1) {
      const nextTurnCount = session.gameState.turnCount + 1;
      store.updateGameState(sessionId, { turnCount: nextTurnCount });

      if (nextTurnCount >= scenario.maxTurns) {
        store.updateGameState(sessionId, {
          isGameOver: true,
          status: 'lost',
          endReason: 'turn_limit',
        });
      }
    }

    store.addMessage(sessionId, { role: 'user', content: message, timestamp: Date.now() });
    await streamResponse(res, sessionId, scenario, message);
  } catch (err) {
    console.error('[chat] error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Narrator failed to respond' });
    }
  }
});

/** POST /api/chat/suggestions — Get 3 follow-up action suggestions (fast, gpt-5-nano) */
chatRouter.post('/suggestions', requireAuth, async (req: Request, res: Response) => {
  // C.2: Build a scene context if we can identify the player's room, so the
  // suggestion model and fallbacks reference what's actually present.
  let ctx: ReturnType<typeof buildSceneContext> | undefined;
  try {
    const { sessionId } = req.body as { sessionId?: string };
    const session = sessionId ? store.get(sessionId) : undefined;
    const scenario = session ? getScenarioForSession(session) : null;
    if (session && scenario) {
      // SP sessions store the active room on gameState; fall back to the first
      // player's room if one exists (MP), otherwise the scenario's start room.
      const roomId =
        session.gameState.currentRoomId
        || Array.from(session.players.values())[0]?.currentRoomId
        || scenario.rooms[0]?.id
        || '';
      if (roomId) ctx = buildSceneContext(scenario, session, roomId);
    }
    const lastAssistant = session?.history.filter((m) => m.role === 'assistant').pop();
    if (!lastAssistant) {
      res.json({ suggestions: buildContextFallbacks(ctx) });
      return;
    }
    const suggestions = await suggestFollowUps(lastAssistant.content, ctx, req.body?.sessionId);
    res.json({ suggestions });
  } catch (err) {
    console.error('[suggestions] error:', err);
    res.json({ suggestions: buildContextFallbacks(ctx) });
  }
});

/** POST /api/chat/image — Generate or fetch a cached scene image */
chatRouter.post('/image', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sessionId, roomName } = req.body as { sessionId?: string; roomName?: string };
    if (!sessionId || !roomName) {
      res.status(400).json({ error: 'sessionId and roomName are required' });
      return;
    }

    const session = store.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const scenario = getScenarioForSession(session);
    if (!scenario) {
      res.status(400).json({ error: 'Unknown scenario' });
      return;
    }

    const matchedRoom = scenario.rooms.find((room) => {
      const normalizedRoomName = roomName.toLowerCase();
      const candidate = room.name.toLowerCase();
      return normalizedRoomName.includes(candidate) || candidate.includes(normalizedRoomName);
    });

    const cacheKey = `${session.scenarioId}:${matchedRoom?.id || roomName.toLowerCase()}`;
    if (imageCache.has(cacheKey)) {
      res.json({ imageUrl: imageCache.get(cacheKey) });
      return;
    }

    const roomLabel = matchedRoom?.name || roomName;
    const roomDescription = matchedRoom?.description || roomName;
    const prompt = `${SCENARIO_STYLES[session.scenarioId] || 'Detailed atmospheric illustration of '}${roomLabel}. ${roomDescription}`;
    const imageUrl = await generateSceneImage(prompt, sessionId);

    if (imageUrl) {
      imageCache.set(cacheKey, imageUrl);
    }

    res.json({ imageUrl });
  } catch (err) {
    console.error('[image] error:', err);
    res.status(500).json({ error: 'Failed to generate image' });
  }
});

/** POST /api/chat/new — Create a new session and return its ID (no streaming) */
chatRouter.post('/new', requireAuth, (req: Request, res: Response) => {
  try {
    const {
      scenarioId = 'noir',
      maxPlayers = 4,
      mode = 'singleplayer',
    } = req.body as { scenarioId?: string; maxPlayers?: number; mode?: string };

    if (mode === 'multiplayer') {
      // Multiplayer: create with room code, scenario chosen later via voting
      const clampedMax = Math.min(Math.max(Math.round(maxPlayers), 2), 10);
      const roomCode = generateRoomCode(store.existingRoomCodes);
      const session = store.create('__pending', clampedMax, roomCode);
      console.log(`${DEBUG_PREFIX} session:new multiplayer`, {
        sessionId: session.id,
        roomCode: session.roomCode,
        maxPlayers: session.maxPlayers,
      });
      res.json({
        sessionId: session.id,
        roomCode: session.roomCode,
        maxPlayers: session.maxPlayers,
        mode: 'multiplayer',
      });
    } else {
      // Single player: create with scenario immediately
      const scenario = SCENARIOS[scenarioId];
      if (!scenario) {
        res.status(400).json({ error: 'Unknown scenario' });
        return;
      }
      const startRoomId = scenario.rooms[0]?.id || 'start';
      const session = store.create(scenarioId, 1, undefined, startRoomId);
      console.log(`${DEBUG_PREFIX} session:new singleplayer`, {
        sessionId: session.id,
        scenarioId,
        startRoomId,
      });
      res.json({ sessionId: session.id, scenarioId, maxPlayers: 1, mode: 'singleplayer' });
    }
  } catch (err) {
    console.error('[chat/new] error:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

/** POST /api/chat/accuse — End-game accusation mechanic for single-player */
chatRouter.post('/accuse', requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      sessionId,
      suspectId,
      evidenceId,
    } = req.body as {
      sessionId?: string;
      suspectId?: string;
      evidenceId?: string;
    };

    if (!sessionId || !suspectId) {
      res.status(400).json({ error: 'sessionId and suspectId are required' });
      return;
    }

    const session = store.get(sessionId);
    if (!session || session.maxPlayers !== 1) {
      res.status(404).json({ error: 'Single-player session not found' });
      return;
    }

    if (session.gameState.status !== 'playing') {
      res.status(400).json({ error: 'Game is already over' });
      return;
    }

    const scenario = getScenarioForSession(session);
    if (!scenario) {
      res.status(400).json({ error: 'Unknown scenario' });
      return;
    }

    const isCorrectAccusation = suspectId === scenario.solution.culpritId;

    store.updateGameState(sessionId, {
      isGameOver: true,
      status: isCorrectAccusation ? 'won' : 'lost',
      endReason: isCorrectAccusation ? 'solved' : 'wrong_accusation',
    });

    const suspect = scenario.npcs.find((npc) => npc.id === suspectId)?.name || suspectId;

    res.json({
      success: true,
      isCorrect: isCorrectAccusation,
      summary: isCorrectAccusation
        ? `You accused ${suspect} and solved the case. Justice has been served.`
        : `You accused ${suspect}, but the evidence doesn't add up. The real culprit slips away.`,
      gameState: store.get(sessionId)?.gameState,
    });
  } catch (err) {
    console.error('[accuse] error:', err);
    res.status(500).json({ error: 'Failed to process accusation' });
  }
});

/** POST /api/chat/start — Send the opening message and stream narrator intro */
chatRouter.post('/start', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body as { sessionId?: string };
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }

    const session = store.get(sessionId);
    if (!session) {
      console.warn(`${DEBUG_PREFIX} start missing`, { sessionId });
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const openingAction = 'Start the game. Describe where I am.';

    // Only start if no messages yet
    if (session.history.length === 0) {
      store.addMessage(sessionId, {
        role: 'user',
        content: openingAction,
        timestamp: Date.now(),
      });
      console.log(`${DEBUG_PREFIX} start opening-action-saved`, {
        sessionId,
        historyLength: store.get(sessionId)?.history.length,
      });
    }

    const scenario = getScenarioForSession(session);
    if (!scenario) {
      res.status(400).json({ error: 'Unknown scenario' });
      return;
    }

    console.log(`${DEBUG_PREFIX} start streaming`, {
      sessionId,
      scenarioId: session.scenarioId,
      historyLength: store.get(sessionId)?.history.length,
    });
    await streamResponse(res, sessionId, scenario, openingAction);
  } catch (err) {
    console.error('[chat/start] error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to start game' });
    }
  }
});

/* ================================================================== */
/*  POST /api/chat/tts — stream TTS audio for arbitrary Turkish text  */
/* ================================================================== */
chatRouter.post('/tts', requireAuth, async (req: Request, res: Response) => {
  try {
    const { text, voice, locale: localeRaw } = req.body as {
      text?: string;
      voice?: string;
      locale?: 'tr' | 'en';
    };
    if (!text || typeof text !== 'string' || text.length < 2) {
      res.status(400).json({ error: 'text is required' });
      return;
    }
    const sessionIdHeader = (req.body as { sessionId?: string })?.sessionId;
    const locale: 'tr' | 'en' = localeRaw === 'en' ? 'en' : 'tr';
    const ttsRes = await streamTts({
      text,
      locale,
      voice: voice as 'ash' | 'ballad' | 'fable' | 'verse' | 'shimmer' | 'nova' | 'coral' | 'alloy' | 'onyx' | 'sage' | 'echo' | undefined,
      format: 'mp3',
      sessionId: sessionIdHeader,
    });

    const buf = Buffer.from(await ttsRes.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Length', String(buf.length));
    res.end(buf);
  } catch (err) {
    console.error(`${DEBUG_PREFIX} tts error`, err);
    if (!res.headersSent) res.status(500).json({ error: 'TTS failed' });
  }
});

/* ================================================================== */
/*  POST /api/chat/finale — bilingual single-flight cached finale     */
/*                                                                     */
/*  Pre-#58 we streamed the finale via SSE per-locale, so two clients  */
/*  (e.g. one TR + one EN) triggered two independent OpenAI calls that  */
/*  competed for rate limits — one returned in 5s while the other was  */
/*  stuck for 30+. Now we run a single bilingual LLM call, cache the   */
/*  result on the session, and return the caller's locale slice. The   */
/*  second client gets a cache hit; spectators / refreshes are free.   */
/*                                                                     */
/*  UX-wise the FinaleCinematic already syncs its typewriter to the    */
/*  TTS audio.currentTime, so losing the LLM-level streaming is        */
/*  invisible — the user-perceived reveal speed comes from TTS playback.*/
/* ================================================================== */
chatRouter.post('/finale', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sessionId, outcome, locale: localeRaw } = req.body as {
      sessionId?: string;
      outcome?: FinaleOutcome;
      locale?: 'tr' | 'en';
    };
    const locale: 'tr' | 'en' = localeRaw === 'en' ? 'en' : 'tr';
    if (!sessionId || !outcome) {
      res.status(400).json({ error: 'sessionId and outcome required' });
      return;
    }
    const session = store.get(sessionId);
    if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
    if (!session.world) { res.status(400).json({ error: 'No generated world for this session' }); return; }

    /* ---- Cache hit: cheapest path ---- */
    const cached = session.finaleText;
    if (cached && cached.outcome === outcome) {
      const sliced = cached[locale];
      console.log(`[finale ${sessionId.slice(0, 8)}] ✓ cache hit (${sliced.length}c, locale=${locale})`);
      res.json({ fullText: sliced, culpritName: cached.culpritName });
      return;
    }

    /* ---- Single-flight: await the in-flight Promise if another client raced us ---- */
    const inflight = store.getInflightFinale(sessionId);
    if (inflight) {
      console.log(`[finale ${sessionId.slice(0, 8)}] ⇢ awaiting in-flight bilingual generation (locale=${locale})`);
      try {
        const out = await inflight;
        if (out.outcome !== outcome) {
          // Extremely unlikely, but cover the case where a stale in-flight Promise
          // belongs to a different outcome (e.g. accusation flipped before the
          // first call resolved). Fall through to a fresh generation.
          console.warn(`[finale ${sessionId.slice(0, 8)}] outcome mismatch (${out.outcome} != ${outcome}); regenerating`);
        } else {
          res.json({ fullText: out[locale], culpritName: out.culpritName });
          return;
        }
      } catch (err) {
        console.error(`${DEBUG_PREFIX} in-flight finale propagated error`, err);
      }
    }

    /* ---- Fresh generation: bilingual JSON in a single LLM call ---- */
    const accusation = session.activeAccusation;
    const finaleScenario = getScenarioForSession(session);
    const finaleMaxTurns = finaleScenario?.maxTurns ?? 40;
    const generation = (async () => {
      const bilingual = await generateBilingualFinale({
        world: session.world!,
        outcome,
        accuserName: accusation?.proposerName,
        accusedNpcId: outcome === 'won' ? session.world!.solution.culpritNpcId : accusation?.suspectId,
        wrongAccusedNpcId: outcome === 'lost_wrong' ? accusation?.suspectId : undefined,
        evidencePresentedId: session.world!.solution.keyEvidenceId,
        worldStateLog: session.worldStateLog,
        turnCount: session.mpTurnCount,
        maxTurns: finaleMaxTurns,
        sessionId,
      });
      const cachePayload = { ...bilingual, outcome };
      store.setFinaleText(sessionId, cachePayload);
      return cachePayload;
    })();
    store.setInflightFinale(sessionId, generation);

    try {
      const out = await generation;
      res.json({ fullText: out[locale], culpritName: out.culpritName });
      console.log(
        `[finale ${sessionId.slice(0, 8)}] ✓ bilingual cached (tr=${out.tr.length}c en=${out.en.length}c, culprit=${out.culpritName})`,
      );
    } finally {
      store.clearInflightFinale(sessionId);
    }
  } catch (err) {
    console.error(`${DEBUG_PREFIX} finale error`, err);
    if (!res.headersSent) res.status(500).json({ error: 'Finale failed' });
  }
});

/* ================================================================== */
/*  POST /api/chat/reconstruction — A.3 / Issue #36                    */
/*  Crime-scene reconstruction timeline. Cached on the session so      */
/*  re-opening the modal doesn't re-burn an LLM call.                  */
/* ================================================================== */
chatRouter.post('/reconstruction', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body as { sessionId?: string };
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }

    const session = store.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (!session.world) {
      res.status(400).json({ error: 'No world for this session' });
      return;
    }

    // Cache hit — return the previously generated reconstruction. Idempotent
    // for the lifetime of the session, which is what we want: the modal
    // can be reopened multiple times without thrashing the LLM.
    if (session.reconstruction) {
      console.log(`[reconstruction ${sessionId.slice(0, 8)}] ✓ cache hit (${session.reconstruction.events.length} events)`);
      res.json({ reconstruction: session.reconstruction });
      return;
    }

    // Single-flight: if another client kicked off a generation moments ago,
    // await the same Promise instead of starting a parallel LLM call. Two
    // racing calls would otherwise produce two different reconstructions
    // (different event counts, different conclusions) — each client keeping
    // its own response while the second write quietly overwrites the first.
    const inflight = store.getInflightReconstruction(sessionId);
    if (inflight) {
      console.log(`[reconstruction ${sessionId.slice(0, 8)}] ⇢ awaiting in-flight generation`);
      const dto = await inflight;
      res.json({ reconstruction: dto });
      return;
    }

    const generation = (async (): Promise<ReconstructionDTO> => {
      const dto = await generateReconstruction(session.world!, session.worldStateLog, sessionId);
      store.setReconstruction(sessionId, dto);
      return dto;
    })();
    store.setInflightReconstruction(sessionId, generation);
    try {
      const dto = await generation;
      res.json({ reconstruction: dto });
    } finally {
      store.clearInflightReconstruction(sessionId);
    }
  } catch (err) {
    console.error(`${DEBUG_PREFIX} reconstruction error`, err);
    if (!res.headersSent) res.status(500).json({ error: 'Reconstruction failed' });
  }
});

/* ================================================================== */
/*  POST /api/chat/case-file — Issue #59                               */
/*  Premium bilingual PDF case file. Lazy-rendered after the game     */
/*  ends; per-locale single-flight cache so a second click (or a      */
/*  parallel TR + EN request) doesn't re-burn the render pipeline.    */
/* ================================================================== */
chatRouter.post('/case-file', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sessionId, locale: localeRaw } = req.body as { sessionId?: string; locale?: 'tr' | 'en' };
    const locale: 'tr' | 'en' = localeRaw === 'en' ? 'en' : 'tr';
    if (!sessionId) { res.status(400).json({ error: 'sessionId is required' }); return; }

    const session = store.get(sessionId);
    if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
    if (!session.world) { res.status(400).json({ error: 'No world for this session' }); return; }
    if (session.state !== 'ended') {
      res.status(403).json({ error: 'Case file is only available for ended sessions' });
      return;
    }

    /* ---- Cache hit ---- */
    const cached = session.caseFilePdf[locale];
    if (cached) {
      console.log(`[case-file ${sessionId.slice(0, 8)}] ✓ cache hit (${cached.length}b, locale=${locale})`);
      sendPdf(res, cached, session, locale);
      return;
    }

    /* ---- Single-flight ---- */
    const inflight = store.getInflightCaseFile(sessionId, locale);
    if (inflight) {
      console.log(`[case-file ${sessionId.slice(0, 8)}] ⇢ awaiting in-flight render (locale=${locale})`);
      try {
        const buf = await inflight;
        sendPdf(res, buf, session, locale);
        return;
      } catch (err) {
        console.error(`${DEBUG_PREFIX} in-flight case-file propagated error`, err);
        // fall through to fresh render
      }
    }

    /* ---- Ensure reconstruction is cached (the PDF reuses it as the timeline). */
    let reconstruction = session.reconstruction;
    if (!reconstruction) {
      const reconInflight = store.getInflightReconstruction(sessionId);
      if (reconInflight) {
        reconstruction = await reconInflight;
      } else {
        const reconGen = (async () => {
          const dto = await generateReconstruction(session.world!, session.worldStateLog);
          store.setReconstruction(sessionId, dto);
          return dto;
        })();
        store.setInflightReconstruction(sessionId, reconGen);
        try {
          reconstruction = await reconGen;
        } finally {
          store.clearInflightReconstruction(sessionId);
        }
      }
    }
    if (!reconstruction) {
      res.status(500).json({ error: 'Reconstruction unavailable' });
      return;
    }

    /* ---- Fresh PDF render ---- */
    const renderPromise = (async () => {
      const buf = await renderCaseFilePdf({
        session,
        world: session.world!,
        reconstruction: reconstruction!,
        locale,
      });
      store.setCaseFilePdf(sessionId, locale, buf);
      return buf;
    })();
    store.setInflightCaseFile(sessionId, locale, renderPromise);

    try {
      const buf = await renderPromise;
      sendPdf(res, buf, session, locale);
    } finally {
      store.clearInflightCaseFile(sessionId, locale);
    }
  } catch (err) {
    console.error(`${DEBUG_PREFIX} case-file error`, err);
    if (!res.headersSent) res.status(500).json({ error: 'PDF render failed' });
  }
});

function sendPdf(
  res: Response,
  buf: Buffer,
  session: { id: string },
  locale: 'tr' | 'en',
): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Content-Length', String(buf.length));
  const filename = `velvet-shadow-${session.id.slice(0, 8)}-${locale}.pdf`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.end(buf);
}

/* ================================================================== */
/*  GET /api/chat/replay/:sessionId — Issue #52                        */
/*  Returns full session history for a finished (ended) session.       */
/*  403 if session still in progress; no auth required for ended games. */
/* ================================================================== */
chatRouter.get('/replay/:sessionId', async (req: Request<{ sessionId: string }>, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = store.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (session.state !== 'ended') {
      res.status(403).json({ error: 'Session is still in progress — use live spectator mode' });
      return;
    }
    res.json({
      sessionId: session.id,
      state: session.state,
      history: session.history,
      world: session.world,
      commHistory: session.commHistory,
      worldStateLog: session.worldStateLog,
      reconstruction: session.reconstruction,
      players: Array.from(session.players.values()).map(toPlayerDTO),
      mpTurnCount: session.mpTurnCount,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
    });
  } catch (err) {
    console.error('[replay] error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Replay fetch failed' });
  }
});
