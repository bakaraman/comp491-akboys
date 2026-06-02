/**
 * openai.ts — OpenAI API client wrapper
 *
 * Provides streaming and non-streaming chat functions.
 * Model and parameters are configured here as constants.
 *
 * @author AKBOYS Team
 * @since 2026-03-12
 */

import type { ChatMessage, WorldData } from '@akboys/shared';
import type OpenAI from 'openai';
import { openaiClient, openaiStreamClient } from '../lib/openai-client.js';
import { withOpenAIRetry } from '../lib/openai-retry.js';
import { logFromCompletion, logOpenAIUsage } from '../lib/usage-logger.js';

/**
 * Model configuration — change these to switch models.
 * gpt-5.4      : latest frontier model, best quality
 * gpt-4o       : previous gen, still solid
 * gpt-4o-mini  : fast, cheap, good for dev/testing
 */
const MODEL = 'gpt-5.4';
const REASONING_EFFORT: 'low' | 'medium' | 'high' = 'medium';
// gpt-5.4 reasoning tokens count against max_completion_tokens, so bump
// the ceiling so the visible output isn't starved by reasoning work.
const MAX_TOKENS = 2500;

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
  sessionId?: string,
): AsyncGenerator<string> {
  const t0 = Date.now();
  console.log(`[narrator-stream] ▶ model=${MODEL} historyLen=${history.length} promptLen=${systemPrompt.length}`);
  const stream = await withOpenAIRetry('narrator-stream', () =>
    openaiStreamClient().chat.completions.create({
      model: MODEL,
      messages: buildMessages(systemPrompt, history),
      max_completion_tokens: MAX_TOKENS,
      reasoning_effort: REASONING_EFFORT,
      stream: true,
      stream_options: { include_usage: true },
    }),
  );

  let firstChunkAt = -1;
  let totalChars = 0;
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  try {
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        if (firstChunkAt < 0) firstChunkAt = Date.now() - t0;
        totalChars += delta.length;
        fullText += delta;
        yield delta;
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? 0;
        outputTokens = chunk.usage.completion_tokens ?? 0;
        reasoningTokens = chunk.usage.completion_tokens_details?.reasoning_tokens ?? 0;
      }
    }
    console.log(`[narrator-stream] ✓ (first=${firstChunkAt}ms total=${Date.now() - t0}ms chars=${totalChars})`);
    console.log(`[narrator-stream]   preview: ${fullText.slice(0, 200).replace(/\n/g, ' ')}...`);
    logOpenAIUsage({
      model: MODEL,
      purpose: 'narrator',
      inputTokens,
      outputTokens,
      reasoningTokens,
      durationMs: Date.now() - t0,
      sessionId,
      success: true,
    });
  } catch (err) {
    logOpenAIUsage({
      model: MODEL,
      purpose: 'narrator',
      inputTokens,
      outputTokens,
      reasoningTokens,
      durationMs: Date.now() - t0,
      sessionId,
      success: false,
      errorTag: (err as Error).name ?? 'stream-error',
    });
    throw err;
  }
}

/**
 * Structured narrator response — returns JSON with guaranteed schema.
 * Used for per-player action responses where we need [RESPONSE]/[OBSERVED]/directives.
 *
 * #58 — `response` and `observed` are bilingual ({tr, en}) so a single
 * LLM call serves both Turkish and English players in the same session
 * with semantically identical content.
 *
 * Returns parsed JSON or null on failure.
 */
export interface BilingualText {
  tr: string;
  en: string;
}

export interface StructuredNarratorResponse {
  response: BilingualText;
  observed: BilingualText;
  directives: Array<{ type: string; player: string; target: string; detail?: string }>;
}

function isBilingualText(v: unknown): v is BilingualText {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { tr?: unknown }).tr === 'string' &&
    typeof (v as { en?: unknown }).en === 'string'
  );
}

/**
 * #58: detect when the LLM has accidentally nested another JSON object
 * inside a bilingual string slice. We've seen the model emit
 *   response.tr = "{ \"response\": \"...\", \"directives\": [...] }"
 * when bilingual + structured-output context confuses the schema. Treat
 * any value that parses cleanly as JSON containing a `response` /
 * `directives` / `observed` key as poisoned so the caller can retry.
 */
function isJsonContaminated(s: string): boolean {
  const trimmed = s.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      ('response' in parsed || 'directives' in parsed || 'observed' in parsed)
    );
  } catch {
    return false;
  }
}

