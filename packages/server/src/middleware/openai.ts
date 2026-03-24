/**
 * openai.ts — OpenAI API client wrapper
 *
 * Provides streaming and non-streaming chat functions.
 * Model and parameters are configured here as constants.
 *
 * @author AK Boys Team
 * @since 2026-03-12
 */

import OpenAI from 'openai';
import type { ChatMessage } from '@akboys/shared';

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
