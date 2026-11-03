export type Play = {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  order: number;
};

export type ProgressItem = {
  playId: string;
  title: string;
  order: number;
  durationMinutes: number;
  /** Furthest position reached, in seconds. Never regresses. */
  lastPosition: number;
  /** True once roughly 90% of the work was watched. */
  completed: boolean;
  updatedAt: string;
};
