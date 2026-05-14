/**
 * openai-retry.ts — Single-shot retry wrapper for OpenAI calls.
 *
 * Issue #50: every OpenAI call retries exactly once on RateLimitError or
 * APITimeoutError with 1s → 2s backoff. Everything else propagates so the
 * caller's existing error path (fallback world, fallback conclusion, SSE
 * error event, etc.) still runs.
 */

import OpenAI from 'openai';

const FIRST_RETRY_DELAY_MS = 1000;

function isTransient(err: unknown): boolean {
  return (
    err instanceof OpenAI.RateLimitError
    || err instanceof OpenAI.APIConnectionTimeoutError
    || err instanceof OpenAI.APIConnectionError
  );
}

export async function withOpenAIRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isTransient(err)) throw err;
    const kind = err instanceof OpenAI.RateLimitError ? 'rate-limit' : 'timeout';
    console.warn(`[openai-retry] ${label} ${kind} on attempt 1 — retrying in ${FIRST_RETRY_DELAY_MS}ms`);
    await new Promise((r) => setTimeout(r, FIRST_RETRY_DELAY_MS));
    return await fn();
  }
}
