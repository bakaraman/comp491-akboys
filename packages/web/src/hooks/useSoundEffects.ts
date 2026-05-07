/**
 * useSoundEffects.ts — One-shot UI sound effects
 *
 * Single-channel SFX manager for short, fire-and-forget sounds. Currently
 * exposes only the global UI click. Uses Web Audio API: each play creates a
 * fresh AudioBufferSourceNode against a shared, pre-decoded AudioBuffer so
 * rapid-fire clicks never cut each other off.
 *
 * Volume + muted state lives in localStorage and is shared across hook
 * instances via a tiny pub-sub so the settings popover and the global click
 * listener see the same source of truth.
 *
 * Asset failures (404, decode error) are graceful: playSfx() becomes a
 * silent no-op for that sound, the rest of the app keeps working.
 *
 * @author AKBOYS Team
 * @since 2026-05-06
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_VOLUME = 'velvet-sfx-volume';
const STORAGE_MUTED = 'velvet-sfx-muted';

/** Catalogue of available SFX names → public URL. Add new sounds here. */
const SFX_SOURCES = {
  'ui-click': '/sfx/ui-click.mp3',
} as const;

export type SfxName = keyof typeof SFX_SOURCES;

/* ------------------------------------------------------------------ */
/*  Module-scoped audio state (singleton across hook instances)        */
/* ------------------------------------------------------------------ */

let audioCtx: AudioContext | null = null;
const buffers = new Map<SfxName, AudioBuffer>();
const decoding = new Map<SfxName, Promise<void>>();

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

async function loadBuffer(name: SfxName): Promise<void> {
  if (buffers.has(name)) return;
  const existing = decoding.get(name);
  if (existing) return existing;

  const ctx = getCtx();
  if (!ctx) return;

  const promise = (async () => {
    try {
      const res = await fetch(SFX_SOURCES[name]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      buffers.set(name, audioBuffer);
    } catch (err) {
      console.warn(`[sfx] failed to load ${name}:`, err);
    } finally {
      decoding.delete(name);
    }
  })();

  decoding.set(name, promise);
  return promise;
}

/* ------------------------------------------------------------------ */
/*  Volume + muted state — persisted, with cross-hook subscription    */
/* ------------------------------------------------------------------ */

interface SfxState {
  volume: number;
  muted: boolean;
}

function readState(): SfxState {
  if (typeof window === 'undefined') return { volume: 0.6, muted: false };
  const v = window.localStorage.getItem(STORAGE_VOLUME);
  const m = window.localStorage.getItem(STORAGE_MUTED);
  const volume = v !== null ? Math.max(0, Math.min(1, Number.parseFloat(v))) : 0.6;
  return {
    volume: Number.isFinite(volume) ? volume : 0.6,
    muted: m === 'true',
  };
}

let cachedState: SfxState | null = null;
const subscribers = new Set<(s: SfxState) => void>();

function getState(): SfxState {
  if (!cachedState) cachedState = readState();
  return cachedState;
}

function writeState(next: SfxState): void {
  cachedState = next;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_VOLUME, String(next.volume));
    window.localStorage.setItem(STORAGE_MUTED, String(next.muted));
  }
  subscribers.forEach((fn) => fn(next));
}

/* ------------------------------------------------------------------ */
/*  Module-level play API (used by the global click listener)         */
/* ------------------------------------------------------------------ */

/** Play a registered SFX. Safe to call before assets are loaded — silent no-op. */
export function playSfxGlobal(name: SfxName): void {
  const ctx = getCtx();
  if (!ctx) return;

  const { volume, muted } = getState();
  if (muted || volume <= 0) return;

  const buffer = buffers.get(name);
  if (!buffer) {
    // Lazy-load on first request; subsequent calls will play.
    void loadBuffer(name);
    return;
  }

  // Browsers gate AudioContext until a user gesture. resume() is a no-op
  // when already running; we ignore the rejection if the user hasn't
  // clicked anywhere yet.
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(gain).connect(ctx.destination);
  source.start();
}

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

export interface SoundEffectsApi {
  playSfx: (name: SfxName) => void;
  volume: number;
  setVolume: (v: number) => void;
  muted: boolean;
  toggleMute: () => void;
}

export function useSoundEffects(): SoundEffectsApi {
  const [state, setState] = useState<SfxState>(() => getState());

  // Pre-load all known SFX once on mount.
  useEffect(() => {
    (Object.keys(SFX_SOURCES) as SfxName[]).forEach((name) => void loadBuffer(name));
  }, []);

  // Subscribe to cross-component state changes so the popover slider and
  // the global click listener always agree.
  useEffect(() => {
    const onChange = (next: SfxState) => setState(next);
    subscribers.add(onChange);
    return () => {
      subscribers.delete(onChange);
    };
  }, []);

  const playSfx = useCallback((name: SfxName) => playSfxGlobal(name), []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    writeState({ ...getState(), volume: clamped });
  }, []);

  const toggleMute = useCallback(() => {
    const cur = getState();
    writeState({ ...cur, muted: !cur.muted });
  }, []);

  return {
    playSfx,
    volume: state.volume,
    setVolume,
    muted: state.muted,
    toggleMute,
  };
}
