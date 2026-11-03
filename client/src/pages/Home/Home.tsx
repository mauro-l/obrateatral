import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { Play } from '../../lib/types';
import PlayCard from '../../components/PlayCard/PlayCard';

export default function Home() {
  const [plays, setPlays] = useState<Play[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listPlays()
      .then(setPlays)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <div className="page-intro">
        <h1>Catálogo</h1>
        <p>Las seis obras en orden de análisis. El video se carga con el link del estudio.</p>
      </div>

      {error ? <p className="error-banner">{error}</p> : null}

      {!plays && !error ? (
        <p className="state-message">Cargando catálogo…</p>
      ) : null}

      {plays ? (
        <ul className="plays-grid">
          {plays.map((play) => (
            <li key={play.id}>
              <PlayCard play={play} />
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
