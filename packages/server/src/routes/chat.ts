/**
 * chat.ts — Chat route handler
 *
 * POST /api/chat — Receives player message, sends to OpenAI with
 * the noir scenario as system context, returns narrator response.
 * Manages per-session conversation history in memory.
 *
 * @author AK Boys Team
 * @since 2026-03-12
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { narratorChat } from '../middleware/openai.js';
import type { ChatMessage } from '@akboys/shared';
import { NOIR_SCENARIO } from '@akboys/shared';

export const chatRouter = Router();

/** In-memory session store — maps sessionId to conversation history */
const sessions = new Map<string, ChatMessage[]>();

/** Build the system prompt from the scenario */
function buildSystemPrompt(): string {
  const s = NOIR_SCENARIO;
  const roomList = s.rooms
    .map((r) => `- ${r.name} (${r.id}): ${r.description} Exits: ${Object.entries(r.exits).map(([dir, id]) => `${dir}->${id}`).join(', ')}`)
    .join('\n');
  const npcList = s.npcs
    .map((n) => `- ${n.name} (in ${n.roomId}): ${n.description}`)
    .join('\n');
  const itemList = s.items
    .map((i) => `- ${i.name} (in ${i.roomId}): ${i.description}${i.isEvidence ? ' [EVIDENCE]' : ''}`)
    .join('\n');

  return `You are the narrator of a noir detective text adventure game called "${s.title}".
Setting: ${s.setting}
Synopsis: ${s.synopsis}

ROOMS:
${roomList}

NPCs:
${npcList}

ITEMS:
${itemList}

RULES:
- The player starts in "office".
- Narrate in second person ("You step into..."), atmospheric noir style.
- Keep responses 2-4 paragraphs max.
- When the player talks to an NPC, use their dialogue lines as inspiration but embellish with noir flair.
- When the player examines items, reveal details dramatically.
- Track which rooms the player visits and items they find based on conversation context.
- Do NOT break character. You are the narrator, not an AI assistant.
- If the player tries something impossible, narrate the failure dramatically.`;
}

/** POST /api/chat — Send a message and get narrator response */
chatRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { sessionId, message } = req.body as { sessionId?: string; message?: string };

    if (!message || message.trim().length === 0) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const sid = sessionId || uuidv4();

    if (!sessions.has(sid)) {
      sessions.set(sid, []);
    }

    const history = sessions.get(sid)!;
    history.push({ role: 'user', content: message, timestamp: Date.now() });

    const response = await narratorChat(buildSystemPrompt(), history);

    history.push({ role: 'assistant', content: response, timestamp: Date.now() });

    res.json({ sessionId: sid, narrative: response });
  } catch (err) {
    console.error('[chat] error:', err);
    res.status(500).json({ error: 'Narrator failed to respond' });
  }
});

/** POST /api/chat/new — Start a new game session */
chatRouter.post('/new', async (_req: Request, res: Response) => {
  try {
    const sid = uuidv4();
    sessions.set(sid, []);

    const history: ChatMessage[] = [
      { role: 'user', content: 'Start the game. Describe where I am.', timestamp: Date.now() },
    ];

    const response = await narratorChat(buildSystemPrompt(), history);

    history.push({ role: 'assistant', content: response, timestamp: Date.now() });
    sessions.set(sid, history);

    res.json({ sessionId: sid, narrative: response });
  } catch (err) {
    console.error('[chat/new] error:', err);
    res.status(500).json({ error: 'Failed to start new game' });
  }
});
