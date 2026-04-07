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
  extractGameStateUpdate,
} from '../middleware/openai.js';
import { requireAuth } from '../middleware/auth.js';
import { SCENARIOS } from '@akboys/shared';
import type { Scenario } from '@akboys/shared';
import {
  FirestoreSessionStore,
  MemorySessionStore,
  generateRoomCode,
} from '../store/SessionStore.js';
import { toPlayerDTO } from '@akboys/shared';

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

  for await (const chunk of narratorChatStream(buildSystemPrompt(scenario), session.history)) {
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

  store.addMessage(sessionId, { role: 'assistant', content: fullText, timestamp: Date.now() });
  console.log(`${DEBUG_PREFIX} stream:assistant-saved`, {
    sessionId,
    chunkCount,
    finalLength: fullText.length,
    historyLengthAfter: store.get(sessionId)?.history.length,
  });

  try {
    const stateUpdates = await extractGameStateUpdate(
      fullText,
      playerAction,
      store.get(sessionId)!.gameState,
      scenario,
    );

    if (Object.keys(stateUpdates).length > 0) {
      store.updateGameState(sessionId, stateUpdates);
    }
  } catch (err) {
    console.warn('[streamResponse] game state extraction error:', err);
  }

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

/** GET /api/chat/session/:id — Get session info, history, and players */
chatRouter.get('/session/:id', requireAuth, (req: Request<{ id: string }>, res: Response) => {
  const session = store.get(req.params.id);
  if (!session) {
    console.warn(`${DEBUG_PREFIX} session:get missing`, { sessionId: req.params.id });
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const scenario = SCENARIOS[session.scenarioId];
  console.log(`${DEBUG_PREFIX} session:get`, {
    sessionId: session.id,
    historyLength: session.history.length,
    conversationLength: session.gameState.conversationHistory.length,
    state: session.state,
    maxPlayers: session.maxPlayers,
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

/** GET /api/chat/room/:code — Look up a session by its 6-char room code */
chatRouter.get('/room/:code', requireAuth, (req: Request<{ code: string }>, res: Response) => {
  const session = store.getByRoomCode(req.params.code);
  if (!session) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }
  const scenario = SCENARIOS[session.scenarioId];
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

    const scenario = SCENARIOS[session.scenarioId];
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
  try {
    const { sessionId } = req.body as { sessionId?: string };
    const session = sessionId ? store.get(sessionId) : undefined;
    const lastAssistant = session?.history.filter((m) => m.role === 'assistant').pop();

    if (!lastAssistant) {
      res.json({ suggestions: ['Look around', 'Talk to someone', 'Check the room'] });
      return;
    }

    const suggestions = await suggestFollowUps(lastAssistant.content);
    res.json({ suggestions });
  } catch (err) {
    console.error('[suggestions] error:', err);
    res.json({ suggestions: ['Look around', 'Talk to someone', 'Check the room'] });
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

    const scenario = SCENARIOS[session.scenarioId];
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
    const imageUrl = await generateSceneImage(prompt);

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
      const clampedMax = Math.min(Math.max(Math.round(maxPlayers), 2), 4);
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

    if (!sessionId || !suspectId || !evidenceId) {
      res.status(400).json({ error: 'sessionId, suspectId, and evidenceId are required' });
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

    const scenario = SCENARIOS[session.scenarioId];
    if (!scenario) {
      res.status(400).json({ error: 'Unknown scenario' });
      return;
    }

    const foundAllRequiredEvidence = scenario.solution.requiredEvidenceIds.every((id) =>
      session.gameState.discoveredEvidence.includes(id) || session.gameState.inventory.includes(id),
    );

    const isCorrectAccusation =
      suspectId === scenario.solution.culpritId &&
      evidenceId === scenario.solution.evidenceId &&
      foundAllRequiredEvidence;

    store.updateGameState(sessionId, {
      isGameOver: true,
      status: isCorrectAccusation ? 'won' : 'lost',
      endReason: isCorrectAccusation ? 'solved' : 'wrong_accusation',
    });

    const suspect = scenario.npcs.find((npc) => npc.id === suspectId)?.name || suspectId;
    const evidence = scenario.items.find((item) => item.id === evidenceId)?.name || evidenceId;

    res.json({
      success: true,
      isCorrect: isCorrectAccusation,
      summary: isCorrectAccusation
        ? `You accused ${suspect} with the ${evidence} and solved the case.`
        : `You accused ${suspect} with the ${evidence}, but the case is not fully proven.`,
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

    const scenario = SCENARIOS[session.scenarioId];
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
