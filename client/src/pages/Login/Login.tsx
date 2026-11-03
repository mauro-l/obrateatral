import { useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const destination =
    (location.state as { from?: string } | null)?.from ?? '/';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await api.login(name.trim(), password);
      await refresh();
      navigate(destination, { replace: true });
    } catch (error) {
      setError(error instanceof ApiError ? error.message : 'No se pudo iniciar sesión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <p className="wordmark-sub">OBRATEATRAL · SALA PRIVADA</p>
        <h1>Entrar</h1>
        <p className="login-copy">Esta sala es privada para los que analizan las obras.</p>

        {error ? <p className="error-banner">{error}</p> : null}

        <label className="field" htmlFor="name">
          Nombre
          <input
            id="name"
            className="field-input"
            type="text"
            autoComplete="username"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </label>

        <label className="field" htmlFor="password">
          Contraseña
          <input
            id="password"
            className="field-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
