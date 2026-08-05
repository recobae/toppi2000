import Link from "next/link";
import { ListChecks, Plus, Sparkles } from "lucide-react";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import type { ForMeStatus } from "@/lib/for-me";
import { FollowingBar, type FollowingProfile } from "@/components/profile/following-bar";

/**
 * Own-profile hero -- replaces the old ForMeHero. The gamified unlock-ring
 * ("For Me" locked behind a threshold) is gone: that whole discovery
 * experience now lives on /fuer-dich, the app's actual landing page, so
 * this just needs to (a) show who you are, (b) send you to My Taste to
 * rate more, and (c) send you into the discovery stream -- not recreate it
 * here. ownCount/friendCount stay the same broadened activity sums
 * lib/for-me.ts already computes; only the unlock/threshold/preview fields
 * on ForMeStatus go unused now.
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
      <Link
        href="/swipe"
        aria-label="My Taste"
        className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground text-base font-semibold shadow-sm"
      >
        <Plus className="size-5" />
        My Taste
      </Link>
      <div className="h-3 w-px bg-border" aria-hidden="true" />

      <Link
        href="/meine-aktivitaet"
        className="inline-flex items-center gap-1 font-medium text-green-600 text-[11px] whitespace-nowrap hover:underline"
      >
        <ListChecks className="size-3" />
        {forMe.ownCount} Bewertungen von dir
      </Link>

      <ProfileAvatar username={username} imageUrl={avatarUrl} size="lg" />

      <span className="text-sm font-semibold">{username}</span>
      <span className="font-medium text-blue-600 text-[11px] whitespace-nowrap">
        {forMe.friendCount} Bewertungen von Freunden
      </span>

      <Link
        href="/fuer-dich"
        aria-label="Für Dich"
        className="mt-1 inline-flex items-center gap-2 h-10 px-4 rounded-full border border-primary text-primary text-sm font-semibold hover:bg-primary/5 transition-colors"
      >
        <Sparkles className="size-4" />
        Für Dich entdecken
      </Link>

      <div className="h-4 w-px bg-border" aria-hidden="true" />

      <FollowingBar
        currentUserId={userId}
        followingProfiles={followingProfiles}
        contributorIds={contributorIds}
      />
    </div>
  );
}
