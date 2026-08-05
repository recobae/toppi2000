"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Sparkles, Star } from "lucide-react";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { FollowSuggestionsModal } from "@/components/profile/follow-suggestions-modal";
import { FollowerListModal } from "@/components/profile/follower-list-modal";
import { StoryViewer } from "@/components/profile/story-viewer";
import { STORY_RING_CLASS, STORY_RING_CLASS_INACTIVE } from "@/components/profile/story-ring-styles";
import { STORY_FEATURE_ENABLED } from "@/lib/feature-flags";
import type { ExpertiseTier } from "@/lib/expertise-tiers";

export type FollowingProfile = {
  id: string;
  username: string;
  avatarUrl: string | null;
  tier: ExpertiseTier;
  hasUnseenStory: boolean;
  /** Higher of the two Taste-Match category percentages, or null if neither has enough shared ratings yet. */
  tasteMatchBadge: number | null;
};

/**
 * Metriken-Audit, Punkt E: the one tiered Kenner/Experte system (same
 * thresholds/table as the profile page's own list-row badges) is now the
 * only "expertise" signal in the app -- this replaced a separate
 * minItems:1 label badge that fired for almost every followed friend and
 * carried no real signal. Einsteiger renders nothing, same rule as
 * ExpertiseTierBadge on the list rows.
 */
function TierCornerBadge({ tier }: { tier: ExpertiseTier }) {
  if (tier === "einsteiger") return null;

  return (
    <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background border border-border">
      <Star
        className={`size-2.5 ${tier === "experte" ? "fill-current text-yellow-500" : "text-amber-700"}`}
      />
    </span>
  );
}

function TasteMatchCornerBadge({ percentage }: { percentage: number | null }) {
  if (percentage === null) return null;
  return (
    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold text-primary-foreground border border-background">
      {percentage}%
    </span>
  );
}

/** Marks a friend who actually contributed a recommendation feeding this user's own For-Me/Topf -- not just anyone followed. */
function ContributorCornerBadge({ isContributor }: { isContributor: boolean }) {
  if (!isContributor) return null;
  return (
    <span className="absolute -bottom-0.5 -left-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary border border-background">
      <Sparkles className="size-2.5 fill-current text-primary-foreground" />
    </span>
  );
}

/**
 * One combined horizontal bar (Runde 2, Punkt 2): follower count + add
 * button on the left (fixed, doesn't scroll away), a thin divider, then the
 * followed-friend avatars -- previously two separate rows (FollowerQuickbar
 * + this bar), which is also why the "friends -> For Me" connector line
 * above it had nothing single to visually anchor to (Punkt 1).
 *
 * The left circle's number is `followingProfiles.length` -- the exact same
 * array the avatars below are rendered from -- instead of a separately
 * queried count. It used to show inbound followers (people following THIS
 * profile) while the avatars show outbound following (people this profile
 * follows), two different populations that happened to sit in the same bar
 * and could show a different number than visible avatars (e.g. "2" next to
 * 3 avatars). There is now exactly one source for both.
 */
