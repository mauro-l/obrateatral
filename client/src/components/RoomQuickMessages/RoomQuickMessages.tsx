import { useRef, useState } from 'react';
import {
  type RoomMessage,
  type RoomMessageKind,
} from '../../lib/useRoomSync';
import { DEFAULT_QUICK_MESSAGES } from '../../lib/useQuickMessages';

const REACTIONS = ['😂', '🤣', '😅', '❤️', '👏', '👍'];

export default function RoomQuickMessages({
  roomId,
  messages,
  connected,
  onSend,
  customMessages,
}: {
  roomId: string;
  messages: RoomMessage[];
  connected: boolean;
  onSend: (text: string, kind: RoomMessageKind) => boolean;
  customMessages: string[];
}) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  const closePanel = () => {
    setOpen(false);
    window.requestAnimationFrame(() => toggleRef.current?.focus());
  };

  const send = (text: string, kind: RoomMessageKind) => {
    if (!connected || !onSend(text, kind)) return;
    closePanel();
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
        <section
          className="quick-message-panel"
          id="room-quick-messages-panel"
          aria-label="Mensajes rápidos"
        >
          <button
            type="button"
            className="quick-message-close"
            aria-label="Cerrar mensajes rápidos"
            onClick={closePanel}
          >
            ×
          </button>

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
              {[...DEFAULT_QUICK_MESSAGES, ...customMessages].map((message) => (
                <button
                  key={message}
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
