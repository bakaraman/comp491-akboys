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
import type { ChatMessage } from '@akboys/shared';

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
  const t0 = Date.now();
  console.log(`[narrator-stream] ▶ model=${MODEL} historyLen=${history.length} promptLen=${systemPrompt.length}`);
  const stream = await getClient().chat.completions.create({
    model: MODEL,
    messages: buildMessages(systemPrompt, history),
    max_completion_tokens: MAX_TOKENS,
    reasoning_effort: REASONING_EFFORT,
    stream: true,
  });

  let firstChunkAt = -1;
  let totalChars = 0;
  let fullText = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      if (firstChunkAt < 0) firstChunkAt = Date.now() - t0;
      totalChars += delta.length;
      fullText += delta;
      yield delta;
    }
  }
  console.log(`[narrator-stream] ✓ (first=${firstChunkAt}ms total=${Date.now() - t0}ms chars=${totalChars})`);
  console.log(`[narrator-stream]   preview: ${fullText.slice(0, 200).replace(/\n/g, ' ')}...`);
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
  directives: Array<{ type: string; player: string; target: string; detail?: string }>;
}

export async function narratorStructuredResponse(
  systemPrompt: string,
  history: ChatMessage[],
): Promise<StructuredNarratorResponse | null> {
  const t0 = Date.now();
  console.log(`[narrator-structured] ▶ model=${MODEL} historyLen=${history.length}`);
  try {
    const completion = await getClient().chat.completions.create({
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
                    type: { type: 'string', description: 'MOVE, PICKUP, OPEN, CLOSE, UNLOCK, BREAK, REVEAL, USE, REMOVE, STATE, DISCOVER, SANITY, NPC_MOOD, NPC_MEMORY, NPC_MOVE, or DISCOVER_EXIT' },
                    player: { type: 'string', description: 'Player name' },
                    target: { type: 'string', description: 'Room ID, item ID, number for SANITY, npcId:roomId for NPC_MOVE, or roomId:direction for DISCOVER_EXIT' },
                    detail: { type: 'string', description: 'Optional extra info: disposition for NPC_MOOD (friendly/neutral/hostile/scared), memory text for NPC_MEMORY' },
                  },
                  required: ['type', 'player', 'target', 'detail'],
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
    console.log(`[narrator-structured] ✓ (${Date.now() - t0}ms, ${raw?.length ?? 0} chars)`);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    // Validate shape
    if (
      typeof parsed.response === 'string' &&
      typeof parsed.observed === 'string' &&
      Array.isArray(parsed.directives)
    ) {
      console.log(`[narrator-structured]   response: ${parsed.response.slice(0, 200).replace(/\n/g, ' ')}...`);
      console.log(`[narrator-structured]   directives: ${parsed.directives.length} (${parsed.directives.map((d: { type: string }) => d.type).join(', ')})`);
      return parsed as StructuredNarratorResponse;
    }

    return null;
  } catch (err) {
    console.error(`[narrator-structured] ✗ error after ${Date.now() - t0}ms:`, err);
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
    reasoning_effort: REASONING_EFFORT,
  });

  return completion.choices[0]?.message?.content || 'The narrator is silent...';
}

/** Fast model for lightweight tasks — gpt-5-nano with minimal reasoning for speed */
const FAST_MODEL = 'gpt-5-nano';

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
 * Build a context-aware fallback when the API fails or returns garbage.
 * Always references something that actually exists in the scene, never
 * a generic "Biriyle konuş" when no NPC is around.
 */
export function buildContextFallbacks(ctx?: SceneContext): string[] {
  const out: string[] = [];

  const npc = ctx?.npcsInRoom?.[0];
  if (npc) out.push(`${npc.name}'a yaklaş`);

  const item = ctx?.itemsInRoom?.[0];
  if (item) out.push(`${item.name}'i incele`);

  const adj = ctx?.adjacentRoomNames?.[0];
  if (adj) out.push(`${adj}'a yönel`);

  // Fill remaining slots with safe scene-agnostic prompts that always make sense.
  const generic = ['Etrafa kulak ver', 'Eşyalarını gözden geçir', 'Çıkışı ara'];
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
export async function suggestFollowUps(
  lastNarratorText: string,
  ctx?: SceneContext,
): Promise<string[]> {
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

  const systemPrompt = `Sen bir dedektif oyununda 3 öneri butonu üreten asistansın.

KESİN KURALLAR:
- ÇIKTI: SADECE 3 string içeren bir JSON dizisi. Başka bir şey yok.
- HEPSİ TÜRKÇE. Her biri en fazla 6 kelime, SOMUT bir eylem.
- Her öneri SAHNEDE GÖRÜNEN bir kişiye, nesneye veya komşu odaya atıfta bulunmalı.
- Sahnede olmayan kişi/nesne/yer ASLA uydurma. Liste dışı isim kullanma.
- Generic ifadeler ("biriyle konuş", "etrafa bak") yalnızca SAHNE TAMAMEN BOŞSA kullanılır.

ÖRNEK 1 — Sahne: morg, kişiler [Doktor Şevket], nesneler [otopsi raporu, çelik makas]:
["Doktor Şevket'e ölüm saatini sor","Otopsi raporunu oku","Çelik makası incele"]

ÖRNEK 2 — Sahne: bahçe, kişi yok, nesneler [kırık fener], komşu [koridor]:
["Kırık feneri al","Çitin ardına bak","Koridora yönel"]

ÖRNEK 3 — Sahne: boş çatı katı, kişi yok, nesne yok, komşu [merdiven boşluğu]:
["Etrafa kulak ver","Tozlu zemine bak","Merdiven boşluğuna in"]`;

  const userPrompt = sceneBlock
    ? `${sceneBlock}\n\nAnlatıcı az önce şunu söyledi:\n"${lastNarratorText.slice(-400)}"\n\n3 Türkçe öneri (yalnızca JSON dizisi):`
    : `Anlatıcı az önce şunu söyledi:\n"${lastNarratorText.slice(-500)}"\n\n3 Türkçe öneri (yalnızca JSON dizisi):`;

  const completion = await getClient().chat.completions.create({
    model: FAST_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_completion_tokens: 150,
    reasoning_effort: 'minimal' as 'low',
  });

  const raw = completion.choices[0]?.message?.content || '[]';
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length >= 3) {
      return parsed.slice(0, 3).map((s: unknown) => String(s));
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
export async function generateSceneImage(prompt: string): Promise<string> {
  const response = await getClient().images.generate({
    model: 'gpt-image-1.5',
    prompt: prompt.slice(0, 1500),
    size: '1024x1024',
    quality: 'low',
    output_format: 'jpeg',
  });

  const first = response.data?.[0];
  if (first?.b64_json) {
    return `data:image/jpeg;base64,${first.b64_json}`;
  }

  return first?.url ?? '';
}
