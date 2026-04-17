/**
 * FinaleCinematic.tsx — End-of-game cinematic with AI-streamed finale + TTS
 *
 * Triggered when session:gameover fires. Fades the screen, plays ambient
 * music louder, streams the AI-generated Turkish finale text while TTS
 * reads it aloud, then shows the "what really happened" reveal.
 *
 * @author AKBOYS Team
 * @since 2026-04-17
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { T } from '@/lib/tr';
import { getAuthHeaders } from '@/lib/firebase';

const API_BASE = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

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
  const [streamed, setStreamed] = useState('');
  const [whatHappened, setWhatHappened] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [showReveal, setShowReveal] = useState(false);
  const ttsPlayed = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stream the finale text from the server
  useEffect(() => {
    let cancelled = false;

    async function stream() {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API_BASE}/api/chat/finale`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ sessionId, outcome }),
        });
        if (!res.ok || !res.body) {
          setStreamed(summary);
          setFinished(true);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';

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
                fullText += evt.content;
                if (!cancelled) setStreamed(fullText);
              } else if (evt.type === 'done') {
                if (!cancelled) {
                  setStreamed(evt.content || fullText);
                  setWhatHappened(evt.whatReallyHappened || null);
                  setFinished(true);
                }
              }
            } catch {
              // skip unparseable lines
            }
          }
        }
      } catch (err) {
        console.error('[finale] stream failed', err);
        setStreamed(summary);
        setFinished(true);
      }
    }

    stream();
    return () => {
      cancelled = true;
    };
  }, [sessionId, outcome, summary]);

  // Kick off TTS once we have enough text
  useEffect(() => {
    if (ttsPlayed.current) return;
    if (streamed.length < 80 && !finished) return;
    ttsPlayed.current = true;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API_BASE}/api/chat/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ text: streamed || summary, voice: 'shimmer' }),
        });
        if (!res.ok) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.play().catch(() => {});
        }
      } catch {
        // silent fail — text still visible
      }
    })();
  }, [streamed, finished, summary]);

  // After stream finishes, wait 2s then show reveal
  useEffect(() => {
    if (!finished) return;
    const t = setTimeout(() => setShowReveal(true), 2000);
    return () => clearTimeout(t);
  }, [finished]);

  const isWin = outcome === 'won';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 80,
        overflow: 'auto',
        padding: '24px',
      }}
    >
      <audio ref={audioRef} style={{ display: 'none' }} />

      <div style={{ maxWidth: '640px', width: '100%', textAlign: 'center' }}>
        {!showReveal ? (
          <>
            <h1
              style={{
                color: isWin ? '#d4a843' : '#d46868',
                fontFamily: 'Georgia, serif',
                fontStyle: 'italic',
                fontSize: '42px',
                marginBottom: '24px',
                animation: 'fadeInUp 0.8s ease',
              }}
            >
              {T.accuse.result[outcome]}
            </h1>

            <div
              style={{
                color: '#e8e0d4',
                fontFamily: 'Georgia, serif',
                fontSize: '17px',
                lineHeight: '1.75',
                whiteSpace: 'pre-wrap',
                textAlign: 'left',
                minHeight: '120px',
              }}
            >
              {streamed ||
                (
                  <span style={{ color: '#6a6050', fontStyle: 'italic' }}>
                    {T.finale.loading}
                  </span>
                )}
            </div>

            {!finished && (
              <div
                style={{
                  marginTop: '28px',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: '3px solid #2a2520',
                  borderTopColor: '#d4a843',
                  animation: 'spin 1.4s linear infinite',
                  margin: '28px auto 0',
                }}
              />
            )}
          </>
        ) : (
          <>
            <h2
              style={{
                color: '#d4a843',
                fontFamily: 'Georgia, serif',
                fontStyle: 'italic',
                fontSize: '28px',
                marginBottom: '18px',
              }}
            >
              {T.finale.revealTitle}
            </h2>
            <div
              style={{
                color: '#b0a080',
                fontFamily: 'Georgia, serif',
                fontSize: '15px',
                lineHeight: '1.75',
                whiteSpace: 'pre-wrap',
                textAlign: 'left',
                marginBottom: '32px',
              }}
            >
              {whatHappened || streamed}
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
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
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
