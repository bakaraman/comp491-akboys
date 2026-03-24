/**
 * usePlayerName.ts — Persistent player name via localStorage
 *
 * Stores and retrieves the player's display name. Returns null
 * if the player hasn't set a name yet (first visit).
 *
 * @author AK Boys Team
 * @since 2026-03-24
 */

'use client';

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'akboys_player_name';

function readName(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeName(name: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch { /* storage blocked */ }
}

export function usePlayerName() {
  const [name, setNameState] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Read from localStorage on mount (client only)
  useEffect(() => {
    setNameState(readName());
    setLoaded(true);
  }, []);

  const setName = useCallback((newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    writeName(trimmed);
    setNameState(trimmed);
  }, []);

  const clearName = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
    setNameState(null);
  }, []);

  return { name, loaded, setName, clearName };
}
