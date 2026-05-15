/**
 * LocaleToggle.tsx — Compact TR / EN switcher
 *
 * Used in the home header and the lobby toolbar. Greys out and shows a
 * tooltip when `useLocale.locked` is true (game already started).
 *
 * @author AKBOYS Team
 * @since 2026-05-13
 */

'use client';

import React from 'react';

import { useLocale, useT } from '@/hooks/useLocale';
import type { Locale } from '@/lib/i18n';

interface LocaleToggleProps {
  /** Visual size of the chip group. */
  size?: 'sm' | 'md';
}

export function LocaleToggle({ size = 'sm' }: LocaleToggleProps): React.ReactElement {
  const { locale, locked, setLocale } = useLocale();
  const T = useT();

  const pad = size === 'md' ? '6px 12px' : '4px 9px';
  const fontSize = size === 'md' ? '12px' : '11px';

  const renderChip = (target: Locale, label: string) => {
    const active = locale === target;
    return (
      <button
        type="button"
        onClick={() => setLocale(target)}
        disabled={locked}
        title={locked ? T.locale.locked : undefined}
        aria-pressed={active}
        style={{
          padding: pad,
          fontFamily: 'monospace',
          fontSize,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          color: active ? '#0a0a0a' : locked ? '#4a4035' : '#a89884',
          backgroundColor: active ? '#d4a843' : 'transparent',
          border: '1px solid #2a2520',
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
    <div
      role="group"
      aria-label={T.locale.sectionTitle}
      style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}
    >
      {renderChip('tr', 'TR')}
      {renderChip('en', 'EN')}
    </div>
  );
}