export async function narratorStructuredResponse(
  systemPrompt: string,
  history: ChatMessage[],
  sessionId?: string,
  world?: WorldData | null,
): Promise<StructuredNarratorResponse | null> {
  const t0 = Date.now();
  console.log(`[narrator-structured] ▶ model=${MODEL} historyLen=${history.length}`);

  // Issue #60: when a world is available, lock `target` to an enum of real
  // room IDs so the model can't emit a typo'd or hallucinated room.
  const roomIds = world?.rooms.map((r) => r.id) ?? [];
  const targetSchema: Record<string, unknown> = roomIds.length > 0
    ? { type: 'string', enum: roomIds, description: 'Exact room ID from the ROOMS list. Must be one of the listed IDs.' }
    : { type: 'string', description: 'Room ID, item ID, number for SANITY, npcId:roomId for NPC_MOVE, or roomId:direction for DISCOVER_EXIT' };

  try {
    const completion = await withOpenAIRetry('narrator-structured', () =>
      openaiClient().chat.completions.create({
        model: MODEL,
        messages: buildMessages(systemPrompt, history),
        max_completion_tokens: MAX_TOKENS,
        reasoning_effort: REASONING_EFFORT,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'narrator_response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                response: {
                  type: 'object',
                  properties: {
                    tr: { type: 'string', description: 'Turkish narrator response for the acting player. Second person. Markdown allowed.' },
                    en: { type: 'string', description: 'English narrator response — semantically identical to the Turkish version: same details, same tone, same pacing. Native English, not literal translation.' },
                  },
                  required: ['tr', 'en'],
                  additionalProperties: false,
                  description: 'Bilingual second-person narrator response for the acting player.',
                },
                observed: {
                  type: 'object',
                  properties: {
                    tr: { type: 'string', description: 'Turkish brief third-person sentence of what nearby players observe. No secrets.' },
                    en: { type: 'string', description: 'English version of the same observed-by-witnesses line.' },
                  },
                  required: ['tr', 'en'],
                  additionalProperties: false,
                  description: 'Bilingual brief third-person sentence of what nearby players observe.',
                },
                directives: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', description: 'MOVE is the only valid type.' },
                      player: { type: 'string', description: 'Player name' },
                      target: targetSchema,
                      detail: { type: 'string', description: 'Optional extra info' },
                    },
                    required: ['type', 'player', 'target', 'detail'],
                    additionalProperties: false,
                  },
                  description: 'State change directives. Only include MOVE if the player changed room.',
                },
              },
              required: ['response', 'observed', 'directives'],
              additionalProperties: false,
            },
          },
        },
      }),
    );

    logFromCompletion(completion, {
      model: MODEL,
      purpose: 'narrator-structured',
      durationMs: Date.now() - t0,
      sessionId,
      success: true,
    });

    const raw = completion.choices[0]?.message?.content;
    console.log(`[narrator-structured] ✓ (${Date.now() - t0}ms, ${raw?.length ?? 0} chars)`);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (
      isBilingualText(parsed.response) &&
      isBilingualText(parsed.observed) &&
      Array.isArray(parsed.directives)
    ) {
      // #58: defensive check — refuse poisoned outputs where the model
      // accidentally nested a JSON object inside one of the bilingual
      // strings. Returning null lets the caller retry exactly once before
      // falling back to legacy text.
      if (
        isJsonContaminated(parsed.response.tr) ||
        isJsonContaminated(parsed.response.en) ||
        isJsonContaminated(parsed.observed.tr) ||
        isJsonContaminated(parsed.observed.en)
      ) {
        console.warn('[narrator-structured] ✗ JSON contamination detected inside a bilingual slice — treating as null so the caller can retry');
        return null;
      }

      console.log(`[narrator-structured]   response.tr: ${parsed.response.tr.slice(0, 160).replace(/\n/g, ' ')}...`);
      console.log(`[narrator-structured]   directives: ${parsed.directives.length} (${parsed.directives.map((d: { type: string }) => d.type).join(', ')})`);
      return parsed as StructuredNarratorResponse;
    }

    return null;
  } catch (err) {
    console.error(`[narrator-structured] ✗ error after ${Date.now() - t0}ms:`, err);
    logOpenAIUsage({
      model: MODEL,
      purpose: 'narrator-structured',
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - t0,
      sessionId,
      success: false,
      errorTag: (err as Error).name ?? 'error',
    });
    return null;
  }
}

/**
 * Non-streaming fallback — returns the full response at once.
 */
export async function narratorChat(
  systemPrompt: string,
  history: ChatMessage[],
  sessionId?: string,
): Promise<string> {
  const t0 = Date.now();
  const completion = await withOpenAIRetry('narrator-chat', () =>
    openaiClient().chat.completions.create({
      model: MODEL,
      messages: buildMessages(systemPrompt, history),
      max_completion_tokens: MAX_TOKENS,
      reasoning_effort: REASONING_EFFORT,
    }),
  );

  logFromCompletion(completion, {
    model: MODEL,
    purpose: 'narrator-nonstream',
    durationMs: Date.now() - t0,
    sessionId,
    success: true,
  });

  return completion.choices[0]?.message?.content || 'The narrator is silent...';
}

