import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    // Same origin in production; vite proxy forwards /socket.io with ws in dev.
    socket = io('/', { transports: ['websocket', 'polling'] });
  }

  return socket;
}
