import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import type { ProgressItem } from '../../lib/types';

function formatPosition(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export default function History() {
  const [rows, setRows] = useState<ProgressItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listProgress()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);

  const sorted = rows ? [...rows].sort((a, b) => a.order - b.order) : null;

  return (
    <>
      <div className="page-intro">
        <h1>Historial</h1>
        <p>Posición guardada por obra. Una obra cuenta como vista al pasar el 90%.</p>
      </div>

      {error ? <p className="error-banner">{error}</p> : null}

      {!sorted && !error ? (
        <p className="state-message">Cargando historial…</p>
      ) : null}

      {sorted?.length === 0 ? (
        <p className="state-message">
          Todavía no hay nada guardado. El progreso se escribe al pausar, al hacer seek y al
          terminar una obra.
        </p>
      ) : (
        <ul className="plays-grid">
          {sorted?.map((row) => (
            <li key={row.playId}>
              <Link className="play-card" to={`/obra/${row.playId}`}>
                <div className="play-cover" role="img" aria-label={`Obra ${row.order}`}>
                  <p className="play-order">{String(row.order).padStart(2, '0')}</p>
                </div>
                <div className="play-body">
                  <h2>{row.title}</h2>
                  <div className="play-meta">
                    <span>{row.durationMinutes} min</span>
                    <span>
                      {row.completed ? (
                        <span className="badge-done">Vista ✓</span>
                      ) : (
                        `En ${formatPosition(row.lastPosition)}`
                      )}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
