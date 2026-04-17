/**
 * tts.ts — OpenAI Text-to-Speech via gpt-4o-mini-tts
 *
 * Streams WAV audio for given Turkish text using the shimmer voice.
 * Used for the opening narration and finale reveal.
 *
 * @author AKBOYS Team
 * @since 2026-04-17
 */

import OpenAI from 'openai';

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}
const DEBUG = '[tts]';

const DEFAULT_INSTRUCTIONS =
  'Speak in a smooth, measured, slightly melancholic Turkish voice. ' +
  'Noir atmosphere. Natural pauses. Like a film voiceover. ' +
  'Pronounce Turkish words naturally with proper stress.';

export interface TtsOptions {
  text: string;
  voice?: 'shimmer' | 'nova' | 'coral' | 'alloy' | 'onyx' | 'shimmer' | 'sage' | 'echo';
  format?: 'wav' | 'mp3' | 'opus' | 'pcm';
  instructions?: string;
}

/**
 * Generate TTS audio, return a Response object whose body can be piped.
 * Caller is responsible for streaming to client.
 */
export async function streamTts(opts: TtsOptions): Promise<Response> {
  const voice = opts.voice ?? 'shimmer';
  const format = opts.format ?? 'wav';
  const instructions = opts.instructions ?? DEFAULT_INSTRUCTIONS;

  console.log(`${DEBUG} generating: voice=${voice}, format=${format}, length=${opts.text.length}`);

  const response = await client().audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice,
    input: opts.text.slice(0, 4000),
    instructions,
    response_format: format,
  });

  // response is a Response object — body is a ReadableStream
  return response as unknown as Response;
}

/** Buffer TTS to a full ArrayBuffer (for simpler client playback). */
export async function renderTtsBuffer(opts: TtsOptions): Promise<ArrayBuffer> {
  const response = await streamTts(opts);
  return response.arrayBuffer();
}
