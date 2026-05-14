/**
 * tts.ts — OpenAI Text-to-Speech via gpt-4o-mini-tts
 *
 * Generates calm, natural Turkish narration using the instructions-aware
 * gpt-4o-mini-tts model. Default voice is `ash` (warm, grounded, male) —
 * the style is a conversational audiobook tone, not a theatrical film-noir one.
 *
 * @author AKBOYS Team
 * @since 2026-04-17
 */

import { openaiClient } from '../lib/openai-client.js';
import { withOpenAIRetry } from '../lib/openai-retry.js';
import { logOpenAIUsage } from '../lib/usage-logger.js';

const DEBUG = '[tts]';

/**
 * Very explicit voice direction — the secret sauce of gpt-4o-mini-tts.
 * Pushes the model away from a flat, robotic read toward a proper
 * film-voiceover cadence.
 */
const DEFAULT_INSTRUCTIONS = `
Voice: a calm, grounded Turkish narrator — late 30s, warm mid-range baritone, like a seasoned audiobook reader telling a story by a fireside.
Personality: composed, attentive, quietly engaged with the story. Human, not performative.
Accent: native Turkish speaker. Pronounce Turkish words with natural stress and ğ, ı, ö, ç, ş, ü naturally.
Pacing: steady and natural, ~150-170 words per minute. Let commas breathe. Do not rush, do not drag.
Delivery: read as if telling a friend what happened. Clear, matter-of-fact. Let the words carry their own weight — no theatrical pauses, no forced gravitas, no melodrama.
Emotion: present but restrained. Subtle, not overperformed. The text itself is plain, so let it sound plain.
Texture: warm, clean, conversational. No rasp, no affectation.
Style: contemporary Turkish narration — think a good podcast host or documentary voice-over, NOT a film-noir caricature.
`.trim();

/** Voices we allow — all supported by gpt-4o-mini-tts. */
export type TtsVoice =
  | 'alloy'
  | 'ash'
  | 'ballad'
  | 'coral'
  | 'echo'
  | 'fable'
  | 'nova'
  | 'onyx'
  | 'sage'
  | 'shimmer'
  | 'verse';

export interface TtsOptions {
  text: string;
  voice?: TtsVoice;
  format?: 'wav' | 'mp3' | 'opus' | 'pcm';
  instructions?: string;
  sessionId?: string;
}

/**
 * Generate TTS audio. Returns a Response object whose body can be piped.
 */
export async function streamTts(opts: TtsOptions): Promise<Response> {
  const voice = opts.voice ?? 'ash';
  const format = opts.format ?? 'mp3';
  const instructions = opts.instructions ?? DEFAULT_INSTRUCTIONS;
  const text = opts.text.slice(0, 4000);
  const t0 = Date.now();

  console.log(`${DEBUG} ▶ voice=${voice} format=${format} chars=${opts.text.length}`);

  try {
    // Some OpenAI SDK versions haven't added `ash`/`ballad`/`fable`/`verse` to the
    // union type yet, but the API accepts them. Cast to string to bypass the
    // stale type check.
    const response = await withOpenAIRetry('tts', () =>
      openaiClient().audio.speech.create({
        model: 'gpt-4o-mini-tts',
        voice: voice as 'shimmer',
        input: text,
        instructions,
        response_format: format,
      }),
    );

    console.log(`${DEBUG} ✓ (${Date.now() - t0}ms)`);
    // TTS pricing is per-character; use inputTokens as char count for the cost calc.
    logOpenAIUsage({
      model: 'gpt-4o-mini-tts',
      purpose: 'tts',
      inputTokens: text.length,
      outputTokens: 0,
      durationMs: Date.now() - t0,
      sessionId: opts.sessionId,
      success: true,
    });
    return response as unknown as Response;
  } catch (err) {
    logOpenAIUsage({
      model: 'gpt-4o-mini-tts',
      purpose: 'tts',
      inputTokens: text.length,
      outputTokens: 0,
      durationMs: Date.now() - t0,
      sessionId: opts.sessionId,
      success: false,
      errorTag: (err as Error).name ?? 'error',
    });
    throw err;
  }
}

/** Buffer TTS to a full ArrayBuffer (for simpler client playback). */
export async function renderTtsBuffer(opts: TtsOptions): Promise<ArrayBuffer> {
  const response = await streamTts(opts);
  return response.arrayBuffer();
}
