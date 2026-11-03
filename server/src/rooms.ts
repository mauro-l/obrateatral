import type { Server, Socket } from 'socket.io';
import { prisma } from './db.js';
import { sessionFromCookieHeader, verifySessionToken } from './auth.js';

type Member = { userId: string; name: string };

type RoomState = {
  roomId: string;
  playId: string;
  sourceUrl: string | null;
  isPlaying: boolean;
  baseTime: number;
  updatedAt: number;
  version: number;
  members: Map<string, Member>;
};

const rooms = new Map<string, RoomState>();

/** Effective playback position in seconds, accounting for time elapsed while playing. */
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

  return {
    roomId: state.roomId,
    playId: state.playId,
    sourceUrl: state.sourceUrl,
    isPlaying: state.isPlaying,
    position: effectiveTime(state),
    version: state.version,
    members: [...unique.values()],
  };
}

/** Work durations in seconds, resolved lazily and cached. */
const durationCache = new Map<string, number>();

async function durationSeconds(playId: string): Promise<number> {
  const cached = durationCache.get(playId);
  if (cached !== undefined) return cached;

  let seconds = 60 * 60;
  try {
    const play = await prisma.play.findUnique({ where: { id: playId } });
    if (play?.durationMinutes && play.durationMinutes > 0) {
      seconds = play.durationMinutes * 60;
    }
  } catch (error) {
    console.error('[rooms] No se pudo leer la duración de la obra:', error);
  }

  durationCache.set(playId, seconds);
  return seconds;
}

/** Persist the room row. Failures are logged, never thrown into socket handlers. */
async function persist(state: RoomState) {
  try {
    await prisma.room.upsert({
      where: { id: state.roomId },
      create: {
        id: state.roomId,
        playId: state.playId,
        sourceUrl: state.sourceUrl,
        isPlaying: state.isPlaying,
        baseTime: state.baseTime,
        version: state.version,
      },
      update: {
        sourceUrl: state.sourceUrl,
        isPlaying: state.isPlaying,
        baseTime: state.baseTime,
        version: state.version,
      },
    });
  } catch (error) {
    console.error('[rooms] No se pudo persistir la sala:', error);
  }
}

/**
 * Write per-user progress for every member of the room. Both people are on the
 * same synced position, so both advance identically. `lastPosition` never
 * regresses: going back in the video does not erase how far you got.
 */
async function saveRoomProgress(state: RoomState) {
  const position = effectiveTime(state);
  const duration = await durationSeconds(state.playId);
  if (duration <= 0) return;

  const completionThreshold = duration * 0.9;
  const seen = new Set<string>();

  for (const member of state.members.values()) {
    if (seen.has(member.userId)) continue;
    seen.add(member.userId);

    try {
      const existing = await prisma.watchProgress.findUnique({
        where: { userId_playId: { userId: member.userId, playId: state.playId } },
      });

      const lastPosition = Math.max(existing?.lastPosition ?? 0, position);
      const completed = (existing?.completed ?? false) || position >= completionThreshold;

      await prisma.watchProgress.upsert({
        where: { userId_playId: { userId: member.userId, playId: state.playId } },
        create: {
          userId: member.userId,
          playId: state.playId,
          lastPosition,
          completed,
        },
        update: { lastPosition, completed },
      });
    } catch (error) {
      console.error('[rooms] No se pudo guardar el progreso:', error);
    }
  }
}

function commit(state: RoomState, partial: Partial<RoomState>) {
  const time = 'baseTime' in partial ? partial.baseTime! : effectiveTime(state);
  state.isPlaying = partial.isPlaying ?? state.isPlaying;
  state.sourceUrl = 'sourceUrl' in partial ? (partial.sourceUrl ?? null) : state.sourceUrl;
  state.baseTime = time;
  state.updatedAt = Date.now();
  state.version += 1;
  void persist(state);
}

