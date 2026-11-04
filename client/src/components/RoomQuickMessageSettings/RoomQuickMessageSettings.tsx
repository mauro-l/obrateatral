import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  MAX_CUSTOM_QUICK_MESSAGES,
  MAX_QUICK_MESSAGE_LENGTH,
} from '../../lib/useQuickMessages';

export default function RoomQuickMessageSettings({
  customMessages,
  onAdd,
  onRemove,
}: {
  customMessages: string[];
  onAdd: (message: string) => boolean;
  onRemove: (message: string) => void;
}) {
  const [draft, setDraft] = useState('');

  const addMessage = (event: FormEvent) => {
    event.preventDefault();
    if (onAdd(draft)) setDraft('');
  };

  return (
    <details className="quick-message-settings">
      <summary>Editar frases rápidas</summary>
      <form className="quick-message-form" onSubmit={addMessage}>
        <label htmlFor="quick-message-draft">Nueva frase</label>
        <div className="quick-message-input-row">
          <input
            id="quick-message-draft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={MAX_QUICK_MESSAGE_LENGTH}
            placeholder="Escribí una frase corta"
            autoComplete="off"
          />
          <button
            type="submit"
            className="btn btn-small"
            disabled={!draft.trim() || customMessages.length >= MAX_CUSTOM_QUICK_MESSAGES}
          >
            Añadir
          </button>
        </div>
        <small>
          {customMessages.length}/{MAX_CUSTOM_QUICK_MESSAGES} frases personalizadas
        </small>
      </form>

      {customMessages.length > 0 ? (
        <ul className="quick-message-custom-list" aria-label="Mis frases personalizadas">
          {customMessages.map((message) => (
            <li key={message}>
              <span>{message}</span>
              <button
                type="button"
                aria-label={`Eliminar ${message}`}
                onClick={() => onRemove(message)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}
