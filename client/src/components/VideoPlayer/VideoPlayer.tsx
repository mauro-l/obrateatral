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

    const isHls = /\.m3u8([?#]|$)/i.test(src);
    let hls: Hls | null = null;

    const detach = () => {
      hls?.destroy();
      hls = null;
      video.removeAttribute('src');
      video.load();
    };

    if (!isHls) {
      // Progressive file (.mp4/.webm/...): the browser fetches it directly with
      // <video src>, which needs no CORS at all. Only the browser's codec
      // support decides.
      const onError = () => {
        setError(
          'No se pudo reproducir el link. Puede haber vencido o el formato no es compatible con este navegador.',
        );
      };

      video.addEventListener('error', onError);
      video.src = src;
      video.load();

      return () => {
        video.removeEventListener('error', onError);
        detach();
      };
    }

    // HLS: Chrome cannot play it natively, so hls.js (MSE) is mandatory.
    if (Hls.isSupported()) {
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
            'No se pudo cargar el manifiesto. El link puede haber vencido o el servidor no permite acceso desde este origen (CORS).',
          );
        } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setError('Error de red al cargar el video. Revisá el link o la conexión.');
        } else if (data.fatal) {
          setError('No se pudo reproducir el video. Probá con un link nuevo.');
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
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
