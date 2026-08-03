"use client";

import { useEffect, useRef, useState } from "react";
import { Square } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { STORY_RING_CLASS, STORY_RING_CLASS_INACTIVE } from "@/components/profile/story-ring-styles";

const MAX_PLAYBACK_MS = 30_000;

export type ProfileFavoriteSong = {
  title: string;
  artist: string | null;
  previewUrl: string;
  artworkUrl: string | null;
};

/**
 * Replaces ProfileStoryAvatar's tap behavior on the profile page (see
 * lib/feature-flags.ts's STORY_FEATURE_ENABLED) -- tapping a friend's
 * profile picture now plays their favorite-song preview instead of opening
 * a story. Same ring visual, reused/extended with a pulse while playing.
 *
 * play() is called synchronously inside the onClick handler, with no
 * await before it -- required for iOS to treat it as a user gesture and
 * actually start playback instead of silently ignoring it.
 *
 * The ring itself doubles as a "Neu" indicator (same role it played for
 * Stories): active/gradient while the current song is unheard by this
 * viewer, pulsing while actually playing, plain once heard. "Heard" is
 * recorded server-side (story_views, content_type "song") the moment
 * playback starts -- reaching the end isn't required.
 */
export function ProfileSongAvatar({
  username,
  avatarUrl,
  favoriteSong,
  isOwnProfile,
  targetUserId,
  hasUnseenSong,
}: {
  username: string;
  avatarUrl: string | null;
  favoriteSong: ProfileFavoriteSong | null;
  isOwnProfile: boolean;
  targetUserId: string;
  hasUnseenSong: boolean;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUnseen, setIsUnseen] = useState(hasUnseenSong);
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

  const avatar = (
    <span className="block rounded-full bg-background p-[3px]">
      <ProfileAvatar username={username} imageUrl={avatarUrl} />
    </span>
  );

  // Own profile keeps its existing behavior (settings are reached via the
  // separate gear icon next to the username) -- tapping your own picture
  // never triggers playback. No song set means a plain, non-interactive
  // avatar, same as "no active story" before it.
  if (isOwnProfile || !favoriteSong) {
    return <span className={STORY_RING_CLASS_INACTIVE}>{avatar}</span>;
  }

  const stop = () => {
    clearStopTimeout();
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  const markHeard = () => {
    if (!isUnseen) return;
    setIsUnseen(false);
    // Fire-and-forget -- playback already started synchronously above and
    // must not wait on this. Guests have no session to attribute a "heard"
    // row to, so this silently no-ops for them (playback still works).
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("story_views").upsert(
        {
          viewer_id: user.id,
          target_user_id: targetUserId,
          content_type: "song",
          viewed_at: new Date().toISOString(),
        },
        { onConflict: "viewer_id,target_user_id,content_type" },
      );
    })();
  };

  const handleClick = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      stop();
      return;
    }

    audio.currentTime = 0;
    audio.play().catch(() => {});
    setIsPlaying(true);
    markHeard();
    clearStopTimeout();
    stopTimeoutRef.current = setTimeout(stop, MAX_PLAYBACK_MS);
  };

  const ringClass = isPlaying
    ? `${STORY_RING_CLASS} animate-pulse`
    : isUnseen
      ? STORY_RING_CLASS
      : STORY_RING_CLASS_INACTIVE;

  return (
    <button
      type="button"
      aria-label={
        isPlaying
          ? `Wiedergabe von ${username}s Lieblingssong stoppen`
          : `Lieblingssong von ${username} abspielen`
      }
      onClick={handleClick}
      className={`relative ${ringClass}`}
    >
      {avatar}
      {isPlaying && (
        <span className="absolute bottom-0 right-0 flex size-6 items-center justify-center rounded-full bg-foreground text-background shadow-sm">
          <Square className="size-2.5 fill-current" />
        </span>
      )}
      <audio ref={audioRef} src={favoriteSong.previewUrl} preload="none" onEnded={stop} />
    </button>
  );
}
