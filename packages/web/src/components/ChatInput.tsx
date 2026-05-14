/**
 * ChatInput.tsx — Player input field component
 *
 * A text input with send button for player actions.
 * Always active in multiplayer — never disabled during narrator streaming.
 * Emits typing status changes for the typing indicator.
 *
 * @author AKBOYS Team
 * @since 2026-03-12
 */

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useT } from '@/hooks/useLocale';

interface ChatInputProps {
  onSend: (message: string) => void;
  onTypingChange?: (isTyping: boolean) => void;
  playerName?: string;
  disabled?: boolean;
}

export function ChatInput({ onSend, onTypingChange, playerName, disabled }: ChatInputProps) {
  const T = useT();
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const typingRef = useRef(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const setTyping = useCallback((isTyping: boolean) => {
    if (typingRef.current !== isTyping) {
      typingRef.current = isTyping;
      onTypingChange?.(isTyping);
    }
  }, [onTypingChange]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setText(e.target.value);

    // Emit typing: true, then reset after 1.5s of inactivity
    setTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => setTyping(false), 1500);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    setTyping(false);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
  }

  const placeholder = disabled
    ? T.game.narratorWriting
    : playerName
      ? T.game.sendPlaceholderNamed.replace('{name}', playerName)
      : T.game.sendPlaceholder;

  const isDisabled = disabled || !text.trim();

  return (
    <form data-tutorial="action-input" onSubmit={handleSubmit} style={{
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
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder}
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
        disabled={isDisabled}
        style={{
          padding: '14px 28px',
          backgroundColor: isDisabled ? '#1a1510' : '#d4a843',
          color: isDisabled ? '#5a5040' : '#0a0a0a',
          border: 'none',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 'bold',
          fontFamily: 'monospace',
          letterSpacing: '1px',
          textTransform: 'uppercase',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          transition: 'background-color 0.2s',
        }}
      >
        {T.game.send}
      </button>
    </form>
  );
}
