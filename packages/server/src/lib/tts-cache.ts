/**
 * tts-cache.ts — In-memory cache for pre-rendered TTS audio.
 *
 * Purpose: kill the 3–5s wait between "open curtain" and audio playback.
 * Server pre-warms both TR + EN renders of the opening narration the
 * moment world generation completes, then `/api/chat/tts` returns the
 * cached buffer instantly when a client asks for the same text.
 *
 * Cache shape: keyed by sessionId + locale + sha1(text). The text hash
 * prevents stale hits when the client requests TTS for OTHER text (e.g.
 * the finale paragraph) in the same session.
 *
 * Entries are dropped when their session is deleted; otherwise they live
 * for the session's lifetime (≤24h via SessionStore cleanup).
 */

import { createHash } from 'crypto';
import type { TtsVoice } from '../world/tts.js';

interface CacheEntry {
  buffer: Buffer;
  textHash: string;
  voice: TtsVoice;
  /** Wall-clock ms it took to render (for observability). */
  renderMs: number;
}

type Locale = 'tr' | 'en';

const cache = new Map<string, CacheEntry>();

function key(sessionId: string, locale: Locale): string {
  return `${sessionId}::${locale}`;
}

function hashText(text: string): string {
  return createHash('sha1').update(text).digest('hex').slice(0, 16);
}

export function setCached(
  sessionId: string,
  locale: Locale,
  text: string,
  voice: TtsVoice,
  buffer: Buffer,
  renderMs: number,
): void {
  cache.set(key(sessionId, locale), {
    buffer,
    textHash: hashText(text),
    voice,
    renderMs,
  });
  console.log(
    `[tts-cache] stored ${sessionId.slice(0, 8)}/${locale} `
      + `(${buffer.length}B, render=${renderMs}ms, hash=${hashText(text)})`,
  );
}

export function tryGetCached(
  sessionId: string,
  locale: Locale,
  text: string,
): { buffer: Buffer; renderMs: number } | null {
  const entry = cache.get(key(sessionId, locale));
  if (!entry) return null;
  if (entry.textHash !== hashText(text)) return null;
  return { buffer: entry.buffer, renderMs: entry.renderMs };
}

export function dropSession(sessionId: string): void {
  for (const locale of ['tr', 'en'] as const) {
    cache.delete(key(sessionId, locale));
  }
}
