import type { Server, Socket } from 'socket.io';
import { prisma } from './db.js';
import { sessionFromCookieHeader, verifySessionToken } from './auth.js';

type Member = { userId: string; name: string };

type RoomState = {
  sessionId: string;
  /**
   * The studio link. It lives ONLY here, in the server's memory: it is never
   * written to the database, so no third-party URL is ever persisted. When the
   * room empties, it is gone.
   */
  sourceUrl: string | null;
  sourceExpired: boolean;
  isPlaying: boolean;
  baseTime: number;
  updatedAt: number;
  version: number;
  members: Map<string, Member>;
};

const rooms = new Map<string, RoomState>();

/** Margin before the real expiry, so we stop serving a link that is about to die. */
const LINK_EXPIRY_MARGIN_SECONDS = 120;

/**
 * Some providers encode validity in the URL: s = issued-at (epoch seconds),
 * e = duration in seconds. Others (plain .mp4, other CDNs) carry nothing.
 * Returns null when unknown — never guess.
 */
function linkExpiresAt(sourceUrl: string): number | null {
  try {
    const url = new URL(sourceUrl);
    const issuedAt = Number(url.searchParams.get('s'));
    const duration = Number(url.searchParams.get('e'));

    if (!Number.isFinite(issuedAt) || !Number.isFinite(duration) || duration <= 0) {
      return null;
    }

    return issuedAt + duration;
  } catch {
    return null;
  }
}

function isLinkExpired(sourceUrl: string): boolean {
  const expiresAt = linkExpiresAt(sourceUrl);
  if (expiresAt === null) return false;
  return Date.now() / 1000 >= expiresAt - LINK_EXPIRY_MARGIN_SECONDS;
}

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
    sourceUrl: expired ? null : state.sourceUrl,
    sourceExpired: expired,
    expiresAt: state.sourceUrl ? linkExpiresAt(state.sourceUrl) : null,
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
  state.sourceUrl = 'sourceUrl' in partial ? (partial.sourceUrl ?? null) : state.sourceUrl;
  if ('sourceUrl' in partial && partial.sourceUrl) state.sourceExpired = false;
  state.baseTime = time;
  state.updatedAt = Date.now();
  state.version += 1;
}

async function getOrCreate(sessionId: string): Promise<RoomState | null> {
  const existing = rooms.get(sessionId);
  if (existing) return existing;

  const row = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!row) return null;

  const state: RoomState = {
    sessionId,
    sourceUrl: null,
    sourceExpired: false,
    isPlaying: false,
    baseTime: row.positionSeconds,
    updatedAt: Date.now(),
    version: 1,
    members: new Map(),
  };
  rooms.set(sessionId, state);
  return state;
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

      const state = await getOrCreate(payload.roomId);
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

    socket.on('room:load', (payload: { sourceUrl?: string }) => {
      if (!sessionId) return;
      const sourceUrl = payload?.sourceUrl?.trim();
      if (!sourceUrl) return;

      const state = rooms.get(sessionId);
      if (!state) return;

      if (isLinkExpired(sourceUrl)) {
        socket.emit('room:error', {
          message: 'Ese link ya venció. Pedí uno nuevo al estudio.',
        });
        return;
      }

      // Keep the saved position: the session resumes where it was left, and
      // entering/leaving without playing must not wipe the minutes.
      commit(state, { sourceUrl, isPlaying: false });
      io.to(sessionId).emit('room:state', snapshot(state));
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
        // No members, no link: nothing to keep.
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
