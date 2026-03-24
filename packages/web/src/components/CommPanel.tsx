/**
 * CommPanel.tsx — Player-to-player communication panel
 *
 * Slide-out drawer with two tabs: Room (local) and Direct (radio).
 * Completely separate from the narrator/action pipeline.
 *
 * @author AK Boys Team
 * @since 2026-03-24
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { PlayerDataDTO, CommMessageDTO } from '@akboys/shared';

interface CommPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: CommMessageDTO[];
  players: PlayerDataDTO[];
  myPlayerId: string | null;
  onSendRoom: (content: string) => void;
  onSendDirect: (targetPlayerId: string, content: string) => void;
  onOpened: () => void;
}

type Tab = 'room' | 'direct';

export function CommPanel({
  isOpen, onClose, messages, players, myPlayerId,
  onSendRoom, onSendDirect, onOpened,
}: CommPanelProps) {
  const [tab, setTab] = useState<Tab>('room');
  const [input, setInput] = useState('');
  const [directTarget, setDirectTarget] = useState<string | null>(null);
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

  const myPlayer = players.find((p) => p.id === myPlayerId);
  const otherPlayers = players.filter((p) => p.id !== myPlayerId);

  // Filter messages based on tab
  const filteredMessages = messages.filter((m) => {
    if (tab === 'room') return m.mode === 'room';
    if (tab === 'direct') {
      if (!directTarget) return m.mode === 'direct' && (m.senderId === myPlayerId || m.targetPlayerId === myPlayerId);
      return m.mode === 'direct' && (
        (m.senderId === myPlayerId && m.targetPlayerId === directTarget) ||
        (m.senderId === directTarget && m.targetPlayerId === myPlayerId)
      );
    }
    return false;
  });

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (tab === 'room') {
      onSendRoom(trimmed);
    } else if (directTarget) {
      onSendDirect(directTarget, trimmed);
    }
    setInput('');
  }

  // Same-room players for room tab info
  const roommates = players.filter((p) => p.id !== myPlayerId && p.currentRoomId === myPlayer?.currentRoomId);

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
        width: '360px', maxWidth: '90vw',
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
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{
            fontSize: '11px', color: '#6a6050', fontFamily: 'monospace',
            textTransform: 'uppercase', letterSpacing: '2px',
          }}>
            Communication
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#6a6050',
            fontSize: '18px', cursor: 'pointer', padding: '4px 8px',
          }}>
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', borderBottom: '1px solid #1e1e1e',
        }}>
          <button
            onClick={() => setTab('room')}
            style={{
              flex: 1, padding: '12px', background: 'none', border: 'none',
              borderBottom: tab === 'room' ? '2px solid #d4a843' : '2px solid transparent',
              color: tab === 'room' ? '#d4a843' : '#5a5545',
              fontSize: '12px', fontFamily: 'monospace', textTransform: 'uppercase',
              letterSpacing: '1px', cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Room
            </span>
          </button>
          <button
            onClick={() => setTab('direct')}
            style={{
              flex: 1, padding: '12px', background: 'none', border: 'none',
              borderBottom: tab === 'direct' ? '2px solid #5ba3cf' : '2px solid transparent',
              color: tab === 'direct' ? '#5ba3cf' : '#5a5545',
              fontSize: '12px', fontFamily: 'monospace', textTransform: 'uppercase',
              letterSpacing: '1px', cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72" />
              </svg>
              Direct
            </span>
          </button>
        </div>

        {/* Direct message target selector */}
        {tab === 'direct' && (
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid #1e1e1e',
            display: 'flex', gap: '6px', flexWrap: 'wrap',
          }}>
            {otherPlayers.map((p) => (
              <button
                key={p.id}
                onClick={() => setDirectTarget(directTarget === p.id ? null : p.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '5px 10px',
                  backgroundColor: directTarget === p.id ? '#1a2030' : '#111',
                  border: `1px solid ${directTarget === p.id ? '#5ba3cf' : '#1e1e1e'}`,
                  borderRadius: '16px', cursor: 'pointer',
                  fontSize: '11px', color: directTarget === p.id ? '#5ba3cf' : '#6a6050',
                  fontFamily: 'monospace', transition: 'all 0.2s',
                }}
              >
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  backgroundColor: p.isConnected ? p.color : '#4a4540',
                }} />
                {p.name}
              </button>
            ))}
            {otherPlayers.length === 0 && (
              <span style={{ fontSize: '11px', color: '#3a3530', fontStyle: 'italic' }}>
                No other players in session
              </span>
            )}
          </div>
        )}

        {/* Room info for room tab */}
        {tab === 'room' && (
          <div style={{
            padding: '8px 16px', borderBottom: '1px solid #1e1e1e',
            fontSize: '11px', color: '#4a4540', fontFamily: 'monospace',
          }}>
            {roommates.length > 0
              ? `In room with: ${roommates.map((p) => p.name).join(', ')}`
              : 'No one else is in your room'}
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {filteredMessages.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '40px 16px',
              color: '#3a3530', fontSize: '13px', fontStyle: 'italic',
            }}>
              {tab === 'room'
                ? 'Say something to players in your room...'
                : directTarget
                  ? `Start a conversation with ${otherPlayers.find((p) => p.id === directTarget)?.name}...`
                  : 'Select a player to message'}
            </div>
          )}

          {filteredMessages.map((m) => {
            const isMe = m.senderId === myPlayerId;
            return (
              <div key={m.id} style={{
                marginBottom: '10px',
                display: 'flex', flexDirection: 'column',
                alignItems: isMe ? 'flex-end' : 'flex-start',
              }}>
                {/* Sender label */}
                <div style={{
                  fontSize: '10px', fontFamily: 'monospace',
                  color: m.senderColor || '#6a6050',
                  marginBottom: '3px',
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}>
                  {m.mode === 'direct' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#5ba3cf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72" />
                    </svg>
                  )}
                  {isMe ? 'You' : m.senderName}
                  {m.mode === 'direct' && !isMe && (
                    <span style={{ color: '#4a4540' }}> → you</span>
                  )}
                  {m.mode === 'direct' && isMe && m.targetPlayerName && (
                    <span style={{ color: '#4a4540' }}> → {m.targetPlayerName}</span>
                  )}
                </div>

                {/* Bubble */}
                <div style={{
                  maxWidth: '85%', padding: '10px 14px',
                  backgroundColor: isMe
                    ? (m.mode === 'direct' ? '#1a2030' : '#1a1510')
                    : '#151515',
                  border: `1px solid ${m.mode === 'direct' ? '#2a3040' : '#1e1e1e'}`,
                  borderRadius: isMe ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                  color: '#c8c0b4',
                  fontSize: '14px', lineHeight: '1.5',
                  fontFamily: 'Georgia, serif',
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
            disabled={tab === 'direct' && !directTarget}
            placeholder={
              tab === 'room'
                ? (roommates.length > 0 ? 'Talk to nearby players...' : 'No one to hear you...')
                : (directTarget ? `Message ${otherPlayers.find((p) => p.id === directTarget)?.name}...` : 'Select a player first')
            }
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
            disabled={!input.trim() || (tab === 'direct' && !directTarget)}
            style={{
              padding: '10px 16px',
              backgroundColor: !input.trim() ? '#1a1510' : (tab === 'direct' ? '#5ba3cf' : '#d4a843'),
              color: !input.trim() ? '#5a5040' : '#0a0a0a',
              border: 'none', borderRadius: '8px',
              fontSize: '12px', fontWeight: 'bold',
              fontFamily: 'monospace', letterSpacing: '1px',
              textTransform: 'uppercase',
              cursor: !input.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Send
          </button>
        </form>
      </div>
    </>
  );
}
