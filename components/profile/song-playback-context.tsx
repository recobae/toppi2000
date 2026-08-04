"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

const MAX_PLAYBACK_MS = 30_000;

type SongPlaybackContextValue = {
  isPlaying: boolean;
  toggle: () => void;
};

const SongPlaybackContext = createContext<SongPlaybackContextValue | null>(null);

/**
 * First Context in this codebase (checked -- no prior pattern to follow).
 * One shared <audio> element + one isPlaying state per favorite song, so
 * the big hero avatar and the sticky mini nav icon (Design-Iteration 2,
 * Punkt 6) both control the exact same playback instead of each owning a
 * separate <audio> that could play simultaneously.
 */
export function SongPlaybackProvider({
  previewUrl,
  children,
}: {
  previewUrl: string;
  children: ReactNode;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearStopTimeout = () => {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      clearStopTimeout();
      audio?.pause();
    };
  }, []);

  const stop = () => {
    clearStopTimeout();
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      stop();
      return;
    }

    // Synchronous, no await before play() -- required for iOS to treat
    // this as a user gesture. Both triggers (hero avatar, mini icon) call
    // this same toggle() directly from their own onClick, so that holds
    // for either one.
    audio.currentTime = 0;
    audio.play().catch(() => {});
    setIsPlaying(true);
    clearStopTimeout();
    stopTimeoutRef.current = setTimeout(stop, MAX_PLAYBACK_MS);
  };

  return (
    <SongPlaybackContext.Provider value={{ isPlaying, toggle }}>
      {children}
      <audio ref={audioRef} src={previewUrl} preload="none" onEnded={stop} />
    </SongPlaybackContext.Provider>
  );
}

export function useSongPlayback(): SongPlaybackContextValue {
  const context = useContext(SongPlaybackContext);
  if (!context) {
    throw new Error("useSongPlayback must be used within a SongPlaybackProvider");
  }
  return context;
}
