/**
 * openai-client.ts — Shared OpenAI client factory with timeout configuration.
 *
 * Issue #50: every OpenAI call must fail fast on hang. We give non-stream
 * calls 60s and stream calls 90s. A second client instance is needed for
 * streams because the SDK applies the timeout to the entire request
 * lifetime, not just to the initial connect.
 */

import OpenAI from 'openai';

const NON_STREAM_TIMEOUT_MS = 60_000;
const STREAM_TIMEOUT_MS = 90_000;

let _nonStream: OpenAI | null = null;
let _stream: OpenAI | null = null;

export function openaiClient(): OpenAI {
  if (!_nonStream) {
    _nonStream = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: NON_STREAM_TIMEOUT_MS,
      maxRetries: 0,
    });
  }
  return _nonStream;
}

export function openaiStreamClient(): OpenAI {
  if (!_stream) {
    _stream = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: STREAM_TIMEOUT_MS,
      maxRetries: 0,
    });
  }
  return _stream;
}
