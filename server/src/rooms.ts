import type { Server, Socket } from 'socket.io';
import { prisma } from './db.js';
import { sessionFromCookieHeader, verifySessionToken } from './auth.js';
import { decryptLink, encryptLink, isLinkEncryptionConfigured } from './linkCrypto.js';
import {
  LINK_EXPIRY_MARGIN_SECONDS,
  isLinkExpired,
  linkExpiresAt,
} from './linkExpiry.js';

type Member = { userId: string; name: string };

type RoomState = {
  sessionId: string;
  /**
   * The studio link in plaintext, for the current room only. It is never
   * logged. The encrypted copy lives in `Session.sourceUrlEnc`.
   */
  sourceUrl: string | null;
  /** Exact expiry (epoch seconds) from the link's `s` + `e`, when present. */
  sourceExpiresAt: number | null;
  sourceExpired: boolean;
  isPlaying: boolean;
  baseTime: number;
  updatedAt: number;
  version: number;
  expiryTimer: NodeJS.Timeout | null;
  members: Map<string, Member>;
};

const rooms = new Map<string, RoomState>();

function effectiveTime(state: RoomState): number {
  return state.isPlaying
    ? state.baseTime + (Date.now() - state.updatedAt) / 1000
    : state.baseTime;
}

function snapshot(state: RoomState) {
  const unique = new Map<string, { id: string; name: string }>();
  for (const member of state.members.values()) {
    unique.set(member.userId, { id: member.userId, name: member.name });
  }

  const expired =
    state.sourceExpired || (state.sourceUrl !== null && isLinkExpired(state.sourceUrl));

  return {
    sessionId: state.sessionId,
    // An expired link is never served to the player. Copy uses the REST
    // endpoint, which can still return it while keeping it out of broadcasts.
    sourceUrl: expired ? null : state.sourceUrl,
    sourceExpired: expired,
    expiresAt: state.sourceExpiresAt,
    isPlaying: expired ? false : state.isPlaying,
    position: effectiveTime(state),
    version: state.version,
    members: [...unique.values()],
  };
}

/** Persist only the minute count — never the URL. */
async function persistPosition(state: RoomState) {
  try {
    await prisma.session.update({
      where: { id: state.sessionId },
      data: { positionSeconds: Math.max(0, effectiveTime(state)) },
    });
  } catch (error) {
    console.error('[rooms] No se pudo guardar la posición:', error);
  }
}

function commit(state: RoomState, partial: Partial<RoomState>) {
  const time = 'baseTime' in partial ? partial.baseTime! : effectiveTime(state);
  state.isPlaying = partial.isPlaying ?? state.isPlaying;
  if ('sourceUrl' in partial) {
    state.sourceUrl = partial.sourceUrl ?? null;
    state.sourceExpiresAt = state.sourceUrl ? linkExpiresAt(state.sourceUrl) : null;
    state.sourceExpired = false;
  }
  state.baseTime = time;
  state.updatedAt = Date.now();
  state.version += 1;
}

function clearExpiryTimer(state: RoomState) {
  if (state.expiryTimer) {
    clearTimeout(state.expiryTimer);
    state.expiryTimer = null;
  }
}

/**
 * Broadcast the expiry transition exactly once. The margin matches the one
 * used to stop serving the link, so the UI flips at the same instant the
 * player would otherwise start getting 403s.
 */
function scheduleExpiry(io: Server, state: RoomState) {
  clearExpiryTimer(state);
  if (state.sourceExpiresAt === null) return;

  const delay = (state.sourceExpiresAt - LINK_EXPIRY_MARGIN_SECONDS) * 1000 - Date.now();
  if (delay <= 0) return;

  state.expiryTimer = setTimeout(() => {
    state.expiryTimer = null;
    const time = effectiveTime(state);
    state.isPlaying = false;
    state.baseTime = time;
    state.updatedAt = Date.now();
    state.version += 1;
    void persistPosition(state);
    io.to(state.sessionId).emit('room:state', snapshot(state));
  }, delay);
}

async function getOrCreate(io: Server, sessionId: string): Promise<RoomState | null> {
  const existing = rooms.get(sessionId);
  if (existing) return existing;

  const row = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!row) return null;

  let sourceUrl: string | null = null;
  let sourceExpired = false;

  if (row.sourceUrlEnc) {
    if (!isLinkEncryptionConfigured()) {
      console.warn('[rooms] LINK_KEY no está configurada: el link guardado no se puede leer.');
    } else {
      const decrypted = decryptLink(row.sourceUrlEnc);
      if (!decrypted) {
        console.warn('[rooms] No se pudo desencriptar el link guardado de la sesión.');
      } else if (isLinkExpired(decrypted)) {
        sourceExpired = true;
      } else {
        sourceUrl = decrypted;
      }
    }
  }

  const storedExpiresAt = row.sourceExpiresAt
    ? Math.floor(row.sourceExpiresAt.getTime() / 1000)
    : null;

  const state: RoomState = {
    sessionId,
    sourceUrl,
    sourceExpiresAt: storedExpiresAt ?? (sourceUrl ? linkExpiresAt(sourceUrl) : null),
    sourceExpired,
    isPlaying: false,
    baseTime: row.positionSeconds,
    updatedAt: Date.now(),
    version: 1,
    expiryTimer: null,
    members: new Map(),
  };
  rooms.set(sessionId, state);
  scheduleExpiry(io, state);
  return state;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function persistLink(state: RoomState, sourceUrl: string) {
  if (!isLinkEncryptionConfigured()) {
    console.warn('[rooms] LINK_KEY no está configurada: el link queda sólo en memoria.');
    return;
  }

  try {
    const expiresAt = linkExpiresAt(sourceUrl);
    await prisma.session.update({
      where: { id: state.sessionId },
      data: {
        sourceUrlEnc: encryptLink(sourceUrl),
        sourceExpiresAt: expiresAt === null ? null : new Date(expiresAt * 1000),
      },
    });
  } catch (error) {
    console.error('[rooms] No se pudo guardar el link encriptado:', error);
  }
}

