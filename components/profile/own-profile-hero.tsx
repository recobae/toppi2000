import { ProfileAvatar } from "@/components/profile/profile-avatar";
import type { ForMeStatus } from "@/lib/for-me";
import { FollowingBar, type FollowingProfile } from "@/components/profile/following-bar";

/**
 * Own-profile hero -- purely social/identity now: avatar, name, two passive
 * activity stats, followed friends. No entry points into My Taste or Für
 * Dich anymore (Punkt 3 of the three-tab restructure) -- both are reached
 * exclusively through the bottom tab bar, so the profile stays a calm,
 * read-only social surface instead of also being a navigation hub.
 */
export function OwnProfileHero({
  userId,
  username,
  avatarUrl,
  forMe,
  followingProfiles,
  contributorIds,
}: {
  userId: string;
  username: string;
  avatarUrl: string | null;
  forMe: ForMeStatus;
  followingProfiles: FollowingProfile[];
  contributorIds?: string[];
}) {
  return (
    <div className="w-full flex flex-col items-center gap-1.5">
      <ProfileAvatar username={username} imageUrl={avatarUrl} size="lg" />

      <span className="text-sm font-semibold">{username}</span>
      <span className="font-medium text-green-600 text-[11px] whitespace-nowrap">
        {forMe.ownCount} Bewertungen von dir
      </span>
      <span className="font-medium text-blue-600 text-[11px] whitespace-nowrap">
        {forMe.friendCount} Bewertungen von Freunden
      </span>

      <div className="h-4 w-px bg-border" aria-hidden="true" />

      <FollowingBar
        currentUserId={userId}
        followingProfiles={followingProfiles}
        contributorIds={contributorIds}
      />
    </div>
  );
}