/** Fast model for lightweight tasks — gpt-5.4-nano with minimal reasoning for speed */
const FAST_MODEL = 'gpt-5.4-nano';

/**
 * Scene context for grounded suggestions — what the player can actually
 * see/touch/talk-to in their current room. Without this, the model is
 * blind and parrots whatever's in the system prompt example.
 */
export interface SceneContext {
  /** Current room name (e.g. "Morg") */
  roomName?: string;
  /** Current room description for atmosphere */
  roomDescription?: string;
  /** NPCs physically in the same room as the player */
  npcsInRoom?: { name: string; description: string }[];
  /** Items in the same room */
  itemsInRoom?: { name: string }[];
  /** Names of rooms reachable through this room's exits */
  adjacentRoomNames?: string[];
}

/**
 * Build a context-aware bilingual fallback when the API fails or returns garbage.
 * Always references something that actually exists in the scene, never
 * a generic "Biriyle konuş" when no NPC is around. Names are proper nouns
 * — same string in both languages.
 */
export function buildContextFallbacks(ctx?: SceneContext): BilingualText[] {
  const out: BilingualText[] = [];

  const npc = ctx?.npcsInRoom?.[0];
  if (npc) out.push({ tr: `${npc.name}'a yaklaş`, en: `Approach ${npc.name}` });

  const item = ctx?.itemsInRoom?.[0];
  if (item) out.push({ tr: `${item.name}'i incele`, en: `Examine ${item.name}` });

  const adj = ctx?.adjacentRoomNames?.[0];
  if (adj) out.push({ tr: `${adj}'a yönel`, en: `Head to ${adj}` });

  // Fill remaining slots with safe scene-agnostic prompts that always make sense.
  const generic: BilingualText[] = [
    { tr: 'Etrafa kulak ver', en: 'Listen for sounds' },
    { tr: 'Eşyalarını gözden geçir', en: 'Check your surroundings' },
    { tr: 'Çıkışı ara', en: 'Look for an exit' },
  ];
  let gi = 0;
  while (out.length < 3 && gi < generic.length) {
    out.push(generic[gi++]);
  }
  return out.slice(0, 3);
}

/**
 * Generate 3 follow-up action suggestions based on the last narrator response.
 * Uses gpt-5-nano with reasoning_effort "minimal" (0 reasoning tokens, ~1s latency).
 *
 * Pass `ctx` (scene context) so the model only suggests actions that reference
 * NPCs, items, or rooms that actually exist right now. Without ctx, it falls
 * back to generic suggestions but at least won't invent characters that aren't
 * in the world (e.g. "Barmenle konuş" in a boarding-school scenario).
 */
/**
 * Generate 3 follow-up action suggestions in BOTH languages so the client
 * can render the player's locale via pickLang. Single LLM call with a
 * bilingual structured schema (#58).
 */
