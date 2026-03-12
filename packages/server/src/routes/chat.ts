/**
 * chat.ts — Chat route handler with SSE streaming
 *
 * POST /api/chat            — Stream narrator response via Server-Sent Events
 * POST /api/chat/new        — Start a new game session (also streams)
 * POST /api/chat/suggestions — Get follow-up action suggestions
 * GET  /api/chat/scenarios   — List available scenarios
 *
 * @author AK Boys Team
 * @since 2026-03-12
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { narratorChatStream, suggestFollowUps } from '../middleware/openai.js';
import { SCENARIOS } from '@akboys/shared';
import type { Scenario } from '@akboys/shared';
import { MemorySessionStore } from '../store/SessionStore.js';

export const chatRouter = Router();

/** Session store — swap this to FirestoreSessionStore later */
const store = new MemorySessionStore();

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
): Promise<void> {
  const session = store.get(sessionId)!;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'session', sessionId })}\n\n`);

  let fullText = '';

  for await (const chunk of narratorChatStream(buildSystemPrompt(scenario), session.history)) {
    fullText += chunk;
    res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
  }

  store.addMessage(sessionId, { role: 'assistant', content: fullText, timestamp: Date.now() });

  res.write(`data: ${JSON.stringify({ type: 'done', content: fullText })}\n\n`);
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

/** GET /api/chat/session/:id — Get session info and history */
chatRouter.get('/session/:id', (req: Request<{ id: string }>, res: Response) => {
  const session = store.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const scenario = SCENARIOS[session.scenarioId];
  res.json({
    id: session.id,
    scenarioId: session.scenarioId,
    scenarioTitle: scenario?.title || 'Unknown',
    createdAt: session.createdAt,
    messages: session.history.map((m) => ({ role: m.role, content: m.content })),
  });
});

/** POST /api/chat — Send a message and stream narrator response */
chatRouter.post('/', async (req: Request, res: Response) => {
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

    store.addMessage(sessionId, { role: 'user', content: message, timestamp: Date.now() });
    await streamResponse(res, sessionId, scenario);
  } catch (err) {
    console.error('[chat] error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Narrator failed to respond' });
    }
  }
});

/** POST /api/chat/suggestions — Get 3 follow-up action suggestions (fast, gpt-5-nano) */
chatRouter.post('/suggestions', async (req: Request, res: Response) => {
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

/** POST /api/chat/new — Create a new session and return its ID (no streaming) */
chatRouter.post('/new', (req: Request, res: Response) => {
  try {
    const { scenarioId = 'noir' } = req.body as { scenarioId?: string };

    const scenario = SCENARIOS[scenarioId];
    if (!scenario) {
      res.status(400).json({ error: 'Unknown scenario' });
      return;
    }

    const session = store.create(scenarioId);
    res.json({ sessionId: session.id, scenarioId });
  } catch (err) {
    console.error('[chat/new] error:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

/** POST /api/chat/start — Send the opening message and stream narrator intro */
chatRouter.post('/start', async (req: Request, res: Response) => {
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

    // Only start if no messages yet
    if (session.history.length === 0) {
      store.addMessage(sessionId, {
        role: 'user',
        content: 'Start the game. Describe where I am.',
        timestamp: Date.now(),
      });
    }

    const scenario = SCENARIOS[session.scenarioId];
    if (!scenario) {
      res.status(400).json({ error: 'Unknown scenario' });
      return;
    }

    await streamResponse(res, sessionId, scenario);
  } catch (err) {
    console.error('[chat/start] error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to start game' });
    }
  }
});
