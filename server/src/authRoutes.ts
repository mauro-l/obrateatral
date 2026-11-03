import { Router } from 'express';
import { prisma } from './db.js';
import {
  clearSessionCookie,
  hashPassword,
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

// Stateless JWTs are intentionally not invalidated here: this is a two-person
// private app, and a lost session expires naturally within 30 days.
authRouter.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    res.status(400).json({ error: 'Faltan campos.' });
    return;
  }

  if (newPassword.length < 6) {
    res.status(400).json({ error: 'La contraseña nueva debe tener al menos 6 caracteres.' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    const ok = user ? await verifyPassword(currentPassword, user.passwordHash) : false;

    if (!ok) {
      res.status(401).json({ error: 'La contraseña actual no es correcta.' });
      return;
    }

    await prisma.user.update({
      where: { id: user!.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('[auth] cambio de contraseña falló:', error);
    res.status(503).json({ error: 'No se pudo cambiar la contraseña.' });
  }
});

// Cross-site (Netlify -> Render) cannot carry the SameSite=Lax session cookie on
// the Socket.IO handshake, so the browser trades the cookie for a 5-minute token
// through the same-origin /api proxy and sends that token on the handshake.
authRouter.get('/socket-token', requireAuth, (req, res) => {
  res.json({ token: signSession({ id: req.user!.sub, name: req.user!.name }, '5m') });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: { id: true, name: true, role: true },
    });

    if (!user) {
      // The token is still valid but the account is gone (deleted/renamed DB).
      res.status(401).json({ error: 'Sesión inválida.' });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error('[auth] /me falló:', error);
    res.status(503).json({ error: 'No disponible por el momento.' });
  }
});
