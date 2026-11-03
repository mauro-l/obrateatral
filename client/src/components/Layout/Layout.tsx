import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';

export default function Layout() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();

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
