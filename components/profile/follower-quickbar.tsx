"use client";

import { useState } from "react";
import { Plus, Users } from "lucide-react";
import { FollowerListModal } from "@/components/profile/follower-list-modal";
import { FollowSuggestionsModal } from "@/components/profile/follow-suggestions-modal";

/**
 * Compact "N Inspirierte" + add button, moved up next to the hero (Design-
 * Iteration 2, Punkt 4) -- replaces the old stats-row FollowerCount for the
 * owner's own view (visitors still see it further down, unchanged). Always
 * clickable, even at 0 -- the old FollowerCount rendered a dead
 * non-interactive <div> at zero, this doesn't.
 */
export function FollowerQuickbar({
  currentUserId,
  count,
}: {
  currentUserId: string;
  count: number;
}) {
  const [showFollowers, setShowFollowers] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setShowFollowers(true)}
        aria-label={`${count} Inspirierte ansehen`}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Users className="size-4" />
        <span>{count}</span>
      </button>
      <button
        type="button"
        onClick={() => setShowSuggestions(true)}
        aria-label="Freunde hinzufügen"
        className="flex h-6 w-6 items-center justify-center rounded-full border border-input text-muted-foreground hover:border-primary hover:text-primary transition-colors"
      >
        <Plus className="size-3.5" />
      </button>

      {showFollowers && (
        <FollowerListModal targetUserId={currentUserId} onClose={() => setShowFollowers(false)} />
      )}
      {showSuggestions && (
        <FollowSuggestionsModal currentUserId={currentUserId} onClose={() => setShowSuggestions(false)} />
      )}
    </div>
  );
}
