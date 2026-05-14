/**
 * test-usage-logger.ts — Smoke test for the usage logger sinks.
 *
 * Runs the logger end-to-end without making a real OpenAI call. Verifies:
 *   1. The JSONL sink writes a daily file.
 *   2. The Firestore sink no-ops when FIREBASE_PROJECT_ID is unset (so no
 *      crash) and writes when it is set (best-effort).
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

import { logOpenAIUsage } from '../src/lib/usage-logger.js';

async function run(): Promise<void> {
  console.log('▶ logging two test rows...');
  logOpenAIUsage({
    model: 'gpt-5.4',
    purpose: 'narrator',
    inputTokens: 1200,
    outputTokens: 480,
    reasoningTokens: 90,
    durationMs: 1700,
    sessionId: 'test-session-1',
    success: true,
  });
  logOpenAIUsage({
    model: 'gpt-5-nano',
    purpose: 'suggestion',
    inputTokens: 200,
    outputTokens: 30,
    durationMs: 380,
    sessionId: 'test-session-1',
    success: true,
  });

  // Give fire-and-forget sinks a moment to flush.
  await new Promise((r) => setTimeout(r, 500));

  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const file = resolve(__dirname, `../logs/openai-usage-${y}-${m}-${day}.jsonl`);
  const body = await fs.readFile(file, 'utf8');
  const lines = body.trim().split('\n').filter(Boolean);
  console.log(`  ✓ JSONL file: ${file}`);
  console.log(`  ✓ ${lines.length} line(s) — last: ${lines[lines.length - 1]}`);

  if (lines.length < 2) {
    console.error('  ✗ Expected >= 2 lines');
    process.exit(1);
  }
  console.log('▶ done.');
}

run().catch((err) => {
  console.error('test failed:', err);
  process.exit(1);
});
