import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Play } from '../../lib/types';
import VideoPlayer from '../../components/VideoPlayer/VideoPlayer';
import { readDisplayName, useRoomSync, writeDisplayName } from '../../lib/useRoomSync';

// Public HLS stream, used to validate the player while the studio link arrives.
const TEST_STREAM = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

export default function Watch() {
  const { playId } = useParams<{ playId: string }>();

  const [play, setPlay] = useState<Play | null>(null);
  const [draft, setDraft] = useState('');
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState(() => readDisplayName());

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    api
      .listPlays()
      .then((list) => setPlay(list.find((p) => p.id === playId) ?? null))
      .catch(() => setPlay(null));
  }, [playId]);

  const { connected, members, loadVideo } = useRoomSync({
    roomId: playId,
    videoRef,
    loadedSrc,
    onLoadSource: setLoadedSrc,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const target = draft.trim();
    if (target) loadVideo(target);
  };

  const loadTestStream = () => loadVideo(TEST_STREAM);

  return (
    <>
      <div className="page-intro">
        <h1>{play ? play.title : 'Sala de visionado'}</h1>
        <p>
          <Link to="/">← Volver al catálogo</Link>
        </p>
      </div>

      <div className="watch-layout">
        <div>
          {loadedSrc ? (
            <VideoPlayer src={loadedSrc} videoRef={videoRef} />
          ) : (
            <div className="player-empty">
              <p>Cargá el link del estudio de esta obra para empezar.</p>
              <button className="btn" onClick={loadTestStream}>
                Probar con un HLS de prueba
              </button>
            </div>
          )}
        </div>

        <aside className="panel" aria-label="Sala compartida">
          <h2>Sala compartida</h2>

          <label className="field" htmlFor="display-name">
            Tu nombre en la sala
            <input
              id="display-name"
              className="field-input"
              value={displayName}
              placeholder="Mauro"
              onChange={(event) => {
                setDisplayName(event.target.value);
                writeDisplayName(event.target.value);
              }}
              maxLength={40}
              autoComplete="off"
            />
          </label>

          <form onSubmit={submit}>
            <label className="field" htmlFor="src">
              Link del estudio (HLS, vigente 4 h)
              <input
                id="src"
                className="field-input"
                type="url"
                placeholder="https://…/master.m3u8?t=…"
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
                  {member.name || 'Invitado'}
                </li>
              ))}
            </ul>
          ) : null}

          {play ? (
            <p className="play-desc" style={{ color: 'var(--text-dim)' }}>
              Obra {play.order} · duración aprox. {play.durationMinutes} min
            </p>
          ) : null}
        </aside>
      </div>
    </>
  );
}
