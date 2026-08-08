"use client";

import { Music2 } from "lucide-react";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { useSongPlayback } from "@/components/profile/song-playback-context";

/**
 * Sticky top-right icon (Design-Iteration 2, Punkt 6) -- stays visible
 * while scrolling, mirrors the same play/pause state as the big hero
 * avatar via SongPlaybackContext (same toggle(), same underlying <audio>).
 * Only rendered when a favorite song actually exists (see
 * ProfileHeader) -- no empty/inactive placeholder otherwise.
 */
export function SongMiniIcon({
  username,
  avatarUrl,
}: {
  username: string;
  avatarUrl: string | null;
}) {
  const { isPlaying, toggle } = useSongPlayback();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        isPlaying
          ? `Wiedergabe von ${username}s Lieblingssong stoppen`
          : `Lieblingssong von ${username} abspielen`
      }
      className="fixed top-4 right-4 z-50 flex items-center justify-center"
    >
      <span className="relative block">
        <span
          className={`block rounded-full overflow-hidden shadow-sm animate-spin [animation-duration:3s] ${
            isPlaying ? "[animation-play-state:running]" : "[animation-play-state:paused]"
          }`}
        >
          <ProfileAvatar username={username} imageUrl={avatarUrl} size="sm" />
        </span>
        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground border border-background">
          <Music2 className="size-2.5" />
        </span>
      </span>
    </button>
  );
}
