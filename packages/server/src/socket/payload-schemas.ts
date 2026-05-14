/**
 * payload-schemas.ts — Zod validation schemas for all ClientToServerEvents
 *
 * Every socket payload emitted by the client is validated against one of
 * these schemas before reaching the handler logic.  Invalid payloads are
 * rejected with { code: 'INVALID_PAYLOAD' } and logged at warn level.
 *
 * Supports: socket payload validation (Issue #53)
 *
 * @author AKBOYS Team
 * @since 2026-05-07
 */

import { z } from 'zod';

/* ------------------------------------------------------------------ */
/*  Re-usable primitives                                               */
/* ------------------------------------------------------------------ */

const sessionId = z.string().min(1, 'sessionId required');
const playerId  = z.string().min(1, 'playerId required');

/* ------------------------------------------------------------------ */
/*  ClientToServerEvents schemas                                        */
/* ------------------------------------------------------------------ */

/** Locale primitive — used by player:join (#58) */
const localeSchema = z.enum(['tr', 'en']);

export const PlayerJoinSchema = z.object({
  sessionId,
  playerName: z.string().min(1).max(32),
  /** Optional for backward compat with older clients — defaults to 'tr' server-side. */
  locale: localeSchema.optional(),
});

export const PlayerActionSchema = z.object({
  sessionId,
  playerId,
  message: z.string().min(1).max(500),
});

export const PlayerTypingSchema = z.object({
  sessionId,
  playerId,
  isTyping: z.boolean(),
});

export const PlayerRejoinSchema = z.object({
  sessionId,
  playerId,
});

export const GameStartSchema = z.object({
  sessionId,
  playerId,
});

export const ScenarioSelectSchema = z.object({
  sessionId,
  playerId,
  scenarioId: z.string().min(1),
});

export const ScenarioVoteSchema = z.object({
  sessionId,
  playerId,
  scenarioId: z.string().min(1),
});

export const ScenarioConfirmSchema = z.object({
  sessionId,
  playerId,
  scenarioId: z.string().min(1),
});

export const CommRoomSchema = z.object({
  sessionId,
  playerId,
  content: z.string().min(1).max(1000),
});

export const CommDirectSchema = z.object({
  sessionId,
  playerId,
  targetPlayerId: z.string().min(1),
  content: z.string().min(1).max(1000),
});

export const EvidenceShareSchema = z.object({
  sessionId,
  playerId,
  evidenceId: z.string().min(1),
});

export const PlayerSelectRoleSchema = z.object({
  sessionId,
  playerId,
  role: z.enum(['detective', 'thief', 'doctor', 'journalist']),
});

export const ProposeAccusationSchema = z.object({
  sessionId,
  playerId,
  suspectId: z.string().min(1),
});

export const VoteAccusationSchema = z.object({
  sessionId,
  playerId,
  vote: z.enum(['guilty', 'not_guilty']),
});

export const StoryGenerateSchema = z.object({
  sessionId,
  playerId,
  hostPrompt: z.string().max(1000),
});

/** Spectator join — new in Issue #52
 *
 * #58 follow-up: optional `locale` so the server can flatten the
 * shared history bilingual companion + scenarioTitle into the
 * spectator's preferred language. Older clients that omit it default
 * to 'tr' server-side (no behaviour change).
 */
export const SpectatorJoinSchema = z.object({
  sessionId,
  role: z.literal('spectator'),
  locale: localeSchema.optional(),
});

/* ------------------------------------------------------------------ */
/*  Validate helper                                                     */
/* ------------------------------------------------------------------ */

/**
 * Parse an unknown payload against a schema.
 * Returns { ok: true, data } on success or { ok: false } on failure.
 *
 * @param schema  A Zod schema
 * @param payload The raw socket payload
 * @param event   Event name (for logging)
 */
export function validatePayload<T>(
  schema: z.ZodType<T>,
  payload: unknown,
  event: string,
): { ok: true; data: T } | { ok: false } {
  const result = schema.safeParse(payload);
  if (!result.success) {
    console.warn(
      `[socket:validation] REJECTED event="${event}" errors=${JSON.stringify(result.error.flatten().fieldErrors)} payload=${JSON.stringify(payload)}`,
    );
    return { ok: false };
  }
  return { ok: true, data: result.data };
}
