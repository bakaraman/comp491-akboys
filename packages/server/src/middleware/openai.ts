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
const MAX_TOKENS = 500;
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
