/**
 * index.ts — Express + Socket.IO server entry point
 *
 * Starts the HTTP server with CORS enabled.
 * Mounts the /api/chat route for game narration.
 * Attaches Socket.IO for real-time multiplayer communication.
 *
 * @author AK Boys Team
 * @since 2026-03-12
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { chatRouter, store } from './routes/chat.js';
import { registerSocketHandlers } from './socket/handlers.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const CORS_ORIGIN = 'http://localhost:3000';

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.use('/api/chat', chatRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

/* ------------------------------------------------------------------ */
/*  HTTP server + Socket.IO                                            */
/* ------------------------------------------------------------------ */

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

registerSocketHandlers(io, store);

server.listen(PORT, () => {
  console.log(`[server] running on http://localhost:${PORT}`);
  console.log(`[socket.io] ready for connections`);
});
