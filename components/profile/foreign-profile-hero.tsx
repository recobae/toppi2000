import { ProfileStoryAvatar } from "@/components/profile/profile-story-avatar";
import { ProfileSongAvatar, type ProfileFavoriteSong } from "@/components/profile/profile-song-avatar";
import { SongPlaybackProvider } from "@/components/profile/song-playback-context";
import { SongMiniIcon } from "@/components/profile/song-mini-icon";
import { STORY_FEATURE_ENABLED } from "@/lib/feature-flags";

/**
 * Hero for a visitor looking at someone else's profile -- the large avatar,
 * unchanged by the Eigenansicht/Fremdansicht restructure. Carries either the
 * Story ring (behind its flag) or the favorite-song tap-to-play ring,
 * exactly as before this split; this component only moved the existing
 * JSX out of the page file, it didn't change its behavior.
 */
export function ForeignProfileHero({
  username,
  avatarUrl,
  hasActiveStory,
  isGuest,
  favoriteSong,
  targetUserId,
  hasUnseenSong,
}: {
  username: string;
  avatarUrl: string | null;
  hasActiveStory: boolean;
  isGuest: boolean;
  favoriteSong: ProfileFavoriteSong | null;
  targetUserId: string;
  hasUnseenSong: boolean;
}) {
  if (STORY_FEATURE_ENABLED) {
    return (
      <ProfileStoryAvatar
        username={username}
        avatarUrl={avatarUrl}
        hasActiveStory={hasActiveStory}
        isOwnStory={false}
        canInteract={!isGuest}
      />
    );
  }

  if (!favoriteSong) {
    // No empty/inactive sticky icon when there's nothing to play.
    return (
      <ProfileSongAvatar
        username={username}
        avatarUrl={avatarUrl}
        favoriteSong={null}
        isOwnProfile={false}
        targetUserId={targetUserId}
        hasUnseenSong={false}
      />
    );
  }

  return (
    <SongPlaybackProvider previewUrl={favoriteSong.previewUrl}>
      <ProfileSongAvatar
        username={username}
        avatarUrl={avatarUrl}
        favoriteSong={favoriteSong}
        isOwnProfile={false}
        targetUserId={targetUserId}
        hasUnseenSong={hasUnseenSong}
      />
      <SongMiniIcon username={username} avatarUrl={avatarUrl} />
    </SongPlaybackProvider>
  );
}
