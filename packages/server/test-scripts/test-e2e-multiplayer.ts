/**
 * test-e2e-multiplayer.ts — End-to-end multiplayer playthrough via real socket.io-client
 *
 * Spins up the server in-process (or uses existing running server on :3001),
 * connects 3 players, triggers story:generate, plays through to accusation,
 * and verifies the full flow.
 *
 * Run: npx tsx packages/server/test-scripts/test-e2e-multiplayer.ts
 */

import 'dotenv/config';
import { io, Socket } from 'socket.io-client';

const SERVER = process.env.SERVER_URL ?? 'http://localhost:3001';

function log(prefix: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${prefix}] ${msg}`);
}

async function createSession(maxPlayers: number): Promise<{ sessionId: string; roomCode: string }> {
  const r = await fetch(`${SERVER}/api/chat/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'multiplayer', maxPlayers }),
  });
  if (!r.ok) throw new Error(`new session failed: ${await r.text()}`);
  const data = await r.json();
  return { sessionId: data.sessionId, roomCode: data.roomCode };
}

interface PlayerClient {
  name: string;
  socket: Socket;
  playerId: string;
  sessionId: string;
  receivedNarratorDone: string[];
  receivedStoryReady: boolean;
  receivedImageReady: number;
  receivedGameOver: { status: string; endReason: string; summary: string } | null;
  activeVote: { proposerName: string; suspectName: string } | null;
  currentRoom: string;
  inventory: string[];
}

async function connectPlayer(sessionId: string, name: string): Promise<PlayerClient> {
  const client: PlayerClient = {
    name,
    socket: io(SERVER, { transports: ['websocket'], autoConnect: false }),
    playerId: '',
    sessionId,
    receivedNarratorDone: [],
    receivedStoryReady: false,
    receivedImageReady: 0,
    receivedGameOver: null,
    activeVote: null,
    currentRoom: '',
    inventory: [],
  };

  client.socket.on('narrator:done', (d: { fullText: string; targetPlayerId?: string }) => {
    if (!d.targetPlayerId || d.targetPlayerId === client.playerId) {
      client.receivedNarratorDone.push(d.fullText.slice(0, 80));
      log(name, `narrator:done ${d.fullText.slice(0, 80)}...`);
    }
  });

  client.socket.on('story:status', (d: { phase: string; message?: string }) => {
    log(name, `story:status phase=${d.phase} msg=${d.message ?? ''}`);
  });

  client.socket.on('story:ready', (_d: unknown) => {
    client.receivedStoryReady = true;
    log(name, `story:ready received`);
  });

  client.socket.on('story:image-ready', (d: { kind: string; id: string }) => {
    client.receivedImageReady++;
    log(name, `story:image-ready #${client.receivedImageReady} kind=${d.kind} id=${d.id}`);
  });

  client.socket.on('accusation:vote-started', (d: { proposerName: string; suspectName: string }) => {
    client.activeVote = { proposerName: d.proposerName, suspectName: d.suspectName };
    log(name, `accusation:vote-started by ${d.proposerName} → ${d.suspectName}`);
  });

  client.socket.on('accusation:vote-result', (d: { result: string; isCorrect?: boolean; summary?: string }) => {
    log(name, `accusation:vote-result result=${d.result} isCorrect=${d.isCorrect} summary=${d.summary ?? ''}`);
  });

  client.socket.on('session:gameover', (d: { status: string; endReason: string; summary: string }) => {
    client.receivedGameOver = d;
    log(name, `session:gameover status=${d.status} endReason=${d.endReason}`);
  });

  // Diagnostic: log ANY inbound event name
  client.socket.onAny((evt: string) => {
    log(name, `📡 event=${evt}`);
  });

  client.socket.on('players:updated', (d: { players: Array<{ id: string; currentRoomId: string; inventory: string[] }> }) => {
    const me = d.players.find((p) => p.id === client.playerId);
    if (me) {
      if (me.currentRoomId !== client.currentRoom) {
        client.currentRoom = me.currentRoomId;
        log(name, `moved to room: ${me.currentRoomId}`);
      }
      if (me.inventory.length !== client.inventory.length) {
        client.inventory = [...me.inventory];
        log(name, `inventory: [${client.inventory.join(', ')}]`);
      }
    }
  });

  await new Promise<void>((resolve) => {
    client.socket.once('connect', () => resolve());
    client.socket.connect();
  });

  // Join session
  const joinResp = await new Promise<{ success: boolean; playerId?: string; error?: string }>((resolve) => {
    client.socket.emit('player:join', { sessionId, playerName: name }, (resp: { success: boolean; playerId?: string; error?: string }) => {
      resolve(resp);
    });
  });

  if (!joinResp.success || !joinResp.playerId) {
    throw new Error(`join failed for ${name}: ${joinResp.error}`);
  }
  client.playerId = joinResp.playerId;
  log(name, `joined as ${client.playerId.slice(0, 8)}`);

  return client;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(cond: () => boolean, timeoutMs: number, label: string): Promise<boolean> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      log('WAIT', `TIMEOUT: ${label} after ${timeoutMs}ms`);
      return false;
    }
    await sleep(300);
  }
  log('WAIT', `${label} ok (${Date.now() - start}ms)`);
  return true;
}

