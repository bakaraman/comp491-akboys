/**
 * pickLang.ts — Bilingual content reader
 *
 * Reads a Bilingual<T> field for a given locale. Strings are accepted as
 * a backward-compatibility fallback for pre-i18n data — they render the
 * same in every locale.
 *
 * Lives in @akboys/shared so server-side adapters/prompt-builders and
 * client-side components share a single implementation.
 *
 * @author AKBOYS Team
 * @since 2026-05-13
 */

import type { Bilingual, Locale } from '../types/game.js';

function isBilingualObject<T>(v: unknown): v is { tr: T; en: T } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'tr' in (v as Record<string, unknown>) &&
    'en' in (v as Record<string, unknown>)
  );
}

export function pickLang<T>(field: Bilingual<T>, locale: Locale): T;
export function pickLang<T>(
  field: Bilingual<T> | null | undefined,
  locale: Locale,
): T | null | undefined;
export function pickLang<T>(
  field: Bilingual<T> | null | undefined,
  locale: Locale,
): T | null | undefined {
  if (field == null) return field;
  if (isBilingualObject<T>(field)) return field[locale];
  return field as T;
}