export function FollowingBar({
  currentUserId,
  followingProfiles,
  contributorIds,
  showAddButton = true,
}: {
  currentUserId: string;
  followingProfiles: FollowingProfile[];
  /** Followed friends who actually contributed to this user's For-Me/Topf -- highlighted instead of every followed profile getting the same badge regardless of contribution. */
  contributorIds?: string[];
  /** Off on a foreign profile -- adding to someone else's follow list from their page doesn't make sense. */
  showAddButton?: boolean;
}) {
  const contributorIdSet = new Set(contributorIds ?? []);
  const [showFollowers, setShowFollowers] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [storyUsername, setStoryUsername] = useState<string | null>(null);
  // Opening a story marks it viewed server-side; track that locally too so
  // the ring disappears immediately without waiting for a full page refetch.
  const [locallyViewedIds, setLocallyViewedIds] = useState<Set<string>>(new Set());

  const markViewed = (username: string) => {
    const friend = followingProfiles.find((f) => f.username === username);
    if (friend) setLocallyViewedIds((prev) => new Set(prev).add(friend.id));
  };

  // Instagram-style: once a person's last slide finishes, jump straight to
  // the next friend who still has an unseen story instead of closing the
  // whole viewer, so everyone with an active story can be gone through in
  // one pass.
  const openNextStory = (afterUsername: string) => {
    markViewed(afterUsername);
    const next = followingProfiles.find(
      (f) => f.hasUnseenStory && !locallyViewedIds.has(f.id) && f.username !== afterUsername,
    );
    setStoryUsername(next?.username ?? null);
  };

  return (
    <div className="w-full flex items-start justify-start gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/*
        Gleiche Verschachtelung (p-[3px] x2) wie die Avatare unten, damit die
        Kreise selbst exakt auf gleicher Höhe sitzen -- der Avatar-Ring
        (STORY_RING_CLASS_INACTIVE) fügt sonst unsichtbares Padding hinzu,
        das die Kreismitte nach unten verschiebt, wenn man nur die Höhe
        angleicht.
      */}
      <div className="shrink-0 flex items-start gap-1.5">
        <button
          type="button"
          onClick={() => setShowFollowers(true)}
          aria-label={`${followingProfiles.length} Gefolgte ansehen`}
          className={`block ${STORY_RING_CLASS_INACTIVE}`}
        >
          <span className="block rounded-full bg-background p-[3px]">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted border border-border text-sm font-semibold">
              {followingProfiles.length}
            </span>
          </span>
        </button>
        {showAddButton && (
          <button
            type="button"
            onClick={() => setShowSuggestions(true)}
            aria-label="Freunde hinzufügen"
            className={`block ${STORY_RING_CLASS_INACTIVE}`}
          >
            <span className="block rounded-full bg-background p-[3px]">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-input text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                <Plus className="size-4" />
              </span>
            </span>
          </button>
        )}
      </div>

      <div className="h-10 w-px bg-border shrink-0 self-center" aria-hidden="true" />

      {followingProfiles.map((friend) => {
        const hasUnseenStory =
          STORY_FEATURE_ENABLED && friend.hasUnseenStory && !locallyViewedIds.has(friend.id);
        const avatar = (
          <span className="relative block">
            <span className={`block ${hasUnseenStory ? STORY_RING_CLASS : STORY_RING_CLASS_INACTIVE}`}>
              <span className="block rounded-full bg-background p-[3px]">
                <ProfileAvatar
                  username={friend.username}
                  imageUrl={friend.avatarUrl}
                  size="sm"
                />
              </span>
            </span>
            <TierCornerBadge tier={friend.tier} />
            <TasteMatchCornerBadge percentage={friend.tasteMatchBadge} />
            <ContributorCornerBadge isContributor={contributorIdSet.has(friend.id)} />
          </span>
        );

        return hasUnseenStory ? (
          <button
            key={friend.id}
            type="button"
            onClick={() => setStoryUsername(friend.username)}
            aria-label={`Story von ${friend.username}`}
            className="shrink-0 flex flex-col items-center gap-1 w-14"
          >
            {avatar}
            <span className="w-full text-center text-[10px] text-muted-foreground truncate">
              {friend.username}
            </span>
          </button>
        ) : (
          <Link
            key={friend.id}
            href={`/u/${friend.username}`}
            aria-label={friend.username}
            className="shrink-0 flex flex-col items-center gap-1 w-14"
          >
            {avatar}
            <span className="w-full text-center text-[10px] text-muted-foreground truncate">
              {friend.username}
            </span>
          </Link>
        );
      })}

      {showFollowers && (
        <FollowerListModal
          profiles={followingProfiles.map((friend) => ({
            id: friend.id,
            username: friend.username,
            avatarUrl: friend.avatarUrl,
          }))}
          onClose={() => setShowFollowers(false)}
        />
      )}
      {showSuggestions && (
        <FollowSuggestionsModal currentUserId={currentUserId} onClose={() => setShowSuggestions(false)} />
      )}
      {STORY_FEATURE_ENABLED && storyUsername && (
        <StoryViewer
          username={storyUsername}
          onClose={() => {
            markViewed(storyUsername);
            setStoryUsername(null);
          }}
          onNext={() => openNextStory(storyUsername)}
        />
      )}
    </div>
  );
}
