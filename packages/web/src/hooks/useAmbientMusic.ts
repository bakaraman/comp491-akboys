/**
 * useAmbientMusic.ts — Background ambient loop for Velvet Shadow
 *
 * Plays a low-volume music loop while a session is active. Fades in on
 * opening cinematic + finale, stays quiet in the middle of the game.
 *
 * @author AKBOYS Team
 * @since 2026-04-17
 */

'use client';

import { useEffect, useRef } from 'react';

const TRACK_URL = '/ambient-urban-noir.m4a';

export function useAmbientMusic(active: boolean, volume = 0.08): void {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!audioRef.current) {
      const a = new Audio(TRACK_URL);
      a.loop = true;
      a.volume = 0;
      audioRef.current = a;
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (active) {
      audio.volume = 0;
      void audio.play().catch(() => {
        // Browser may block autoplay — first user interaction will unlock.
      });

      // Fade in
      const start = Date.now();
      const fadeDuration = 1500;
      const target = volume;
      const iv = setInterval(() => {
        if (!audio) return;
        const elapsed = Date.now() - start;
        const pct = Math.min(1, elapsed / fadeDuration);
        audio.volume = target * pct;
        if (pct >= 1) clearInterval(iv);
      }, 80);

      return () => clearInterval(iv);
    } else {
      // Fade out
      const start = Date.now();
      const startVol = audio.volume;
      const iv = setInterval(() => {
        const elapsed = Date.now() - start;
        const pct = Math.min(1, elapsed / 1200);
        audio.volume = startVol * (1 - pct);
        if (pct >= 1) {
          audio.pause();
          clearInterval(iv);
        }
      }, 80);
      return () => clearInterval(iv);
    }
  }, [active, volume]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);
}
