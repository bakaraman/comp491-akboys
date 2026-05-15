/**
 * useLocale.ts — Per-user locale preference (UI rendering)
 *
 * Holds the current player's UI locale ('tr' | 'en') with:
 *   - localStorage persistence (key `velvet-locale`)
 *   - Cross-component sync via tiny pub-sub (same pattern as useAmbientLoop)
 *   - Locked state: when the game starts, setLocale becomes a no-op so
 *     mid-game language switching is impossible (a hard product constraint)
 *
 * Bilingual narrator/world content is rendered with pickLang from i18n.ts;
 * UI strings come from getT(locale). This hook is the single source of
 * truth for the current locale on the client.
 *
 * @author AKBOYS Team
 * @since 2026-05-13
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

import { getT, type Locale, type Translations } from '@/lib/i18n';

const STORAGE_LOCALE = 'velvet-locale';

interface LocaleState {
  locale: Locale;
  locked: boolean;
}

function readLocaleFromStorage(): Locale {
  if (typeof window === 'undefined') return 'tr';
  const v = window.localStorage.getItem(STORAGE_LOCALE);
  return v === 'en' ? 'en' : 'tr';
}

let cachedState: LocaleState | null = null;
const subscribers = new Set<(s: LocaleState) => void>();

function getState(): LocaleState {
  if (!cachedState) {
    cachedState = { locale: readLocaleFromStorage(), locked: false };
  }
  return cachedState;
}

function publish(next: LocaleState): void {
  cachedState = next;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_LOCALE, next.locale);
  }
  subscribers.forEach((fn) => fn(next));
}

export interface UseLocaleResult {
  locale: Locale;
  locked: boolean;
  setLocale: (l: Locale) => void;
  lock: () => void;
  unlock: () => void;
}

export function useLocale(): UseLocaleResult {
  const [state, setState] = useState<LocaleState>(() => getState());

  useEffect(() => {
    subscribers.add(setState);
    return () => {
      subscribers.delete(setState);
    };
  }, []);

  const setLocale = useCallback((l: Locale) => {
    const current = getState();
    if (current.locked) return;
    if (current.locale === l) return;
    publish({ locale: l, locked: current.locked });
  }, []);

  const lock = useCallback(() => {
    const current = getState();
    if (current.locked) return;
    publish({ locale: current.locale, locked: true });
  }, []);

  const unlock = useCallback(() => {
    const current = getState();
    if (!current.locked) return;
    publish({ locale: current.locale, locked: false });
  }, []);

  return {
    locale: state.locale,
    locked: state.locked,
    setLocale,
    lock,
    unlock,
  };
}

/**
 * Convenience hook for components that only need the translated UI dict.
 * Equivalent to `getT(useLocale().locale)` but shorter at the call site.
 */
export function useT(): Translations {
  const { locale } = useLocale();
  return getT(locale);
}

/**
 * Non-hook accessor. Useful for socket payload builders and other utility
 * functions that need to know the locale but don't render React.
 */
export function getCurrentLocale(): Locale {
  return getState().locale;
}

/**
 * True iff the user has previously chosen a locale (key exists in
 * localStorage). Drives whether the onboarding modal appears on first
 * visit.
 */
export function hasUserChosenLocale(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_LOCALE) !== null;
}
