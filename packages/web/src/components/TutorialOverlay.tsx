/**
 * TutorialOverlay.tsx — First-run guided tour (#49)
 *
 * 5-step overlay that highlights key UI elements (turn counter, chat,
 * action input, accuse button, settings) and explains them in Turkish.
 *
 * Trigger: shown automatically on the player's first time reaching the
 * playing state in any session (gated by `velvet-tutorial-seen` localStorage
 * flag). Can be replayed via a button in SettingsPopover.
 *
 * The overlay finds its targets by `data-tutorial="<id>"` attributes set
 * on the relevant elements; if a target isn't on screen for a step, that
 * step skips its highlight and just shows the caption centered.
 *
 * Demo material — explains the game UI to a new viewer with zero spoken
 * narration.
 *
 * @author AKBOYS Team
 * @since 2026-05-08
 */

'use client';

import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { T } from '@/lib/tr';

const STORAGE_KEY = 'velvet-tutorial-seen';
const HIGHLIGHT_PADDING = 6;
const CAPTION_WIDTH = 300;
const CAPTION_GAP = 14;

export interface TutorialStep {
  id: string;
  /** value of `data-tutorial` on the target element */
  target: string;
  title: string;
  body: string;
}

export interface TutorialOverlayProps {
  visible: boolean;
  onClose: () => void;
  steps?: TutorialStep[];
}

/* ------------------------------------------------------------------ */
/*  localStorage helpers (exported so the page + Settings can share)   */
/* ------------------------------------------------------------------ */

export function hasSeenTutorial(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return true;
  }
}

export function markTutorialSeen(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* ignore */ }
}

