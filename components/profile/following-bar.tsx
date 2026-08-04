"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Sparkles, Users } from "lucide-react";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { FollowSuggestionsModal } from "@/components/profile/follow-suggestions-modal";
import { FollowerListModal } from "@/components/profile/follower-list-modal";
import { StoryViewer } from "@/components/profile/story-viewer";
import { STORY_RING_CLASS, STORY_RING_CLASS_INACTIVE } from "@/components/profile/story-ring-styles";
import { STORY_FEATURE_ENABLED } from "@/lib/feature-flags";
import { getExpertiseIcon } from "@/lib/expertise";

export type FollowingProfile = {
  id: string;
  username: string;
  avatarUrl: string | null;
  expertiseKeys: string[];
  hasUnseenStory: boolean;
  /** Higher of the two Taste-Match category percentages, or null if neither has enough shared ratings yet. */
  tasteMatchBadge: number | null;
};

function ExpertiseCornerBadge({ expertiseKeys }: { expertiseKeys: string[] }) {
  const key = expertiseKeys[0];
  if (!key) return null;
  const Icon = getExpertiseIcon(key);

  return (
    <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background border border-border">
      <Icon className="size-2.5 fill-current text-primary" />
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
 */
export function FollowingBar({
  currentUserId,
  followerCount,
  followingProfiles,
  contributorIds,
}: {
  currentUserId: string;
  followerCount: number;
  followingProfiles: FollowingProfile[];
  /** Followed friends who actually contributed to this user's For-Me/Topf -- highlighted instead of every followed profile getting the same badge regardless of contribution. */
  contributorIds?: string[];
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
    <div className="w-full flex items-start justify-center gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="shrink-0 flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={() => setShowFollowers(true)}
          aria-label={`${followerCount} Inspirierte ansehen`}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Users className="size-4" />
          <span>{followerCount}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowSuggestions(true)}
          aria-label="Freunde hinzufügen"
          className="flex h-6 w-6 items-center justify-center rounded-full border border-input text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <Plus className="size-3.5" />
        </button>
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
            <ExpertiseCornerBadge expertiseKeys={friend.expertiseKeys} />
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
        <FollowerListModal targetUserId={currentUserId} onClose={() => setShowFollowers(false)} />
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
