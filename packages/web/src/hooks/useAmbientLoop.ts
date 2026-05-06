/**
 * useAmbientLoop.ts — Background music loop with cross-component volume control
 *
 * Plays a looping HTMLAudioElement track. Volume + muted state is persisted
 * to localStorage and shared across hook instances via a tiny pub-sub so
 * the lobby loop, the in-game loop, and the settings popover slider all
 * stay in sync.
 *
 * SINGLETON-PER-URL: each unique trackUrl owns ONE module-scope <audio>
 * element, regardless of how many components mount the hook. This keeps
 * the music seamless across Next.js route transitions — when /page-A
 * unmounts and /page-B mounts (both pointing at the same track), the
 * audio simply hands off subscribers without rewinding.
 *
 * NOTE: Intentionally NOT used by OpeningCinematic / FinaleCinematic.
 * Those overlays manage their own audio (`ambient-urban-noir.m4a`) with
 * the pre-existing useAmbientMusic hook, and we do not touch that path.
 *
 * @author AKBOYS Team
 * @since 2026-05-06
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_VOLUME = 'velvet-ambient-volume';
const STORAGE_MUTED = 'velvet-ambient-muted';

const FADE_IN_MS = 1200;
const FADE_OUT_MS = 800;
const FADE_TICK_MS = 80;

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
const settingsSubscribers = new Set<(s: AmbientState) => void>();

function getSettings(): AmbientState {
  if (!cachedState) cachedState = readState();
  return cachedState;
}

function writeSettings(next: AmbientState): void {
  cachedState = next;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_VOLUME, String(next.volume));
    window.localStorage.setItem(STORAGE_MUTED, String(next.muted));
  }
  settingsSubscribers.forEach((fn) => fn(next));
  // Master volume/mute change ripples into every audio currently in the pool.
  audios.forEach((_audio, url) => reconcile(url));
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
  const [state, setState] = useState<AmbientState>(() => getSettings());

  useEffect(() => {
    const onChange = (next: AmbientState) => setState(next);
    settingsSubscribers.add(onChange);
    return () => {
      settingsSubscribers.delete(onChange);
    };
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    writeSettings({ ...getSettings(), volume: clamped });
  }, []);

  const toggleMute = useCallback(() => {
    const cur = getSettings();
    writeSettings({ ...cur, muted: !cur.muted });
  }, []);

  return {
    volume: state.volume,
    setVolume,
    muted: state.muted,
    toggleMute,
  };
}

/* ------------------------------------------------------------------ */
/*  Module-scope audio pool — one <audio> per unique URL              */
/* ------------------------------------------------------------------ */

interface SubscriberHandle {
  active: boolean;
}

const audios = new Map<string, HTMLAudioElement>();
const subscribers = new Map<string, Set<SubscriberHandle>>();
const fadeTimers = new Map<string, ReturnType<typeof setInterval>>();

function ensureAudio(url: string): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  let audio = audios.get(url);
  if (!audio) {
    audio = new Audio(url);
    audio.loop = true;
    audio.volume = 0;
    audio.preload = 'auto';
    audios.set(url, audio);
  }
  return audio;
}

/**
 * Decide what `audios.get(url)` should be doing right now and fade toward
 * that target. Idempotent: callable from anywhere (subscribe/unsubscribe,
 * settings change, active flag flip) without racing with itself.
 *
 * Critically: when target is 0 we let the existing fade run to silence
 * but DO NOT pause the element. Keeping it ticking at volume 0 means a
 * subscriber that re-mounts during a route change resumes mid-track
 * instead of restarting from 0:00.
 */
function reconcile(url: string): void {
  const audio = audios.get(url);
  if (!audio) return;

  const set = subscribers.get(url);
  const wantsActive = !!set && Array.from(set).some((s) => s.active);
  const { volume, muted } = getSettings();
  const target = wantsActive && !muted ? volume : 0;

  if (target > 0) {
    void audio.play().catch(() => {
      // Browser autoplay block — element will start once the user interacts
      // (any later reconcile will retry).
    });
  }

  const start = audio.volume;
  if (Math.abs(start - target) < 0.001) return;

  const existing = fadeTimers.get(url);
  if (existing) clearInterval(existing);

  const duration = target > start ? FADE_IN_MS : FADE_OUT_MS;
  const t0 = Date.now();
  const interval = setInterval(() => {
    const pct = Math.min(1, (Date.now() - t0) / duration);
    audio.volume = Math.max(0, Math.min(1, start + (target - start) * pct));
    if (pct >= 1) {
      clearInterval(interval);
      fadeTimers.delete(url);
      // Note: deliberately NOT calling audio.pause() at silence. The element
      // keeps running at volume 0; this preserves currentTime across route
      // hand-offs and avoids cold-start glitches. Cost is negligible — one
      // mp3 decoder running at zero gain.
    }
  }, FADE_TICK_MS);
  fadeTimers.set(url, interval);
}

/* ------------------------------------------------------------------ */
/*  Loop hook                                                          */
/* ------------------------------------------------------------------ */

/**
 * Subscribe to a looping ambient track. While ANY mounted hook instance
 * for the same trackUrl has `active=true`, the track plays at the user's
 * chosen master volume. The track keeps playing seamlessly even when one
 * instance unmounts and another mounts (e.g. crossing a Next.js route
 * boundary), as long as one of them is active.
 */
export function useAmbientLoop(trackUrl: string, active: boolean): void {
  // Keep a stable handle whose `active` field we update in place. This lets
  // us flip the flag without unsubscribing/resubscribing on every render.
  const handleRef = useRef<SubscriberHandle>({ active });
  handleRef.current.active = active;

  // Subscribe lifecycle (mount once per trackUrl).
  useEffect(() => {
    const handle = handleRef.current;
    let set = subscribers.get(trackUrl);
    if (!set) {
      set = new Set();
      subscribers.set(trackUrl, set);
    }
    set.add(handle);
    ensureAudio(trackUrl);
    reconcile(trackUrl);

    return () => {
      const s = subscribers.get(trackUrl);
      s?.delete(handle);
      reconcile(trackUrl);
      // We deliberately leave the audio element in the pool — a sibling
      // mount on the same URL (route change) will reuse it.
    };
  }, [trackUrl]);

  // React to active-flag changes (no resubscription needed).
  useEffect(() => {
    reconcile(trackUrl);
  }, [trackUrl, active]);
}
