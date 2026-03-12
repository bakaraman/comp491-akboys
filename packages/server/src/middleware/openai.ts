/**
 * openai.ts — OpenAI API client wrapper
 *
 * Provides a single function to chat with the OpenAI API.
 * Uses GPT-5.4 for narration. Reads API key from environment.
 *
 * @author AK Boys Team
 * @since 2026-03-12
 */

import OpenAI from 'openai';
import type { ChatMessage } from '@akboys/shared';

const MODEL = 'gpt-4o-mini';

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

/**
 * Send conversation history to OpenAI and get narrator response.
 *
 * @param systemPrompt - The game scenario and rules as system message
 * @param history - The conversation history so far
 * @returns The narrator's response text
 */
export async function narratorChat(
  systemPrompt: string,
  history: ChatMessage[],
): Promise<string> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ];

  const completion = await getClient().chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: 500,
    temperature: 0.85,
  });

  return completion.choices[0]?.message?.content || 'The narrator is silent...';
}