export function registerRooms(io: Server) {
  // Private room. A handshake token wins (cross-site: Netlify -> Render), and
  // the session cookie remains the fallback for same-origin / local dev.
  io.use((socket, next) => {
    const handshakeToken = (socket.handshake.auth as { token?: string } | undefined)?.token;
    const user =
      (handshakeToken && verifySessionToken(handshakeToken)) ||
      sessionFromCookieHeader(socket.request.headers.cookie);

    if (!user) {
      next(new Error('No autenticado.'));
      return;
    }

    socket.data.user = user;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const member = (): Member => ({
      userId: socket.data.user?.sub as string,
      name: (socket.data.user?.name as string) ?? 'Invitado',
    });

    let sessionId: string | null = null;

    socket.on('room:join', async (payload: { roomId: string }) => {
      if (!payload?.roomId) return;

      const state = await getOrCreate(io, payload.roomId);
      if (!state) {
        socket.emit('room:error', { message: 'La sesión no existe.' });
        return;
      }

      sessionId = payload.roomId;
      void socket.join(sessionId);
      state.members.set(socket.id, member());

      const view = snapshot(state);
      socket.emit('room:state', view);
      socket.to(sessionId).emit('room:state', view);
    });

    socket.on('room:load', async (payload: { sourceUrl?: string }) => {
      if (!sessionId) return;
      const roomId = sessionId;
      const sourceUrl = payload?.sourceUrl?.trim();
      if (!sourceUrl) return;

      const state = rooms.get(roomId);
      if (!state) return;

      if (!isHttpUrl(sourceUrl)) {
        socket.emit('room:error', { message: 'Ese link no es una URL http(s) válida.' });
        return;
      }

      if (isLinkExpired(sourceUrl)) {
        socket.emit('room:error', {
          message: 'Ese link ya venció. Pedí uno nuevo al estudio.',
        });
        return;
      }

      // Keep the saved position: the session resumes where it was left, and
      // entering/leaving without playing must not wipe the minutes.
      commit(state, { sourceUrl, isPlaying: false });
      scheduleExpiry(io, state);
      // Persist before broadcasting so a client refresh sees the new metadata.
      await persistLink(state, sourceUrl);
      io.to(roomId).emit('room:state', snapshot(state));
    });

    socket.on('room:play', () => {
      if (!sessionId) return;
      const state = rooms.get(sessionId);
      if (!state || state.isPlaying) return;
      commit(state, { isPlaying: true });
      io.to(sessionId).emit('room:state', snapshot(state));
    });

    socket.on('room:pause', () => {
      if (!sessionId) return;
      const state = rooms.get(sessionId);
      if (!state || !state.isPlaying) return;
      commit(state, { isPlaying: false });
      void persistPosition(state);
      io.to(sessionId).emit('room:state', snapshot(state));
    });

    socket.on('room:seek', (payload: { time?: number }) => {
      if (!sessionId) return;
      const state = rooms.get(sessionId);
      const time = payload?.time;
      if (!state || typeof time !== 'number' || Number.isNaN(time)) return;

      commit(state, { baseTime: Math.max(0, time) });
      void persistPosition(state);
      io.to(sessionId).emit('room:state', snapshot(state));
    });

    // Drift correction: answer only the reporter, and never while it is
    // mid-seek (its reported time is a moving target).
    socket.on('room:tick', (payload: { time?: number; seeking?: boolean }) => {
      if (!sessionId) return;
      const state = rooms.get(sessionId);
      const time = payload?.time;
      if (!state || typeof time !== 'number' || Number.isNaN(time)) return;
      if (payload.seeking) return;

      if (Math.abs(effectiveTime(state) - time) > 2) {
        socket.emit('room:state', snapshot(state));
      }
    });

    const leave = () => {
      if (!sessionId) return;
      const state = rooms.get(sessionId);
      if (!state) return;

      void persistPosition(state);
      state.members.delete(socket.id);
      void socket.leave(sessionId);

      if (state.members.size === 0) {
        // No members, no in-memory link. The encrypted copy stays in the DB so
        // the session can be resumed while the link is still valid.
        clearExpiryTimer(state);
        rooms.delete(sessionId);
      } else {
        io.to(sessionId).emit('room:state', snapshot(state));
      }

      sessionId = null;
    };

    socket.on('room:leave', leave);
    socket.on('disconnect', leave);
  });
}
