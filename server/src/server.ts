import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { prisma } from './db.js';
import { requireAuth } from './auth.js';
import { authRouter } from './authRoutes.js';
import { registerRooms, hydrateRooms } from './rooms.js';

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

app.get('/api/plays', requireAuth, async (_req, res) => {
  try {
    const plays = await prisma.play.findMany({ orderBy: { order: 'asc' } });
    res.json(plays);
  } catch (error) {
    console.error('[api] /api/plays failed:', error);
    res.status(503).json({ error: 'Catálogo no disponible por el momento.' });
  }
});

app.get('/api/progress', requireAuth, async (req, res) => {
  try {
    const rows = await prisma.watchProgress.findMany({
      where: { userId: req.user!.sub },
      include: { play: true },
    });

    res.json(
      rows.map((row) => ({
        playId: row.playId,
        title: row.play.title,
        order: row.play.order,
        durationMinutes: row.play.durationMinutes,
        lastPosition: row.lastPosition,
        completed: row.completed,
        updatedAt: row.updatedAt,
      })),
    );
  } catch (error) {
    console.error('[api] /api/progress failed:', error);
    res.status(503).json({ error: 'Historial no disponible por el momento.' });
  }
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGINS, methods: ['GET', 'POST'], credentials: true },
});

// Shared playback-state authority, one room per obra.
registerRooms(io);

// Optional: when client/dist exists (single-service deploy) serve the SPA here.
// With the front on Netlify this block is skipped and Render is API-only.
if (isProduction && fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

hydrateRooms()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`Servidor activo en http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    // Degraded mode: the room can be recreated by pasting the link again.
    console.error('[rooms] No se pudo hidratar la sala; arrancando vacío:', error);
    httpServer.listen(PORT, () => {
      console.log(`Servidor activo en http://localhost:${PORT} (sin estado persistido)`);
    });
  });
