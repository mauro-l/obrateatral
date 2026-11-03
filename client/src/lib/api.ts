import type { Play, ProgressItem } from './types';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? `Request failed with status ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export type SessionUser = { id: string; name: string };

export const api = {
  listPlays: () => request<Play[]>('/api/plays'),
  listProgress: () => request<ProgressItem[]>('/api/progress'),
  me: () => request<SessionUser>('/api/auth/me'),
  login: (name: string, password: string) =>
    request<SessionUser>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ name, password }),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
};
