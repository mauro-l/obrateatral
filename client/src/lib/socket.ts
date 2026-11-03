import { io, type Socket } from 'socket.io-client';

// Empty/undefined => same origin (local dev through the Vite proxy, or a
// single-service deploy). On Netlify this points at the Render host.
const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL as string | undefined)?.trim() || undefined;

let socket: Socket | null = null;

async function fetchHandshakeToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/socket-token', { credentials: 'include' });
    if (!res.ok) return null;
    const body = (await res.json()) as { token?: string };
    return body.token ?? null;
  } catch {
    return null;
  }
}

export function getSocket(): Socket {
  if (!socket) {
    // The front on Netlify and the API on Render are different sites, so the
    // SameSite=Lax session cookie cannot travel with the WebSocket handshake.
    // Trade the cookie for a 5-minute token through the same-origin /api proxy.
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      auth: (cb) => {
        void fetchHandshakeToken().then((token) => cb(token ? { token } : {}));
      },
    });
  }

  return socket;
}
