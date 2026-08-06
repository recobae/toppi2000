import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { FollowingBar, type FollowingProfile } from "@/components/profile/following-bar";

/**
 * Own-profile hero -- purely social/identity now: avatar, name, followed
 * friends. No entry points into My Taste or Für Dich anymore (Punkt 3 of
 * the three-tab restructure) -- both are reached exclusively through the
 * bottom tab bar, so the profile stays a calm, read-only social surface
 * instead of also being a navigation hub. The "X Bewertungen von dir/von
 * Freunden" stats that used to sit here moved to Für Dich (Struktur-Runde)
 * -- they're personal discovery context, not identity, and competed with
 * this hero's own read-only role.
 */
export function OwnProfileHero({
  userId,
  username,
  avatarUrl,
  followingProfiles,
  contributorIds,
}: {
  userId: string;
  username: string;
  avatarUrl: string | null;
  followingProfiles: FollowingProfile[];
  contributorIds?: string[];
}) {
  return (
    <div className="w-full flex flex-col items-center gap-1.5">
      <ProfileAvatar username={username} imageUrl={avatarUrl} size="lg" />

      <span className="text-sm font-semibold">{username}</span>

      <div className="h-4 w-px bg-border" aria-hidden="true" />

      <FollowingBar
        currentUserId={userId}
        followingProfiles={followingProfiles}
        contributorIds={contributorIds}
      />
    </div>
  );
}
