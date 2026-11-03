export type Play = {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  durationMinutes: number;
  order: number;
};

export type PlayProgress = {
  playId: string;
  lastPosition: number;
  completed: boolean;
  updatedAt: string;
};
