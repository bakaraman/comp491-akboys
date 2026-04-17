/**
 * test-worldgen.ts — Real OpenAI test for world generation
 *
 * Generates a world with a real OpenAI call, runs validators, dumps
 * the full result to stdout so we can eyeball the quality.
 *
 * Run: npx tsx packages/server/test-scripts/test-worldgen.ts
 */

import 'dotenv/config';
import { generateWorld, validateWorld } from '../src/world/generator.js';

async function main() {
  console.log('━'.repeat(80));
  console.log('TEST 1: International Space Station, 5 players');
  console.log('━'.repeat(80));
  const start = Date.now();
  const result = await generateWorld({
    hostPrompt: 'International Space Station, a scientist has gone missing',
    playerCount: 5,
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nElapsed: ${elapsed}s | usedFallback: ${result.usedFallback} | attempts: ${result.attempts}`);

  console.log('\n--- META ---');
  console.log('title:', result.world.meta.title);
  console.log('setting:', result.world.meta.setting);
  console.log('centralMystery:', result.world.meta.centralMystery);
  console.log('tone:', result.world.meta.tone);
  console.log('visualStylePrompt:', result.world.meta.visualStylePrompt);
  console.log('ambientTrack:', result.world.meta.ambientTrack);

  console.log('\n--- ROOMS ---');
  result.world.rooms.forEach((r) => {
    console.log(`  [${r.id}] ${r.name} — ${r.description.slice(0, 80)}...`);
    const exits = Object.entries(r.exits).filter(([, v]) => v !== null).map(([k, v]) => `${k}→${v}`).join(', ');
    console.log(`    exits: ${exits}`);
  });

  console.log('\n--- NPCS ---');
  result.world.npcs.forEach((n) => {
    console.log(`  [${n.id}] ${n.name} (${n.role}) ${n.isCulprit ? '⚠️ CULPRIT' : ''}`);
    console.log(`    alibi: ${n.alibiClaim.slice(0, 100)}`);
    console.log(`    hidden: ${n.hiddenSecret ? n.hiddenSecret.slice(0, 100) : '(none)'}`);
  });

  console.log('\n--- ITEMS ---');
  result.world.items.forEach((i) => {
    console.log(`  [${i.id}] ${i.name} ${i.isEvidence ? '🔍 EVIDENCE' : ''} ${i.pointsToNpcId ? `→ ${i.pointsToNpcId}` : ''}`);
    if (i.prerequisiteItemIds.length) console.log(`    prereqs: ${i.prerequisiteItemIds.join(', ')}`);
  });

  console.log('\n--- ENTRY SCENES ---');
  result.world.entryScenes.forEach((e, i) => {
    console.log(`  [Player ${i + 1}] room=${e.roomId}`);
    console.log(`    ${e.narrativeHook}`);
  });

  console.log('\n--- OPENING ---');
  console.log(result.world.openingNarration);

  console.log('\n--- SOLUTION ---');
  console.log('culprit:', result.world.solution.culpritNpcId);
  console.log('motive:', result.world.solution.motiveShort);
  console.log('keyEvidence:', result.world.solution.keyEvidenceId);
  console.log('requiredEvidence:', result.world.solution.requiredEvidenceIds);

  console.log('\n--- WHAT REALLY HAPPENED ---');
  console.log(result.world.whatReallyHappened);

  console.log('\n--- VALIDATION ---');
  const v = validateWorld(result.world, 5);
  console.log('valid:', v.valid);
  if (!v.valid) console.log('errors:', v.errors);

  // TEST 2 — 2 player case
  console.log('\n\n' + '━'.repeat(80));
  console.log('TEST 2: Medieval castle, 2 players');
  console.log('━'.repeat(80));
  const start2 = Date.now();
  const result2 = await generateWorld({
    hostPrompt: 'Medieval castle, the king was poisoned at a feast',
    playerCount: 2,
  });
  const elapsed2 = ((Date.now() - start2) / 1000).toFixed(1);
  console.log(`Elapsed: ${elapsed2}s | usedFallback: ${result2.usedFallback} | attempts: ${result2.attempts}`);
  console.log('title:', result2.world.meta.title);
  console.log('rooms:', result2.world.rooms.length);
  console.log('npcs:', result2.world.npcs.length);
  console.log('entryScenes:', result2.world.entryScenes.length);
  const v2 = validateWorld(result2.world, 2);
  console.log('valid:', v2.valid, v2.errors);

  // TEST 3 — 3 player empty prompt (surprise)
  console.log('\n\n' + '━'.repeat(80));
  console.log('TEST 3: Empty prompt (surprise), 3 players');
  console.log('━'.repeat(80));
  const start3 = Date.now();
  const result3 = await generateWorld({
    hostPrompt: '',
    playerCount: 3,
  });
  const elapsed3 = ((Date.now() - start3) / 1000).toFixed(1);
  console.log(`Elapsed: ${elapsed3}s | usedFallback: ${result3.usedFallback}`);
  console.log('title:', result3.world.meta.title);
  console.log('setting:', result3.world.meta.setting);
  console.log('entryScenes:', result3.world.entryScenes.length);

  console.log('\n✅ All tests completed.');
}

main().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
