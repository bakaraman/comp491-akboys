/**
 * useGame.ts — Custom hook for game state and API communication
 *
 * Manages the chat history, session ID, loading state,
 * and API calls to the backend narrator endpoint.
 *
 * @author AK Boys Team
 * @since 2026-03-12
 */

'use client';

import { useState, useCallback } from 'react';

const API_BASE = 'http://localhost:3001/api/chat';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface UseGameReturn {
  messages: Message[];
  isLoading: boolean;
  sessionId: string | null;
  startNewGame: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
}

export function useGame(): UseGameReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const startNewGame = useCallback(async () => {
    setIsLoading(true);
    setMessages([]);

    try {
      const res = await fetch(`${API_BASE}/new`, { method: 'POST' });
      const data = await res.json();

      setSessionId(data.sessionId);
      setMessages([{ role: 'assistant', content: data.narrative }]);
    } catch (err) {
      console.error('Failed to start game:', err);
      setMessages([{ role: 'assistant', content: 'Failed to connect to the narrator. Is the server running?' }]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!sessionId || isLoading) return;

    const userMsg: Message = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const data = await res.json();

      setMessages((prev) => [...prev, { role: 'assistant', content: data.narrative }]);
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessages((prev) => [...prev, { role: 'assistant', content: 'The narrator falls silent...' }]);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, isLoading]);

  return { messages, isLoading, sessionId, startNewGame, sendMessage };
}
