/**
 * action-batcher.ts — Timer-based action batching for multiplayer
 *
 * Collects player actions over a short window, then fires them
 * as a single batch. This allows the narrator to respond to
 * multiple players in one coherent reply.
 *
 * @author AK Boys Team
 * @since 2026-03-23
 */

import type { PlayerAction } from '@akboys/shared';
import type { SessionStore } from '../store/SessionStore.js';

/* ------------------------------------------------------------------ */
/*  Timing constants                                                   */
/* ------------------------------------------------------------------ */

/** Wait time when only one player has acted (fast response) */
const SINGLE_PLAYER_WINDOW = 1500;

/** Wait time when 2+ players have acted (collect more) */
const MULTI_PLAYER_WINDOW = 4000;

/** Absolute maximum wait from the first action in a batch */
const MAX_WINDOW = 6000;

/** Minimum cooldown between actions from the same player */
export const PLAYER_ACTION_COOLDOWN = 2000;

/* ------------------------------------------------------------------ */
/*  Per-session batch state                                            */
/* ------------------------------------------------------------------ */

interface BatchState {
  timerId: ReturnType<typeof setTimeout> | null;
  firstActionAt: number;       // timestamp of first action in this batch
  uniquePlayers: Set<string>;  // distinct playerIds in this batch
}

/* ------------------------------------------------------------------ */
/*  ActionBatcher                                                      */
/* ------------------------------------------------------------------ */

export class ActionBatcher {
  private batches = new Map<string, BatchState>();
  private store: SessionStore;
  private onBatchFire: (sessionId: string, actions: PlayerAction[]) => void | Promise<void>;

  constructor(
    store: SessionStore,
    onBatchFire: (sessionId: string, actions: PlayerAction[]) => void | Promise<void>,
  ) {
    this.store = store;
    this.onBatchFire = onBatchFire;
  }

  /**
   * Add an action to the session's batch queue.
   * Starts or adjusts the timer as needed.
   * Returns the estimated time remaining (ms) until the batch fires.
   */
  enqueue(sessionId: string, action: PlayerAction): number {
    this.store.queueAction(sessionId, action);

    let batch = this.batches.get(sessionId);

    if (!batch) {
      // First action — start a new batch
      batch = {
        timerId: null,
        firstActionAt: Date.now(),
        uniquePlayers: new Set(),
      };
      this.batches.set(sessionId, batch);
    }

    batch.uniquePlayers.add(action.playerId);

    // Determine delay
    const elapsed = Date.now() - batch.firstActionAt;
    const baseWindow = batch.uniquePlayers.size >= 2
      ? MULTI_PLAYER_WINDOW
      : SINGLE_PLAYER_WINDOW;
    const remaining = Math.max(0, Math.min(baseWindow, MAX_WINDOW - elapsed));

    // Clear existing timer and set a new one with updated delay
    if (batch.timerId !== null) {
      clearTimeout(batch.timerId);
    }

    if (remaining <= 0) {
      // Max window exceeded — fire immediately
      this.fire(sessionId);
    } else {
      batch.timerId = setTimeout(() => this.fire(sessionId), remaining);
    }

    return remaining;
  }

  /** Cancel any pending batch for a session (e.g. session deleted) */
  cancel(sessionId: string): void {
    const batch = this.batches.get(sessionId);
    if (batch?.timerId !== null) {
      clearTimeout(batch!.timerId!);
    }
    this.batches.delete(sessionId);
  }

  /** Check if a session currently has a pending batch */
  hasPending(sessionId: string): boolean {
    return this.batches.has(sessionId);
  }

  /** Get the number of queued actions for a session */
  queueSize(sessionId: string): number {
    const session = this.store.get(sessionId);
    return session?.actionQueue.length ?? 0;
  }

  /* -------------------------------------------------------------- */
  /*  Private                                                        */
  /* -------------------------------------------------------------- */

  private fire(sessionId: string): void {
    // Clean up batch state
    const batch = this.batches.get(sessionId);
    if (batch?.timerId !== null) {
      clearTimeout(batch!.timerId!);
    }
    this.batches.delete(sessionId);

    // Drain the queue
    const actions = this.store.drainActionQueue(sessionId);
    if (actions.length === 0) return;

    console.log(`[batcher] firing batch for session ${sessionId.slice(0, 8)}: ${actions.length} action(s) from ${new Set(actions.map((a) => a.playerName)).size} player(s)`);

    this.onBatchFire(sessionId, actions);
  }
}
