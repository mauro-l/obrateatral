import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Session } from '../../lib/types';

function formatPosition(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export default function Home() {
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.sessions
      .list()
      .then(setSessions)
      .catch((e: Error) => setError(e.message));
  }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const session = await api.sessions.create(name.trim());
      navigate(`/sesion/${session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la sesión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-intro">
        <h1>Sesiones</h1>
        <p>
          Cada encuentro es una sesión: le ponés nombre y la app guarda por dónde van.
          El link del estudio se guarda encriptado y se reutiliza mientras siga vigente.
        </p>
      </div>

      {error ? <p className="error-banner">{error}</p> : null}

      <form className="account-card" onSubmit={create}>
        <label className="field" htmlFor="session-name">
          Nombre de la sesión
          <input
            id="session-name"
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Ej: Análisis 1 · obra 2"
            autoComplete="off"
            required
          />
        </label>

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Creando…' : 'Crear y entrar'}
        </button>
      </form>

      <h2 style={{ marginTop: '2rem' }}>Tus sesiones</h2>

      {!sessions ? (
        <p className="state-message">Cargando…</p>
      ) : sessions.length === 0 ? (
        <p className="state-message">Todavía no hay sesiones. Creá la primera arriba.</p>
      ) : (
        <ul className="session-list">
          {sessions.map((session) => (
            <li key={session.id}>
              <Link className="session-row" to={`/sesion/${session.id}`}>
                <span className="session-name">{session.name}</span>
                <span className="session-meta">
                  {session.hasLink ? (
                    <span
                      className={`link-badge ${session.linkExpired ? 'is-expired' : 'is-valid'}`}
                    >
                      {session.linkExpired ? 'link vencido' : 'link guardado'}
                    </span>
                  ) : null}
                  <span className="session-min">
                    {session.positionSeconds >= 60
                      ? `van ${formatPosition(session.positionSeconds)}`
                      : 'sin empezar'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
