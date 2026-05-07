/**
 * PlayerSidebar.tsx — Slide-out panel showing all players and their state
 *
 * Displays player name, color, current room, inventory, and online status.
 * Slides in from the right with a smooth animation.
 *
 * @author AKBOYS Team
 * @since 2026-03-24
 */

'use client';

import React, { useEffect } from 'react';
import type { PlayerDataDTO } from '@/types/shared';

interface PlayerSidebarProps {
  players: PlayerDataDTO[];
  myPlayerId: string | null;
  isOpen: boolean;
  onClose: () => void;
  /** Player ids who are currently transmitting voice (#48). */
  talkingPlayerIds?: Set<string>;
  /** True when the local user is holding V to transmit (#48). */
  selfTransmitting?: boolean;
}

export function PlayerSidebar({
  players,
  myPlayerId,
  isOpen,
  onClose,
  talkingPlayerIds,
  selfTransmitting,
}: PlayerSidebarProps) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 40,
            transition: 'opacity 0.3s ease',
          }}
        />
      )}

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: '320px', maxWidth: '85vw',
        backgroundColor: '#0d0d0d',
        borderLeft: '1px solid #2a2520',
        zIndex: 50,
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #2a2520',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{
            fontSize: '11px', color: '#6a6050',
            fontFamily: 'monospace', textTransform: 'uppercase',
            letterSpacing: '2px',
          }}>
            Players ({players.length})
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none',
              color: '#6a6050', fontSize: '18px',
              cursor: 'pointer', padding: '4px 8px',
              borderRadius: '4px',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#e8e0d4'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#6a6050'; }}
          >
            ✕
          </button>
        </div>

        {/* Player list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {players.map((player) => {
            const isMe = player.id === myPlayerId;
            const isTalking = isMe
              ? Boolean(selfTransmitting)
              : Boolean(talkingPlayerIds?.has(player.id));
            return (
              <div
                key={player.id}
                style={{
                  padding: '16px',
                  backgroundColor: isMe ? '#1a1510' : '#111',
                  border: `1px solid ${isMe ? '#3a3020' : '#1e1e1e'}`,
                  borderRadius: '10px',
                  marginBottom: '10px',
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Player name row */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  marginBottom: '12px',
                }}>
                  {/* Avatar circle (with green ring when transmitting #48) */}
                  <div style={{
                    position: 'relative',
                    width: '36px', height: '36px',
                    flexShrink: 0,
                  }}>
                    {isTalking && (
                      <span
                        aria-hidden
                        style={{
                          position: 'absolute',
                          inset: '-4px',
                          borderRadius: '50%',
                          border: '2px solid #4ade80',
                          boxShadow: '0 0 8px rgba(74,222,128,0.6)',
                          animation: 'voice-talking-pulse 1s ease-in-out infinite',
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '50%',
                      backgroundColor: player.isConnected ? player.color : '#3a3530',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '15px', fontWeight: 'bold', color: '#0a0a0a',
                      border: isMe ? '2px solid #e8e0d4' : '2px solid transparent',
                      opacity: player.isConnected ? 1 : 0.5,
                    }}>
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '14px', fontWeight: 'bold',
                      color: player.color,
                      fontFamily: 'Georgia, serif',
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}>
                      {player.name}
                      {isMe && (
                        <span style={{
                          fontSize: '9px', color: '#6a6050',
                          fontFamily: 'monospace', textTransform: 'uppercase',
                          letterSpacing: '1px',
                          padding: '2px 6px',
                          backgroundColor: '#1a1a1a',
                          borderRadius: '4px',
                        }}>
                          you
                        </span>
                      )}
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: player.isConnected ? '#4a8a4a' : '#8a4a4a',
                      fontFamily: 'monospace',
                      display: 'flex', alignItems: 'center', gap: '4px',
                      marginTop: '2px',
                    }}>
                      <span style={{
                        width: '6px', height: '6px', borderRadius: '50%',
                        backgroundColor: player.isConnected ? '#4a8a4a' : '#8a4a4a',
                        display: 'inline-block',
                      }} />
                      {player.isConnected ? 'Online' : 'Offline'}
                    </div>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes voice-talking-pulse {
          0%, 100% { opacity: 0.65; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.06); }
        }
      `}</style>
    </>
  );
}
