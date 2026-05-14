/**
 * usage-logger.ts — Per-call OpenAI usage + cost recorder.
 *
 * Issue #51 + dashboard scope expansion: every OpenAI call routes through
 * `logOpenAIUsage` which writes to three sinks (each is fire-and-forget,
 * so a sink failing never blocks the model call):
 *
 *   1. stdout — `[openai-usage] ...` structured line for grep
 *   2. JSONL  — `logs/openai-usage-YYYY-MM-DD.jsonl` (UTC, append mode)
 *   3. Firestore — `openai_usage` collection (one doc per call) so the
 *      web dashboard at /admin/usage can subscribe in real time
 *
 * Rates table is intentionally approximate — useful for an at-a-glance
 * "are we burning $50/hr or $5/hr?" check, not invoicing.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { Firestore } from 'firebase-admin/firestore';

export type UsagePurpose =
  | 'narrator'
  | 'narrator-structured'
  | 'narrator-nonstream'
  | 'suggestion'
  | 'worldgen'
  | 'reconstruction-events'
  | 'reconstruction-conclusion'
  | 'finale'
  | 'tts'
  | 'image';

export interface UsageMeta {
  model: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  sessionId?: string;
  purpose: UsagePurpose;
  /** Wall-clock duration of the call in ms. */
  durationMs?: number;
  /** True if the call returned, false if it threw. */
  success?: boolean;
  /** Short error tag (e.g. "rate-limit") when success=false. */
  errorTag?: string;
}

interface PriceRow {
  inputPer1k: number;
  outputPer1k: number;
}

/**
 * Approximate USD per 1k tokens — updated 2026-05. We don't use these for
 * any guardrail, only the dashboard cost display. If a model isn't found
 * we attribute zero cost rather than guess.
 */
const RATES: Record<string, PriceRow> = {
  'gpt-5.4': { inputPer1k: 0.005, outputPer1k: 0.020 },
  'gpt-5-nano': { inputPer1k: 0.0001, outputPer1k: 0.0004 },
  'gpt-4o': { inputPer1k: 0.005, outputPer1k: 0.015 },
  'gpt-4o-mini': { inputPer1k: 0.00015, outputPer1k: 0.0006 },
};

const IMAGE_COST_USD = 0.04;
const TTS_COST_PER_1K_CHARS = 0.015;

function estimateCostUsd(meta: UsageMeta): number {
  if (meta.purpose === 'image') return IMAGE_COST_USD;
  if (meta.purpose === 'tts') {
    return (meta.inputTokens / 1000) * TTS_COST_PER_1K_CHARS;
  }
  const row = RATES[meta.model];
  if (!row) return 0;
  const out = meta.outputTokens + (meta.reasoningTokens ?? 0);
  return (meta.inputTokens / 1000) * row.inputPer1k + (out / 1000) * row.outputPer1k;
}

/* ------------------------------------------------------------------ */
/*  Sink: JSONL file (rolls daily on UTC)                              */
/* ------------------------------------------------------------------ */

const LOG_DIR = path.resolve(process.cwd(), 'logs');
let _logDirReady = false;

async function ensureLogDir(): Promise<void> {
  if (_logDirReady) return;
  await fs.mkdir(LOG_DIR, { recursive: true });
  _logDirReady = true;
}

function todayFileName(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `openai-usage-${y}-${m}-${day}.jsonl`;
}

async function appendJsonl(line: Record<string, unknown>): Promise<void> {
  try {
    await ensureLogDir();
    const file = path.join(LOG_DIR, todayFileName());
    await fs.appendFile(file, JSON.stringify(line) + '\n', 'utf8');
  } catch (err) {
    console.warn('[openai-usage] jsonl sink failed:', (err as Error).message);
  }
}

/* ------------------------------------------------------------------ */
/*  Sink: Firestore (only when admin SDK is configured)                */
/* ------------------------------------------------------------------ */

let _firestoreReady = false;
let _firestore: Firestore | null = null;
const COLLECTION = 'openai_usage';

async function getFs(): Promise<Firestore | null> {
  if (_firestoreReady) return _firestore;
  _firestoreReady = true;
  if (!process.env.FIREBASE_PROJECT_ID) return null;
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    // SessionStore already calls firestore.settings() at boot; calling it
    // again would throw "Firestore has already been started".
    _firestore = getFirestore();
  } catch (err) {
    console.warn('[openai-usage] firestore sink unavailable:', (err as Error).message);
    _firestore = null;
  }
  return _firestore;
}

async function writeFirestore(row: Record<string, unknown>): Promise<void> {
  const fsdb = await getFs();
  if (!fsdb) return;
  try {
    await fsdb.collection(COLLECTION).add(row);
  } catch (err) {
    console.warn('[openai-usage] firestore write failed:', (err as Error).message);
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

export function logOpenAIUsage(meta: UsageMeta): void {
  const ts = Date.now();
  const cost = estimateCostUsd(meta);
  const reasoning = meta.reasoningTokens ?? 0;

  console.log(
    `[openai-usage] model=${meta.model} purpose=${meta.purpose} in=${meta.inputTokens} out=${meta.outputTokens} reason=${reasoning} cost=$${cost.toFixed(4)} dur=${meta.durationMs ?? 0}ms session=${meta.sessionId ?? '-'} ok=${meta.success !== false}${meta.errorTag ? ' err=' + meta.errorTag : ''}`,
  );

  const row = {
    timestamp: ts,
    model: meta.model,
    purpose: meta.purpose,
    inputTokens: meta.inputTokens,
    outputTokens: meta.outputTokens,
    reasoningTokens: reasoning,
    totalTokens: meta.inputTokens + meta.outputTokens + reasoning,
    estimatedCostUsd: Number(cost.toFixed(6)),
    durationMs: meta.durationMs ?? 0,
    sessionId: meta.sessionId ?? null,
    success: meta.success !== false,
    errorTag: meta.errorTag ?? null,
  };

  void appendJsonl(row);
  void writeFirestore(row);
}

/**
 * Pull `usage` off a non-streaming chat completion response and forward
 * to the logger. Tolerates missing fields — older models / image calls
 * don't return token counts.
 */
export function logFromCompletion(
  completion: { usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } } | null | undefined } | null | undefined,
  partial: Omit<UsageMeta, 'inputTokens' | 'outputTokens' | 'reasoningTokens'>,
): void {
  const u = completion?.usage;
  logOpenAIUsage({
    ...partial,
    inputTokens: u?.prompt_tokens ?? 0,
    outputTokens: u?.completion_tokens ?? 0,
    reasoningTokens: u?.completion_tokens_details?.reasoning_tokens,
  });
}