export async function suggestFollowUps(
  lastNarratorText: string,
  ctx?: SceneContext,
  sessionId?: string,
): Promise<BilingualText[]> {
  // Compact, model-readable scene block. Kept short to avoid token bloat.
  const sceneBlock = (() => {
    if (!ctx) return '';
    const lines: string[] = [];
    if (ctx.roomName) {
      lines.push(`Oda: ${ctx.roomName}${ctx.roomDescription ? ` — ${ctx.roomDescription}` : ''}`);
    }
    if (ctx.npcsInRoom && ctx.npcsInRoom.length > 0) {
      lines.push(`Bu odadaki kişiler: ${ctx.npcsInRoom.map((n) => n.name).join(', ')}`);
    } else {
      lines.push('Bu odada kimse yok.');
    }
    if (ctx.itemsInRoom && ctx.itemsInRoom.length > 0) {
      lines.push(`Görünen nesneler: ${ctx.itemsInRoom.map((i) => i.name).join(', ')}`);
    }
    if (ctx.adjacentRoomNames && ctx.adjacentRoomNames.length > 0) {
      lines.push(`Komşu odalar: ${ctx.adjacentRoomNames.join(', ')}`);
    }
    return lines.join('\n');
  })();

  const systemPrompt = `You generate 3 suggestion buttons for a detective game in BOTH Turkish and English.

OUTPUT — strict JSON object with shape: { "suggestions": [ { "tr": "...", "en": "..." }, ... ] } with EXACTLY 3 items.
Each suggestion: a CONCRETE action, at most 6 words in either language.
Each suggestion MUST reference a person, object, or adjacent room that is actually in the scene block. Never invent.
Generic phrasings (look around, examine the room) are allowed only when the scene is completely empty.

EXAMPLE 1 — Scene: morg/morgue, people [Doktor Şevket], objects [otopsi raporu, çelik makas]:
[
  {"tr":"Doktor Şevket'e ölüm saatini sor","en":"Ask Doktor Şevket the time of death"},
  {"tr":"Otopsi raporunu oku","en":"Read the autopsy report"},
  {"tr":"Çelik makası incele","en":"Examine the steel shears"}
]

EXAMPLE 2 — Scene: bahçe/garden, no people, objects [kırık fener], adjacent [koridor/corridor]:
[
  {"tr":"Kırık feneri al","en":"Pick up the broken lantern"},
  {"tr":"Çitin ardına bak","en":"Look behind the fence"},
  {"tr":"Koridora yönel","en":"Head into the corridor"}
]

EXAMPLE 3 — Scene: empty attic, no people, no objects, adjacent [merdiven boşluğu/stairwell]:
[
  {"tr":"Etrafa kulak ver","en":"Listen for sounds"},
  {"tr":"Tozlu zemine bak","en":"Inspect the dusty floor"},
  {"tr":"Merdiven boşluğuna in","en":"Descend the stairwell"}
]`;

  const userPrompt = sceneBlock
    ? `${sceneBlock}\n\nAnlatıcı az önce şunu söyledi:\n"${lastNarratorText.slice(-400)}"\n\n3 bilingual suggestion (JSON object as specified):`
    : `Anlatıcı az önce şunu söyledi:\n"${lastNarratorText.slice(-500)}"\n\n3 bilingual suggestion (JSON object as specified):`;

  const t0 = Date.now();
  let completion;
  try {
    completion = await withOpenAIRetry('suggestion', () =>
      openaiClient().chat.completions.create({
        model: FAST_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_completion_tokens: 250,
        // gpt-5.4-nano dropped 'minimal' — 'none' is the new "no reasoning" value.
        reasoning_effort: 'none' as 'low',
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'suggestions',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                suggestions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      tr: { type: 'string', description: 'Turkish suggestion, max 6 words.' },
                      en: { type: 'string', description: 'English suggestion — semantically identical to Turkish.' },
                    },
                    required: ['tr', 'en'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['suggestions'],
              additionalProperties: false,
            },
          },
        },
      }),
    );
  } catch (err) {
    logOpenAIUsage({
      model: FAST_MODEL,
      purpose: 'suggestion',
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - t0,
      sessionId,
      success: false,
      errorTag: (err as Error).name ?? 'error',
    });
    return buildContextFallbacks(ctx);
  }

  logFromCompletion(completion, {
    model: FAST_MODEL,
    purpose: 'suggestion',
    durationMs: Date.now() - t0,
    sessionId,
    success: true,
  });

  const raw = completion.choices[0]?.message?.content || '{"suggestions":[]}';
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.suggestions) && parsed.suggestions.length >= 3) {
      const out: BilingualText[] = parsed.suggestions
        .slice(0, 3)
        .filter(isBilingualText);
      if (out.length === 3) return out;
    }
  } catch { /* fallback below */ }
  return buildContextFallbacks(ctx);
}

// extractGameStateUpdate removed: was a bag of regex heuristics for single-player.
// MP flow uses AI-emitted directives (MOVE/PICKUP/DISCOVER) as the sole source of truth.

/**
 * Generate a scene image URL for the current room.
 * Uses the official GPT Image model family via the image generation API.
 */
export async function generateSceneImage(prompt: string, sessionId?: string): Promise<string> {
  const t0 = Date.now();
  const IMAGE_MODEL = 'gpt-image-2';
  try {
    const response = await withOpenAIRetry('image-gen', () =>
      openaiClient().images.generate({
        model: IMAGE_MODEL,
        prompt: prompt.slice(0, 1500),
        size: '1024x1024',
        quality: 'low',
        output_format: 'jpeg',
      }),
    );

    logOpenAIUsage({
      model: IMAGE_MODEL,
      purpose: 'image',
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - t0,
      sessionId,
      success: true,
    });

    const first = response.data?.[0];
    if (first?.b64_json) {
      return `data:image/jpeg;base64,${first.b64_json}`;
    }

    return first?.url ?? '';
  } catch (err) {
    logOpenAIUsage({
      model: IMAGE_MODEL,
      purpose: 'image',
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - t0,
      sessionId,
      success: false,
      errorTag: (err as Error).name ?? 'error',
    });
    throw err;
  }
}
