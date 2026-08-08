"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Play, Square } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { STORY_RING_CLASS, STORY_RING_CLASS_INACTIVE } from "@/components/profile/story-ring-styles";
import { useSongPlayback } from "@/components/profile/song-playback-context";

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
 * Playback itself (the <audio> element, isPlaying, play/pause) lives in
 * SongPlaybackContext -- shared with the sticky mini nav icon (Punkt 6) so
 * both trigger the exact same instance, never two independent ones. This
 * component only owns the "have I, this viewer, heard the current song
 * yet" ring state, which is specific to it.
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
  const [isUnseen, setIsUnseen] = useState(hasUnseenSong);

  const avatar = (
    <span className="block rounded-full bg-background p-[3px]">
      <ProfileAvatar username={username} imageUrl={avatarUrl} />
    </span>
  );

  // Own profile keeps its existing behavior (settings are reached via the
  // separate gear icon next to the username) -- tapping your own picture
  // never triggers playback. No song set means a plain, non-interactive
  // avatar, same as "no active story" before it. Neither case needs the
  // playback context at all, so this returns before calling the hook.
  if (isOwnProfile || !favoriteSong) {
    return <span className={STORY_RING_CLASS_INACTIVE}>{avatar}</span>;
  }

  return (
    <ProfileSongAvatarInner
      username={username}
      avatar={avatar}
      artworkUrl={favoriteSong.artworkUrl}
      targetUserId={targetUserId}
      isUnseen={isUnseen}
      setIsUnseen={setIsUnseen}
    />
  );
}

function ProfileSongAvatarInner({
  username,
  avatar,
  artworkUrl,
  targetUserId,
  isUnseen,
  setIsUnseen,
}: {
  username: string;
  avatar: React.ReactNode;
  artworkUrl: string | null;
  targetUserId: string;
  isUnseen: boolean;
  setIsUnseen: (value: boolean) => void;
}) {
  const { isPlaying, toggle } = useSongPlayback();

  // Fires once playback actually starts, regardless of whether it was
  // triggered from this avatar or the sticky mini icon -- both call the
  // same shared toggle().
  useEffect(() => {
    if (!isPlaying || !isUnseen) return;
    setIsUnseen(false);
    // Fire-and-forget -- must not block/delay the already-started playback.
    // Guests have no session to attribute a "heard" row to, so this
    // silently no-ops for them (playback still works).
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

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
      onClick={toggle}
      className={`relative ${ringClass}`}
    >
      {avatar}
      {/*
        Songcover als kleines Badge -- dauerhaft sichtbar (nicht nur beim
        Abspielen), damit Besucher überhaupt erkennen, dass es einen Song
        gibt, bevor sie tippen. artworkUrl kommt aus profiles.
        favorite_song_artwork_url (iTunes-Suche), war schon als Prop
        vorhanden, wurde bisher nirgends gerendert. Fällt auf das reine
        Play/Stop-Icon zurück, wenn kein Artwork gespeichert ist.
      */}
      <span className="absolute bottom-0 right-0 flex size-6 items-center justify-center overflow-hidden rounded-full bg-foreground text-background shadow-sm">
        {artworkUrl && (
          <Image src={artworkUrl} alt="" fill sizes="24px" className="object-cover" />
        )}
        <span className={`relative flex items-center justify-center ${artworkUrl ? "bg-black/40 size-full" : ""}`}>
          {isPlaying ? (
            <Square className="size-2.5 fill-current" />
          ) : (
            <Play className="size-2.5 fill-current" />
          )}
        </span>
      </span>
    </button>
  );
}
