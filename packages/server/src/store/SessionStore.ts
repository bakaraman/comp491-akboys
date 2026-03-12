/**
 * SessionStore.ts — In-memory session management
 *
 * Defines the SessionData and SessionStore interfaces together with a
 * concrete MemorySessionStore implementation backed by a Map.
 *
 * @author AK Boys Team
 * @since 2026-03-12
 */

import { v4 as uuidv4 } from 'uuid';
import type { ChatMessage } from '@akboys/shared';

/* ------------------------------------------------------------------ */
/*  Interfaces                                                        */
/* ------------------------------------------------------------------ */

/** Data held for a single game session */
export interface SessionData {
  id: string;
  scenarioId: string;
  history: ChatMessage[];
  createdAt: number;
}

/** Contract every session store must satisfy */
export interface SessionStore {
  create(scenarioId: string): SessionData;
  get(id: string): SessionData | undefined;
  addMessage(id: string, msg: ChatMessage): void;
  delete(id: string): void;
}

/* ------------------------------------------------------------------ */
/*  Implementation                                                    */
/* ------------------------------------------------------------------ */

/** Simple in-memory session store using a Map */
export class MemorySessionStore implements SessionStore {
  private sessions: Map<string, SessionData> = new Map();

  create(scenarioId: string): SessionData {
    const session: SessionData = {
      id: uuidv4(),
      scenarioId,
      history: [],
      createdAt: Date.now(),
    };

    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): SessionData | undefined {
    return this.sessions.get(id);
  }

  addMessage(id: string, msg: ChatMessage): void {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }
    session.history.push(msg);
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }
}