export function clearTutorialSeen(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/*  Default steps                                                      */
/* ------------------------------------------------------------------ */

function defaultSteps(): TutorialStep[] {
  return [
    { id: 'turn',     target: 'turn-counter',   title: T.tutorial.steps.turn.title,     body: T.tutorial.steps.turn.body },
    { id: 'chat',     target: 'chat-area',      title: T.tutorial.steps.chat.title,     body: T.tutorial.steps.chat.body },
    { id: 'input',    target: 'action-input',   title: T.tutorial.steps.input.title,    body: T.tutorial.steps.input.body },
    { id: 'accuse',   target: 'accuse-button',  title: T.tutorial.steps.accuse.title,   body: T.tutorial.steps.accuse.body },
    { id: 'settings', target: 'settings-button', title: T.tutorial.steps.settings.title, body: T.tutorial.steps.settings.body },
  ];
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function TutorialOverlay({
  visible,
  onClose,
  steps = defaultSteps(),
}: TutorialOverlayProps): React.ReactElement | null {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const current = steps[stepIndex];
  const total = steps.length;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === total - 1;

  /* ---- Compute target rect on step change + window resize ---- */
  const recompute = useCallback(() => {
    if (!visible || !current) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(`[data-tutorial="${current.target}"]`) as HTMLElement | null;
    if (!el) {
      setTargetRect(null);
      return;
    }
    setTargetRect(el.getBoundingClientRect());
  }, [visible, current]);

  useLayoutEffect(() => {
    recompute();
  }, [recompute]);

  useEffect(() => {
    if (!visible) return;
    const onResize = () => recompute();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    // Periodic recheck — covers DOM shifts (cinematic dismissing, modals)
    const id = setInterval(recompute, 400);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      clearInterval(id);
    };
  }, [visible, recompute]);

  /* ---- Reset to first step whenever the overlay (re)opens ---- */
  useEffect(() => {
    if (visible) setStepIndex(0);
  }, [visible]);

  /* ---- Handlers ---- */
  const finish = useCallback(() => {
    markTutorialSeen();
    onClose();
  }, [onClose]);

  const next = useCallback(() => {
    if (isLast) finish();
    else setStepIndex((i) => i + 1);
  }, [isLast, finish]);

  const prev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  /* ---- Keyboard navigation ---- */
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, next, prev, finish]);

  if (!visible || !current) return null;

  /* ---- Layout: caption position relative to target ---- */
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  let captionTop: number;
  let captionLeft: number;
  let pointerDir: 'up' | 'down' | null = null;
  if (targetRect) {
    const spaceBelow = vh - targetRect.bottom;
    const spaceAbove = targetRect.top;
    const placeBelow = spaceBelow >= 200 || spaceBelow >= spaceAbove;
    if (placeBelow) {
      captionTop = targetRect.bottom + CAPTION_GAP;
      pointerDir = 'up';
    } else {
      captionTop = targetRect.top - CAPTION_GAP - 160; // approximate caption height
      pointerDir = 'down';
    }
    captionLeft = targetRect.left + targetRect.width / 2 - CAPTION_WIDTH / 2;
    captionLeft = Math.max(16, Math.min(captionLeft, vw - CAPTION_WIDTH - 16));
    captionTop = Math.max(16, Math.min(captionTop, vh - 200));
  } else {
    // Centered when no target found — fallback to plain modal
    captionTop = vh / 2 - 80;
    captionLeft = vw / 2 - CAPTION_WIDTH / 2;
  }

  return (
    <div
      role="dialog"
      aria-label={T.tutorial.title}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        pointerEvents: 'auto',
      }}
    >
      {/* Scrim with cutout — uses box-shadow trick to darken everything except the highlighted rect */}
      {targetRect ? (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            top: targetRect.top - HIGHLIGHT_PADDING,
            left: targetRect.left - HIGHLIGHT_PADDING,
            width: targetRect.width + HIGHLIGHT_PADDING * 2,
            height: targetRect.height + HIGHLIGHT_PADDING * 2,
            borderRadius: '10px',
            boxShadow: '0 0 0 9999px rgba(5,4,2,0.78), 0 0 0 2px #d4a843, 0 0 24px rgba(212,168,67,0.5)',
            transition: 'top 0.3s, left 0.3s, width 0.3s, height 0.3s',
            pointerEvents: 'none',
            animation: 'tutorial-glow 1.6s ease-in-out infinite',
          }}
        />
      ) : (
        <div
          aria-hidden
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(5,4,2,0.78)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Top-right Skip button */}
      <button
        onClick={finish}
        style={{
          position: 'fixed',
          top: '20px', right: '20px',
          padding: '8px 16px',
          backgroundColor: 'rgba(20,17,10,0.85)',
          border: '1px solid #3a3530',
          borderRadius: '6px',
          color: '#b0a080',
          fontFamily: 'monospace',
          fontSize: '11px',
          letterSpacing: '1px',
          textTransform: 'uppercase',
          cursor: 'pointer',
          zIndex: 201,
        }}
      >
        {T.tutorial.skip}
      </button>

      {/* Caption tooltip */}
      <div
        style={{
          position: 'fixed',
          top: `${captionTop}px`,
          left: `${captionLeft}px`,
          width: `${CAPTION_WIDTH}px`,
          padding: '16px 18px',
          backgroundColor: '#100c08',
          border: '1px solid #d4a843',
          borderRadius: '10px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.7)',
          color: '#e8e0d4',
          fontFamily: 'Georgia, serif',
          zIndex: 202,
        }}
      >
        {/* Pointer arrow */}
        {pointerDir && targetRect && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              [pointerDir === 'up' ? 'top' : 'bottom']: '-7px',
              left: `${Math.max(20, Math.min(CAPTION_WIDTH - 20, targetRect.left + targetRect.width / 2 - captionLeft))}px`,
              width: 0, height: 0,
              borderLeft: '7px solid transparent',
              borderRight: '7px solid transparent',
              [pointerDir === 'up' ? 'borderBottom' : 'borderTop']: '7px solid #d4a843',
            } as React.CSSProperties}
          />
        )}

        {/* Step indicator */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '8px',
        }}>
          <span style={{
            fontSize: '10px',
            color: '#8a7d60',
            fontFamily: 'monospace',
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}>
            {T.tutorial.stepOf.replace('{n}', String(stepIndex + 1)).replace('{total}', String(total))}
          </span>
          <span style={{ display: 'flex', gap: '4px' }}>
            {steps.map((_, i) => (
              <span
                key={i}
                style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  backgroundColor: i === stepIndex ? '#d4a843' : i < stepIndex ? '#5a4a30' : '#2a2520',
                  transition: 'background-color 0.2s',
                }}
              />
            ))}
          </span>
        </div>

        {/* Title */}
        <h3 style={{
          margin: '0 0 6px 0',
          fontSize: '18px',
          color: '#d4a843',
          fontStyle: 'italic',
          fontWeight: 'normal',
          letterSpacing: '0.3px',
        }}>
          {current.title}
        </h3>

        {/* Body */}
        <p style={{
          margin: '0 0 14px 0',
          fontSize: '13px',
          lineHeight: '1.55',
          color: '#c8c0b4',
        }}>
          {current.body}
        </p>

        {/* Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
          <button
            onClick={prev}
            disabled={isFirst}
            style={controlStyle(isFirst, false)}
          >
            ← {T.tutorial.prev}
          </button>
          <button
            onClick={next}
            style={controlStyle(false, true)}
          >
            {isLast ? T.tutorial.finish : `${T.tutorial.next} →`}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes tutorial-glow {
          0%, 100% { box-shadow: 0 0 0 9999px rgba(5,4,2,0.78), 0 0 0 2px #d4a843, 0 0 18px rgba(212,168,67,0.4); }
          50% { box-shadow: 0 0 0 9999px rgba(5,4,2,0.78), 0 0 0 2px #d4a843, 0 0 32px rgba(212,168,67,0.7); }
        }
      `}</style>
    </div>
  );
}

function controlStyle(disabled: boolean, primary: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '8px 14px',
    backgroundColor: disabled ? 'transparent' : primary ? '#d4a843' : 'transparent',
    color: disabled ? '#3a3530' : primary ? '#0a0a0a' : '#b0a080',
    border: `1px solid ${disabled ? '#1e1a14' : primary ? '#d4a843' : '#3a3530'}`,
    borderRadius: '6px',
    fontFamily: 'monospace',
    fontSize: '11px',
    fontWeight: primary ? 'bold' : 'normal',
    letterSpacing: '1px',
    textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s',
  };
}
