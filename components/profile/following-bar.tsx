"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Lock, Plus, Sparkles, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { FollowSuggestionsModal } from "@/components/profile/follow-suggestions-modal";
import { StoryViewer } from "@/components/profile/story-viewer";
import { STORY_RING_CLASS, STORY_RING_CLASS_INACTIVE } from "@/components/profile/story-ring-styles";
import { STORY_FEATURE_ENABLED } from "@/lib/feature-flags";
import { ProgressRing } from "@/components/profile/progress-badges";
import { markForMeUnlockNotified, type ForMeStatus } from "@/lib/for-me";
import { getExpertiseIcon } from "@/lib/expertise";

type FollowingProfile = {
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

function SwipeWidget() {
  return (
    <Link
      href="/swipe"
      aria-label="Swipe"
      className="shrink-0 flex flex-col items-center gap-1 w-14"
    >
      <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground">
        <Zap className="size-6" />
      </span>
      <span className="w-full text-center text-[10px] font-medium truncate">
        Swipe
      </span>
    </Link>
  );
}

/**
 * The "For Me" tile: an action element (ring + lock/sparkle + label,
 * tappable, leads to /topf) with a visually separate info line underneath
 * (own vs. friend contribution counts, color-coded) -- two layers instead
 * of one dense block, per the UX-audit ask. Locked state blurs real recent
 * Topf thumbnails behind the ring (never a grey placeholder) to read as "not
 * yet" rather than "empty."
 */
function ForMeWidget({ forMe }: { forMe: ForMeStatus }) {
  return (
    <div className="shrink-0 flex flex-col items-center gap-1 w-16">
      <Link
        href="/topf"
        aria-label={forMe.isUnlocked ? "For Me" : "For Me (noch gesperrt)"}
        className="relative flex h-[52px] w-[52px] items-center justify-center rounded-full overflow-hidden bg-muted border border-border"
      >
        {!forMe.isUnlocked && forMe.previewImageUrls.length > 0 && (
          <>
            <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
              {Array.from({ length: 4 }).map((_, index) => {
                const url = forMe.previewImageUrls[index % forMe.previewImageUrls.length];
                return (
                  <div key={index} className="relative bg-muted">
                    <Image src={url} alt="" fill sizes="26px" className="object-cover blur-[3px] scale-125" />
                  </div>
                );
              })}
            </div>
            <div className="absolute inset-0 bg-background/40" />
          </>
        )}
        <ProgressRing fraction={forMe.fraction} size={48} stroke={3} />
        <span className="absolute inset-0 flex items-center justify-center">
          {forMe.isUnlocked ? (
            <Sparkles className="size-4 text-primary" />
          ) : (
            <Lock className="size-3.5 text-foreground" />
          )}
        </span>
      </Link>
      <span className="w-full text-center text-[10px] font-medium truncate">For Me</span>
      <span className="flex flex-col items-center gap-0 leading-tight">
        <span className="text-[9px] font-medium text-green-600 whitespace-nowrap">
          {forMe.ownCount} von dir
        </span>
        <span className="text-[9px] font-medium text-blue-600 whitespace-nowrap">
          {forMe.friendCount} von Freunden
        </span>
      </span>
    </div>
  );
}

/** Separates the fixed Swipe/For-Me tiles from the scrollable followed-profile avatars. */
function BarDivider() {
  return <div className="w-px self-stretch bg-border shrink-0" />;
}

export function FollowingBar({
  currentUserId,
  followingProfiles,
  forMe,
}: {
  currentUserId: string;
  followingProfiles: FollowingProfile[];
  forMe: ForMeStatus;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [storyUsername, setStoryUsername] = useState<string | null>(null);
  // Opening a story marks it viewed server-side; track that locally too so
  // the ring disappears immediately without waiting for a full page refetch.
  const [locallyViewedIds, setLocallyViewedIds] = useState<Set<string>>(new Set());
  const [unlockToast, setUnlockToast] = useState(false);

  // Fires exactly once, at the actual unlock moment (server already
  // confirmed topf_unlocked_notified was still false) -- never re-shown on
  // a later visit, and never announced ahead of time.
  useEffect(() => {
    if (!forMe.justUnlocked) return;
    setUnlockToast(true);
    const supabase = createClient();
    markForMeUnlockNotified(supabase, currentUserId);
    const timeout = setTimeout(() => setUnlockToast(false), 4000);
    return () => clearTimeout(timeout);
  }, [forMe.justUnlocked, currentUserId]);

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

  const unlockToastEl = unlockToast && (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg">
        🎉 Dein &bdquo;For Me&ldquo;-Bereich ist jetzt offen!
      </div>
    </div>
  );

  if (followingProfiles.length === 0) {
    return (
      <div className="w-full flex items-start gap-3">
        <SwipeWidget />
        <ForMeWidget forMe={forMe} />
        <BarDivider />
        <button
          type="button"
          onClick={() => setShowSuggestions(true)}
          aria-label="Profile entdecken"
          className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-input text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <Plus className="size-5" />
        </button>
        {showSuggestions && (
          <FollowSuggestionsModal
            currentUserId={currentUserId}
            onClose={() => setShowSuggestions(false)}
          />
        )}
        {unlockToastEl}
      </div>
    );
  }

  return (
    <div className="w-full flex items-start gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <SwipeWidget />
      <ForMeWidget forMe={forMe} />
      <BarDivider />
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
      {unlockToastEl}
    </div>
  );
}
