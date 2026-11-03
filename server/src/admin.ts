import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from './db.js';
import { hashPassword, requireAuth } from './auth.js';

/** Only `role === "admin"` can manage accounts. The role is read from the DB,
 *  so revoking it takes effect immediately instead of waiting for the token to expire. */
export async function requireAdmin(req: Request, res: Response, next: () => void) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: { role: true },
    });

    if (!user) {
      res.status(401).json({ error: 'Sesión inválida.' });
      return;
    }

    if (user.role !== 'admin') {
      res.status(403).json({ error: 'Solo el administrador puede gestionar cuentas.' });
      return;
    }

    next();
  } catch (error) {
    console.error('[admin] no se pudo verificar el rol:', error);
    res.status(503).json({ error: 'No disponible por el momento.' });
  }
}

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/users', async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(users);
  } catch (error) {
    console.error('[admin] listar usuarios falló:', error);
    res.status(503).json({ error: 'No se pudo listar los usuarios.' });
  }
});

adminRouter.post('/users', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (name.length < 2 || name.length > 40) {
    res.status(400).json({ error: 'El nombre debe tener entre 2 y 40 caracteres.' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    return;
  }

  try {
    const created = await prisma.user.create({
      data: {
        name,
        passwordHash: await hashPassword(password),
        role: 'member',
      },
      select: { id: true, name: true, role: true },
    });
    res.status(201).json(created);
  } catch (error: unknown) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
      res.status(409).json({ error: 'Ya existe un usuario con ese nombre.' });
      return;
    }
    console.error('[admin] crear usuario falló:', error);
    res.status(503).json({ error: 'No se pudo crear el usuario.' });
  }
});

adminRouter.patch('/users/:id', async (req, res) => {
  const id = req.params.id;
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined;
  const password = typeof req.body?.password === 'string' ? req.body.password : undefined;

  if (name === undefined && password === undefined) {
    res.status(400).json({ error: 'Nada para actualizar.' });
    return;
  }

  if (name !== undefined) {
    if (name.length < 2 || name.length > 40) {
      res.status(400).json({ error: 'El nombre debe tener entre 2 y 40 caracteres.' });
      return;
    }
    if (id === req.user!.sub) {
      // Your own name lives inside the current session token; renaming yourself
      // would leave the UI showing the old name until you sign in again.
      res.status(400).json({ error: 'No podés renombrar tu propia cuenta.' });
      return;
    }
  }

  if (password !== undefined && password.length < 6) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    return;
  }

  try {
    await prisma.user.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(password !== undefined ? { passwordHash: await hashPassword(password) } : {}),
      },
    });
    res.json({ ok: true });
  } catch (error: unknown) {
    if (typeof error === 'object' && error && 'code' in error) {
      if (error.code === 'P2002') {
        res.status(409).json({ error: 'Ya existe un usuario con ese nombre.' });
        return;
      }
      if (error.code === 'P2025') {
        res.status(404).json({ error: 'Usuario inexistente.' });
        return;
      }
    }
    console.error('[admin] actualizar usuario falló:', error);
    res.status(503).json({ error: 'No se pudo actualizar el usuario.' });
  }
});
