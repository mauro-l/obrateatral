import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import type { AdminUser } from '../../lib/api';
import { useAuth } from '../../lib/auth';

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

function suggestPassword(length = 8): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => ALPHABET[n % ALPHABET.length]).join('');
}

function message(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function UserRow({
  user,
  isSelf,
  onSaved,
}: {
  user: AdminUser;
  isSelf: boolean;
  onSaved: (notice: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await api.admin.updateUser(user.id, {
        ...(name.trim() && name.trim() !== user.name ? { name: name.trim() } : {}),
        ...(password ? { password } : {}),
      });
      setEditing(false);
      setPassword('');
      onSaved(`Guardado: ${name.trim() || user.name}`);
    } catch (error) {
      setError(message(error, 'No se pudo guardar.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="admin-user">
      <div className="admin-user-summary">
        <strong>{user.name}</strong>
        <span className="admin-role">{user.role === 'admin' ? 'admin' : 'miembro'}</span>
        {isSelf ? <span className="admin-self">vos</span> : null}
        <button className="btn btn-ghost" type="button" onClick={() => setEditing((v) => !v)}>
          {editing ? 'Cancelar' : 'Editar'}
        </button>
      </div>

      {editing ? (
        <form className="admin-edit" onSubmit={save}>
          <label className="field" htmlFor={`name-${user.id}`}>
            Nombre
            <input
              id={`name-${user.id}`}
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSelf}
              maxLength={40}
              autoComplete="off"
            />
          </label>

          <label className="field" htmlFor={`pass-${user.id}`}>
            Nueva contraseña (vacío = no cambiar)
            <input
              id={`pass-${user.id}`}
              className="field-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              autoComplete="new-password"
            />
          </label>

          {error ? <p className="error-banner">{error}</p> : null}

          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      ) : null}
    </li>
  );
}

export default function Admin() {
  const { user } = useAuth();

  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsers(await api.admin.listUsers());
    } catch (error) {
      setError(message(error, 'No se pudieron cargar los usuarios.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user) return null;
  if (user.role !== 'admin') return <Navigate to="/" replace />;

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const created = await api.admin.createUser(name.trim(), password);
      setNotice(`Usuario ${created.name} creado. Pasale la contraseña: ${password}`);
      setName('');
      setPassword('');
      await load();
    } catch (error) {
      setError(message(error, 'No se pudo crear el usuario.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-intro">
        <h1>Cuentas</h1>
        <p>
          <Link to="/">← Volver al catálogo</Link>
        </p>
      </div>

      {error ? <p className="error-banner">{error}</p> : null}
      {notice ? <p className="saved-banner">{notice}</p> : null}

      <form className="account-card" onSubmit={create}>
        <h2>Nueva cuenta</h2>

        <label className="field" htmlFor="new-name">
          Nombre
          <input
            id="new-name"
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            autoComplete="off"
            required
          />
        </label>

        <label className="field" htmlFor="new-pass">
          Contraseña
          <input
            id="new-pass"
            className="field-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            autoComplete="new-password"
            required
          />
        </label>

        <button
          className="btn"
          type="button"
          onClick={() => setPassword(suggestPassword())}
        >
          Generar contraseña
        </button>

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>

      <h2 style={{ marginTop: '2rem' }}>Cuentas existentes</h2>

      {!users ? (
        <p className="state-message">Cargando…</p>
      ) : (
        <ul className="admin-list">
          {users.map((row) => (
            <UserRow
              key={row.id}
              user={row}
              isSelf={row.id === user.id}
              onSaved={(text) => {
                setNotice(text);
                void load();
              }}
            />
          ))}
        </ul>
      )}
    </>
  );
}
