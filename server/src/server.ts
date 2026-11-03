import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { authRouter } from './authRoutes.js';
import { adminRouter } from './admin.js';
import { sessionsRouter } from './sessions.js';
import { registerRooms } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

const PORT = Number(process.env.PORT) || 3001;

// CLIENT_URL may be a comma-separated list: the Netlify site, and optionally the
// Render host itself when the SPA fallback is used.
const CLIENT_ORIGINS = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const isProduction = process.env.NODE_ENV === 'production';

const app = express();

app.use(cors({ origin: CLIENT_ORIGINS, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', application: 'obrateatral' });
});

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/sessions', sessionsRouter);

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGINS, methods: ['GET', 'POST'], credentials: true },
});

// Shared playback-state authority, one room per session. The studio link is
// held in memory only.
registerRooms(io);

// Optional: when client/dist exists (single-service deploy) serve the SPA here.
// With the front on Netlify this block is skipped and Render is API-only.
if (isProduction && fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

httpServer.listen(PORT, () => {
  console.log(`Servidor activo en http://localhost:${PORT}`);
});
