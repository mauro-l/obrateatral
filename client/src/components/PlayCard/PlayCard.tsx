import { Link } from 'react-router-dom';
import type { Play } from '../../lib/types';

export default function PlayCard({ play }: { play: Play }) {
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

        <div className="play-meta">
          <span>{play.durationMinutes} min</span>
        </div>
      </div>
    </Link>
  );
}
