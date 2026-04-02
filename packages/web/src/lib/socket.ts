/**
 * socket.ts — Socket.IO client singleton
 *
 * Provides a single, reusable Socket.IO connection to the game server.
 * All components share the same socket instance via getSocket().
 *
 * @author AK Boys Team
 * @since 2026-03-24
 */

import { io, Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@akboys/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

let socket: GameSocket | null = null;

/** Get or create the shared socket instance */
export function getSocket(): GameSocket {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

/** Disconnect and dispose of the socket instance */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
