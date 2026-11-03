import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import Hls from 'hls.js';

export default function VideoPlayer({
  src,
  videoRef,
}: {
  src: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setError(null);

    // The studio serves HLS only, and Chrome cannot play it natively.
    // hls.js (MSE) is mandatory here. Safari can use its native HLS path.
    const isHls = /\.m3u8([?#]|$)/i.test(src);

    let hls: Hls | null = null;
    const detach = () => {
      hls?.destroy();
      hls = null;
      video.removeAttribute('src');
      video.load();
    };

    if (isHls && Hls.isSupported()) {
      hls = new Hls({
        maxBufferLength: 45,
        maxMaxBufferLength: 90,
        enableWorker: true,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR) {
          setError(
            'No se pudo cargar el manifiesto (master.m3u8). El link puede haber vencido o el servidor no permite acceso desde este origen (CORS).',
          );
        } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setError('Error de red al cargar el video. Revisá la conexión o el link.');
        } else if (data.fatal) {
          setError('No se pudo reproducir el video. Recargá o probá un link nuevo.');
        }
      });
    } else if (isHls && video.canPlayType('application/vnd.apple.mpegurl').length > 0) {
      video.src = src;
    } else {
      setError('Este navegador no puede reproducir HLS. Probá con Chrome o Safari.');
    }

    return detach;
  }, [src, videoRef]);

  return (
    <div className="player-shell">
      <video
        ref={videoRef}
        controls
        playsInline
        preload="metadata"
        aria-label="Reproductor de video"
      >
        Tu navegador no soporta el elemento de video.
      </video>
      {error ? (
        <p className="error-banner" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
