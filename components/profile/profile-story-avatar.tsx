"use client";

import { useState } from "react";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { StoryViewer } from "@/components/profile/story-viewer";

/**
 * The large avatar at the top of a profile page. Replaces the old
 * always-links-to-/inspo behavior: clicking opens this person's active
 * story (Instagram-style), with delete controls when it's your own. With no
 * active story, or as a guest who can't view/mark stories, it's inert --
 * the only remaining path into Inspo is the widget in the "Ich folge" bar.
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

  const wrapperClass =
    "rounded-full p-[3px] bg-[conic-gradient(from_0deg,#f97316,#ec4899,#8b5cf6,#3b82f6,#10b981,#f97316)]";

  if (!canInteract || !hasActiveStory) {
    return <span className={wrapperClass}>{avatar}</span>;
  }

  return (
    <>
      <button
        type="button"
        aria-label={isOwnStory ? "Meine Story ansehen" : `Story von ${username}`}
        onClick={() => setShowStory(true)}
        className={wrapperClass}
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
