import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Play } from '../../lib/types';
import VideoPlayer from '../../components/VideoPlayer/VideoPlayer';

// Public HLS stream, used to validate the player while the studio link arrives.
const TEST_STREAM = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

export default function Watch() {
  const { playId } = useParams<{ playId: string }>();

  const [plays, setPlays] = useState<Play[] | null>(null);
  const [play, setPlay] = useState<Play | null>(null);

  const [draft, setDraft] = useState('');
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);

  useEffect(() => {
    api
      .listPlays()
      .then((list) => {
        setPlays(list);
        setPlay(list.find((p) => p.id === playId) ?? null);
      })
      .catch(() => setPlays([]));
  }, [playId]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const target = draft.trim();
    if (target) setLoadedSrc(target);
  };

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
            <VideoPlayer src={loadedSrc} />
          ) : (
            <div className="player-empty">
              <p>Cargá el link del estudio de esta obra para empezar.</p>
              <button className="btn" onClick={() => setLoadedSrc(TEST_STREAM)}>
                Probar con un HLS de prueba
              </button>
            </div>
          )}
        </div>

        <aside className="panel" aria-label="Sala compartida">
          <h2>Sala compartida</h2>

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
            <span className="dot dot-connecting" aria-hidden="true" />
            <span>Sincronización pendiente: se conecta al entrar en la sala.</span>
          </div>

          {play ? (
            <p className="play-desc" style={{ color: 'var(--text-dim)' }}>
              Obra {play.order} · duración aprox. {play.durationMinutes} min
            </p>
          ) : null}
        </aside>
      </div>

      {plays ? null : <p className="state-message">Cargando datos de la obra…</p>}
    </>
  );
}
