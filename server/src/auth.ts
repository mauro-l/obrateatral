import type { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const SESSION_COOKIE = 'obrateatral_session';
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error('SESSION_SECRET is not set (see .env.example)');
  return value;
}

export type SessionUser = { sub: string; name: string };

export function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, 12);
}

export function verifyPassword(plainText: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plainText, passwordHash);
}

export function signSession(user: { id: string; name: string }): string {
  return jwt.sign({ sub: user.id, name: user.name } satisfies SessionUser, secret(), {
    expiresIn: '30d',
  });
}

export function verifySessionToken(token: string): SessionUser | null {
  try {
    const payload = jwt.verify(token, secret());
    if (typeof payload === 'object' && payload && 'sub' in payload && 'name' in payload) {
      return { sub: String(payload.sub), name: String(payload.name) };
    }
    return null;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE_MS,
  secure: false,
};

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    ...SESSION_COOKIE_OPTIONS,
    secure: process.env.NODE_ENV === 'production',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const raw of header.split(';')) {
    const [key, ...rest] = raw.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/** For Socket.IO handshakes, where there is no Express req/res. */
export function sessionFromCookieHeader(header: string | undefined): SessionUser | null {
  const token = readCookie(header, SESSION_COOKIE);
  return token ? verifySessionToken(token) : null;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE);
  if (!token) {
    res.status(401).json({ error: 'No autenticado.' });
    return;
  }

  const user = verifySessionToken(token);
  if (!user) {
    res.status(401).json({ error: 'Sesión inválida o vencida.' });
    return;
  }

  req.user = user;
  next();
}
