import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket } from './socket';

export type Member = { id: string; name: string };

export type RoomView = {
  roomId: string;
  playId: string;
  sourceUrl: string | null;
  isPlaying: boolean;
  position: number;
  version: number;
  members: Member[];
};

const DISPLAY_NAME_KEY = 'obrateatral:display-name';

export function readDisplayName(): string {
  return window.localStorage.getItem(DISPLAY_NAME_KEY) ?? '';
}

export function writeDisplayName(value: string) {
  window.localStorage.setItem(DISPLAY_NAME_KEY, value.trim());
}

export function useRoomSync({
  roomId,
  videoRef,
  loadedSrc,
  onLoadSource,
}: {
  roomId: string | undefined;
  videoRef: RefObject<HTMLVideoElement | null>;
  loadedSrc: string | null;
  onLoadSource: (url: string) => void;
}) {
  const socketRef = useRef<Socket | null>(null);

  const [connected, setConnected] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);

  const applyingRemote = useRef(false);
  const versionRef = useRef(0);
  const latestState = useRef<RoomView | null>(null);
  const loadedSrcRef = useRef(loadedSrc);

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
      socket.emit('room:join', { roomId, name: readDisplayName() });
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

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onState);

    if (socket.connected) {
      setConnected(true);
      join();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onState);
      socket.emit('room:leave', { roomId });
    };
  }, [roomId, applyRemoteState]);

  // Local intents + drift ticks, re-attached whenever the source changes.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => {
      if (!applyingRemote.current) socketRef.current?.emit('room:play', { roomId });
    };
    const onPause = () => {
      if (!applyingRemote.current) socketRef.current?.emit('room:pause', { roomId });
    };
    const onSeeked = () => {
      if (!applyingRemote.current) {
        socketRef.current?.emit('room:seek', { roomId, time: video.currentTime });
      }
    };
    const onLoadedMetadata = () => {
      if (latestState.current) applyToVideo(latestState.current);
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('loadedmetadata', onLoadedMetadata);

    const tick = window.setInterval(() => {
      if (!applyingRemote.current) {
        socketRef.current?.emit('room:tick', { roomId, time: video.currentTime });
      }
    }, 5000);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      window.clearInterval(tick);
    };
  }, [applyToVideo, loadedSrc, roomId, videoRef]);

  const loadVideo = useCallback(
    (url: string) => {
      socketRef.current?.emit('room:load', { roomId, sourceUrl: url.trim() });
    },
    [roomId],
  );

  return { connected, members, loadVideo };
}
