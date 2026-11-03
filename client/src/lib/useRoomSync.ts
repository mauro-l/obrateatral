import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket } from './socket';

export type Member = { id: string; name: string };

export type RoomView = {
  roomId: string;
  playId: string;
  sourceUrl: string | null;
  sourceExpired: boolean;
  expiresAt: number | null;
  isPlaying: boolean;
  position: number;
  version: number;
  members: Member[];
};

export function useRoomSync({
  roomId,
  videoRef,
  loadedSrc,
  onLoadSource,
  resumePosition = null,
}: {
  roomId: string | undefined;
  videoRef: RefObject<HTMLVideoElement | null>;
  loadedSrc: string | null;
  onLoadSource: (url: string | null) => void;
  /** Furthest saved position for this obra, in seconds. Used to seek both
   *  players forward right after a fresh link is loaded. */
  resumePosition?: number | null;
}) {
  const socketRef = useRef<Socket | null>(null);

  const [connected, setConnected] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sourceExpired, setSourceExpired] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);

  const applyingRemote = useRef(false);
  const versionRef = useRef(0);
  const latestState = useRef<RoomView | null>(null);
  const loadedSrcRef = useRef(loadedSrc);
  /** Set right before we move the element ourselves. Our seeking/seeked events are not user intent. */
  const programmaticSeek = useRef(false);
  const lastSeekEmitted = useRef<number | null>(null);

  useEffect(() => {
    loadedSrcRef.current = loadedSrc;
  }, [loadedSrc]);

  /** Apply an authoritative server state to the <video> element. */
  const applyToVideo = useCallback(
    (state: RoomView) => {
      const video = videoRef.current;
      if (!video) return;

      applyingRemote.current = true;

      // A snapshot is authoritative even if the element is not seekable yet;
      // loadedmetadata will re-apply it once it is.
      if (Math.abs(video.currentTime - state.position) > 1.5) {
        programmaticSeek.current = true;
        video.currentTime = state.position;
      }

      if (state.isPlaying && video.paused) void video.play();
      else if (!state.isPlaying && !video.paused) video.pause();

      window.setTimeout(() => {
        applyingRemote.current = false;
      }, 250);
    },
    [videoRef],
  );

  const applyRemoteState = useCallback(
    (state: RoomView) => {
      latestState.current = state;
      versionRef.current = Math.max(versionRef.current, state.version);
      setMembers(state.members);
      setSourceExpired(Boolean(state.sourceExpired));
      setExpiresAt(state.expiresAt ?? null);

      if (state.sourceUrl) setError(null);

      // An expired studio link must stop feeding the player: it only yields a promo.
      if (state.sourceExpired) {
        onLoadSource(null);
        return;
      }

      if (state.sourceUrl && state.sourceUrl !== loadedSrcRef.current) {
        onLoadSource(state.sourceUrl);
      }

      applyToVideo(state);
    },
    [applyToVideo, onLoadSource],
  );

  // Connection lifecycle.
  useEffect(() => {
    if (!roomId) return;

    const socket = getSocket();
    socketRef.current = socket;

    const join = () => {
      socket.emit('room:join', { roomId });
    };

    const onConnect = () => {
      setConnected(true);
      join();
    };
    const onDisconnect = () => setConnected(false);
    const onState = (state: RoomView) => {
      if (state.version < versionRef.current) return;
      applyRemoteState(state);
    };
    const onError = (payload: { message?: string }) => {
      setError(payload?.message ?? 'No se pudo cargar el link.');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onState);
    socket.on('room:error', onError);

    if (socket.connected) {
      setConnected(true);
      join();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onState);
      socket.off('room:error', onError);
      socket.emit('room:leave', { roomId });
    };
  }, [roomId, applyRemoteState]);

  // Local intents + drift ticks + resume, re-attached whenever the source changes.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let resumeArmed = true;

    const onPlay = () => {
      if (!applyingRemote.current) socketRef.current?.emit('room:play', { roomId });
    };
    const onPause = () => {
      if (!applyingRemote.current) socketRef.current?.emit('room:pause', { roomId });
    };
    const emitSeek = (time: number) => {
      if (lastSeekEmitted.current === time) return;
      lastSeekEmitted.current = time;
      socketRef.current?.emit('room:seek', { roomId, time });
    };
    const onSeeking = () => {
      if (programmaticSeek.current) return; // our own seek
      emitSeek(video.currentTime);
    };
    const onSeeked = () => {
      if (programmaticSeek.current) {
        programmaticSeek.current = false;
        return;
      }
      emitSeek(video.currentTime);
    };
    const onLoadedMetadata = () => {
      const state = latestState.current;
      if (state) applyToVideo(state);

      // Freshly loaded link and the room restarted at 0: pull both players to
      // the last saved position. The server persists and rebroadcasts it.
      if (resumeArmed && resumePosition && resumePosition > 5) {
        if (state && state.position < 2) {
          socketRef.current?.emit('room:seek', { roomId, time: resumePosition });
        }
        resumeArmed = false;
      }
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeking', onSeeking);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('loadedmetadata', onLoadedMetadata);

    const tick = window.setInterval(() => {
      if (!applyingRemote.current) {
        socketRef.current?.emit('room:tick', { roomId, time: video.currentTime, seeking: video.seeking });
      }
    }, 5000);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeking', onSeeking);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      window.clearInterval(tick);
    };
  }, [applyToVideo, loadedSrc, roomId, videoRef, resumePosition]);

  const loadVideo = useCallback(
    (url: string) => {
      socketRef.current?.emit('room:load', { roomId, sourceUrl: url.trim() });
    },
    [roomId],
  );

  return { connected, members, loadVideo, error, sourceExpired, expiresAt };
}
