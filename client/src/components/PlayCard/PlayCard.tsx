import { Link } from 'react-router-dom';
import type { Play, ProgressItem } from '../../lib/types';

function formatPosition(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export default function PlayCard({
  play,
  progress,
}: {
  play: Play;
  progress?: ProgressItem;
}) {
  const totalSeconds = play.durationMinutes * 60;
  const percent = progress
    ? Math.min(100, (progress.lastPosition / Math.max(1, totalSeconds)) * 100)
    : 0;

  return (
    <Link className="play-card" to={`/obra/${play.id}`}>
      <div
        className="play-cover"
        role="img"
        aria-label={`Portada de ${play.title}`}
      >
        <p className="play-order">{String(play.order).padStart(2, '0')}</p>
      </div>

      <div className="play-body">
        <h2>{play.title}</h2>
        <p className="play-desc">{play.description}</p>

        {percent > 0 ? (
          <div
            className="progress"
            role="progressbar"
            aria-label={`Progreso de ${play.title}`}
            aria-valuenow={Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
        ) : null}

        <div className="play-meta">
          <span>{play.durationMinutes} min</span>
          <span>
            {progress?.completed ? (
              <span className="badge-done">Vista ✓</span>
            ) : progress && progress.lastPosition > 1 ? (
              `en ${formatPosition(progress.lastPosition)}`
            ) : (
              'sin empezar'
            )}
          </span>
        </div>
      </div>
    </Link>
  );
}
