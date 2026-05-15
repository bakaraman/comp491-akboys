/**
 * LocaleOnboardingModal.tsx — First-visit language picker
 *
 * Shown once when the user has no `velvet-locale` value in localStorage.
 * Picking a language sets it (and dismisses the modal); afterwards the
 * user can change it from the home toggle or settings popover.
 *
 * @author AKBOYS Team
 * @since 2026-05-13
 */

'use client';

import React, { useEffect, useState } from 'react';

import {
  hasUserChosenLocale,
  useLocale,
  useT,
} from '@/hooks/useLocale';
import type { Locale } from '@/lib/i18n';

export function LocaleOnboardingModal(): React.ReactElement | null {
  const T = useT();
  const { setLocale } = useLocale();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // SSR-safe: only read on the client.
    if (typeof window === 'undefined') return;
    if (!hasUserChosenLocale()) setVisible(true);
  }, []);

  if (!visible) return null;

  const pick = (l: Locale) => {
    setLocale(l);
    // Persist immediately so a refresh during the same visit doesn't reopen.
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('velvet-locale', l);
    }
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.82)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 90,
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: '#0f0d0a',
          border: '1px solid #d4a843',
          borderRadius: '14px',
          padding: '28px 26px',
          color: '#e8e0d4',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '11px',
            letterSpacing: '2px',
            color: '#d4a843',
            textTransform: 'uppercase',
            marginBottom: '12px',
            textAlign: 'center',
          }}
        >
          Velvet Shadow
        </div>
        <h2
          style={{
            margin: '0 0 6px',
            fontSize: '22px',
            textAlign: 'center',
            color: '#f0e5c8',
          }}
        >
          {T.locale.onboardingTitle}
        </h2>
        <p
          style={{
            margin: '0 0 18px',
            fontSize: '13px',
            lineHeight: '1.55',
            textAlign: 'center',
            color: '#a89884',
          }}
        >
          {T.locale.onboardingSubtitle}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <button
            type="button"
            onClick={() => pick('tr')}
            style={localeButtonStyle}
          >
            <span style={{ fontSize: '13px', fontFamily: 'monospace', letterSpacing: '2px', color: '#d4a843' }}>TR</span>
            <span style={{ fontWeight: 600 }}>Türkçe</span>
          </button>
          <button
            type="button"
            onClick={() => pick('en')}
            style={localeButtonStyle}
          >
            <span style={{ fontSize: '13px', fontFamily: 'monospace', letterSpacing: '2px', color: '#d4a843' }}>EN</span>
            <span style={{ fontWeight: 600 }}>English</span>
          </button>
        </div>

        <p
          style={{
            marginTop: '18px',
            marginBottom: 0,
            fontSize: '11px',
            lineHeight: '1.5',
            textAlign: 'center',
            color: '#6e6354',
            fontStyle: 'italic',
          }}
        >
          {T.locale.onboardingHint}
        </p>
      </div>
    </div>
  );
}

const localeButtonStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  padding: '16px 12px',
  backgroundColor: '#1a1410',
  color: '#e8e0d4',
  border: '1px solid #3a3025',
  borderRadius: '10px',
  fontFamily: 'inherit',
  fontSize: '15px',
  cursor: 'pointer',
  transition: 'border-color 0.15s, background-color 0.15s',
};
