import { useEffect, useState } from 'react';

export type Countdown = {
  expired: boolean;
  /** "Vence en 3:58:12" or "Venció hace 0:42". */
  label: string;
  /** Absolute local time, e.g. "18:42". */
  clock: string;
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function elapsed(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Live countdown for a link's exact expiry (epoch seconds). Returns null when
 * the link declares no expiry — the app never invents one.
 */
export function useCountdown(expiresAt: number | null): Countdown | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (expiresAt === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  if (expiresAt === null) return null;

  const remaining = expiresAt - now / 1000;
  const clock = new Date(expiresAt * 1000).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (remaining <= 0) {
    return { expired: true, label: `Venció hace ${elapsed(-remaining)}`, clock };
  }

  return { expired: false, label: `Vence en ${elapsed(remaining)}`, clock };
}