async function runScenario(playerCount: number, hostPrompt: string) {
  console.log('\n' + '═'.repeat(80));
  console.log(`E2E TEST: ${playerCount} players, prompt="${hostPrompt}"`);
  console.log('═'.repeat(80) + '\n');

  const { sessionId, roomCode } = await createSession(playerCount);
  log('SETUP', `session=${sessionId.slice(0, 8)} room=${roomCode}`);

  const names = ['Alice', 'Bob', 'Charlie', 'Dave', 'Eve', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy'].slice(0, playerCount);
  const clients: PlayerClient[] = [];
  for (const name of names) {
    const c = await connectPlayer(sessionId, name);
    clients.push(c);
  }

  const host = clients[0];
  log('SETUP', `${clients.length} players joined`);

  // Host triggers story generation
  const genResp = await new Promise<{ success: boolean; error?: string }>((resolve) => {
    host.socket.emit('story:generate', {
      sessionId,
      playerId: host.playerId,
      hostPrompt,
    }, (resp: { success: boolean; error?: string }) => resolve(resp));
  });
  if (!genResp.success) {
    throw new Error(`story:generate failed: ${genResp.error}`);
  }
  log('SETUP', `story:generate acked by server`);

  // Wait for story:ready on all clients
  const storyReady = await waitFor(
    () => clients.every((c) => c.receivedStoryReady),
    180_000,
    'story:ready on all clients',
  );
  if (!storyReady) throw new Error('story:ready timeout');

  // Host starts game
  await sleep(500);
  const startResp = await new Promise<{ success: boolean; error?: string }>((resolve) => {
    host.socket.emit('game:start', { sessionId, playerId: host.playerId }, (resp: { success: boolean; error?: string }) => resolve(resp));
  });
  if (!startResp.success) throw new Error(`game:start failed: ${startResp.error}`);
  log('SETUP', `game:start acked`);

  // Wait for each client to receive their entry scene (narrator:done)
  const entriesOk = await waitFor(
    () => clients.every((c) => c.receivedNarratorDone.length > 0),
    20_000,
    'entry scene narrator:done for each player',
  );
  if (!entriesOk) log('WARN', 'not all players received entry scene');

  log('STAGE', `─── Each player performs 2 actions ───`);

  // Each player performs 2 actions
  for (let round = 0; round < 2; round++) {
    for (const c of clients) {
      const prevCount = c.receivedNarratorDone.length;
      const action = round === 0 ? 'etrafıma bak' : 'bir ipucu ara';
      log(c.name, `sending action: "${action}"`);
      c.socket.emit('player:action', {
        sessionId,
        playerId: c.playerId,
        message: action,
      });
      // Wait for response (up to 60s)
      const got = await waitFor(
        () => c.receivedNarratorDone.length > prevCount,
        60_000,
        `${c.name} narrator response`,
      );
      if (!got) log('WARN', `${c.name} did not get response`);
      await sleep(500);
    }
  }

  log('STAGE', `─── Host proposes accusation ───`);

  // Host proposes accusation against SOME npc — we fetch session to find one
  const sessRes = await fetch(`${SERVER}/api/chat/session/${sessionId}`);
  const sessData = await sessRes.json();
  const firstNpcId = sessData.scenarioMeta?.npcs?.[0]?.id;
  if (!firstNpcId) { log('WARN', 'no NPC found in session scenarioMeta'); return; }
  log('SETUP', `proposing accusation against ${firstNpcId}`);

  const proposeResp = await new Promise<{ success: boolean; error?: string }>((resolve) => {
    host.socket.emit('player:propose-accusation', {
      sessionId,
      playerId: host.playerId,
      suspectId: firstNpcId,
    }, (resp: { success: boolean; error?: string }) => resolve(resp));
  });
  log('SETUP', `accusation proposed: ${proposeResp.success} ${proposeResp.error ?? ''}`);

  await waitFor(() => clients.every((c) => c.activeVote !== null), 10_000, 'all clients received vote-started');

  // Every player votes GUILTY (unanimous)
  for (const c of clients) {
    await new Promise<void>((resolve) => {
      c.socket.emit('player:vote-accusation', {
        sessionId,
        playerId: c.playerId,
        vote: 'guilty',
      }, (_r: unknown) => resolve());
    });
    log(c.name, `voted guilty`);
    await sleep(200);
  }

  // Wait for gameover
  await waitFor(() => clients.every((c) => c.receivedGameOver !== null), 15_000, 'all clients got session:gameover');

  const host_go = host.receivedGameOver;
  if (host_go) {
    log('RESULT', `Game over: status=${host_go.status}, endReason=${host_go.endReason}`);
    log('RESULT', `Summary: ${host_go.summary}`);
  }

  // Disconnect all
  for (const c of clients) c.socket.disconnect();
  log('TEARDOWN', 'disconnected');
}

async function main() {
  await runScenario(3, 'International Space Station, a scientist is missing');
  // Optional: try a 5-player run too
  if (process.env.RUN_5P === '1') {
    await runScenario(5, 'Velvet Shadow, 1920s Chicago, missing jazz singer');
  }
  console.log('\n✅ E2E test completed.');
}

main().catch((err) => {
  console.error('❌ E2E failed:', err);
  process.exit(1);
});
