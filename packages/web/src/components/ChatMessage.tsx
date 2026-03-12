/**
 * ChatMessage.tsx — Single chat message bubble component
 *
 * Renders a message from either the player or the narrator
 * with distinct styling for each role. Supports markdown.
 *
 * @author AK Boys Team
 * @since 2026-03-12
 */

'use client';

import React from 'react';
import Markdown from 'react-markdown';

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
        <div className="markdown-content">
          <Markdown
            components={{
              h1: ({ children }) => <h1 style={{ fontSize: '20px', color: '#d4a843', fontFamily: 'Georgia, serif', margin: '16px 0 8px', fontWeight: 'normal', fontStyle: 'italic' }}>{children}</h1>,
              h2: ({ children }) => <h2 style={{ fontSize: '17px', color: '#d4a843', fontFamily: 'Georgia, serif', margin: '14px 0 6px', fontWeight: 'normal', fontStyle: 'italic' }}>{children}</h2>,
              h3: ({ children }) => <h3 style={{ fontSize: '15px', color: '#b0a080', fontFamily: 'monospace', margin: '12px 0 4px', letterSpacing: '1px', textTransform: 'uppercase' }}>{children}</h3>,
              p: ({ children }) => <p style={{ margin: '0 0 12px 0' }}>{children}</p>,
              strong: ({ children }) => <strong style={{ color: '#d4a843' }}>{children}</strong>,
              em: ({ children }) => <em style={{ color: isNarrator ? '#c8b890' : '#e0c070' }}>{children}</em>,
              ul: ({ children }) => <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>{children}</ul>,
              ol: ({ children }) => <ol style={{ margin: '8px 0', paddingLeft: '20px' }}>{children}</ol>,
              li: ({ children }) => <li style={{ marginBottom: '4px' }}>{children}</li>,
              blockquote: ({ children }) => (
                <blockquote style={{
                  borderLeft: '3px solid #d4a843',
                  paddingLeft: '12px',
                  margin: '8px 0',
                  color: '#b0a080',
                  fontStyle: 'italic',
                }}>
                  {children}
                </blockquote>
              ),
              hr: () => <hr style={{ border: 'none', borderTop: '1px solid #2a2520', margin: '16px 0' }} />,
            }}
          >
            {content}
          </Markdown>
        </div>
      </div>
    </div>
  );
}