async function getOrCreate(roomId: string): Promise<RoomState> {
  let state = rooms.get(roomId);
  if (state) return state;

  // Rebuild from PostgreSQL so a room survives both users disconnecting
  // and server restarts (the ephemeral link stays valid for 4h).
  let row = null;
  try {
    row = await prisma.room.findUnique({ where: { id: roomId } });
  } catch (error) {
    console.error('[rooms] No se pudo leer la sala:', error);
  }

  state = {
    roomId,
    playId: roomId,
    sourceUrl: row?.sourceUrl ?? null,
    isPlaying: false,
    baseTime: row?.baseTime ?? 0,
    updatedAt: Date.now(),
    version: row?.version ?? 1,
    members: new Map(),
  };
  rooms.set(roomId, state);
  return state;
}

/**
 * Rebuild in-memory rooms from PostgreSQL. Never starts in "playing" mode:
 * a restarted server must not surprise autoplay.
 */
export async function hydrateRooms() {
  const rows = await prisma.room.findMany({
    where: { sourceUrl: { not: null } },
  });

  for (const row of rows) {
    rooms.set(row.id, {
      roomId: row.id,
      playId: row.playId,
      sourceUrl: row.sourceUrl,
      isPlaying: false,
      baseTime: row.baseTime,
      updatedAt: Date.now(),
      version: row.version,
      members: new Map(),
    });
  }

  console.log(`[rooms] hidratadas ${rows.length} sala(s) desde PostgreSQL`);
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

    let roomId: string | null = null;

    socket.on('room:join', async (payload: { roomId: string }) => {
      if (!payload?.roomId) return;

      const state = await getOrCreate(payload.roomId);
      roomId = payload.roomId;
      void socket.join(roomId);

      state.members.set(socket.id, member());

      const view = snapshot(state);
      // The joiner gets the full state, everyone else gets notified to re-derive it.
      socket.emit('room:state', view);
      socket.to(roomId).emit('room:state', view);
    });

    socket.on('room:load', (payload: { sourceUrl?: string }) => {
      if (!roomId) return;
      const sourceUrl = payload?.sourceUrl?.trim();
      if (!sourceUrl) return;

      const state = rooms.get(roomId);
      if (!state) return;

      commit(state, { sourceUrl, isPlaying: false, baseTime: 0 });
      void saveRoomProgress(state);
      io.to(roomId).emit('room:state', snapshot(state));
    });

    socket.on('room:play', () => {
      if (!roomId) return;
      const state = rooms.get(roomId);
      if (!state || state.isPlaying) return;
      commit(state, { isPlaying: true });
      io.to(roomId).emit('room:state', snapshot(state));
    });

    socket.on('room:pause', () => {
      if (!roomId) return;
      const state = rooms.get(roomId);
      if (!state || !state.isPlaying) return;
      commit(state, { isPlaying: false });
      void saveRoomProgress(state);
      io.to(roomId).emit('room:state', snapshot(state));
    });

    socket.on('room:seek', (payload: { time?: number }) => {
      if (!roomId) return;
      const state = rooms.get(roomId);
      const time = payload?.time;
      if (!state || typeof time !== 'number' || Number.isNaN(time)) return;

      commit(state, { baseTime: Math.max(0, time) });
      void saveRoomProgress(state);
      io.to(roomId).emit('room:state', snapshot(state));
    });

    // Drift correction: the server answers only to the reporter, it never
    // rebroadcasts on a mere tick, so clients don't fight each other.
    socket.on('room:tick', (payload: { time?: number; seeking?: boolean }) => {
      if (!roomId) return;
      const state = rooms.get(roomId);
      const time = payload?.time;
      if (!state || typeof time !== 'number' || Number.isNaN(time)) return;
      // The reporter is mid-seek; its tick carries a moving target, never a drift signal.
      if (payload.seeking) return;

      if (Math.abs(effectiveTime(state) - time) > 2) {
        socket.emit('room:state', snapshot(state));
      }
    });

    const leave = () => {
      if (!roomId) return;
      const state = rooms.get(roomId);
      if (!state) return;

      void saveRoomProgress(state);
      state.members.delete(socket.id);
      void socket.leave(roomId);

      if (state.members.size === 0) {
        rooms.delete(roomId);
      } else {
        io.to(roomId).emit('room:state', snapshot(state));
      }

      roomId = null;
    };

    socket.on('room:leave', leave);
    socket.on('disconnect', leave);
  });
}
