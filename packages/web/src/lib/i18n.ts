/**
 * i18n.ts — Translation type + helpers for Velvet Shadow
 *
 * Type authority for UI translations. Defines:
 *   - Locale: 'tr' | 'en'
 *   - Translations: widened structural type derived from tr.ts (no literals)
 *   - Bilingual<T>: a server-produced field that may carry both languages
 *   - getT(locale): runtime UI-string selector
 *   - pickLang(field, locale): safe bilingual content reader with
 *     backward compatibility (string fields render in any locale)
 *
 * The Widen mapped type erases the literal types that tr.ts's `as const`
 * adds, so en.ts can satisfy the same shape with different string values.
 *
 * @author AKBOYS Team
 * @since 2026-05-13
 */

import { T as trT } from './tr';
import { T as enT } from './en';

export type Locale = 'tr' | 'en';

type Widen<T> =
  T extends string ? string :
  T extends readonly (infer U)[] ? Widen<U>[] :
  T extends object ? { -readonly [K in keyof T]: Widen<T[K]> } :
  T;

export type Translations = Widen<typeof trT>;

export function getT(locale: Locale): Translations {
  return locale === 'en'
    ? (enT as Translations)
    : (trT as unknown as Translations);
}

/* ------------------------------------------------------------------ */
/*  Bilingual field reader                                             */
/* ------------------------------------------------------------------ */

export type Bilingual<T = string> = T | { tr: T; en: T };

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
