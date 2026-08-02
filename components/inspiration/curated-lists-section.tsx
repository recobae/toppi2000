"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { ListOverviewRow } from "@/components/profile/list-overview-row";
import type { CuratedListPreview } from "@/lib/curated-lists";

/**
 * "Kuratiert"-Sektion on the Inspiration Orte tab -- every is_curated = true
 * place list (city lists + freeform themed lists), rendered with the same
 * ListOverviewRow used everywhere else lists-of-lists show up (profile
 * Orte tiles, onboarding picker). Currently a single block sourced from
 * /api/curated-lists (place_regions); a future curated source (e.g. once
 * movies get a list entity of their own) would slot in as an additional
 * block next to this one inside the same wrapping section, not replace it.
 */
export function CuratedListsSection() {
  const [lists, setLists] = useState<CuratedListPreview[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/curated-lists");
      if (!response.ok || cancelled) return;
      const data: { lists: CuratedListPreview[] } = await response.json();
      if (!cancelled) setLists(data.lists);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!lists || lists.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-3 border-t pt-4">
      <h2 className="text-sm font-medium text-muted-foreground">Kuratiert</h2>
      <div className="w-full flex flex-col gap-2">
        {lists.map((list) => (
          <ListOverviewRow
            key={`${list.ownerUsername}-${list.key}`}
            title={list.name}
            icon={MapPin}
            preview={{ type: "collage", urls: list.photoUrls }}
            itemCount={list.itemCount}
            noteCount={list.noteCount}
            savedCount={list.savedCount}
            href={`/u/${list.ownerUsername}/orte/${list.key}`}
            shareUrl={`/u/${list.ownerUsername}/orte/${list.key}`}
          />
        ))}
      </div>
    </div>
  );
}
