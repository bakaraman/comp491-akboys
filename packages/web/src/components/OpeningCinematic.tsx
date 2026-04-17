/**
 * OpeningCinematic.tsx — Shared opening scene overlay
 *
 * Full-screen overlay shown when game transitions to 'playing'. All players
 * see the same image + narration + music + TTS. Text reveal is synced to
 * the TTS audio playback. Auto-dismisses when TTS ends. Music and TTS live
 * ONLY here (no ambient music anywhere else).
 *
 * @author AKBOYS Team
 * @since 2026-04-17
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { T } from '@/lib/tr';
import { getAuthHeaders } from '@/lib/firebase';

const API_BASE = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';
const AMBIENT_TRACK = '/ambient-urban-noir.m4a';
const DEBUG = '[opening-cinematic]';

export interface OpeningCinematicProps {
  title: string;
  setting: string;
  openingNarration: string;
  openingImageUrl: string | null;
  onStart: () => void;
}

export function OpeningCinematic({
  title,
  setting,
  openingNarration,
  openingImageUrl,
  onStart,
}: OpeningCinematicProps) {
  const [visibleChars, setVisibleChars] = useState(0);
  const [ttsReady, setTtsReady] = useState(false);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const ttsRef = useRef<HTMLAudioElement | null>(null);
  const ttsStarted = useRef(false);
  const dismissed = useRef(false);

  const fullText = openingNarration || '';

  const dismiss = () => {
    if (dismissed.current) return;
    dismissed.current = true;
    console.log(`${DEBUG} dismiss → transitioning to game`);
    onStart();
  };

  // Start + fade in music
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const audio = new Audio(AMBIENT_TRACK);
    audio.loop = true;
    audio.volume = 0;
    musicRef.current = audio;
    console.log(`${DEBUG} music: fade-in start`);

    void audio.play().catch((err) => {
      console.warn(`${DEBUG} music: autoplay blocked`, err);
    });

    const start = Date.now();
    const target = 0.22;
    const duration = 1800;
    const iv = setInterval(() => {
      const pct = Math.min(1, (Date.now() - start) / duration);
      audio.volume = target * pct;
      if (pct >= 1) clearInterval(iv);
    }, 80);

    return () => {
      clearInterval(iv);
      const fadeStart = Date.now();
      const startVol = audio.volume;
      const outIv = setInterval(() => {
        const pct = Math.min(1, (Date.now() - fadeStart) / 1200);
        audio.volume = startVol * (1 - pct);
        if (pct >= 1) {
          audio.pause();
          audio.src = '';
          clearInterval(outIv);
        }
      }, 80);
    };
  }, []);

  // Fetch TTS audio (but don't play yet)
  useEffect(() => {
    if (ttsStarted.current) return;
    if (!fullText || fullText.length < 20) {
      console.log(`${DEBUG} TTS: narration too short, skipping`);
      setTtsReady(true);
      return;
    }
    ttsStarted.current = true;
    const fetchStart = Date.now();

    (async () => {
      try {
        console.log(`${DEBUG} TTS: fetch start (${fullText.length} chars)`);
        const res = await fetch(`${API_BASE}/api/chat/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
          body: JSON.stringify({ text: fullText, voice: 'shimmer' }),
        });
        if (!res.ok) {
          console.error(`${DEBUG} TTS: HTTP ${res.status}`);
          setTtsReady(true);
          return;
        }
        const blob = await res.blob();
        console.log(`${DEBUG} TTS: fetched (${Date.now() - fetchStart}ms, ${blob.size} bytes)`);
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.volume = 0.92;
        ttsRef.current = audio;

        audio.onloadedmetadata = () => {
          console.log(`${DEBUG} TTS: metadata loaded (duration=${audio.duration.toFixed(2)}s)`);
        };

        audio.ontimeupdate = () => {
          if (!audio.duration || !isFinite(audio.duration)) return;
          const ratio = audio.currentTime / audio.duration;
          const chars = Math.ceil(ratio * fullText.length);
          setVisibleChars(chars);
        };

        audio.onended = () => {
          console.log(`${DEBUG} TTS: ended → auto-dismiss in 1.5s`);
          setVisibleChars(fullText.length);
          setTimeout(() => dismiss(), 1500);
        };

        audio.onerror = () => {
          console.error(`${DEBUG} TTS: playback error → auto-dismiss`);
          setVisibleChars(fullText.length);
          setTimeout(() => dismiss(), 1500);
        };

        setTtsReady(true);
        void audio.play().catch((err) => {
          console.warn(`${DEBUG} TTS: play() blocked`, err);
          // Autoplay blocked — start revealing text on a timer and dismiss
          revealWithoutAudio();
        });
      } catch (err) {
        console.error(`${DEBUG} TTS: fetch failed`, err);
        setTtsReady(true);
        revealWithoutAudio();
      }
    })();

    function revealWithoutAudio() {
      // ~15 chars per second reading speed fallback
      const start = Date.now();
      const charsPerSec = 15;
      const iv = setInterval(() => {
        const elapsed = (Date.now() - start) / 1000;
        const chars = Math.min(fullText.length, Math.ceil(elapsed * charsPerSec));
        setVisibleChars(chars);
        if (chars >= fullText.length) {
          clearInterval(iv);
          setTimeout(() => dismiss(), 2000);
        }
      }, 150);
    }

    return () => {
      if (ttsRef.current) {
        ttsRef.current.pause();
        ttsRef.current.src = '';
        ttsRef.current = null;
      }
    };
  }, [fullText]);

  const shown = fullText.slice(0, visibleChars);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        overflow: 'hidden',
        backgroundColor: '#050505',
      }}
    >
      {/* Background image */}
      {openingImageUrl ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${openingImageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'brightness(0.55) saturate(0.85)',
            animation: 'cinematicZoom 22s ease-out forwards',
            opacity: 0,
            animationName: 'cinematicFadeIn, cinematicZoom',
            animationDuration: '1.5s, 22s',
            animationFillMode: 'forwards, forwards',
            animationTimingFunction: 'ease, ease-out',
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#3a3530',
            fontFamily: 'monospace',
            fontSize: '11px',
            letterSpacing: '2px',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                border: '2px solid #2a2520',
                borderTopColor: '#d4a843',
                animation: 'spin 1.2s linear infinite',
                margin: '0 auto 10px',
              }}
            />
            <div>{T.opening.imageLoading.toUpperCase()}</div>
          </div>
        </div>
      )}

      {/* Vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.75) 70%, rgba(0,0,0,0.92) 100%)',
        }}
      />

      {/* Content */}
      <div
        style={{
          position: 'relative',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 24px',
        }}
      >
        <div
          style={{
            maxWidth: '720px',
            width: '100%',
            textAlign: 'center',
            animation: 'cinematicFadeIn 1.4s ease forwards',
            opacity: 0,
          }}
        >
          <p
            style={{
              color: '#8a7d60',
              fontFamily: 'monospace',
              fontSize: '11px',
              letterSpacing: '4px',
              textTransform: 'uppercase',
              marginBottom: '14px',
            }}
          >
            {setting}
          </p>
          <h1
            style={{
              color: '#e8d4a4',
              fontFamily: 'Georgia, serif',
              fontStyle: 'italic',
              fontSize: '44px',
              fontWeight: 'normal',
              lineHeight: '1.15',
              marginBottom: '36px',
              textShadow: '0 4px 18px rgba(0,0,0,0.8)',
            }}
          >
            {title}
          </h1>
          <p
            style={{
              color: '#d4cdb8',
              fontFamily: 'Georgia, serif',
              fontSize: '18px',
              lineHeight: '1.85',
              whiteSpace: 'pre-wrap',
              textShadow: '0 2px 10px rgba(0,0,0,0.9)',
              marginBottom: '44px',
              minHeight: '120px',
            }}
          >
            {shown}
            {shown.length < fullText.length && (
              <span
                style={{
                  display: 'inline-block',
                  width: '8px',
                  marginLeft: '2px',
                  color: '#d4a843',
                  animation: 'blink 0.9s steps(2) infinite',
                }}
              >
                ▍
              </span>
            )}
          </p>

          {!ttsReady && (
            <p
              style={{
                color: '#5a5040',
                fontSize: '11px',
                fontFamily: 'monospace',
                letterSpacing: '2px',
              }}
            >
              {T.opening.loading.toUpperCase()}
            </p>
          )}
        </div>
      </div>

      {/* Skip link — bottom right */}
      <button
        onClick={() => {
          console.log(`${DEBUG} user clicked skip`);
          if (ttsRef.current) ttsRef.current.pause();
          dismiss();
        }}
        style={{
          position: 'absolute',
          bottom: '28px',
          right: '32px',
          background: 'none',
          border: 'none',
          color: '#6a6050',
          fontFamily: 'monospace',
          fontSize: '11px',
          letterSpacing: '3px',
          textTransform: 'uppercase',
          cursor: 'pointer',
          padding: '8px 14px',
          transition: 'color 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#d4a843')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#6a6050')}
      >
        {T.opening.skip} →
      </button>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes cinematicZoom {
          from { transform: scale(1.02); }
          to { transform: scale(1.08); }
        }
        @keyframes cinematicFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes blink {
          50% { opacity: 0.15; }
        }
      `}</style>
    </div>
  );
}
