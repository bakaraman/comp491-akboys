/**
 * NamePopup.tsx — First-time name entry popup
 *
 * Shown as a centered overlay when the player hasn't set a name yet.
 * Also used for editing name from the profile button.
 *
 * @author AKBOYS Team
 * @since 2026-03-24
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';

interface NamePopupProps {
  currentName?: string | null;
  onSave: (name: string) => void;
  onClose?: () => void;
  isEdit?: boolean;
}

export function NamePopup({ currentName, onSave, onClose, isEdit }: NamePopupProps) {
  const [value, setValue] = useState(currentName || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Small delay so the animation plays before focus
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  // Close on Escape (only for edit mode)
  useEffect(() => {
    if (!isEdit) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isEdit, onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSave(trimmed);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 80,
      animation: 'fadeIn 0.25s ease',
    }}>
      <div
        style={{
          width: '400px', maxWidth: '90vw',
          backgroundColor: '#111',
          border: '1px solid #2a2520',
          borderRadius: '16px',
          padding: '36px',
          textAlign: 'center',
          animation: 'scaleIn 0.25s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div style={{ marginBottom: '16px' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d4a843" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>

        <h2 style={{
          fontSize: '22px', color: '#e8e0d4',
          fontFamily: 'Georgia, serif', fontStyle: 'italic',
          fontWeight: 'normal', margin: '0 0 6px',
        }}>
          {isEdit ? 'Change Your Name' : 'Welcome, Adventurer'}
        </h2>
        <p style={{
          fontSize: '12px', color: '#5a5545',
          fontFamily: 'monospace', letterSpacing: '0.5px',
          marginBottom: '24px', lineHeight: '1.5',
        }}>
          {isEdit
            ? 'Enter a new display name'
            : 'What should we call you?'}
        </p>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Your name..."
            maxLength={20}
            style={{
              width: '100%', padding: '14px 18px',
              backgroundColor: '#0a0a0a',
              border: '1px solid #2a2520',
              borderRadius: '8px',
              color: '#e8e0d4',
              fontSize: '16px',
              fontFamily: 'Georgia, serif',
              outline: 'none',
              textAlign: 'center',
              boxSizing: 'border-box',
              marginBottom: '14px',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#d4a843'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#2a2520'; }}
          />

          <div style={{ display: 'flex', gap: '10px' }}>
            {isEdit && onClose && (
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1, padding: '13px',
                  backgroundColor: 'transparent',
                  border: '1px solid #2a2520',
                  borderRadius: '8px',
                  color: '#6a6050',
                  fontSize: '13px', fontWeight: 'bold',
                  fontFamily: 'monospace', letterSpacing: '1px',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4a4030'; e.currentTarget.style.color = '#9a9080'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2520'; e.currentTarget.style.color = '#6a6050'; }}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={!value.trim()}
              style={{
                flex: 1, padding: '13px',
                backgroundColor: !value.trim() ? '#1a1510' : '#d4a843',
                color: !value.trim() ? '#5a5040' : '#0a0a0a',
                border: 'none', borderRadius: '8px',
                fontSize: '13px', fontWeight: 'bold',
                fontFamily: 'monospace', letterSpacing: '1px',
                textTransform: 'uppercase',
                cursor: !value.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {isEdit ? 'Save' : 'Continue'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
