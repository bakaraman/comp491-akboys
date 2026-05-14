/**
 * CommPanel.tsx — Evidence Board (#48)
 *
 * Repurposed from the old "Telsiz" room/direct chat into a single shared
 * notepad where the team posts clues, theories, and observations as the
 * mystery progresses. The narrator never sees what's posted here — this
 * board is purely a player-to-player thinking surface, not part of the
 * game's directive pipeline.
 *
 * The wire protocol is unchanged for backward compatibility: notes are
 * still emitted via `comm:room` and arrive as `comm:message` events;
 * the server now broadcasts every message to every connected player
 * regardless of in-game room.
 *
 * @author AKBOYS Team
 * @since 2026-03-24 (originally), repurposed 2026-05-07
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { PlayerDataDTO, CommMessageDTO } from '@/types/shared';
import { useT } from '@/hooks/useLocale';

interface CommPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: CommMessageDTO[];
  players: PlayerDataDTO[];
  myPlayerId: string | null;
  onSendRoom: (content: string) => void;
  /**
   * Legacy direct-message sender. Kept in the prop signature so the
   * session page can keep passing it without conditional wiring; the
   * Evidence Board does not call it. Future cleanup can drop it once
   * other callers are gone.
   */
  onSendDirect?: (targetPlayerId: string, content: string) => void;
  onOpened: () => void;
}

export function CommPanel({
  isOpen, onClose, messages, myPlayerId,
  onSendRoom, onOpened,
}: CommPanelProps) {
  // `players` and `onSendDirect` props are accepted but unused — kept on the
  // signature so callers don't need to update on this incremental rename.
  const T = useT();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      onOpened();
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen, onOpened]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Lock scroll
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendRoom(trimmed);
    setInput('');
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div onClick={onClose} style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 40,
        }} />
      )}

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: '380px', maxWidth: '90vw',
        backgroundColor: '#0d0d0d',
        borderLeft: '1px solid #2a2520',
        zIndex: 50,
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #2a2520',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <div style={{
              fontSize: '12px', color: '#d4a843', fontFamily: 'Georgia, serif',
              fontStyle: 'italic', letterSpacing: '0.5px',
              marginBottom: '2px',
            }}>
              {T.evidence.title}
            </div>
            <div style={{
              fontSize: '10px', color: '#6a6050', fontFamily: 'monospace',
              textTransform: 'uppercase', letterSpacing: '1.5px',
            }}>
              {T.evidence.subtitle}
            </div>
          </div>
          <button onClick={onClose} aria-label={T.game.closeAria} style={{
            background: 'none', border: 'none', color: '#6a6050',
            fontSize: '18px', cursor: 'pointer', padding: '4px 8px',
          }}>
            ✕
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {messages.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '40px 16px',
              color: '#3a3530', fontSize: '13px', fontStyle: 'italic',
              fontFamily: 'Georgia, serif',
            }}>
              {T.evidence.noMessages}
            </div>
          )}

          {messages.map((m) => {
            const isMe = m.senderId === myPlayerId;
            return (
              <div key={m.id} style={{
                marginBottom: '12px',
                display: 'flex', flexDirection: 'column',
                alignItems: isMe ? 'flex-end' : 'flex-start',
              }}>
                {/* Sender label */}
                <div style={{
                  fontSize: '10px', fontFamily: 'monospace',
                  color: m.senderColor || '#6a6050',
                  marginBottom: '3px',
                  letterSpacing: '0.5px',
                }}>
                  {isMe ? T.game.youCommLabel : m.senderName}
                </div>

                {/* Bubble */}
                <div style={{
                  maxWidth: '85%', padding: '10px 14px',
                  backgroundColor: isMe ? '#1a1510' : '#151515',
                  border: `1px solid ${isMe ? '#2a2520' : '#1e1e1e'}`,
                  borderRadius: isMe ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                  color: '#c8c0b4',
                  fontSize: '14px', lineHeight: '1.55',
                  fontFamily: 'Georgia, serif',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {m.content}
                </div>
              </div>
            );
          })}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          style={{
            padding: '12px 16px', borderTop: '1px solid #2a2520',
            display: 'flex', gap: '8px',
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={T.evidence.placeholder}
            maxLength={500}
            style={{
              flex: 1, padding: '10px 14px',
              backgroundColor: '#111', border: '1px solid #2a2520',
              borderRadius: '8px', color: '#e8e0d4',
              fontSize: '14px', fontFamily: 'Georgia, serif',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!input.trim()}
            style={{
              padding: '10px 16px',
              backgroundColor: !input.trim() ? '#1a1510' : '#d4a843',
              color: !input.trim() ? '#5a5040' : '#0a0a0a',
              border: 'none', borderRadius: '8px',
              fontSize: '12px', fontWeight: 'bold',
              fontFamily: 'monospace', letterSpacing: '1px',
              textTransform: 'uppercase',
              cursor: !input.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {T.evidence.send}
          </button>
        </form>
      </div>
    </>
  );
}
