/**
 * useAmbientLoop.ts — Background music loop with cross-component volume control
 *
 * Plays a looping HTMLAudioElement track and fades it in/out as `active`
 * changes. Volume + muted state is persisted to localStorage and shared
 * across hook instances via a tiny pub-sub so the lobby loop, the in-game
 * loop, and the settings popover slider all stay in sync.
 *
 * NOTE: This is intentionally NOT used by OpeningCinematic / FinaleCinematic.
 * Those overlays manage their own audio (`ambient-urban-noir.m4a`) with the
 * pre-existing useAmbientMusic hook, and we do not touch that path.
 *
 * @author AKBOYS Team
 * @since 2026-05-06
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_VOLUME = 'velvet-ambient-volume';
const STORAGE_MUTED = 'velvet-ambient-muted';

/* ------------------------------------------------------------------ */
/*  Shared volume/mute state                                           */
/* ------------------------------------------------------------------ */

interface AmbientState {
  volume: number;
  muted: boolean;
}

function readState(): AmbientState {
  if (typeof window === 'undefined') return { volume: 0.35, muted: false };
  const v = window.localStorage.getItem(STORAGE_VOLUME);
  const m = window.localStorage.getItem(STORAGE_MUTED);
  const volume = v !== null ? Math.max(0, Math.min(1, Number.parseFloat(v))) : 0.35;
  return {
    volume: Number.isFinite(volume) ? volume : 0.35,
    muted: m === 'true',
  };
}

let cachedState: AmbientState | null = null;
const subscribers = new Set<(s: AmbientState) => void>();

function getState(): AmbientState {
  if (!cachedState) cachedState = readState();
  return cachedState;
}

function writeState(next: AmbientState): void {
  cachedState = next;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_VOLUME, String(next.volume));
    window.localStorage.setItem(STORAGE_MUTED, String(next.muted));
  }
  subscribers.forEach((fn) => fn(next));
}

/* ------------------------------------------------------------------ */
/*  Ambient settings hook (for the popover — no audio side effects)   */
/* ------------------------------------------------------------------ */

export interface AmbientSettings {
  volume: number;
  setVolume: (v: number) => void;
  muted: boolean;
  toggleMute: () => void;
}

/** Subscribe to ambient volume/mute settings without owning a track. */
export function useAmbientSettings(): AmbientSettings {
  const [state, setState] = useState<AmbientState>(() => getState());

  useEffect(() => {
    const onChange = (next: AmbientState) => setState(next);
    subscribers.add(onChange);
    return () => {
      subscribers.delete(onChange);
    };
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    writeState({ ...getState(), volume: clamped });
  }, []);

  const toggleMute = useCallback(() => {
    const cur = getState();
    writeState({ ...cur, muted: !cur.muted });
  }, []);

  return {
    volume: state.volume,
    setVolume,
    muted: state.muted,
    toggleMute,
  };
}

/* ------------------------------------------------------------------ */
/*  Loop hook                                                          */
/* ------------------------------------------------------------------ */

const FADE_IN_MS = 1200;
const FADE_OUT_MS = 800;

/**
 * Plays a looping ambient track when `active` is true. Fades in to the
 * user's chosen master volume and fades back out when active flips to
 * false (or master mute toggles on). Each call to this hook owns its
 * own <audio> element, so multiple ambient tracks can coexist (lobby +
 * game) and be activated independently.
 */
export function useAmbientLoop(trackUrl: string, active: boolean): void {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [settings, setSettings] = useState<AmbientState>(() => getState());

  // Subscribe to master volume/mute changes.
  useEffect(() => {
    const onChange = (next: AmbientState) => setSettings(next);
    subscribers.add(onChange);
    return () => {
      subscribers.delete(onChange);
    };
  }, []);

  // Lazily create the audio element.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!audioRef.current) {
      const a = new Audio(trackUrl);
      a.loop = true;
      a.volume = 0;
      audioRef.current = a;
    }
    return () => {
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [trackUrl]);

  // React to active flag + master volume/mute by fading the element.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const target = active && !settings.muted ? settings.volume : 0;
    const start = audio.volume;
    const duration = target > start ? FADE_IN_MS : FADE_OUT_MS;
    const t0 = Date.now();

    if (target > 0) {
      // Browsers may reject autoplay until first user interaction. Swallow
      // the rejection — once the user clicks anywhere, the next render
      // attempt (or a settings change) will succeed.
      void audio.play().catch(() => {});
    }

    if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    fadeIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - t0;
      const pct = Math.min(1, elapsed / duration);
      const next = start + (target - start) * pct;
      audio.volume = Math.max(0, Math.min(1, next));
      if (pct >= 1) {
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
        if (target === 0) audio.pause();
      }
    }, 80);
  }, [active, settings.volume, settings.muted]);
}
