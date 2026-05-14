/**
 * ReconstructionReplay.tsx — Post-game crime-scene timeline modal
 *
 * Mounted from FinaleCinematic after the user has heard the finale and
 * clicks the CTA. Fetches a chronological reconstruction of the crime
 * (4–10 beats, Turkish) from the server and walks the user through it
 * step by step. Each beat names a real room and (usually) a real
 * character from the world the player just lived through — the AI is
 * locked to existing IDs by the server's strict Zod schema, so what's
 * shown here is always consistent with the rest of the game.
 *
 * Two ways to advance:
 *   - Sonraki / Önceki buttons (manual walk)
 *   - Otomatik Oynat (auto-advance every AUTO_TICK_MS)
 *
 * Caches via the server endpoint: opening the modal a second time hits
 * `session.reconstruction` and returns instantly without a fresh LLM call.
 *
 * @author AKBOYS Team
 * @since 2026-05-06
 */

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ReconstructionDTO } from '@/types/shared';
import { useLocale, useT } from '@/hooks/useLocale';
import { pickLang } from '@/lib/i18n';
import { getAuthHeaders } from '@/lib/firebase';

const API_BASE = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';
const AUTO_TICK_MS = 4500;

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ReconstructionReplayProps {
  sessionId: string;
  onClose: () => void;
}

