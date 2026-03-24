/**
 * CopyLinkButton.tsx — Copy session link to clipboard
 *
 * One-click button that copies the current page URL so players
 * can easily invite friends to their session.
 *
 * @author AK Boys Team
 * @since 2026-03-24
 */

'use client';

import React, { useState, useCallback } from 'react';

interface CopyLinkButtonProps {
  /** Optional custom style override */
  compact?: boolean;
}

export function CopyLinkButton({ compact }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers that don't support clipboard API
      const textarea = document.createElement('textarea');
      textarea.value = window.location.href;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  if (compact) {
    return (
      <button
        onClick={handleCopy}
        title="Copy invite link"
        style={{
          padding: '6px 12px',
          backgroundColor: copied ? '#1a2a1a' : 'transparent',
          border: `1px solid ${copied ? '#4a8a4a' : '#2a2520'}`,
          borderRadius: '6px',
          color: copied ? '#4a8a4a' : '#6a6050',
          fontSize: '11px',
          fontFamily: 'monospace',
          letterSpacing: '0.5px',
          cursor: 'pointer',
          transition: 'all 0.25s ease',
          display: 'flex', alignItems: 'center', gap: '5px',
        }}
        onMouseEnter={(e) => {
          if (!copied) {
            e.currentTarget.style.borderColor = '#d4a843';
            e.currentTarget.style.color = '#d4a843';
          }
        }}
        onMouseLeave={(e) => {
          if (!copied) {
            e.currentTarget.style.borderColor = '#2a2520';
            e.currentTarget.style.color = '#6a6050';
          }
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {copied ? (
            <path d="M20 6L9 17l-5-5" />
          ) : (
            <>
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </>
          )}
        </svg>
        {copied ? 'Copied!' : 'Invite'}
      </button>
    );
  }

  return (
    <button
      onClick={handleCopy}
      style={{
        width: '100%', padding: '12px 16px',
        backgroundColor: copied ? '#1a2a1a' : '#0a0a0a',
        border: `1px solid ${copied ? '#4a8a4a' : '#2a2520'}`,
        borderRadius: '8px',
        color: copied ? '#4a8a4a' : '#9a9080',
        fontSize: '13px',
        fontFamily: 'monospace',
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
      }}
      onMouseEnter={(e) => {
        if (!copied) {
          e.currentTarget.style.borderColor = '#d4a843';
          e.currentTarget.style.color = '#d4a843';
        }
      }}
      onMouseLeave={(e) => {
        if (!copied) {
          e.currentTarget.style.borderColor = '#2a2520';
          e.currentTarget.style.color = '#9a9080';
        }
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {copied ? (
          <path d="M20 6L9 17l-5-5" />
        ) : (
          <>
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </>
        )}
      </svg>
      {copied ? 'Link Copied!' : 'Copy Invite Link'}
    </button>
  );
}
