/**
 * finale.ts — Live AI finale generation based on how the game actually played
 *
 * When the game ends (victory, wrong accusation, or turn limit), this module
 * generates a personalized Turkish finale narrative by feeding GPT-5.4 the
 * session's actual world state log plus the outcome.
 *
 * Streams chunks via an async generator for incremental playback.
 *
 * @author AKBOYS Team
 * @since 2026-04-17
 */

import { pickLang } from '@akboys/shared';
import type { Locale, WorldData } from '@akboys/shared';
import { openaiClient, openaiStreamClient } from '../lib/openai-client.js';
import { withOpenAIRetry } from '../lib/openai-retry.js';
import { logFromCompletion, logOpenAIUsage } from '../lib/usage-logger.js';

const DEBUG = '[finale]';

export type FinaleOutcome = 'won' | 'lost_wrong' | 'lost_timeout';

export interface GenerateFinaleInput {
  world: WorldData;
  outcome: FinaleOutcome;
  accuserName?: string;
  accusedNpcId?: string;
  wrongAccusedNpcId?: string;
  evidencePresentedId?: string;
  worldStateLog: string[];
  turnCount: number;
  maxTurns: number;
  sessionId?: string;
  /** #58: player's locale for the streamed finale text. */
  locale: Locale;
}

function buildFinalePrompt(input: GenerateFinaleInput): { system: string; user: string } {
  const {
    world,
    outcome,
    accuserName,
    accusedNpcId,
    wrongAccusedNpcId,
    evidencePresentedId,
    worldStateLog,
    turnCount,
    maxTurns,
    locale,
  } = input;

  const isEn = locale === 'en';
  const langName = isEn ? 'English' : 'Turkish';

  const culprit = world.npcs.find((n) => n.id === world.solution.culpritNpcId);
  const keyEv = world.items.find((i) => i.id === world.solution.keyEvidenceId);
  const accusedNpc = accusedNpcId ? world.npcs.find((n) => n.id === accusedNpcId) : null;
  const wrongNpc = wrongAccusedNpcId ? world.npcs.find((n) => n.id === wrongAccusedNpcId) : null;
  const evidenceItem = evidencePresentedId ? world.items.find((i) => i.id === evidencePresentedId) : null;

  const system = `You are narrating the FINALE of a mystery. Write in clear, direct, natural ${langName}.

Write EXACTLY 2 short paragraphs. Maximum 150 ${langName} words total. Every sentence delivers a fact or beat — no filler, no decoration, no heavy literary style.

Plain readable prose. Short sentences. Think the matter-of-fact voice of a detective recounting what happened. Every line should either:
  - Name a specific thing the team found or missed
  - State who did what and why
  - Land a concrete consequence

Read it aloud in your head — if a sentence sounds ornamental, cut it.

Do NOT use list items, headers, or markdown. Prose only. Separate the two paragraphs with a single blank line.`;

  const truthBlock = `WORLD:
Title: ${pickLang(world.meta.title, locale)}
Setting: ${pickLang(world.meta.setting, locale)}

TRUE CULPRIT: ${culprit?.name ?? 'unknown'} (role: ${culprit ? pickLang(culprit.role, locale) : 'unknown'})
TRUE MOTIVE: ${pickLang(world.solution.motiveShort, locale)}
KEY EVIDENCE: ${keyEv?.name ?? 'unknown'}`;

  const logBlock = worldStateLog.length
    ? `WORLD STATE LOG (actual team actions, most recent last):\n${worldStateLog.slice(-30).map((e) => `- ${e}`).join('\n')}`
    : 'WORLD STATE LOG: (no canonical events recorded)';

  let outcomeBlock = '';
  if (outcome === 'won') {
    outcomeBlock = `OUTCOME: VICTORY. The team accused the real culprit.
Accuser: ${accuserName ?? 'The team'}
Accused: ${accusedNpc?.name ?? culprit?.name ?? 'the culprit'}
Evidence presented: ${evidenceItem?.name ?? 'key evidence'}
Turns used: ${turnCount} of ${maxTurns}

Write a victorious but bittersweet ending. The truth came at a cost. Name the culprit. Reference the evidence. Let the mood lift only slightly at the end — this is noir.`;
  } else if (outcome === 'lost_wrong') {
    outcomeBlock = `OUTCOME: DEFEAT (wrong accusation).
Accuser: ${accuserName ?? 'A detective'}
Wrongly accused: ${wrongNpc?.name ?? 'an innocent'}
True culprit (escaped): ${culprit?.name}
Turns used: ${turnCount} of ${maxTurns}

Write a tragic ending. The wrong person paid the price. The real culprit escaped, perhaps still out there. Describe the aftermath. Mention the wronged innocent and the real culprit by name.`;
  } else {
    outcomeBlock = `OUTCOME: DEFEAT (trail went cold).
Turns exhausted: ${turnCount} of ${maxTurns}
True culprit (never caught): ${culprit?.name}

Write a defeated, reflective ending. Describe how the case slipped away. The city moved on. The culprit was never caught. Short, elegiac paragraphs.`;
  }

  const user = `${truthBlock}\n\n${logBlock}\n\n${outcomeBlock}\n\nWrite the finale now, in ${langName} prose only.`;

  return { system, user };
}

/**
 * Stream the finale text chunk by chunk. Caller pipes chunks to the client.
 */
