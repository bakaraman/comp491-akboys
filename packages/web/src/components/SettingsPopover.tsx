/**
 * SettingsPopover.tsx — Ses ayarları paneli
 *
 * Two independent channels — Atmosfer Müziği (ambient loop) and Ses
 * Efektleri (UI clicks). Each has its own volume slider (0–100) and a
 * Sustur / Aç toggle. Settings persist via the underlying hooks and
 * stay in sync with any other component that reads them.
 *
 * Mounted from a header speaker icon on every page (home + session) so
 * the user can adjust audio at any time without leaving their context.
 *
 * @author AKBOYS Team
 * @since 2026-05-06
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useSoundEffects } from '@/hooks/useSoundEffects';
import { useAmbientSettings } from '@/hooks/useAmbientLoop';
import { T } from '@/lib/tr';

/* ------------------------------------------------------------------ */
/*  Speaker icon (open/close trigger)                                  */
/* ------------------------------------------------------------------ */

function SpeakerIcon({ muted }: { muted: boolean }): React.ReactElement {
  if (muted) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Channel row — volume slider + mute toggle                          */
/* ------------------------------------------------------------------ */

interface ChannelRowProps {
  label: string;
  volume: number;
  onVolumeChange: (v: number) => void;
  muted: boolean;
  onToggleMute: () => void;
}

function ChannelRow({ label, volume, onVolumeChange, muted, onToggleMute }: ChannelRowProps): React.ReactElement {
  const percent = Math.round(volume * 100);
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: '6px',
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#b0a080',
        letterSpacing: '1px',
        textTransform: 'uppercase',
      }}>
        <span>{label}</span>
        <span style={{ color: muted ? '#5a5040' : '#d4a843' }}>
          {muted ? '—' : `${percent}%`}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={muted ? 0 : percent}
          onChange={(e) => onVolumeChange(Number(e.currentTarget.value) / 100)}
          aria-label={label}
          style={{
            flex: 1,
            accentColor: '#d4a843',
            cursor: 'pointer',
            opacity: muted ? 0.4 : 1,
          }}
        />
        <button
          onClick={onToggleMute}
          aria-label={muted ? T.audio.unmute : T.audio.mute}
          style={{
            padding: '4px 10px',
            backgroundColor: muted ? '#2a1515' : 'transparent',
            border: `1px solid ${muted ? '#cf5b5b' : '#3a3530'}`,
            borderRadius: '4px',
            color: muted ? '#cf5b5b' : '#8a8070',
            fontFamily: 'monospace',
            fontSize: '10px',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            cursor: 'pointer',
            minWidth: '54px',
          }}
        >
          {muted ? T.audio.unmute : T.audio.mute}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main popover                                                       */
/* ------------------------------------------------------------------ */

export interface SettingsPopoverProps {
  /**
   * Which side of the trigger button the popover panel anchors to.
   * - 'right' (default): panel's right edge aligns with the trigger,
   *   panel grows leftward. Use when the trigger sits near the right
   *   edge of the viewport.
   * - 'left': panel's left edge aligns with the trigger, panel grows
   *   rightward. Use when the trigger sits near the left edge.
   */
  align?: 'left' | 'right';
}

export function SettingsPopover({ align = 'right' }: SettingsPopoverProps): React.ReactElement {
  const ambient = useAmbientSettings();
  const sfx = useSoundEffects();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Click-outside / Escape to close.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      if (buttonRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Visual hint: if either channel is fully muted, the trigger icon shows
  // the muted variant. Lets the user see at a glance that audio is off.
  const anyMuted = ambient.muted || sfx.muted;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        title={T.audio.open}
        aria-label={T.audio.open}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '34px',
          height: '34px',
          padding: 0,
          backgroundColor: open ? '#1a1510' : 'transparent',
          border: `1px solid ${open ? '#d4a843' : '#2a2520'}`,
          borderRadius: '6px',
          color: anyMuted ? '#cf5b5b' : open ? '#d4a843' : '#8a8070',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        <SpeakerIcon muted={anyMuted} />
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={T.audio.settings}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            ...(align === 'left' ? { left: 0 } : { right: 0 }),
            width: '260px',
            padding: '16px 18px 12px',
            backgroundColor: '#0f0d0a',
            border: '1px solid #2a2520',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            zIndex: 80,
          }}
        >
          <div style={{
            fontFamily: 'Georgia, serif',
            fontSize: '13px',
            color: '#d4a843',
            fontStyle: 'italic',
            marginBottom: '14px',
            letterSpacing: '0.5px',
          }}>
            {T.audio.settings}
          </div>

          <ChannelRow
            label={T.audio.ambient}
            volume={ambient.volume}
            onVolumeChange={ambient.setVolume}
            muted={ambient.muted}
            onToggleMute={ambient.toggleMute}
          />

          <ChannelRow
            label={T.audio.sfx}
            volume={sfx.volume}
            onVolumeChange={sfx.setVolume}
            muted={sfx.muted}
            onToggleMute={sfx.toggleMute}
          />
        </div>
      )}
    </div>
  );
}
