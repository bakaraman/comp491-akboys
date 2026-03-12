/**
 * session/[id]/page.tsx — Game session page
 *
 * Loads a session by UUID from the URL and renders the chat interface.
 * If the session doesn't exist, redirects to home.
 *
 * @author AK Boys Team
 * @since 2026-03-12
 */

'use client';

import React, { useRef, useEffect, useState, useCallback, use } from 'react';
import { ChatMessage } from '@/components/ChatMessage';
import { ChatInput } from '@/components/ChatInput';

const API_BASE = 'http://localhost:3001/api/chat';

const SCENARIO_EMOJI: Record<string, string> = {
  noir: '🕵️',
  haunted: '👻',
  space: '🚀',
  pirate: '🏴‍☠️',
  western: '🤠',
  cyberpunk: '🌃',
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface SessionInfo {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  messages: Message[];
}

async function consumeStream(
  response: Response,
  onChunk: (text: string) => void,
): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'chunk') {
          fullText += event.content;
          onChunk(fullText);
        }
      } catch { /* skip */ }
    }
  }
  return fullText;
}

async function fetchSuggestions(sessionId: string): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE}/suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    const data = await res.json();
    return data.suggestions || [];
  } catch {
    return [];
  }
}

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = use(params);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const r = await fetch(`${API_BASE}/session/${sessionId}`);
        if (!r.ok) throw new Error();
        const data: SessionInfo = await r.json();

        if (cancelled) return;
        setSession(data);

        const visibleMessages = data.messages.filter(
          (m) => m.role !== 'user' || m.content !== 'Start the game. Describe where I am.',
        );

        if (visibleMessages.length > 0) {
          // Session already has history — just show it
          setMessages(visibleMessages);
          fetchSuggestions(sessionId).then(setSuggestions);
        } else {
          // New session — stream the opening narration
          setIsLoading(true);
          setMessages([{ role: 'assistant', content: '' }]);

          const streamRes = await fetch(`${API_BASE}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          });

          await consumeStream(streamRes, (text) => {
            if (!cancelled) setMessages([{ role: 'assistant', content: text }]);
          });

          if (!cancelled) {
            setIsLoading(false);
            fetchSuggestions(sessionId).then(setSuggestions);
          }
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [sessionId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (isLoading) return;

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setIsLoading(true);
    setSuggestions([]);

    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text }),
      });

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      await consumeStream(res, (text) => {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: text };
          return updated;
        });
      });

      fetchSuggestions(sessionId).then(setSuggestions);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'The narrator falls silent...' }]);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, isLoading]);

  if (error) {
    return (
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a',
      }}>
        <p style={{ color: '#6a6050', fontSize: '16px', marginBottom: '24px' }}>
          Session not found
        </p>
        <a href="/" style={{
          padding: '12px 32px', backgroundColor: '#d4a843', color: '#0a0a0a',
          borderRadius: '8px', textDecoration: 'none', fontFamily: 'monospace',
          fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase',
        }}>
          Back to Home
        </a>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', backgroundColor: '#0a0a0a',
      }}>
        <p style={{ color: '#4a4540', fontStyle: 'italic' }}>Loading session...</p>
      </div>
    );
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      backgroundColor: '#0a0a0a',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px', borderBottom: '1px solid #2a2520',
        backgroundColor: '#0d0d0d', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <span style={{
            fontSize: '18px', color: '#d4a843',
            fontFamily: 'Georgia, serif', fontStyle: 'italic',
          }}>
            {SCENARIO_EMOJI[session.scenarioId] || '📖'}{' '}{session.scenarioTitle}
          </span>
          <span style={{
            fontSize: '11px', color: '#4a4540', fontFamily: 'monospace',
            marginLeft: '16px', letterSpacing: '1px',
          }}>
            SESSION {sessionId.slice(0, 8)}
          </span>
        </div>
        <a
          href="/"
          style={{
            padding: '8px 16px', backgroundColor: 'transparent',
            border: '1px solid #2a2520', borderRadius: '6px', color: '#6a6050',
            fontSize: '12px', fontFamily: 'monospace', textDecoration: 'none',
            letterSpacing: '1px', textTransform: 'uppercase',
          }}
        >
          New Game
        </a>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {messages.map((msg, i) => (
          <ChatMessage key={i} role={msg.role} content={msg.content} />
        ))}
        {isLoading && (
          <div style={{ color: '#4a4540', fontStyle: 'italic', fontSize: '14px', padding: '8px 0' }}>
            The narrator contemplates...
          </div>
        )}
      </div>

      {/* Follow-up suggestions */}
      {suggestions.length > 0 && !isLoading && (
        <div style={{ display: 'flex', gap: '8px', padding: '8px 24px', flexWrap: 'wrap' }}>
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => sendMessage(s)}
              style={{
                padding: '8px 16px', backgroundColor: 'transparent',
                border: '1px solid #2a2520', borderRadius: '20px', color: '#b0a080',
                fontSize: '13px', fontFamily: 'Georgia, serif', fontStyle: 'italic',
                cursor: 'pointer', transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#d4a843'; e.currentTarget.style.color = '#d4a843'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2520'; e.currentTarget.style.color = '#b0a080'; }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </div>
  );
}
