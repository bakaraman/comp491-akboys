/**
 * MobileVoiceButton.tsx — Touch push-to-talk for mobile players
 *
 * The V-key push-to-talk is the desktop primary; on touch devices there
 * is no V key, so this floating button takes over. Press-and-hold to
 * transmit, release to mute. Wired to the same `setTransmit` exposed by
 * `useVoiceChat`, so the underlying mic-track toggle is identical to the
 * desktop keyboard path — no duplicate state, no risk of a hot mic.
 *
 * Visual feedback:
 *   - Idle: muted-amber outlined mic icon
 *   - Active: bright red filled mic with pulsing halo + "📢 YAYIN"
 *   - Voice unavailable (unsupported / denied / not ready): rendered as
 *     a static disabled stub so users know the affordance exists, but
 *     touch events are no-ops.
 *
 * Mounts only on mobile (caller gates with `useIsMobile()`), so desktop
 * UX is untouched.
 *
 * @author AKBOYS Team
 * @since 2026-05-21
 */

'use client';

import React, { useEffect, useRef } from 'react';
import type { VoiceStatus } from '@/hooks/useVoiceChat';
import { useT } from '@/hooks/useLocale';

export interface MobileVoiceButtonProps {
  status: VoiceStatus;
  isTransmitting: boolean;
  setTransmit: (on: boolean) => void;
}

export function MobileVoiceButton({
  status,
  isTransmitting,
  setTransmit,
}: MobileVoiceButtonProps): React.ReactElement | null {
  const T = useT();
  /* Always carry the latest setTransmit so the touchend handler attached
   * to document still releases the mic even if the user drags off the
   * button before lifting their finger. */
  const setTransmitRef = useRef(setTransmit);
  setTransmitRef.current = setTransmit;

  /* Safety net: if the user drags their finger off the button before
   * lifting, the button itself stops receiving touchend. Listen at the
   * document level so we never leave the mic stuck open. */
  useEffect(() => {
    if (!isTransmitting) return;
    const release = () => setTransmitRef.current(false);
    document.addEventListener('touchend', release, { passive: true });
    document.addEventListener('touchcancel', release, { passive: true });
    document.addEventListener('mouseup', release);
    document.addEventListener('visibilitychange', release);
    return () => {
      document.removeEventListener('touchend', release);
      document.removeEventListener('touchcancel', release);
      document.removeEventListener('mouseup', release);
      document.removeEventListener('visibilitychange', release);
    };
  }, [isTransmitting]);

  if (status === 'unsupported') return null;
  const disabled = status === 'denied' || status === 'idle' || status === 'connecting';

  const baseStyles: React.CSSProperties = {
    position: 'fixed',
    /* Sits above ChatInput (which is the bottom-most element). The
     * suggestion row + safe-area inset on iPhone X+ both need clearance. */
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 92px)',
    right: '14px',
    zIndex: 65,
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    border: 'none',
    backgroundColor: isTransmitting ? '#cf2a2a' : disabled ? '#1a1510' : '#1a1510',
    color: isTransmitting ? '#ffffff' : disabled ? '#5a5040' : '#d4a843',
    boxShadow: isTransmitting
      ? '0 0 0 6px rgba(207,42,42,0.35), 0 6px 18px rgba(0,0,0,0.6)'
      : '0 4px 14px rgba(0,0,0,0.6)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    fontFamily: 'monospace',
    fontSize: '8px',
    letterSpacing: '1px',
    textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    /* Prevent the native context-menu / text-selection / callout while
     * the user is holding their finger down. */
    WebkitUserSelect: 'none',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    WebkitTouchCallout: 'none',
    /* Tell the browser this element should not pan/zoom on touch — without
     * this, holding the button for >300ms can trigger an unintended scroll
     * or a long-press menu on iOS. */
    touchAction: 'none',
    transition: 'background-color 0.1s, box-shadow 0.15s',
  };

  function onPressStart(e: React.SyntheticEvent) {
    if (disabled) return;
    e.preventDefault();
    setTransmit(true);
  }
  function onPressEnd(e: React.SyntheticEvent) {
    if (disabled) return;
    e.preventDefault();
    setTransmit(false);
  }

  return (
    <button
      type="button"
      aria-label={T.game.voiceButtonHoldToTalk ?? 'Hold to talk'}
      aria-pressed={isTransmitting}
      disabled={disabled}
      onTouchStart={onPressStart}
      onTouchEnd={onPressEnd}
      onTouchCancel={onPressEnd}
      onMouseDown={onPressStart}
      onMouseUp={onPressEnd}
      onMouseLeave={(e) => { if (isTransmitting) onPressEnd(e); }}
      /* Stop the browser-default context menu on long-press */
      onContextMenu={(e) => e.preventDefault()}
      style={baseStyles}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <line x1="12" y1="18" x2="12" y2="22" />
      </svg>
      <span style={{ pointerEvents: 'none' }}>
        {isTransmitting
          ? (T.game.voiceButtonOn ?? 'LIVE')
          : disabled
            ? (T.game.voiceButtonDisabled ?? 'MIC')
            : (T.game.voiceButtonHoldShort ?? 'HOLD')}
      </span>
    </button>
  );
}
