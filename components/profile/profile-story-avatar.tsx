"use client";

import { useState } from "react";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { StoryViewer } from "@/components/profile/story-viewer";
import { STORY_RING_CLASS, STORY_RING_CLASS_INACTIVE } from "@/components/profile/story-ring-styles";
import { STORY_FEATURE_ENABLED } from "@/lib/feature-flags";

/**
 * The large avatar at the top of a profile page. Replaces the old
 * always-links-to-/inspiration behavior: clicking opens this person's active
 * story (Instagram-style), with delete controls when it's your own. With no
 * active story, or as a guest who can't view/mark stories, it's inert --
 * the only remaining path into Inspiration is the widget in the "Ich folge" bar.
 */
export function ProfileStoryAvatar({
  username,
  avatarUrl,
  hasActiveStory,
  isOwnStory,
  canInteract,
}: {
  username: string;
  avatarUrl: string | null;
  hasActiveStory: boolean;
  isOwnStory: boolean;
  canInteract: boolean;
}) {
  const [showStory, setShowStory] = useState(false);

  const avatar = (
    <span className="block rounded-full bg-background p-[3px]">
      <ProfileAvatar username={username} imageUrl={avatarUrl} />
    </span>
  );

  if (!STORY_FEATURE_ENABLED || !hasActiveStory) {
    return <span className={STORY_RING_CLASS_INACTIVE}>{avatar}</span>;
  }

  if (!canInteract) {
    return <span className={STORY_RING_CLASS}>{avatar}</span>;
  }

  return (
    <>
      <button
        type="button"
        aria-label={isOwnStory ? "Meine Story ansehen" : `Story von ${username}`}
        onClick={() => setShowStory(true)}
        className={STORY_RING_CLASS}
      >
        {avatar}
      </button>
      {showStory && (
        <StoryViewer
          username={username}
          allowDelete={isOwnStory}
          onClose={() => setShowStory(false)}
        />
      )}
    </>
  );
}
