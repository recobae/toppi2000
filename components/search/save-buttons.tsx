"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CATEGORY_ACTION_LABELS,
  CATEGORY_ICONS,
  SAVED_CATEGORIES,
  type SavedCategory,
} from "@/lib/categories";
import { removeFromCategory, saveToCategory, type SavableItem } from "@/lib/saved-items";
import type { SavedState } from "@/lib/hooks/use-saved-state";

const CATEGORY_ORDER: SavedCategory[] = ["dont_watch", "top_list", "watchlist"];

const CATEGORY_ACTIVE_CLASSES: Record<SavedCategory, string> = {
  dont_watch: "bg-destructive text-destructive-foreground border-destructive",
  top_list: "bg-primary text-primary-foreground border-primary",
  watchlist: "bg-secondary text-secondary-foreground border-secondary",
};

/**
 * Tinder-style 3-button save row: Don't Watch (left, red), Top List
 * (center, highlighted), Watchlist (right, neutral). Clicking immediately
 * writes/removes the entry -- no confirmation step.
 */
export function SaveButtons({
  isLoggedIn,
  userId,
  item,
  savedState,
  onChange,
  onGuestClick,
  size = "default",
}: {
  isLoggedIn: boolean;
  userId?: string | null;
  item: SavableItem;
  savedState: SavedState;
  onChange: (category: SavedCategory, value: boolean) => void;
  onGuestClick?: () => void;
  size?: "default" | "compact";
}) {
  const [pending, setPending] = useState<SavedCategory | null>(null);

  const handleClick = async (category: SavedCategory) => {
    if (!isLoggedIn || !userId) {
      onGuestClick?.();
      return;
    }
    if (pending) return;

    const isActive = savedState[category];
    setPending(category);
    try {
      const supabase = createClient();
      if (isActive) {
        await removeFromCategory(supabase, category, userId, item.itemId, item.mediaType);
        onChange(category, false);
      } else {
        await saveToCategory(supabase, category, userId, item);
        onChange(category, true);
      }
    } finally {
      setPending(null);
    }
  };

  const isCompact = size === "compact";

  return (
    <div className="flex items-center gap-1.5">
      {CATEGORY_ORDER.map((category) => {
        const Icon = CATEGORY_ICONS[category];
        const isActive = savedState[category];
        return (
          <button
            key={category}
            type="button"
            aria-label={CATEGORY_ACTION_LABELS[category]}
            aria-pressed={isActive}
            disabled={pending === category}
            onClick={() => handleClick(category)}
            className={`flex items-center justify-center gap-1 rounded-full border transition-colors disabled:opacity-50 ${
              isCompact ? "size-8" : "h-9 px-3 text-xs font-medium"
            } ${
              isActive
                ? CATEGORY_ACTIVE_CLASSES[category]
                : "border-input bg-background hover:bg-accent"
            } ${category === "top_list" && !isActive ? "scale-110" : ""}`}
          >
            <Icon
              className={isCompact ? "size-4" : "size-3.5"}
              fill={isActive ? "currentColor" : "none"}
            />
            {!isCompact && <span>{CATEGORY_ACTION_LABELS[category]}</span>}
          </button>
        );
      })}
    </div>
  );
}

export { SAVED_CATEGORIES };
