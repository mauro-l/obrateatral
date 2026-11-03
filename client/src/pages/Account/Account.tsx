import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';

export default function Account() {
  const { user } = useAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);

    if (next !== repeat) {
      setError('Las contraseñas nuevas no coinciden.');
      return;
    }

    setBusy(true);
    try {
      await api.changePassword(current, next);
      setSaved(true);
      setCurrent('');
      setNext('');
      setRepeat('');
    } catch (error) {
      setError(error instanceof ApiError ? error.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-intro">
        <h1>Mi cuenta</h1>
        <p><Link to="/">← Volver al catálogo</Link></p>
      </div>

      <form className="account-card" onSubmit={submit}>
        <p className="account-user">Sesión iniciada como <strong>{user?.name}</strong></p>

        {error ? <p className="error-banner">{error}</p> : null}
        {saved ? (
          <p className="saved-banner" role="status">Contraseña actualizada.</p>
        ) : null}

        <label className="field" htmlFor="current">
          Contraseña actual
          <input
            id="current"
            className="field-input"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </label>

        <label className="field" htmlFor="new">
          Contraseña nueva
          <input
            id="new"
            className="field-input"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            minLength={6}
            required
          />
        </label>

        <label className="field" htmlFor="repeat">
          Repetir contraseña nueva
          <input
            id="repeat"
            className="field-input"
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            minLength={6}
            required
          />
        </label>

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Guardando…' : 'Cambiar contraseña'}
        </button>
      </form>
    </>
  );
}
