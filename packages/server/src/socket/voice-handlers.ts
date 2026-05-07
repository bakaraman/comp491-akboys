/**
 * voice-handlers.ts — Voice chat WebRTC signaling relay
 *
 * The server is signaling-only — it never sees audio. Audio packets flow
 * peer-to-peer via WebRTC; this file just routes SDP offers/answers and
 * ICE candidates between specific peer pairs in the same session, plus
 * tracks who's currently in the voice mesh so newcomers can discover
 * existing peers.
 *
 * @author AKBOYS Team
 * @since 2026-05-07
 */

import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@akboys/shared';
import { socketMap } from './handlers.js';

type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/**
 * Active voice participants per session. Keyed by sessionId, values are
 * sets of playerIds currently in the voice mesh. Process-local; not
 * persisted to Firestore — voice state is ephemeral by nature.
 */
const voiceParticipants = new Map<string, Set<string>>();

/**
 * Find every connected socketId that belongs to a given playerId in a
 * given session. Uses the same module-level socketMap that handlers.ts
 * maintains so voice routing stays in sync with player presence.
 */
function findSocketsForPlayer(
  _io: GameServer,
  sessionId: string,
  playerId: string,
): string[] {
  const result: string[] = [];
  for (const [sid, mapping] of socketMap) {
    if (mapping.playerId === playerId && mapping.sessionId === sessionId) {
      result.push(sid);
    }
  }
  return result;
}

/** Emit an event to all sockets belonging to a specific player. */
function emitToPlayer<E extends keyof ServerToClientEvents>(
  io: GameServer,
  sessionId: string,
  playerId: string,
  event: E,
  payload: Parameters<ServerToClientEvents[E]>[0],
): void {
  for (const sid of findSocketsForPlayer(io, sessionId, playerId)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (io.to(sid).emit as any)(event, payload);
  }
}

/**
 * Wire voice signaling handlers onto a freshly-connected socket. Call
 * this from inside the io 'connection' callback alongside other handlers.
 */
export function setupVoiceHandlers(io: GameServer, socket: GameSocket): void {
  /* ---- voice:join — newcomer announces presence ---- */
  socket.on('voice:join', (data) => {
    const { sessionId, playerId } = data;
    if (!sessionId || !playerId) return;

    let participants = voiceParticipants.get(sessionId);
    if (!participants) {
      participants = new Set();
      voiceParticipants.set(sessionId, participants);
    }

    // Existing peers (excluding the joiner itself) — newcomer needs this list
    // to initiate offers toward them.
    const existing = Array.from(participants).filter((id) => id !== playerId);

    // Only add + announce if this is a genuinely new participant. Repeat
    // joins (e.g. F5 reconnect) just refresh the participant list reply.
    const wasAlreadyIn = participants.has(playerId);
    participants.add(playerId);

    // Reply to the joiner with the current peer list.
    socket.emit('voice:participants', { peerIds: existing });

    if (!wasAlreadyIn) {
      // Tell existing peers a newcomer has arrived.
      for (const peerId of existing) {
        emitToPlayer(io, sessionId, peerId, 'voice:peer-joined', { peerId: playerId });
      }
      console.log(`[voice ${sessionId.slice(0, 8)}] ${playerId.slice(0, 8)} joined (now ${participants.size})`);
    }
  });

  /* ---- voice:leave — explicit withdrawal ---- */
  socket.on('voice:leave', (data) => {
    const { sessionId, playerId } = data;
    leaveVoice(io, sessionId, playerId);
  });

  /* ---- voice:offer — relay SDP offer to target peer ---- */
  socket.on('voice:offer', (data) => {
    const { sessionId, fromPlayerId, toPlayerId, sdp } = data;
    if (!sessionId || !fromPlayerId || !toPlayerId || !sdp) return;
    emitToPlayer(io, sessionId, toPlayerId, 'voice:offer', { fromPlayerId, sdp });
  });

  /* ---- voice:answer — relay SDP answer to target peer ---- */
  socket.on('voice:answer', (data) => {
    const { sessionId, fromPlayerId, toPlayerId, sdp } = data;
    if (!sessionId || !fromPlayerId || !toPlayerId || !sdp) return;
    emitToPlayer(io, sessionId, toPlayerId, 'voice:answer', { fromPlayerId, sdp });
  });

  /* ---- voice:ice-candidate — relay ICE candidate to target peer ---- */
  socket.on('voice:ice-candidate', (data) => {
    const { sessionId, fromPlayerId, toPlayerId, candidate } = data;
    if (!sessionId || !fromPlayerId || !toPlayerId) return;
    emitToPlayer(io, sessionId, toPlayerId, 'voice:ice-candidate', { fromPlayerId, candidate });
  });
}

/**
 * Remove a player from the voice mesh and announce their departure.
 * Called both from explicit `voice:leave` and from the disconnect
 * cleanup path in handlers.ts.
 */
export function leaveVoice(io: GameServer, sessionId: string, playerId: string): void {
  const participants = voiceParticipants.get(sessionId);
  if (!participants || !participants.has(playerId)) return;

  participants.delete(playerId);
  if (participants.size === 0) {
    voiceParticipants.delete(sessionId);
  }

  for (const peerId of participants) {
    emitToPlayer(io, sessionId, peerId, 'voice:peer-left', { peerId: playerId });
  }
  console.log(`[voice ${sessionId.slice(0, 8)}] ${playerId.slice(0, 8)} left (now ${participants.size})`);
}
