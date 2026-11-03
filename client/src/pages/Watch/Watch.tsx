import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Session } from '../../lib/types';
import VideoPlayer from '../../components/VideoPlayer/VideoPlayer';
import { useRoomSync } from '../../lib/useRoomSync';

// Public HLS stream, handy to test the player without a studio link.
const TEST_STREAM = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

export default function Watch() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const [session, setSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState('');
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    api.sessions
      .get(sessionId)
      .then(setSession)
      .catch((e: Error) => setLoadError(e.message));
  }, [sessionId]);

  const { connected, members, loadVideo, error, sourceExpired, expiresAt } = useRoomSync({
    roomId: sessionId,
    videoRef,
    loadedSrc,
    onLoadSource: setLoadedSrc,
    resumePosition: session?.positionSeconds ?? null,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const target = draft.trim();
    if (target) {
      setLoadError(null);
      loadVideo(target);
    }
  };

  const loadTestStream = () => {
    setLoadError(null);
    loadVideo(TEST_STREAM);
  };

  const expiresLabel = expiresAt
    ? new Date(expiresAt * 1000).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <>
      <div className="page-intro">
        <h1>{session ? session.name : 'Sesión'}</h1>
        <p>
          <Link to="/">← Volver a las sesiones</Link>
        </p>
      </div>

      <div className="watch-layout">
        <div>
          {loadError ? (
            <p className="error-banner" role="alert">
              {loadError}
            </p>
          ) : null}

          {error ? (
            <p className="error-banner" role="alert">
              {error}
            </p>
          ) : null}

          {sourceExpired ? (
            <p className="error-banner" role="status">
              El link de esta sesión venció. Pegá el link nuevo del estudio para continuar
              desde donde iban.
            </p>
          ) : null}

          {loadedSrc ? (
            <VideoPlayer src={loadedSrc} videoRef={videoRef} />
          ) : (
            <div className="player-empty">
              <p>Pegá el link del estudio para empezar la sesión.</p>
              <button className="btn" onClick={loadTestStream}>
                Probar con un HLS de prueba
              </button>
            </div>
          )}
        </div>

        <aside className="panel" aria-label="Sala compartida">
          <h2>Sala compartida</h2>

          <form onSubmit={submit}>
            <label className="field" htmlFor="src">
              Link del estudio (el que te dieron; no se guarda)
              <input
                id="src"
                className="field-input"
                type="url"
                placeholder="https://…/master.m3u8?… o https://…/video.mp4"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoComplete="off"
                required
              />
            </label>
            <button className="btn btn-primary" type="submit" style={{ marginTop: '0.6rem' }}>
              Cargar video
            </button>
          </form>

          {expiresLabel ? (
            <p className="play-desc" style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
              Este link vence alrededor de las {expiresLabel}.
            </p>
          ) : null}

          <div className="sync-status" role="status">
            <span
              className={`dot ${connected ? 'dot-online' : 'dot-connecting'}`}
              aria-hidden="true"
            />
            <span>
              {connected
                ? `Sincronizados (${members.length} ${members.length === 1 ? 'persona' : 'personas'})`
                : 'Conectando con la sala…'}
            </span>
          </div>

          {members.length > 0 ? (
            <ul
              aria-label="Personas en la sala"
              style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}
            >
              {members.map((member) => (
                <li
                  key={member.id}
                  style={{
                    fontSize: '0.76rem',
                    border: '1px solid var(--border-strong)',
                    borderRadius: '999px',
                    padding: '0.15rem 0.6rem',
                    color: 'var(--text-h)',
                  }}
                >
                  {member.name}
                </li>
              ))}
            </ul>
          ) : null}

          {session && session.positionSeconds >= 60 ? (
            <p className="play-desc" style={{ color: 'var(--text-dim)' }}>
              Guardado: van {Math.floor(session.positionSeconds / 60)} min de esta sesión.
            </p>
          ) : null}
        </aside>
      </div>
    </>
  );
}
