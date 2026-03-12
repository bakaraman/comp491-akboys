/**
 * ChatMessage.tsx — Single chat message bubble component
 *
 * Renders a message from either the player or the narrator
 * with distinct styling for each role.
 *
 * @author AK Boys Team
 * @since 2026-03-12
 */

'use client';

import React from 'react';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  const isNarrator = role === 'assistant';

  return (
    <div style={{
      display: 'flex',
      justifyContent: isNarrator ? 'flex-start' : 'flex-end',
      marginBottom: '16px',
      paddingLeft: isNarrator ? '0' : '48px',
      paddingRight: isNarrator ? '48px' : '0',
    }}>
      <div style={{
        maxWidth: '85%',
        padding: '16px 20px',
        borderRadius: isNarrator ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
        backgroundColor: isNarrator ? '#1a1a1a' : '#2a2010',
        border: `1px solid ${isNarrator ? '#2a2520' : '#3a3020'}`,
        color: isNarrator ? '#e8e0d4' : '#d4a843',
        fontSize: '15px',
        lineHeight: '1.7',
        whiteSpace: 'pre-wrap',
      }}>
        <div style={{
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '1.5px',
          color: isNarrator ? '#6a6050' : '#8a7030',
          marginBottom: '8px',
          fontFamily: 'monospace',
        }}>
          {isNarrator ? 'Narrator' : 'You'}
        </div>
        {content}
      </div>
    </div>
  );
}
