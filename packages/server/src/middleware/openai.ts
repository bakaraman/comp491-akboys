/**
 * openai.ts — OpenAI API client wrapper
 *
 * Provides streaming and non-streaming chat functions.
 * Model and parameters are configured here as constants.
 *
 * @author AKBOYS Team
 * @since 2026-03-12
 */

import OpenAI from 'openai';
import type { ChatMessage, GameState, Scenario } from '@akboys/shared';

/**
 * Model configuration — change these to switch models.
 * gpt-5.4      : latest frontier model, best quality
 * gpt-4o       : previous gen, still solid
 * gpt-4o-mini  : fast, cheap, good for dev/testing
 */
const MODEL = 'gpt-5.4';
const MAX_TOKENS = 800;
const TEMPERATURE = 0.85;

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

/** Build the messages array from system prompt + history */
function buildMessages(
  systemPrompt: string,
  history: ChatMessage[],
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ];
}

/**
 * Stream narrator response as an async generator of text chunks.
 * Each yield is a small piece of text as it arrives from OpenAI.
 * Used for opening narration (unstructured, broadcast to all).
 */
export async function* narratorChatStream(
  systemPrompt: string,
  history: ChatMessage[],
): AsyncGenerator<string> {
  const stream = await getClient().chat.completions.create({
    model: MODEL,
    messages: buildMessages(systemPrompt, history),
    max_completion_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      yield delta;
    }
  }
}

/**
 * Structured narrator response — returns JSON with guaranteed schema.
 * Used for per-player action responses where we need [RESPONSE]/[OBSERVED]/directives.
 *
 * Returns parsed JSON or null on failure.
 */
export interface StructuredNarratorResponse {
  response: string;
  observed: string;
  directives: Array<{ type: string; player: string; target: string }>;
}

export async function narratorStructuredResponse(
  systemPrompt: string,
  history: ChatMessage[],
): Promise<StructuredNarratorResponse | null> {
  try {
    const completion = await getClient().chat.completions.create({
      model: MODEL,
      messages: buildMessages(systemPrompt, history),
      max_completion_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'narrator_response',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              response: {
                type: 'string',
                description: 'Detailed second-person narrator response for the acting player. Use markdown formatting.',
              },
              observed: {
                type: 'string',
                description: 'Brief third-person sentence of what nearby players observe. No secrets or details.',
              },
              directives: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', description: 'MOVE, PICKUP, OPEN, CLOSE, UNLOCK, BREAK, REVEAL, USE, REMOVE, or STATE' },
                    player: { type: 'string', description: 'Player name' },
                    target: { type: 'string', description: 'Room ID, item ID, or state change description' },
                  },
                  required: ['type', 'player', 'target'],
                  additionalProperties: false,
                },
                description: 'State change directives. Only include if something changed.',
              },
            },
            required: ['response', 'observed', 'directives'],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    // Validate shape
    if (
      typeof parsed.response === 'string' &&
      typeof parsed.observed === 'string' &&
      Array.isArray(parsed.directives)
    ) {
      return parsed as StructuredNarratorResponse;
    }

    return null;
  } catch (err) {
    console.error('[openai] structured response error:', err);
    return null;
  }
}

/**
 * Non-streaming fallback — returns the full response at once.
 */
export async function narratorChat(
  systemPrompt: string,
  history: ChatMessage[],
): Promise<string> {
  const completion = await getClient().chat.completions.create({
    model: MODEL,
    messages: buildMessages(systemPrompt, history),
    max_completion_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
  });

  return completion.choices[0]?.message?.content || 'The narrator is silent...';
}

/** Fast model for lightweight tasks — gpt-5-nano with minimal reasoning for speed */
const FAST_MODEL = 'gpt-5-nano';

/**
 * Generate 3 follow-up action suggestions based on the last narrator response.
 * Uses gpt-5-nano with reasoning_effort "minimal" (0 reasoning tokens, ~1s latency).
 */
export async function suggestFollowUps(lastNarratorText: string): Promise<string[]> {
  const completion = await getClient().chat.completions.create({
    model: FAST_MODEL,
    messages: [
      {
        role: 'system',
        content: `Give 3 short things a player can do next in a detective game. Max 5 words each. Use simple English. Return ONLY a JSON array of 3 strings. Example: ["Look around","Talk to the man","Open the door"]`,
      },
      {
        role: 'user',
        content: `The narrator just said:\n"${lastNarratorText.slice(-500)}"\n\nSuggest 3 actions:`,
      },
    ],
    max_completion_tokens: 150,
    reasoning_effort: 'minimal' as 'low',
  });

  const raw = completion.choices[0]?.message?.content || '[]';
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length >= 3) {
      return parsed.slice(0, 3);
    }
  } catch { /* fallback below */ }
  return ['Look around', 'Talk to someone', 'Examine the room'];
}

/**
 * Infer coarse game-state updates from the player's action and the narrator's response.
 * This is primarily used for the single-player SSE flow; multiplayer already maintains
 * richer canonical state in the socket pipeline.
 */
