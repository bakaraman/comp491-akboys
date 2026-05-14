/**
 * test-usage-e2e.ts — End-to-end usage logger test against a real OpenAI call.
 *
 * Calls `suggestFollowUps` (gpt-5-nano, minimal reasoning — pennies per call)
 * and confirms a `[openai-usage]` log line is produced with non-zero tokens.
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

import { suggestFollowUps } from '../src/middleware/openai.js';

async function run(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY required.');
    process.exit(1);
  }

  console.log('▶ calling suggestFollowUps (real OpenAI)...');
  const t0 = Date.now();
  const suggestions = await suggestFollowUps(
    'Salonun ortasında durdun. Şömineden hâlâ tütüyor.',
    {
      roomName: 'Salon',
      itemsInRoom: [{ name: 'şömine' }, { name: 'masa' }],
      npcsInRoom: [],
      adjacentRoomNames: ['Mutfak'],
    },
    'e2e-test-session',
  );
  console.log(`  ✓ got ${suggestions.length} suggestion(s) in ${Date.now() - t0}ms`);
  suggestions.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));

  // Flush window for fire-and-forget sinks.
  await new Promise((r) => setTimeout(r, 800));

  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const file = resolve(__dirname, `../logs/openai-usage-${y}-${m}-${day}.jsonl`);
  const body = await fs.readFile(file, 'utf8');
  const lines = body.trim().split('\n').filter(Boolean);
  const last = JSON.parse(lines[lines.length - 1]);
  console.log(`  ✓ last JSONL line:`, last);

  if (last.purpose !== 'suggestion') {
    console.error(`  ✗ expected purpose=suggestion, got ${last.purpose}`);
    process.exit(1);
  }
  if (!last.success) {
    console.error(`  ✗ call was logged as failure`);
    process.exit(1);
  }
  if (last.inputTokens === 0 && last.outputTokens === 0) {
    console.error(`  ✗ no token usage recorded`);
    process.exit(1);
  }
  console.log('▶ all checks passed.');
}

run().catch((err) => {
  console.error('test failed:', err);
  process.exit(1);
});
