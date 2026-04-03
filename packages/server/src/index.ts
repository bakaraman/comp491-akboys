/**
 * index.ts — Express + Socket.IO server entry point
 *
 * Starts the HTTP server with CORS enabled.
 * Mounts the /api/chat route for game narration.
 * Attaches Socket.IO for real-time multiplayer communication.
 *
 * @author AKBOYS Team
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
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { Server } from 'socket.io';
import { chatRouter, store, storeReady } from './routes/chat.js';
import { registerSocketHandlers } from './socket/handlers.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
const ALLOWED_ORIGINS = CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
};

if (process.env.FIREBASE_PROJECT_ID && getApps().length === 0) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
  console.log('[firebase] Admin SDK initialized');
}

app.use(cors(corsOptions));
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
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  },
});

registerSocketHandlers(io, store);

await storeReady;

server.listen(PORT, () => {
  console.log(`[server] running on http://localhost:${PORT}`);
  console.log(`[socket.io] ready for connections`);
  console.log(`[cors] allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
});
