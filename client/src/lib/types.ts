export type Session = {
  id: string;
  name: string;
  positionSeconds: number;
  createdAt: string;
  updatedAt: string;
  /** The studio link is stored encrypted; the UI only gets metadata. */
  hasLink: boolean;
  /** Exact expiry (epoch seconds) when the link declares `s` + `e`. */
  linkExpiresAt: number | null;
  linkExpired: boolean;
};

export type SessionLink = {
  url: string;
  expiresAt: number | null;
  expired: boolean;
};