export async function extractGameStateUpdate(
  narrative: string,
  playerAction: string,
  currentState: Pick<
    GameState,
    'currentRoomId' | 'inventory' | 'visitedRooms' | 'isGameOver' | 'discoveredEvidence'
  >,
  scenario: Scenario,
): Promise<Partial<Omit<GameState, 'conversationHistory'>>> {
  const roomIds = scenario.rooms.map((room) => room.id);
  const itemIds = scenario.items.map((item) => item.id);
  const evidenceItems = scenario.items.filter((item) => item.isEvidence);
  const actionLower = playerAction.toLowerCase();
  const isMovementAction = /\b(go|walk|move|head|enter|leave|travel|climb)\b/.test(actionLower);

  const systemPrompt = `You are a deterministic game-state tracker for a text adventure.
Valid room IDs: ${roomIds.join(', ')}
Valid item IDs: ${itemIds.join(', ')}
Current room: ${currentState.currentRoomId}
Current inventory: ${JSON.stringify(currentState.inventory)}

Return ONLY a JSON object with any changed fields from:
{
  "currentRoomId": string,
  "inventory": string[],
  "isGameOver": boolean
}

Rules:
- Change currentRoomId only if the player clearly moves to a new room.
- Only include inventory when an item is clearly taken, picked up, or dropped.
- Leave fields out if unchanged.
- Return {} if nothing changed.`;

  let partial: Partial<Omit<GameState, 'conversationHistory'>> = {};

  try {
    const completion = await getClient().chat.completions.create({
      model: FAST_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Player action: "${playerAction}"\n\nNarrator response:\n"${narrative.slice(-900)}"`,
        },
      ],
      max_completion_tokens: 120,
      reasoning_effort: 'minimal' as 'low',
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '{}';
    const parsed = JSON.parse(raw);

    if (typeof parsed.currentRoomId === 'string' && roomIds.includes(parsed.currentRoomId)) {
      partial.currentRoomId = parsed.currentRoomId;
    }

    if (
      Array.isArray(parsed.inventory) &&
      parsed.inventory.every((value: unknown) => typeof value === 'string')
    ) {
      partial.inventory = parsed.inventory;
    }

    if (typeof parsed.isGameOver === 'boolean') {
      partial.isGameOver = parsed.isGameOver;
    }
  } catch (err) {
    console.warn('[extractGameStateUpdate] fallback to heuristic parsing:', err);
  }

  const lowerNarrative = narrative.toLowerCase();
  const discoveredEvidence = new Set(currentState.discoveredEvidence);
  for (const item of evidenceItems) {
    const itemName = item.name.toLowerCase();
    const itemIdWords = item.id.replace(/_/g, ' ').toLowerCase();
    if (lowerNarrative.includes(itemName) || lowerNarrative.includes(itemIdWords)) {
      discoveredEvidence.add(item.id);
    }
  }

  if (discoveredEvidence.size !== currentState.discoveredEvidence.length) {
    partial.discoveredEvidence = [...discoveredEvidence];
  }

  if (!partial.currentRoomId && isMovementAction) {
    const currentRoom = scenario.rooms.find((room) => room.id === currentState.currentRoomId);
    const directionMatch = actionLower.match(/\b(north|south|east|west|up|down|n|s|e|w)\b/);
    if (currentRoom && directionMatch) {
      const dirMap: Record<string, string> = {
        n: 'north',
        s: 'south',
        e: 'east',
        w: 'west',
      };
      const normalizedDirection = dirMap[directionMatch[1]] || directionMatch[1];
      const nextRoomId = currentRoom.exits[normalizedDirection];
      if (nextRoomId) {
        partial.currentRoomId = nextRoomId;
      }
    }
  }

  if (!partial.currentRoomId && isMovementAction) {
    for (const room of scenario.rooms) {
      if (room.id === currentState.currentRoomId) continue;
      const roomName = room.name.toLowerCase();
      if (lowerNarrative.includes(roomName) || actionLower.includes(roomName)) {
        partial.currentRoomId = room.id;
        break;
      }
    }
  }

  if (!partial.inventory && /\b(pick|take|grab|get|collect)\b/.test(actionLower)) {
    const updatedInventory = new Set(currentState.inventory);
    for (const item of scenario.items) {
      const itemName = item.name.toLowerCase();
      const itemIdWords = item.id.replace(/_/g, ' ').toLowerCase();
      if (
        actionLower.includes(itemName) ||
        actionLower.includes(itemIdWords) ||
        lowerNarrative.includes(itemName)
      ) {
        updatedInventory.add(item.id);
      }
    }

    if (updatedInventory.size !== currentState.inventory.length) {
      partial.inventory = [...updatedInventory];
    }
  }

  if (partial.currentRoomId && !currentState.visitedRooms.includes(partial.currentRoomId)) {
    partial.visitedRooms = [...currentState.visitedRooms, partial.currentRoomId];
  }

  return partial;
}

/**
 * Generate a scene image URL for the current room.
 * Uses the official GPT Image model family via the image generation API.
 */
export async function generateSceneImage(prompt: string): Promise<string> {
  const response = await getClient().images.generate({
    model: 'gpt-image-1.5',
    prompt: prompt.slice(0, 1500),
    size: '1024x1024',
  });

  const first = response.data?.[0];
  if (first?.b64_json) {
    return `data:image/png;base64,${first.b64_json}`;
  }

  return first?.url ?? '';
}
