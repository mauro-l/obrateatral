import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  type RoomMessage,
  type RoomMessageKind,
} from '../../lib/useRoomSync';

const STORAGE_KEY = 'obrateatral:quick-messages:v1';
const DEFAULT_MESSAGES = ['Ya vuelvo', 'Espera 5', 'Pongo play'];
const REACTIONS = ['😂', '🤣', '😅', '❤️', '👏', '👍'];
const MAX_CUSTOM_MESSAGES = 8;
const MAX_MESSAGE_LENGTH = 80;

function readCustomMessages(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((message): message is string => typeof message === 'string')
      .map((message) => message.trim())
      .filter((message) => message.length > 0 && message.length <= MAX_MESSAGE_LENGTH)
      .slice(0, MAX_CUSTOM_MESSAGES);
  } catch {
    return [];
  }
}

export default function RoomQuickMessages({
  roomId,
  messages,
  connected,
  onSend,
}: {
  roomId: string;
  messages: RoomMessage[];
  connected: boolean;
  onSend: (text: string, kind: RoomMessageKind) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [customMessages, setCustomMessages] = useState(readCustomMessages);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customMessages));
    } catch {
      // Messaging still works when browser storage is unavailable.
    }
  }, [customMessages]);

  const closePanel = () => {
    setOpen(false);
    window.requestAnimationFrame(() => toggleRef.current?.focus());
  };

  const send = (text: string, kind: RoomMessageKind) => {
    if (!connected || !onSend(text, kind)) return;
    closePanel();
  };

  const addCustomMessage = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || text.length > MAX_MESSAGE_LENGTH || customMessages.length >= MAX_CUSTOM_MESSAGES) {
      return;
    }
    if (customMessages.some((message) => message.toLocaleLowerCase() === text.toLocaleLowerCase())) {
      return;
    }

    setCustomMessages((current) => [...current, text]);
    setDraft('');
  };

  const visibleMessages = messages.filter((message) => message.roomId === roomId);

  return (
    <div className="quick-message-widget">
      <button
        type="button"
        className="quick-message-toggle"
        ref={toggleRef}
        aria-label={open ? 'Cerrar mensajes rápidos' : 'Abrir mensajes rápidos'}
        aria-expanded={open}
        aria-controls="room-quick-messages-panel"
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">💬</span>
      </button>

      {open ? (
        <section className="quick-message-panel" id="room-quick-messages-panel" aria-label="Mensajes rápidos">
          <div className="quick-message-panel-header">
            <h2>Mensajes rápidos</h2>
            <button
              type="button"
              className="quick-message-close"
              aria-label="Cerrar mensajes rápidos"
              onClick={closePanel}
            >
              ×
            </button>
          </div>

          {!connected ? <p className="quick-message-offline">Conectando con la sala…</p> : null}

          <div className="quick-message-section">
            <h3>Reacciones</h3>
            <div className="quick-reaction-list">
              {REACTIONS.map((reaction) => (
                <button
                  key={reaction}
                  type="button"
                  className="quick-reaction-button"
                  aria-label={`Enviar reacción ${reaction}`}
                  disabled={!connected}
                  onClick={() => send(reaction, 'reaction')}
                >
                  {reaction}
                </button>
              ))}
            </div>
          </div>

          <div className="quick-message-section">
            <h3>Frases</h3>
            <div className="quick-message-list">
              {[...DEFAULT_MESSAGES, ...customMessages].map((message, index) => (
                <button
                  key={`${index}-${message}`}
                  type="button"
                  className="quick-message-option"
                  disabled={!connected}
                  onClick={() => send(message, 'text')}
                >
                  {message}
                </button>
              ))}
            </div>
          </div>

          <div className="quick-message-editor">
            <button
              type="button"
              className="quick-message-edit-toggle"
              aria-expanded={editing}
              onClick={() => setEditing((current) => !current)}
            >
              {editing ? 'Listo' : 'Editar mis frases'}
            </button>

            {editing ? (
              <div className="quick-message-edit-content">
                <form className="quick-message-form" onSubmit={addCustomMessage}>
                  <label htmlFor="quick-message-draft">Nueva frase</label>
                  <div className="quick-message-input-row">
                    <input
                      id="quick-message-draft"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      maxLength={MAX_MESSAGE_LENGTH}
                      placeholder="Escribí una frase corta"
                      autoComplete="off"
                    />
                    <button
                      type="submit"
                      className="btn btn-small"
                      disabled={!draft.trim() || customMessages.length >= MAX_CUSTOM_MESSAGES}
                    >
                      Añadir
                    </button>
                  </div>
                  <small>{customMessages.length}/{MAX_CUSTOM_MESSAGES} frases personalizadas</small>
                </form>

                {customMessages.length > 0 ? (
                  <ul className="quick-message-custom-list" aria-label="Mis frases personalizadas">
                    {customMessages.map((message) => (
                      <li key={message}>
                        <span>{message}</span>
                        <button
                          type="button"
                          aria-label={`Eliminar ${message}`}
                          onClick={() =>
                            setCustomMessages((current) => current.filter((item) => item !== message))
                          }
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {visibleMessages.length > 0 ? (
        <div className="quick-message-notices" aria-live="polite" aria-label="Mensajes recientes">
          {visibleMessages.map((message) => (
            <div className="quick-message-notice" key={message.id}>
              <strong>{message.name}</strong>
              <span className={message.kind === 'reaction' ? 'quick-message-notice-reaction' : ''}>
                {message.text}
              </span>
            </div>
          ))}
        </div>
      ) : null}

    </div>
  );
}
