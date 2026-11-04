import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Session } from '../../lib/types';
import VideoPlayer from '../../components/VideoPlayer/VideoPlayer';
import { useRoomSync } from '../../lib/useRoomSync';
import { useCountdown } from '../../lib/useCountdown';
import { copyText } from '../../lib/clipboard';

// Public HLS stream, handy to test the player without a studio link.
const TEST_STREAM = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

export default function Watch() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const [session, setSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState('');
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  const refreshSession = useCallback(() => {
    if (!sessionId) return;
    api.sessions
      .get(sessionId)
      .then(setSession)
      .catch((e: Error) => setLoadError(e.message));
  }, [sessionId]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const { connected, members, loadVideo, error, sourceExpired, expiresAt } = useRoomSync({
    roomId: sessionId,
    videoRef,
    loadedSrc,
    onLoadSource: setLoadedSrc,
    resumePosition: session?.positionSeconds ?? null,
  });

  const effectiveExpiresAt = expiresAt ?? session?.linkExpiresAt ?? null;
  const countdown = useCountdown(effectiveExpiresAt);
  const expiredNow =
    sourceExpired || (session?.linkExpired ?? false) || (countdown?.expired ?? false);
  const hasStoredLink = session?.hasLink ?? false;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const target = draft.trim();
    if (!target) return;

    setLoadError(null);
    loadVideo(target);
    setDraft('');
    // The server persists the encrypted link on room:load; refresh the
    // metadata shortly after so the status card reflects it.
    window.setTimeout(refreshSession, 700);
  };

  const loadTestStream = () => {
    setLoadError(null);
    loadVideo(TEST_STREAM);
  };

  const copyLink = async () => {
    if (!sessionId) return;
    setCopyMessage(null);
    try {
      const { url } = await api.sessions.link(sessionId);
      await copyText(url);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2500);
    } catch (e) {
      setCopyState('error');
      setCopyMessage(e instanceof Error ? e.message : 'No se pudo copiar el link.');
    }
  };

  const reuseStoredLink = async () => {
    if (!sessionId) return;
    setLoadError(null);
    try {
      const { url, expired } = await api.sessions.link(sessionId);
      if (expired) {
        setLoadError('El link guardado ya venció. Pegá uno nuevo del estudio.');
        return;
      }
      loadVideo(url);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'No se pudo reutilizar el link.');
    }
  };

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

          {expiredNow ? (
            <p className="error-banner" role="status">
              El link de esta sesión venció. Podés copiarlo o pegar el link nuevo del
              estudio para continuar desde donde iban.
            </p>
          ) : null}

          {loadedSrc && !expiredNow ? (
            <VideoPlayer src={loadedSrc} videoRef={videoRef} />
          ) : (
            <div className="player-empty">
              <p>
                {expiredNow
                  ? 'El link guardado ya no sirve para reproducir.'
                  : 'Pegá el link del estudio para empezar la sesión.'}
              </p>
              <button className="btn" onClick={loadTestStream}>
                Probar con un HLS de prueba
              </button>
            </div>
          )}
        </div>

        <aside className="panel" aria-label="Sala compartida">
          <h2>Sala compartida</h2>

          <form className="link-form" onSubmit={submit}>
            <label className="field" htmlFor="src">
              Link del estudio (se guarda encriptado)
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
            <button className="btn btn-primary" type="submit">
              Cargar video
            </button>
          </form>

          <div
            className={`link-card ${expiredNow ? 'is-expired' : hasStoredLink ? 'is-valid' : ''}`}
          >
            <div className="link-card-head">
              <span className="link-card-title">Link del estudio</span>
              <span
                className={`link-badge ${
                  !hasStoredLink ? 'is-empty' : expiredNow ? 'is-expired' : 'is-valid'
                }`}
              >
                {!hasStoredLink ? 'sin guardar' : expiredNow ? 'vencido' : 'guardado'}
              </span>
            </div>

            {hasStoredLink ? (
              <>
                <p className="link-status-text">
                  {expiredNow
                    ? 'El link guardado venció. Podés copiarlo igual o pegar uno nuevo.'
                    : 'Guardado encriptado en la base. No se muestra en pantalla.'}
                </p>

                {expiredNow ? (
                  <p className="link-countdown is-expired">
                    Dejó de servir
                    {countdown ? (
                      <span className="link-clock">
                        {' '}
                        · vencimiento nominal a las {countdown.clock}
                      </span>
                    ) : null}
                  </p>
                ) : countdown ? (
                  <p className="link-countdown">
                    {countdown.label}
                    <span className="link-clock"> · vence a las {countdown.clock}</span>
                  </p>
                ) : (
                  <p className="link-countdown">El link no declara vencimiento.</p>
                )}

                <div className="link-actions">
                  <button type="button" className="btn btn-small" onClick={copyLink}>
                    {copyState === 'copied' ? 'Copiado ✓' : 'Copiar link'}
                  </button>
                  {!expiredNow && !loadedSrc ? (
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={reuseStoredLink}
                    >
                      Reutilizar
                    </button>
                  ) : null}
                </div>

                {copyState === 'error' && copyMessage ? (
                  <p className="error-banner" role="alert">
                    {copyMessage}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="link-status-text">
                Todavía no hay un link guardado en esta sesión.
              </p>
            )}
          </div>

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
            <ul className="member-list" aria-label="Personas en la sala">
              {members.map((member) => (
                <li key={member.id} className="member-chip">
                  {member.name}
                </li>
              ))}
            </ul>
          ) : null}

          {session && session.positionSeconds >= 60 ? (
            <p className="play-desc saved-minutes">
              Guardado: van {Math.floor(session.positionSeconds / 60)} min de esta sesión.
            </p>
          ) : null}
        </aside>
      </div>
    </>
  );
}
