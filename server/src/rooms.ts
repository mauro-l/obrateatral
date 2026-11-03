import type { Server, Socket } from 'socket.io';

type Member = { id: string; name: string };

type RoomState = {
  roomId: string;
  playId: string;
  sourceUrl: string | null;
  isPlaying: boolean;
  baseTime: number;
  updatedAt: number;
  version: number;
  members: Map<string, string>;
};

const rooms = new Map<string, RoomState>();

/** Effective playback position in seconds, accounting for time elapsed while playing. */
function effectiveTime(state: RoomState): number {
  return state.isPlaying
    ? state.baseTime + (Date.now() - state.updatedAt) / 1000
    : state.baseTime;
}

function snapshot(state: RoomState) {
  return {
    roomId: state.roomId,
    playId: state.playId,
    sourceUrl: state.sourceUrl,
    isPlaying: state.isPlaying,
    position: effectiveTime(state),
    version: state.version,
    members: [...state.members].map(([id, name]) => ({ id, name }) satisfies Member),
  };
}

function commit(state: RoomState, partial: Partial<RoomState>) {
  const time = 'baseTime' in partial ? partial.baseTime! : effectiveTime(state);
  state.isPlaying = partial.isPlaying ?? state.isPlaying;
  state.sourceUrl = partial.sourceUrl ?? state.sourceUrl;
  state.baseTime = time;
  state.updatedAt = Date.now();
  state.version += 1;
}

function getOrCreate(roomId: string): RoomState {
  let state = rooms.get(roomId);
  if (!state) {
    state = {
      roomId,
      playId: roomId,
      sourceUrl: null,
      isPlaying: false,
      baseTime: 0,
      updatedAt: Date.now(),
      version: 1,
      members: new Map(),
    };
    rooms.set(roomId, state);
  }
  return state;
}

export function registerRooms(io: Server) {
  io.on('connection', (socket: Socket) => {
    let roomId: string | null = null;

    socket.on('room:join', (payload: { roomId: string; name?: string }) => {
      if (!payload?.roomId) return;

      const state = getOrCreate(payload.roomId);
      roomId = payload.roomId;
      void socket.join(roomId);

      state.members.set(socket.id, payload.name?.trim() || 'Invitado');

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
      io.to(roomId).emit('room:state', snapshot(state));
    });

    socket.on('room:seek', (payload: { time?: number }) => {
      if (!roomId) return;
      const state = rooms.get(roomId);
      const time = payload?.time;
      if (!state || typeof time !== 'number' || Number.isNaN(time)) return;

      commit(state, { baseTime: Math.max(0, time) });
      io.to(roomId).emit('room:state', snapshot(state));
    });

    // Drift correction: the server answers only to the reporter, it never
    // rebroadcasts on a mere tick, so clients don't fight each other.
    socket.on('room:tick', (payload: { time?: number }) => {
      if (!roomId) return;
      const state = rooms.get(roomId);
      const time = payload?.time;
      if (!state || typeof time !== 'number' || Number.isNaN(time)) return;

      if (Math.abs(effectiveTime(state) - time) > 2) {
        socket.emit('room:state', snapshot(state));
      }
    });

    const leave = () => {
      if (!roomId) return;
      const state = rooms.get(roomId);
      if (!state) return;

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
