/**
 * page.tsx — Main game page
 *
 * The primary UI: a noir-themed chat interface where the player
 * interacts with the AI narrator. Shows a start screen initially,
 * then transitions to the game chat.
 *
 * @author AK Boys Team
 * @since 2026-03-12
 */

'use client';

import React, { useRef, useEffect } from 'react';
import { useGame } from '@/hooks/useGame';
import { ChatMessage } from '@/components/ChatMessage';
import { ChatInput } from '@/components/ChatInput';

export default function GamePage() {
  const { messages, isLoading, sessionId, startNewGame, sendMessage } = useGame();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  /* Start screen — shown before a game session begins */
  if (!sessionId) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0a0a0a',
        padding: '24px',
      }}>
        <div style={{
          textAlign: 'center',
          maxWidth: '500px',
        }}>
          <h1 style={{
            fontSize: '42px',
            color: '#d4a843',
            fontFamily: 'Georgia, serif',
            fontWeight: 'normal',
            fontStyle: 'italic',
            marginBottom: '8px',
          }}>
            The Velvet Shadow
          </h1>
          <p style={{
            fontSize: '14px',
            color: '#6a6050',
            fontFamily: 'monospace',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            marginBottom: '32px',
          }}>
            A Noir Detective Mystery
          </p>
          <p style={{
            fontSize: '16px',
            color: '#9a9080',
            lineHeight: '1.8',
            marginBottom: '40px',
          }}>
            A jazz singer has vanished from The Velvet Lounge.
            The rain never stops, the whiskey is cheap, and everyone
            has something to hide. You are the detective.
          </p>
          <button
            onClick={startNewGame}
            disabled={isLoading}
            style={{
              padding: '16px 48px',
              backgroundColor: isLoading ? '#2a2010' : '#d4a843',
              color: isLoading ? '#5a5040' : '#0a0a0a',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              fontFamily: 'monospace',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {isLoading ? 'Starting...' : 'Begin Investigation'}
          </button>
          <p style={{
            marginTop: '48px',
            fontSize: '12px',
            color: '#3a3530',
            fontFamily: 'monospace',
          }}>
            COMP 491 — AK Boys — Spring 2026
          </p>
        </div>
      </div>
    );
  }

  /* Game chat screen */
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#0a0a0a',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid #2a2520',
        backgroundColor: '#0d0d0d',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <span style={{
            fontSize: '18px',
            color: '#d4a843',
            fontFamily: 'Georgia, serif',
            fontStyle: 'italic',
          }}>
            The Velvet Shadow
          </span>
          <span style={{
            fontSize: '11px',
            color: '#4a4540',
            fontFamily: 'monospace',
            marginLeft: '16px',
            letterSpacing: '1px',
          }}>
            SESSION {sessionId.slice(0, 8)}
          </span>
        </div>
        <button
          onClick={startNewGame}
          style={{
            padding: '8px 16px',
            backgroundColor: 'transparent',
            border: '1px solid #2a2520',
            borderRadius: '6px',
            color: '#6a6050',
            fontSize: '12px',
            fontFamily: 'monospace',
            cursor: 'pointer',
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}
        >
          New Game
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
        }}
      >
        {messages.map((msg, i) => (
          <ChatMessage key={i} role={msg.role} content={msg.content} />
        ))}
        {isLoading && (
          <div style={{
            color: '#4a4540',
            fontStyle: 'italic',
            fontSize: '14px',
            padding: '8px 0',
          }}>
            The narrator contemplates...
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </div>
  );
}
