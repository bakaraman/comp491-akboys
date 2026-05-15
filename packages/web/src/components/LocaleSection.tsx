/**
 * LocaleSection.tsx — Language section for the SettingsPopover
 *
 * Two radio-style buttons. Grays out when the locale is locked (game
 * has started) and shows the lock reason as a small hint.
 *
 * @author AKBOYS Team
 * @since 2026-05-13
 */

'use client';

import React from 'react';

import { useLocale, useT } from '@/hooks/useLocale';
import type { Locale } from '@/lib/i18n';

export function LocaleSection(): React.ReactElement {
  const T = useT();
  const { locale, locked, setLocale } = useLocale();

  const renderOption = (target: Locale, label: string) => {
    const active = locale === target;
    return (
      <button
        type="button"
        onClick={() => setLocale(target)}
        disabled={locked}
        aria-pressed={active}
        style={{
          flex: 1,
          padding: '8px 10px',
          fontFamily: 'monospace',
          fontSize: '11px',
          letterSpacing: '1px',
          textTransform: 'uppercase',
          color: active ? '#0a0a0a' : locked ? '#4a4035' : '#b0a080',
          backgroundColor: active ? '#d4a843' : 'transparent',
          border: '1px solid #3a3530',
          borderRadius: '6px',
          cursor: locked ? 'not-allowed' : 'pointer',
          opacity: locked && !active ? 0.5 : 1,
          transition: 'background-color 0.12s, color 0.12s',
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #1f1a14' }}>
      <div style={{
        fontFamily: 'monospace',
        fontSize: '10px',
        letterSpacing: '1.5px',
        color: '#7a6a50',
        textTransform: 'uppercase',
        marginBottom: '8px',
      }}>
        {T.locale.sectionTitle}
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {renderOption('tr', T.locale.turkish)}
        {renderOption('en', T.locale.english)}
      </div>
      <p style={{
        margin: '8px 0 0',
        fontSize: '10px',
        color: locked ? '#6e6354' : '#5a5040',
        fontStyle: 'italic',
        lineHeight: 1.4,
      }}>
        {locked ? T.locale.locked : T.locale.sectionHint}
      </p>
    </div>
  );
}
