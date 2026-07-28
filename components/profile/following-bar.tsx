"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { FollowSuggestionsModal } from "@/components/profile/follow-suggestions-modal";

const RING_CLASS =
  "rounded-full p-[3px] bg-[conic-gradient(from_0deg,#f97316,#ec4899,#8b5cf6,#3b82f6,#10b981,#f97316)]";

type FollowingProfile = {
  id: string;
  username: string;
  avatarUrl: string | null;
};

export function FollowingBar({
  currentUserId,
  followingProfiles,
}: {
  currentUserId: string;
  followingProfiles: FollowingProfile[];
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);

  if (followingProfiles.length === 0) {
    return (
      <>
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
      </>
    );
  }

  return (
    <div className="w-full flex items-start gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {followingProfiles.map((friend) => (
        <Link
          key={friend.id}
          href={`/u/${friend.username}`}
          aria-label={friend.username}
          className="shrink-0 flex flex-col items-center gap-1 w-14"
        >
          <span className={`block ${RING_CLASS}`}>
            <span className="block rounded-full bg-background p-[3px]">
              <ProfileAvatar
                username={friend.username}
                imageUrl={friend.avatarUrl}
                size="sm"
              />
            </span>
          </span>
          <span className="w-full text-center text-[10px] text-muted-foreground truncate">
            {friend.username}
          </span>
        </Link>
      ))}
    </div>
  );
}
