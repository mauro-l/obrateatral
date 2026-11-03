import { useEffect } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';

// Render's free tier sleeps the service after ~15 minutes without inbound
// traffic, which kills any open WebSocket session. Ping while the tab is
// open so a 4-hour session is never dropped for inactivity.
const KEEP_ALIVE_MS = 5 * 60 * 1000;

export default function Layout() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const ping = () => {
      void fetch('/health', { credentials: 'include' }).catch(() => undefined);
    };

    ping();
    const id = window.setInterval(ping, KEEP_ALIVE_MS);
    return () => window.clearInterval(id);
  }, []);

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      await refresh();
      navigate('/entrar', { replace: true });
    }
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="wordmark" to="/">
          <span className="wordmark-name">Obrateatral</span>
          <span className="wordmark-sub">Sala privada</span>
        </Link>

        <nav className="site-nav" aria-label="Navegación principal">
          <NavLink to="/" end>
            Catálogo
          </NavLink>
          <NavLink to="/historial">Historial</NavLink>
          <NavLink to="/cuenta">Mi cuenta</NavLink>

          {user ? (
            <button className="btn btn-ghost" onClick={logout} title={`Cerrar sesión de ${user.name}`}>
              Salir · {user.name}
            </button>
          ) : null}
        </nav>
      </header>

      <main>
        <Outlet />
      </main>
    </div>
  );
}