export async function* streamFinale(input: GenerateFinaleInput): AsyncGenerator<string> {
  const { system, user } = buildFinalePrompt(input);
  console.log(`${DEBUG} streaming finale: outcome=${input.outcome} locale=${input.locale}`);

  // 2026-05-22 demo speed-up: flagship → mini, medium reasoning → low.
  // Finale prose is 2 short paragraphs of plain noir Turkish/English —
  // mini handles this cleanly and shaves ~10–15s off the user-visible wait.
  const FINALE_MODEL = 'gpt-5.4-mini';
  const t0 = Date.now();
  const stream = await withOpenAIRetry('finale', () =>
    openaiStreamClient().chat.completions.create({
      model: FINALE_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_completion_tokens: 1500, // leave room for reasoning tokens
      reasoning_effort: 'low',
      stream: true,
      stream_options: { include_usage: true },
    }),
  );
  console.log(`${DEBUG} stream opened (${Date.now() - t0}ms)`);

  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  try {
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? 0;
        outputTokens = chunk.usage.completion_tokens ?? 0;
        reasoningTokens = chunk.usage.completion_tokens_details?.reasoning_tokens ?? 0;
      }
    }
    logOpenAIUsage({
      model: FINALE_MODEL,
      purpose: 'finale',
      inputTokens,
      outputTokens,
      reasoningTokens,
      durationMs: Date.now() - t0,
      sessionId: input.sessionId,
      success: true,
    });
  } catch (err) {
    logOpenAIUsage({
      model: FINALE_MODEL,
      purpose: 'finale',
      inputTokens,
      outputTokens,
      reasoningTokens,
      durationMs: Date.now() - t0,
      sessionId: input.sessionId,
      success: false,
      errorTag: (err as Error).name ?? 'stream-error',
    });
    throw err;
  }
}

/** Render full finale text (non-streaming). Useful for saving with session. */
export async function renderFinaleText(input: GenerateFinaleInput): Promise<string> {
  let full = '';
  for await (const chunk of streamFinale(input)) {
    full += chunk;
  }
  return full;
}

/* ------------------------------------------------------------------ */
/*  Bilingual finale — single LLM call, cached and reused per session  */
/* ------------------------------------------------------------------ */

/**
 * #58 follow-up: produce the finale in BOTH languages in a single LLM
 * call so every client in the same session gets the same beat-for-beat
 * story flattened into its own locale. Cached on the session — the
 * second client (and any spectator) hits cache instead of triggering
 * a parallel OpenAI stream.
 *
 * Differs from `streamFinale`/`renderFinaleText` (which are unilingual
 * streaming) in that callers wait for both languages at once. Client
 * UX still feels alive because the FinaleCinematic typewriter syncs
 * with TTS audio, not the LLM stream.
 */
export interface GenerateBilingualFinaleInput {
  world: WorldData;
  outcome: FinaleOutcome;
  accuserName?: string;
  accusedNpcId?: string;
  wrongAccusedNpcId?: string;
  evidencePresentedId?: string;
  worldStateLog: string[];
  turnCount: number;
  maxTurns: number;
  sessionId?: string;
}

export async function generateBilingualFinale(
  input: GenerateBilingualFinaleInput,
): Promise<{ tr: string; en: string; culpritName: string | null }> {
  const trPrompt = buildFinalePrompt({ ...input, locale: 'tr' });
  const enPrompt = buildFinalePrompt({ ...input, locale: 'en' });

  const culprit = input.world.npcs.find((n) => n.id === input.world.solution.culpritNpcId);
  const culpritName = culprit?.name ?? null;

  /* Single combined call: ask the model for both languages in a strict
   * JSON object. Re-use the per-language prompts so each side stays
   * fully grounded in its own outcome block. */
  const system = `You produce the FINALE of a mystery in BOTH Turkish and English in a single JSON object.

The Turkish and English versions must be semantically identical — same beats, same names, same paragraph structure, just two languages. Native flow in each (NOT literal word-for-word translation).

OUTPUT: a strict JSON object: { "tr": "<Turkish finale prose>", "en": "<English finale prose>" }. No commentary, no markdown.

Each language must follow ITS OWN rule pack below.`;

  const user = `### TURKISH RULE PACK
${trPrompt.system}

### TURKISH PROMPT BODY
${trPrompt.user}

### ENGLISH RULE PACK
${enPrompt.system}

### ENGLISH PROMPT BODY
${enPrompt.user}

Now produce the bilingual JSON now.`;

  // 2026-05-22 demo speed-up: flagship → mini, medium reasoning → low.
  // Bilingual JSON output is ~1.5k chars of plain prose; mini renders it
  // cleanly and the user-visible wait between accusation and finale drops
  // from ~20–30s to ~8–12s. Cached per-session so this only fires once.
  const FINALE_MODEL = 'gpt-5.4-mini';
  console.log(`${DEBUG} bilingual generation start: outcome=${input.outcome}`);
  const t0 = Date.now();

  const completion = await withOpenAIRetry('finale-bilingual', () =>
    openaiClient().chat.completions.create({
      model: FINALE_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_completion_tokens: 3000,
      reasoning_effort: 'low',
      response_format: { type: 'json_object' },
    }),
  );

  logFromCompletion(completion, {
    model: FINALE_MODEL,
    purpose: 'finale',
    durationMs: Date.now() - t0,
    sessionId: input.sessionId,
    success: true,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('Bilingual finale returned empty content');
  const parsed = JSON.parse(raw) as { tr?: string; en?: string };
  if (typeof parsed.tr !== 'string' || typeof parsed.en !== 'string') {
    throw new Error('Bilingual finale missing tr/en fields');
  }
  console.log(
    `${DEBUG} bilingual generation ✓ (${Date.now() - t0}ms, tr=${parsed.tr.length}c en=${parsed.en.length}c)`,
  );
  return { tr: parsed.tr.trim(), en: parsed.en.trim(), culpritName };
}