export function ReconstructionReplay({ sessionId, onClose }: ReconstructionReplayProps): React.ReactElement {
  const T = useT();
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [data, setData] = useState<ReconstructionDTO | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  /* ---- Fetch (with retry) ---- */
  const load = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setStatus('loading');
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/chat/reconstruction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const dto: ReconstructionDTO | undefined = json.reconstruction;
      if (!dto || !Array.isArray(dto.events) || dto.events.length === 0) {
        throw new Error('empty payload');
      }
      setData(dto);
      setStepIndex(0);
      setStatus('ready');
    } catch (err) {
      console.error('[reconstruction] fetch failed', err);
      setErrorMsg(T.reconstruction.failed);
      setStatus('error');
    } finally {
      fetchingRef.current = false;
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---- Auto-play tick ---- */
  useEffect(() => {
    if (!autoPlay || status !== 'ready' || !data) return;
    const id = setInterval(() => {
      setStepIndex((i) => {
        if (i + 1 >= data.events.length) {
          // Reached the end — stop auto-play, leave the user on the last beat.
          setAutoPlay(false);
          return i;
        }
        return i + 1;
      });
    }, AUTO_TICK_MS);
    return () => clearInterval(id);
  }, [autoPlay, status, data]);

  /* ---- Keyboard navigation ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (status !== 'ready' || !data) return;
      if (e.key === 'ArrowRight') {
        setStepIndex((i) => Math.min(i + 1, data.events.length - 1));
      } else if (e.key === 'ArrowLeft') {
        setStepIndex((i) => Math.max(i - 1, 0));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [status, data, onClose]);

  /* ---- Render: scrim ---- */
  return (
    <div
      role="dialog"
      aria-label={T.reconstruction.title}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        backgroundColor: 'rgba(5,4,2,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div style={{
        width: '100%', maxWidth: '720px',
        backgroundColor: '#0a0807',
        border: '1px solid #2a2520',
        borderRadius: '14px',
        padding: '24px 26px 22px',
        boxShadow: '0 14px 50px rgba(0,0,0,0.75)',
        position: 'relative',
        maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '14px' }}>
          <h2 style={{
            margin: 0,
            fontSize: '22px', color: '#d4a843',
            fontFamily: 'Georgia, serif', fontStyle: 'italic',
            letterSpacing: '0.5px',
          }}>
            {T.reconstruction.title}
          </h2>
          <button
            onClick={onClose}
            aria-label={T.reconstruction.close}
            style={{
              padding: '4px 12px',
              backgroundColor: 'transparent',
              border: '1px solid #2a2520',
              borderRadius: '6px',
              color: '#8a8070',
              fontFamily: 'monospace', fontSize: '11px',
              letterSpacing: '1px', textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        {status === 'loading' && (
          <ReplayLoading />
        )}
        {status === 'error' && (
          <ReplayError message={errorMsg ?? T.reconstruction.failed} onRetry={() => void load()} />
        )}
        {status === 'ready' && data && (
          <ReplayBody
            data={data}
            stepIndex={stepIndex}
            autoPlay={autoPlay}
            onPrev={() => setStepIndex((i) => Math.max(i - 1, 0))}
            onNext={() => setStepIndex((i) => Math.min(i + 1, data.events.length - 1))}
            onToggleAutoplay={() => setAutoPlay((v) => !v)}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-views                                                          */
/* ------------------------------------------------------------------ */

function ReplayLoading(): React.ReactElement {
  const T = useT();
  return (
    <div style={{
      padding: '40px 0',
      textAlign: 'center',
      color: '#8a8070',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
    }}>
      <div style={{
        width: '28px', height: '28px',
        borderRadius: '50%',
        border: '3px solid #2a2520',
        borderTopColor: '#d4a843',
        animation: 'reconstructionSpin 1s linear infinite',
        margin: '0 auto 16px',
      }} />
      {T.reconstruction.loading}
      <style>{'@keyframes reconstructionSpin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}

function ReplayError({ message, onRetry }: { message: string; onRetry: () => void }): React.ReactElement {
  const T = useT();
  return (
    <div style={{
      padding: '32px 0',
      textAlign: 'center',
    }}>
      <p style={{
        color: '#cf8a8a',
        fontFamily: 'Georgia, serif',
        fontStyle: 'italic',
        marginBottom: '18px',
      }}>
        {message}
      </p>
      <button
        onClick={onRetry}
        style={{
          padding: '8px 18px',
          backgroundColor: 'transparent',
          border: '1px solid #d4a843',
          borderRadius: '6px',
          color: '#d4a843',
          fontFamily: 'monospace',
          fontSize: '12px',
          letterSpacing: '1px',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        {T.reconstruction.retry}
      </button>
    </div>
  );
}

interface ReplayBodyProps {
  data: ReconstructionDTO;
  stepIndex: number;
  autoPlay: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToggleAutoplay: () => void;
}

function ReplayBody({
  data,
  stepIndex,
  autoPlay,
  onPrev,
  onNext,
  onToggleAutoplay,
}: ReplayBodyProps): React.ReactElement {
  const T = useT();
  const { locale } = useLocale();
  const event = data.events[stepIndex];
  const total = data.events.length;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === total - 1;
  const culprit = event.isCulpritAction;

  return (
    <>
      {/* Step indicator + progress dots */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{
          fontFamily: 'monospace', fontSize: '10px',
          color: '#5a5545', letterSpacing: '2px', textTransform: 'uppercase',
        }}>
          {T.reconstruction.eventOf.replace('{n}', String(stepIndex + 1)).replace('{total}', String(total))}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {data.events.map((_, i) => (
            <span
              key={i}
              style={{
                width: '8px', height: '8px', borderRadius: '50%',
                backgroundColor: i === stepIndex ? '#d4a843' : i < stepIndex ? '#5a4a30' : '#2a2520',
                transition: 'background-color 0.2s',
              }}
            />
          ))}
        </div>
      </div>

      {/* Beat card */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 22px',
        backgroundColor: culprit ? '#1a0e0e' : '#15110a',
        border: `2px solid ${culprit ? '#cf5b5b' : '#2a2520'}`,
        borderRadius: '12px',
        marginBottom: '14px',
        position: 'relative',
      }}>
        {culprit && (
          <div style={{
            position: 'absolute',
            top: '10px', right: '12px',
            padding: '3px 8px',
            backgroundColor: '#3a1010',
            border: '1px solid #cf5b5b',
            borderRadius: '4px',
            color: '#cf5b5b',
            fontFamily: 'monospace',
            fontSize: '9px',
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
          }}>
            {T.reconstruction.culpritBadge}
          </div>
        )}

        {/* Time + room */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline', marginBottom: '10px' }}>
          <span style={{
            fontSize: '20px',
            fontFamily: 'monospace',
            color: '#d4a843',
            letterSpacing: '1px',
          }}>
            {event.time}
          </span>
          <span style={{
            fontSize: '14px',
            fontFamily: 'Georgia, serif',
            fontStyle: 'italic',
            color: '#b0a080',
          }}>
            {event.roomName}
          </span>
        </div>

        {/* Actor */}
        {event.actorName && (
          <div style={{
            fontSize: '13px',
            fontFamily: 'monospace',
            color: '#9a8a70',
            letterSpacing: '0.5px',
            marginBottom: '10px',
          }}>
            {event.actorRole ? `${event.actorRole} ` : ''}<strong style={{ color: '#e8d8b0' }}>{event.actorName}</strong>
          </div>
        )}

        {/* Description */}
        <p style={{
          margin: 0,
          fontSize: '15px',
          lineHeight: '1.7',
          color: '#e8e0d4',
          fontFamily: 'Georgia, serif',
        }}>
          {pickLang(event.description, locale)}
        </p>
      </div>

      {/* Conclusion appears once we're on the last beat */}
      {isLast && data.conclusion && (
        <div style={{
          padding: '14px 18px',
          marginBottom: '14px',
          backgroundColor: '#100c08',
          border: '1px solid #d4a843',
          borderRadius: '10px',
        }}>
          <div style={{
            fontFamily: 'monospace',
            fontSize: '10px',
            letterSpacing: '2px',
            color: '#d4a843',
            textTransform: 'uppercase',
            marginBottom: '6px',
          }}>
            {T.reconstruction.conclusionTitle}
          </div>
          <p style={{
            margin: 0,
            fontSize: '14px',
            lineHeight: '1.7',
            color: '#c8b890',
            fontFamily: 'Georgia, serif',
            fontStyle: 'italic',
          }}>
            {pickLang(data.conclusion, locale)}
          </p>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
        <button
          onClick={onPrev}
          disabled={isFirst}
          style={controlButtonStyle(isFirst)}
        >
          ← {T.reconstruction.prev}
        </button>
        <button
          onClick={onToggleAutoplay}
          aria-pressed={autoPlay}
          style={{
            ...controlButtonStyle(false),
            backgroundColor: autoPlay ? '#1a1510' : 'transparent',
            color: autoPlay ? '#d4a843' : '#8a8070',
            borderColor: autoPlay ? '#d4a843' : '#3a3530',
          }}
        >
          {autoPlay ? T.reconstruction.pause : T.reconstruction.autoplay}
        </button>
        <button
          onClick={onNext}
          disabled={isLast}
          style={controlButtonStyle(isLast)}
        >
          {T.reconstruction.next} →
        </button>
      </div>
    </>
  );
}

function controlButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '10px 16px',
    backgroundColor: 'transparent',
    border: `1px solid ${disabled ? '#1e1a14' : '#3a3530'}`,
    borderRadius: '8px',
    color: disabled ? '#3a3530' : '#b0a080',
    fontFamily: 'monospace',
    fontSize: '11px',
    letterSpacing: '1px',
    textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s',
  };
}
