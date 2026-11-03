import { Router } from 'express';
import { prisma } from './db.js';
import {
  clearSessionCookie,
  requireAuth,
  setSessionCookie,
  signSession,
  verifyPassword,
} from './auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { name, password } = req.body ?? {};
  if (
    typeof name !== 'string' ||
    typeof password !== 'string' ||
    !name.trim() ||
    !password
  ) {
    res.status(400).json({ error: 'Faltan credenciales.' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { name: name.trim() } });
    const ok = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!ok) {
      // Deliberately vague, and deliberately the same latency either way:
      // do not reveal which names exist.
      res.status(401).json({ error: 'Credenciales inválidas.' });
      return;
    }

    setSessionCookie(res, signSession(user!));
    res.json({ id: user!.id, name: user!.name });
  } catch (error) {
    console.error('[auth] El login falló:', error);
    res.status(503).json({ error: 'Autenticación no disponible.' });
  }
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user!.sub, name: req.user!.name });
});
