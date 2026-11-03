export type Play = {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  order: number;
};

/**
 * Placeholder catalogue for Etapa 1.
 * Real works will come from PostgreSQL in Etapa 3.
 */
export const plays: Play[] = [
  {
    id: 'obra-1',
    title: 'Obra 1',
    description: 'Placeholder. Reemplazar por los datos reales de la obra.',
    durationMinutes: 60,
    order: 1,
  },
  {
    id: 'obra-2',
    title: 'Obra 2',
    description: 'Placeholder. Reemplazar por los datos reales de la obra.',
    durationMinutes: 60,
    order: 2,
  },
  {
    id: 'obra-3',
    title: 'Obra 3',
    description: 'Placeholder. Reemplazar por los datos reales de la obra.',
    durationMinutes: 60,
    order: 3,
  },
  {
    id: 'obra-4',
    title: 'Obra 4',
    description: 'Placeholder. Reemplazar por los datos reales de la obra.',
    durationMinutes: 60,
    order: 4,
  },
  {
    id: 'obra-5',
    title: 'Obra 5',
    description: 'Placeholder. Reemplazar por los datos reales de la obra.',
    durationMinutes: 60,
    order: 5,
  },
  {
    id: 'obra-6',
    title: 'Obra 6',
    description: 'Placeholder. Reemplazar por los datos reales de la obra.',
    durationMinutes: 60,
    order: 6,
  },
];
