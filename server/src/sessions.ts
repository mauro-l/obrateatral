import { Router } from 'express';
import { prisma } from './db.js';
import { requireAuth } from './auth.js';

export const sessionsRouter = Router();

sessionsRouter.use(requireAuth);

const SELECT = {
  id: true,
  name: true,
  positionSeconds: true,
  createdAt: true,
  updatedAt: true,
} as const;

sessionsRouter.get('/', async (_req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      select: SELECT,
      orderBy: { updatedAt: 'desc' },
    });
    res.json(sessions);
  } catch (error) {
    console.error('[sessions] listar falló:', error);
    res.status(503).json({ error: 'No se pudieron cargar las sesiones.' });
  }
});

sessionsRouter.get('/:id', async (req, res) => {
  try {
    const session = await prisma.session.findUnique({
      where: { id: req.params.id },
      select: SELECT,
    });

    if (!session) {
      res.status(404).json({ error: 'La sesión no existe.' });
      return;
    }

    res.json(session);
  } catch (error) {
    console.error('[sessions] leer falló:', error);
    res.status(503).json({ error: 'No se pudo cargar la sesión.' });
  }
});

sessionsRouter.post('/', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';

  if (name.length < 1 || name.length > 80) {
    res.status(400).json({ error: 'El nombre debe tener entre 1 y 80 caracteres.' });
    return;
  }

  try {
    const session = await prisma.session.create({ data: { name }, select: SELECT });
    res.status(201).json(session);
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
      select: SELECT,
    });
    res.json(session);
  } catch (error: unknown) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2025') {
      res.status(404).json({ error: 'La sesión no existe.' });
      return;
    }
    console.error('[sessions] renombrar falló:', error);
    res.status(503).json({ error: 'No se pudo renombrar la sesión.' });
  }
});
