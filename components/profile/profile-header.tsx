import Link from "next/link";
import { Settings } from "lucide-react";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { ProfileStoryAvatar } from "@/components/profile/profile-story-avatar";
import { ProfileSongAvatar, type ProfileFavoriteSong } from "@/components/profile/profile-song-avatar";
import { SongPlaybackProvider } from "@/components/profile/song-playback-context";
import { SongMiniIcon } from "@/components/profile/song-mini-icon";
import { STORY_FEATURE_ENABLED } from "@/lib/feature-flags";
import { FollowButton } from "@/components/profile/follow-button";
import { ShareListButton } from "@/components/lists/share-list-button";
import { GuestProfileCta } from "@/components/profile/guest-profile-cta";

/**
 * Ein Header für eigenes UND fremdes Profil (Profil-Umbau, Punkt 3) --
 * vorher zwei getrennte Komponenten (OwnProfileHero/ForeignProfileHero) plus
 * page-seitig verstreute Follow-/Teilen-Blöcke in unterschiedlicher
 * Reihenfolge. Eine Zeile: Avatar -- Username -- kompakte Icon-Buttons.
 * Follow/Teilen sind jetzt IMMER kompakte Icons direkt neben dem Namen,
 * nie mehr große Textbuttons unterhalb.
 */
export function ProfileHeader({
  isOwnProfile,
  username,
  avatarUrl,
  profileUrl,
  isGuest,
  targetUserId,
  initialIsFollowing,
  favoriteSong,
  hasUnseenSong,
  hasActiveStory,
}: {
  isOwnProfile: boolean;
  username: string;
  avatarUrl: string | null;
  profileUrl: string;
  isGuest: boolean;
  /** Nur bei Fremdansicht nötig (Follow-Target, Song-Ring-"gehört"-Tracking). */
  targetUserId?: string;
  initialIsFollowing?: boolean;
  favoriteSong?: ProfileFavoriteSong | null;
  hasUnseenSong?: boolean;
  hasActiveStory?: boolean;
}) {
  const avatar = isOwnProfile ? (
    <ProfileAvatar username={username} imageUrl={avatarUrl} size="sm" />
  ) : STORY_FEATURE_ENABLED ? (
    <ProfileStoryAvatar
      username={username}
      avatarUrl={avatarUrl}
      hasActiveStory={!!hasActiveStory}
      isOwnStory={false}
      canInteract={!isGuest}
    />
  ) : favoriteSong ? (
    <SongPlaybackProvider previewUrl={favoriteSong.previewUrl}>
      <ProfileSongAvatar
        username={username}
        avatarUrl={avatarUrl}
        favoriteSong={favoriteSong}
        isOwnProfile={false}
        targetUserId={targetUserId ?? ""}
        hasUnseenSong={!!hasUnseenSong}
      />
      <SongMiniIcon username={username} avatarUrl={avatarUrl} />
    </SongPlaybackProvider>
  ) : (
    <ProfileSongAvatar
      username={username}
      avatarUrl={avatarUrl}
      favoriteSong={null}
      isOwnProfile={false}
      targetUserId={targetUserId ?? ""}
      hasUnseenSong={false}
    />
  );

  return (
    <div className="w-full flex items-center gap-3">
      {avatar}
      <span className="flex-1 min-w-0 text-base font-semibold truncate">{username}</span>
      <span className="flex items-center gap-1.5 shrink-0">
        {isOwnProfile ? (
          <Link
            href="/settings"
            aria-label="Einstellungen"
            title="Einstellungen"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Settings className="size-4" />
          </Link>
        ) : (
          <>
            {!isGuest && targetUserId && (
              <FollowButton
                targetUserId={targetUserId}
                targetUsername={username}
                initialIsLoggedIn
                initialIsFollowing={!!initialIsFollowing}
                iconOnly
              />
            )}
            {isGuest && <GuestProfileCta variant="button" />}
          </>
        )}
        <ShareListButton shareTitle={`Schau dir ${username}s Filmgeschmack an`} url={profileUrl} iconOnly />
      </span>
    </div>
  );
}
