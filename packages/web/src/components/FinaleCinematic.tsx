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
import { useLocale, useT } from '@/hooks/useLocale';
import { useIsMobile } from '@/hooks/useIsMobile';
import { getAuthHeaders } from '@/lib/firebase';
import { ReconstructionReplay } from './ReconstructionReplay';

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
  const T = useT();
  const { locale } = useLocale();
  const isMobile = useIsMobile();
  const [fullText, setFullText] = useState('');
  const [streamDone, setStreamDone] = useState(false);
  const [visibleChars, setVisibleChars] = useState(0);
  const [ttsStarted, setTtsStarted] = useState(false);
  const [ttsDone, setTtsDone] = useState(false);
  const [culpritName, setCulpritName] = useState<string | null>(null);
  /* A.3: post-finale crime-scene reconstruction modal */
  const [reconstructionOpen, setReconstructionOpen] = useState(false);
  /* #59: case-file PDF download state */
  const [caseFileLoading, setCaseFileLoading] = useState(false);
  const [caseFileError, setCaseFileError] = useState<string | null>(null);
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
    const target = 0.10;
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

  // Fetch the finale text (bilingual single-flight; #58 follow-up).
  //
  // Server now returns the full text in one JSON response — the SSE chunk
  // protocol was retired so two clients with different locales no longer
  // race two parallel OpenAI streams. UX still feels live because the
  // visibleChars typewriter is driven by audio.currentTime once TTS plays.
  useEffect(() => {
    let cancelled = false;
    const t0 = Date.now();

    async function fetchFinale() {
      try {
        console.log(`${DEBUG} fetch start outcome=${outcome} locale=${locale}`);
        const headers = await getAuthHeaders();
        const res = await fetch(`${API_BASE}/api/chat/finale`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ sessionId, outcome, locale }),
        });
        if (!res.ok) {
          console.error(`${DEBUG} fetch HTTP ${res.status}`);
          if (!cancelled) {
            setFullText(summary);
            setStreamDone(true);
          }
          return;
        }
        const data = (await res.json()) as { fullText?: string; culpritName?: string | null };
        if (cancelled) return;

        const acc = data.fullText ?? summary;
        if (data.culpritName) setCulpritName(data.culpritName);
        console.log(`${DEBUG} fetch done (${Date.now() - t0}ms, ${acc.length} chars)`);
        setFullText(acc);
        setStreamDone(true);
      } catch (err) {
        console.error(`${DEBUG} fetch error`, err);
        if (!cancelled) {
          setFullText(summary);
          setStreamDone(true);
        }
      }
    }

    fetchFinale();
    return () => {
      cancelled = true;
    };
  }, [sessionId, outcome, summary, locale]);

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
          body: JSON.stringify({
            text: fullText,
            locale,
            voice: locale === 'en' ? 'onyx' : 'ash',
          }),
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

  // A.3: Render the reconstruction modal as a sibling overlay (z-index above
  // the finale scrim) so it opens on top without unmounting the finale state.
  if (reconstructionOpen) {
    return (
      <ReconstructionReplay
        sessionId={sessionId}
        onClose={() => setReconstructionOpen(false)}
      />
    );
  }

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
        padding: 'clamp(16px, 4vw, 32px)',
      }}
    >
      <div style={{ maxWidth: '680px', width: '100%', textAlign: 'center' }}>
        <h1
          style={{
            color: isWin ? '#d4a843' : '#d46868',
            fontFamily: 'Georgia, serif',
            fontStyle: 'italic',
            fontSize: 'clamp(28px, 7vw, 42px)',
            marginBottom: 'clamp(18px, 4vw, 28px)',
            animation: 'fadeInUp 0.9s ease',
          }}
        >
          {T.accuse.result[outcome]}
        </h1>

        <div
          style={{
            color: '#e8e0d4',
            fontFamily: 'Georgia, serif',
            fontSize: 'clamp(15px, 4vw, 18px)',
            lineHeight: '1.85',
            whiteSpace: 'pre-wrap',
            textAlign: 'left',
            minHeight: '180px',
            marginBottom: 'clamp(18px, 4vw, 28px)',
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
            {T.finale.trueCulprit} · <span style={{ color: '#d4a843' }}>{culpritName}</span>
          </p>
        )}

        {ttsDone && (
          <div
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center',
              flexWrap: 'wrap',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'stretch' : 'center',
              animation: 'fadeInUp 0.6s ease',
            }}
          >
            {/* A.3: CTA — open the crime-scene reconstruction modal. */}
            <button
              onClick={() => setReconstructionOpen(true)}
              style={{
                padding: '14px 24px',
                backgroundColor: '#15110a',
                border: '1px solid #d4a843',
                borderRadius: '8px',
                color: '#d4a843',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                letterSpacing: '1px',
                cursor: 'pointer',
              }}
            >
              {T.reconstruction.cta}
            </button>
            {/* #59: Premium case-file PDF download. */}
            <button
              onClick={async () => {
                if (caseFileLoading) return;
                setCaseFileLoading(true);
                setCaseFileError(null);
                try {
                  const headers = await getAuthHeaders();
                  const res = await fetch(`${API_BASE}/api/chat/case-file`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...headers },
                    body: JSON.stringify({ sessionId, locale }),
                  });
                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `velvet-shadow-${sessionId.slice(0, 8)}-${locale}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(url), 5000);
                } catch (err) {
                  console.error(`${DEBUG} case-file download failed`, err);
                  setCaseFileError(T.caseFile.failed);
                } finally {
                  setCaseFileLoading(false);
                }
              }}
              disabled={caseFileLoading}
              style={{
                padding: '14px 24px',
                backgroundColor: caseFileLoading ? '#2a2010' : '#15110a',
                border: '1px solid #c8894a',
                borderRadius: '8px',
                color: caseFileLoading ? '#7a6a50' : '#c8894a',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                letterSpacing: '1px',
                cursor: caseFileLoading ? 'wait' : 'pointer',
              }}
            >
              {caseFileLoading ? T.caseFile.preparing : T.caseFile.download}
            </button>
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
        {caseFileError && (
          <p style={{ marginTop: '14px', fontSize: '12px', color: '#cf5b5b', fontFamily: 'monospace' }}>
            {caseFileError}
          </p>
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
