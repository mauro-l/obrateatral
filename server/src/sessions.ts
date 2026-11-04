import { Router } from 'express';
import { prisma } from './db.js';
import { requireAuth } from './auth.js';
import { decryptLink, isLinkEncryptionConfigured } from './linkCrypto.js';
import {
  LINK_EXPIRY_MARGIN_SECONDS,
  isLinkExpired,
  linkExpiresAt,
} from './linkExpiry.js';

export const sessionsRouter = Router();

sessionsRouter.use(requireAuth);

const SESSION_SELECT = {
  id: true,
  name: true,
  positionSeconds: true,
  sourceUrlEnc: true,
  sourceExpiresAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type SessionRow = {
  id: string;
  name: string;
  positionSeconds: number;
  sourceUrlEnc: string | null;
  sourceExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function expiresAtSeconds(row: SessionRow): number | null {
  return row.sourceExpiresAt ? Math.floor(row.sourceExpiresAt.getTime() / 1000) : null;
}

/** Public shape: link metadata only. Never the ciphertext, never the plaintext. */
function publicSession(row: SessionRow) {
  const linkExpiresAtSeconds = expiresAtSeconds(row);
  return {
    id: row.id,
    name: row.name,
    positionSeconds: row.positionSeconds,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    hasLink: Boolean(row.sourceUrlEnc),
    linkExpiresAt: linkExpiresAtSeconds,
    // Operational expiry: the room stops serving the link a couple of minutes
    // before the signed deadline, so the UI flips at the same instant.
    linkExpired:
      linkExpiresAtSeconds !== null
        ? Date.now() / 1000 >= linkExpiresAtSeconds - LINK_EXPIRY_MARGIN_SECONDS
        : false,
  };
}

sessionsRouter.get('/', async (_req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      select: SESSION_SELECT,
      orderBy: { updatedAt: 'desc' },
    });
    res.json(sessions.map(publicSession));
  } catch (error) {
    console.error('[sessions] listar falló:', error);
    res.status(503).json({ error: 'No se pudieron cargar las sesiones.' });
  }
});

sessionsRouter.get('/:id', async (req, res) => {
  try {
    const session = await prisma.session.findUnique({
      where: { id: req.params.id },
      select: SESSION_SELECT,
    });

    if (!session) {
      res.status(404).json({ error: 'La sesión no existe.' });
      return;
    }

    res.json(publicSession(session));
  } catch (error) {
    console.error('[sessions] leer falló:', error);
    res.status(503).json({ error: 'No se pudo cargar la sesión.' });
  }
});

/**
 * Copy endpoint. Returns the decrypted link so the UI can copy it even after it
 * expired. It is authenticated and never logged. The plaintext is intentionally
 * NOT part of the session list/detail payload.
 */
sessionsRouter.get('/:id/link', async (req, res) => {
  try {
    const row = await prisma.session.findUnique({
      where: { id: req.params.id },
      select: { sourceUrlEnc: true, sourceExpiresAt: true },
    });

    if (!row) {
      res.status(404).json({ error: 'La sesión no existe.' });
      return;
    }

    if (!row.sourceUrlEnc) {
      res.status(404).json({ error: 'Esta sesión no tiene un link guardado.' });
      return;
    }

    if (!isLinkEncryptionConfigured()) {
      res.status(503).json({
        error: 'Falta LINK_KEY en el servidor: no se puede leer el link guardado.',
      });
      return;
    }

    const url = decryptLink(row.sourceUrlEnc);
    if (!url) {
      res.status(503).json({ error: 'No se pudo desencriptar el link guardado.' });
      return;
    }

    const expiresAt = row.sourceExpiresAt
      ? Math.floor(row.sourceExpiresAt.getTime() / 1000)
      : linkExpiresAt(url);

    res.json({
      url,
      expiresAt,
      expired: isLinkExpired(url),
    });
  } catch (error) {
    console.error('[sessions] leer link falló:', error);
    res.status(503).json({ error: 'No se pudo leer el link guardado.' });
  }
});

sessionsRouter.post('/', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';

  if (name.length < 1 || name.length > 80) {
    res.status(400).json({ error: 'El nombre debe tener entre 1 y 80 caracteres.' });
    return;
  }

  try {
    const session = await prisma.session.create({
      data: { name },
      select: SESSION_SELECT,
    });
    res.status(201).json(publicSession(session));
  } catch (error) {
    console.error('[sessions] crear falló:', error);
    res.status(503).json({ error: 'No se pudo crear la sesión.' });
  }
});

sessionsRouter.patch('/:id', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';

  if (name.length < 1 || name.length > 80) {
    res.status(400).json({ error: 'El nombre debe tener entre 1 y 80 caracteres.' });
    return;
  }

  try {
    const session = await prisma.session.update({
      where: { id: req.params.id },
      data: { name },
      select: SESSION_SELECT,
    });
    res.json(publicSession(session));
  } catch (error: unknown) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2025') {
      res.status(404).json({ error: 'La sesión no existe.' });
      return;
    }
    console.error('[sessions] renombrar falló:', error);
    res.status(503).json({ error: 'No se pudo renombrar la sesión.' });
  }
});
