/**
 * ChatMessage.tsx — Chat message bubble component
 *
 * Renders messages from the narrator, players, or system (join/leave).
 * Supports markdown rendering and player name/color display.
 *
 * @author AKBOYS Team
 * @since 2026-03-12
 */

'use client';

import React from 'react';
import Markdown from 'react-markdown';

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system' | 'observed';
  content: string;
  playerName?: string;
  playerColor?: string;
  imageUrl?: string;
  isLoadingImage?: boolean;
  /** Server-side classification — 'global' renders the shared opening style. */
  messageType?: 'global' | 'observed' | 'private' | 'action';
}

export function ChatMessage({
  role,
  content,
  playerName,
  playerColor,
  imageUrl,
  isLoadingImage,
  messageType,
}: ChatMessageProps) {
  /* ---- C.1: Shared opening narration — distinct style ---- */
  if (messageType === 'global' && role === 'assistant') {
    return (
      <div style={{ marginBottom: '20px', padding: '0 4px' }}>
        <div style={{
          textAlign: 'center',
          fontSize: '10px',
          color: '#d4a843',
          fontFamily: 'monospace',
          letterSpacing: '4px',
          textTransform: 'uppercase',
          marginBottom: '8px',
          opacity: 0.7,
        }}>
          ── Açılış ──
        </div>
        <div style={{
          padding: '20px 24px',
          backgroundColor: '#15110a',
          border: '2px solid #d4a843',
          borderRadius: '12px',
          color: '#e8d8b0',
          fontSize: '15px',
          fontStyle: 'italic',
          lineHeight: '1.8',
          fontFamily: 'Georgia, serif',
          boxShadow: '0 0 24px rgba(212, 168, 67, 0.12)',
        }}>
          <Markdown
            components={{
              p: ({ children }) => <p style={{ margin: '0 0 10px 0' }}>{children}</p>,
              strong: ({ children }) => <strong style={{ color: '#d4a843', fontStyle: 'normal' }}>{children}</strong>,
              em: ({ children }) => <em style={{ color: '#e8d8b0' }}>{children}</em>,
            }}
          >
            {content}
          </Markdown>
        </div>
      </div>
    );
  }

  /* ---- Observed messages (what you see others doing) ---- */
  if (role === 'observed') {
    return (
      <div style={{
        padding: '8px 0', marginBottom: '10px',
      }}>
        <div style={{
          padding: '10px 16px',
          backgroundColor: '#12120f',
          border: '1px solid #1e1e1a',
          borderRadius: '8px',
          borderLeft: '3px solid #6a6050',
        }}>
          <div style={{
            fontSize: '10px', color: '#5a5545',
            fontFamily: 'monospace', textTransform: 'uppercase',
            letterSpacing: '1px', marginBottom: '4px',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6a6050" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Observed
          </div>
          <div style={{
            fontSize: '14px', color: '#8a8070',
            fontFamily: 'Georgia, serif', fontStyle: 'italic',
            lineHeight: '1.6',
          }}>
            {content}
          </div>
        </div>
      </div>
    );
  }

  /* ---- System messages (join/leave/reconnect) ---- */
  if (role === 'system') {
    return (
      <div style={{
        textAlign: 'center',
        padding: '6px 0',
        marginBottom: '8px',
      }}>
        <span style={{
          fontSize: '12px',
          color: '#6a6050',
          fontFamily: 'monospace',
          letterSpacing: '0.5px',
        }}>
          <Markdown
            components={{
              p: ({ children }) => <span>{children}</span>,
              strong: ({ children }) => <strong style={{ color: '#8a7a60' }}>{children}</strong>,
            }}
          >
            {content}
          </Markdown>
        </span>
      </div>
    );
  }

  const isNarrator = role === 'assistant';
  const displayColor = playerColor || '#d4a843';

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
        color: isNarrator ? '#e8e0d4' : displayColor,
        fontSize: '15px',
        lineHeight: '1.7',
        overflow: 'hidden',
      }}>
        <div style={{
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '1.5px',
          color: isNarrator ? '#6a6050' : displayColor,
          marginBottom: '8px',
          fontFamily: 'monospace',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          {isNarrator ? (
            'Narrator'
          ) : (
            <>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: displayColor,
                display: 'inline-block',
              }} />
              {playerName || 'Player'}
            </>
          )}
        </div>

        {isLoadingImage && (
          <div style={{
            width: '100%',
            maxWidth: '320px',
            aspectRatio: '1 / 1',
            marginBottom: '16px',
            borderRadius: '8px',
            border: '1px dashed #2a2520',
            backgroundColor: '#0d0d0d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6a6050',
            fontFamily: 'monospace',
            fontSize: '12px',
            fontStyle: 'italic',
          }}>
            Visualizing scene...
          </div>
        )}

        {imageUrl && !isLoadingImage && (
          <div style={{
            width: '100%',
            maxWidth: '320px',
            marginBottom: '16px',
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid #2a2520',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Scene visualization"
              style={{
                display: 'block',
                width: '100%',
                aspectRatio: '1 / 1',
                objectFit: 'cover',
              }}
            />
          </div>
        )}

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
