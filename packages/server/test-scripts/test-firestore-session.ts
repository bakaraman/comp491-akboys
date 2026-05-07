/**
 * test-firestore-session.ts — Firestore session persistence integration test
 *
 * Verifies that a session written by one FirestoreSessionStore instance can be
 * fully rehydrated by a *new* instance (simulating a server restart).
 *
 * Usage:
 *   npm run test:firestore -w packages/server
 *
 * Prerequisites:
 *   - FIREBASE_PROJECT_ID env var must be set (or a .env file in the repo root)
 *   - Application Default Credentials must be configured:
 *       gcloud auth application-default login
 *     or GOOGLE_APPLICATION_CREDENTIALS pointing to a service-account JSON.
 *
 * @author AKBOYS Team
 * @since 2026-05-07
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

import { FirestoreSessionStore } from '../src/store/SessionStore.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    console.error(`  ✗ FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ PASS: ${msg}`);
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* ------------------------------------------------------------------ */
/*  Main test                                                           */
/* ------------------------------------------------------------------ */

async function run(): Promise<void> {
  if (!process.env.FIREBASE_PROJECT_ID) {
    console.error('[test-firestore] FIREBASE_PROJECT_ID env var is required.');
    process.exit(1);
  }

  const testSessionId = `test-session-${Date.now()}`;
  console.log(`\n[test-firestore] Starting test (sessionId=${testSessionId})\n`);

  /* ---- Step 1: Create and populate a session ---- */
  const store1 = new FirestoreSessionStore();
  await store1.hydrate();

  const session = store1.create('noir', 2, undefined, 'foyer');
  // Override the auto-generated id with our deterministic test id
  // (We can't inject the id via create(), so we delete and re-write.)
  // Instead, just work with the assigned id — still a unique test session.
  const sessionId = session.id;

  console.log(`[test-firestore] Created session ${sessionId.slice(0, 8)}`);

  // Add 5 messages
  const messages = [
    { role: 'user' as const,      content: 'I look around the foyer.',     timestamp: Date.now() },
    { role: 'assistant' as const, content: 'The foyer is dimly lit.',       timestamp: Date.now() + 1 },
    { role: 'user' as const,      content: 'I examine the painting.',       timestamp: Date.now() + 2 },
    { role: 'assistant' as const, content: 'A portrait of a stern man.',    timestamp: Date.now() + 3 },
    { role: 'user' as const,      content: 'I head to the library.',        timestamp: Date.now() + 4 },
  ];
  for (const msg of messages) {
    store1.addMessage(sessionId, msg);
  }

  // Set a world stub
  const world = {
    meta: { title: 'Test Manor', setting: 'Victorian England', genre: 'noir', tone: 'dark' },
    openingNarration: 'It was a dark and stormy night...',
    rooms: [
      { id: 'foyer', name: 'Foyer', description: 'The entrance.', exits: { north: 'library' }, items: [], npcs: [] },
      { id: 'library', name: 'Library', description: 'Walls of books.', exits: { south: 'foyer' }, items: [], npcs: [] },
    ],
    npcs: [
      { id: 'butler', name: 'Reginald', role: 'butler', description: 'Stiff upper lip.', roomId: 'foyer',
        backstory: '', alibi: '', isCulprit: false, dialogue: [] },
    ],
    items: [],
    entryScenes: [{ roomId: 'foyer', narrativeHook: 'You arrive at the manor.' }],
    solution: { culpritNpcId: 'butler', keyEvidenceId: 'candlestick', motive: 'greed', method: 'blunt force' },
  } as never;
  store1.setWorld(sessionId, world);

  // Set a reconstruction stub
  const reconstruction = {
    title: 'What Really Happened',
    events: [{ turn: 1, time: '23:00', roomId: 'foyer', roomName: 'Foyer', actorNpcId: 'butler',
               actorName: 'Reginald', actorRole: 'butler', description: 'Butler waited.', isCulpritAction: false }],
    conclusion: 'The butler did it.',
    generatedAt: Date.now(),
  };
  store1.setReconstruction(sessionId, reconstruction);

  // Explicitly sync to Firestore
  await store1.sync(sessionId);
  console.log('[test-firestore] Session synced to Firestore\n');

  /* ---- Step 2: New store instance — simulates server restart ---- */
  const store2 = new FirestoreSessionStore();
  await store2.hydrate();
  console.log('[test-firestore] New store hydrated (restart simulation)\n');

  const rehydrated = store2.get(sessionId);

  /* ---- Assertions ---- */
  assert(rehydrated !== undefined, 'Rehydrated session exists');

  assert(rehydrated!.id === sessionId, `Session ID matches (${sessionId.slice(0, 8)})`);
  assert(rehydrated!.scenarioId === 'noir', 'scenarioId preserved');
  assert(rehydrated!.history.length === messages.length, `history has ${messages.length} messages`);

  for (let i = 0; i < messages.length; i++) {
    assert(
      rehydrated!.history[i].content === messages[i].content,
      `history[${i}].content matches`,
    );
    assert(
      rehydrated!.history[i].role === messages[i].role,
      `history[${i}].role matches`,
    );
  }

  assert(rehydrated!.world !== null, 'world is present');
  assert(rehydrated!.world?.meta.title === 'Test Manor', 'world.meta.title matches');
  assert(rehydrated!.world?.rooms.length === 2, 'world.rooms length matches');

  assert(rehydrated!.reconstruction !== null, 'reconstruction is present');
  assert(rehydrated!.reconstruction?.conclusion === reconstruction.conclusion, 'reconstruction.conclusion matches');
  assert(rehydrated!.reconstruction?.events.length === 1, 'reconstruction.events length matches');

  assert(
    deepEqual(
      JSON.parse(JSON.stringify(store1.get(sessionId)?.reconstruction)),
      JSON.parse(JSON.stringify(rehydrated!.reconstruction)),
    ),
    'reconstruction byte-for-byte match (JSON)',
  );

  /* ---- Cleanup ---- */
  store2.delete(sessionId);
  await store2.sync(sessionId);
  console.log('\n[test-firestore] ✓ Cleanup: test session deleted from Firestore');

  // Verify deletion
  const store3 = new FirestoreSessionStore();
  await store3.hydrate();
  assert(store3.get(sessionId) === undefined, 'Session no longer exists after deletion');

  console.log('\n[test-firestore] ✅ All assertions passed!\n');
  process.exit(0);
}

run().catch((err) => {
  console.error('[test-firestore] Unexpected error:', err);
  process.exit(1);
});
