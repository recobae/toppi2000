"use client";

import { useState } from "react";
import { ListTile } from "@/components/profile/list-tile";
import { CategoryItemsGrid } from "@/components/lists/list-items-grid";
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  type SavedCategory,
} from "@/lib/categories";

type CategoryPreview = {
  category: SavedCategory;
  posterUrls: string[];
  itemCount: number;
};

export function ProfileCategorySections({
  username,
  ownerId,
  currentUserId,
  previewByCategory,
}: {
  username: string;
  ownerId: string;
  currentUserId: string | null;
  previewByCategory: CategoryPreview[];
}) {
  const [expanded, setExpanded] = useState<SavedCategory | null>(null);

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="w-full grid grid-cols-2 sm:grid-cols-3 gap-3">
        {previewByCategory.map(({ category, posterUrls, itemCount }) => (
          <ListTile
            key={category}
            label={CATEGORY_LABELS[category]}
            icon={CATEGORY_ICONS[category]}
            posterUrls={posterUrls}
            itemCount={itemCount}
            shareUrl={`/u/${username}`}
            isExpanded={expanded === category}
            onToggle={() =>
              setExpanded((prev) => (prev === category ? null : category))
            }
          />
        ))}
      </div>

      {expanded && (
        <div className="w-full flex flex-col gap-3 border-t pt-4">
          <h2 className="text-sm font-medium">{CATEGORY_LABELS[expanded]}</h2>
          <CategoryItemsGrid
            username={username}
            category={expanded}
            ownerId={ownerId}
            currentUserId={currentUserId}
          />
        </div>
      )}
    </div>
  );
}
