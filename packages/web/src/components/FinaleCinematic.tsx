/**
 * FinaleCinematic.tsx — End-of-game cinematic with AI-streamed 2-paragraph finale + TTS
 *
 * When session:gameover fires: streams the full finale text from server,
 * then plays TTS while revealing the text in sync (typewriter effect
 * driven by audio.currentTime). Single panel — no separate reveal.
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
const DEBUG = '[finale-cinematic]';

type FinaleOutcome = 'won' | 'lost_wrong' | 'lost_timeout';

export interface FinaleCinematicProps {
  sessionId: string;
  outcome: FinaleOutcome;
  summary: string;
  onHome: () => void;
  onPlayAgain: () => void;
}

export function FinaleCinematic({
  sessionId,
  outcome,
  summary,
  onHome,
  onPlayAgain,
}: FinaleCinematicProps) {
  const [fullText, setFullText] = useState('');
  const [streamDone, setStreamDone] = useState(false);
  const [visibleChars, setVisibleChars] = useState(0);
  const [ttsStarted, setTtsStarted] = useState(false);
  const [ttsDone, setTtsDone] = useState(false);
  const [culpritName, setCulpritName] = useState<string | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const ttsRef = useRef<HTMLAudioElement | null>(null);
  const ttsStartedRef = useRef(false);

  // Music: fade in on mount, fade out on unmount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const audio = new Audio(AMBIENT_TRACK);
    audio.loop = true;
    audio.volume = 0;
    musicRef.current = audio;
    console.log(`${DEBUG} music: fade-in`);
    void audio.play().catch(() => {});
    const start = Date.now();
    const target = 0.2;
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

  // Stream the finale text from the server
  useEffect(() => {
    let cancelled = false;
    const t0 = Date.now();

    async function stream() {
      try {
        console.log(`${DEBUG} stream start outcome=${outcome}`);
        const headers = await getAuthHeaders();
        const res = await fetch(`${API_BASE}/api/chat/finale`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ sessionId, outcome }),
        });
        if (!res.ok || !res.body) {
          console.error(`${DEBUG} stream HTTP ${res.status}`);
          if (!cancelled) {
            setFullText(summary);
            setStreamDone(true);
          }
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let acc = '';

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const evt = JSON.parse(line.slice(6));
              if (evt.type === 'chunk') {
                acc += evt.content;
              } else if (evt.type === 'done') {
                acc = evt.content || acc;
                if (evt.culpritName) setCulpritName(evt.culpritName);
              }
            } catch {
              // skip
            }
          }
        }

        if (!cancelled) {
          console.log(`${DEBUG} stream done (${Date.now() - t0}ms, ${acc.length} chars)`);
          setFullText(acc);
          setStreamDone(true);
        }
      } catch (err) {
        console.error(`${DEBUG} stream error`, err);
        if (!cancelled) {
          setFullText(summary);
          setStreamDone(true);
        }
      }
    }

    stream();
    return () => {
      cancelled = true;
    };
  }, [sessionId, outcome, summary]);

  // Once stream completes, fetch + play TTS and sync text reveal
  useEffect(() => {
    if (!streamDone || ttsStartedRef.current) return;
    if (!fullText || fullText.length < 40) {
      setVisibleChars(fullText.length);
      setTtsDone(true);
      return;
    }
    ttsStartedRef.current = true;
    setTtsStarted(true);

    (async () => {
      const t0 = Date.now();
      try {
        console.log(`${DEBUG} TTS fetch start (${fullText.length} chars)`);
        const headers = await getAuthHeaders();
        const res = await fetch(`${API_BASE}/api/chat/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ text: fullText, voice: 'shimmer' }),
        });
        if (!res.ok) {
          console.error(`${DEBUG} TTS HTTP ${res.status}`);
          revealFallback();
          return;
        }
        const blob = await res.blob();
        console.log(`${DEBUG} TTS fetched (${Date.now() - t0}ms, ${blob.size} bytes)`);
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.volume = 0.92;
        ttsRef.current = audio;

        audio.onloadedmetadata = () => {
          console.log(`${DEBUG} TTS metadata (duration=${audio.duration.toFixed(2)}s)`);
        };

        audio.ontimeupdate = () => {
          if (!audio.duration || !isFinite(audio.duration)) return;
          const ratio = audio.currentTime / audio.duration;
          setVisibleChars(Math.ceil(ratio * fullText.length));
        };

        audio.onended = () => {
          console.log(`${DEBUG} TTS ended`);
          setVisibleChars(fullText.length);
          setTtsDone(true);
        };

        audio.onerror = () => {
          console.error(`${DEBUG} TTS playback error`);
          revealFallback();
        };

        void audio.play().catch((err) => {
          console.warn(`${DEBUG} TTS autoplay blocked`, err);
          revealFallback();
        });
      } catch (err) {
        console.error(`${DEBUG} TTS fetch failed`, err);
        revealFallback();
      }
    })();

    function revealFallback() {
      const start = Date.now();
      const charsPerSec = 15;
      const iv = setInterval(() => {
        const elapsed = (Date.now() - start) / 1000;
        const chars = Math.min(fullText.length, Math.ceil(elapsed * charsPerSec));
        setVisibleChars(chars);
        if (chars >= fullText.length) {
          clearInterval(iv);
          setTtsDone(true);
        }
      }, 150);
    }

    return () => {
      if (ttsRef.current) {
        ttsRef.current.pause();
        ttsRef.current = null;
      }
    };
  }, [streamDone, fullText]);

  const isWin = outcome === 'won';
  const shown = fullText.slice(0, visibleChars);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.94)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 80,
        overflow: 'auto',
        padding: '32px',
      }}
    >
      <div style={{ maxWidth: '680px', width: '100%', textAlign: 'center' }}>
        <h1
          style={{
            color: isWin ? '#d4a843' : '#d46868',
            fontFamily: 'Georgia, serif',
            fontStyle: 'italic',
            fontSize: '42px',
            marginBottom: '28px',
            animation: 'fadeInUp 0.9s ease',
          }}
        >
          {T.accuse.result[outcome]}
        </h1>

        <div
          style={{
            color: '#e8e0d4',
            fontFamily: 'Georgia, serif',
            fontSize: '18px',
            lineHeight: '1.85',
            whiteSpace: 'pre-wrap',
            textAlign: 'left',
            minHeight: '180px',
            marginBottom: '28px',
          }}
        >
          {shown || (
            <span style={{ color: '#6a6050', fontStyle: 'italic' }}>
              {T.finale.loading}
            </span>
          )}
          {streamDone && shown.length < fullText.length && (
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
        </div>

        {culpritName && (
          <p
            style={{
              color: '#8a7d60',
              fontFamily: 'monospace',
              fontSize: '11px',
              letterSpacing: '3px',
              textTransform: 'uppercase',
              marginBottom: '28px',
            }}
          >
            Gerçek Katil · <span style={{ color: '#d4a843' }}>{culpritName}</span>
          </p>
        )}

        {ttsDone && (
          <div
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center',
              animation: 'fadeInUp 0.6s ease',
            }}
          >
            <button
              onClick={onHome}
              style={{
                padding: '14px 28px',
                backgroundColor: 'transparent',
                border: '1px solid #2a2520',
                borderRadius: '8px',
                color: '#b0a080',
                fontFamily: 'monospace',
                letterSpacing: '1px',
                cursor: 'pointer',
              }}
            >
              {T.finale.home}
            </button>
            <button
              onClick={onPlayAgain}
              style={{
                padding: '14px 28px',
                backgroundColor: '#d4a843',
                border: 'none',
                borderRadius: '8px',
                color: '#0a0a0a',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                letterSpacing: '1px',
                cursor: 'pointer',
              }}
            >
              {T.finale.playAgain}
            </button>
          </div>
        )}

        {!streamDone && !ttsStarted && (
          <div
            style={{
              marginTop: '20px',
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              border: '3px solid #2a2520',
              borderTopColor: '#d4a843',
              animation: 'spin 1.4s linear infinite',
              margin: '20px auto 0',
            }}
          />
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink {
          50% { opacity: 0.15; }
        }
      `}</style>
    </div>
  );
}
