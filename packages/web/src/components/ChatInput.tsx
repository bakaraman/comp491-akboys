/**
 * ChatInput.tsx — Player input field component
 *
 * A text input with send button for player actions.
 * Submits on Enter key or button click.
 *
 * @author AK Boys Team
 * @since 2026-03-12
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [disabled]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  }

  return (
    <form onSubmit={handleSubmit} style={{
      display: 'flex',
      gap: '12px',
      padding: '20px 24px',
      borderTop: '1px solid #2a2520',
      backgroundColor: '#0d0d0d',
    }}>
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        placeholder={disabled ? 'The narrator is thinking...' : 'What do you do?'}
        style={{
          flex: 1,
          padding: '14px 18px',
          backgroundColor: '#111111',
          border: '1px solid #2a2520',
          borderRadius: '8px',
          color: '#e8e0d4',
          fontSize: '15px',
          fontFamily: 'Georgia, serif',
          outline: 'none',
        }}
      />
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        style={{
          padding: '14px 28px',
          backgroundColor: disabled ? '#1a1510' : '#d4a843',
          color: disabled ? '#5a5040' : '#0a0a0a',
          border: 'none',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 'bold',
          fontFamily: 'monospace',
          letterSpacing: '1px',
          textTransform: 'uppercase',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'background-color 0.2s',
        }}
      >
        Send
      </button>
    </form>
  );
}
