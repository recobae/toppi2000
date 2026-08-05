"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { recordInteraction } from "@/lib/interactions";
import { recordSkip } from "@/lib/item-skips";
import { likeAndSaveCandidate } from "@/lib/discovery-like";
import { DiscoveryListRow } from "@/components/discovery/discovery-list-row";
import type { DiscoveryCandidate } from "@/lib/discovery";

/**
 * One supplementary section under the main stream ("Gerade neu von
 * Freunden", "Beliebt im Netzwerk", ...). Same row component and same
 * Like/Dislike/Skip write-through as the main stream, but purely local list
 * state -- no live refill, since these are meant as a deeper, finite dip
 * into the network rather than an endless queue.
 */
export function DiscoverySection({
  title,
  candidates,
  userId,
}: {
  title: string;
  candidates: DiscoveryCandidate[];
  userId: string;
}) {
  const [items, setItems] = useState(candidates);
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (items.length === 0) return null;

  const handleAction = async (candidate: DiscoveryCandidate, action: "like" | "dislike" | "skip") => {
    if (pendingId) return;
    setPendingId(candidate.id);
    const supabase = createClient();
    if (action === "like") {
      await likeAndSaveCandidate(supabase, userId, candidate);
    } else {
      switch (candidate.sourceType) {
        case "movie":
        case "tv":
          if (candidate.ref.tmdbId !== undefined) {
            if (action === "skip") {
              await recordSkip(supabase, userId, String(candidate.ref.tmdbId), candidate.sourceType);
            } else {
              await recordInteraction(supabase, userId, {
                itemId: String(candidate.ref.tmdbId),
                mediaType: candidate.sourceType,
                interactionType: action,
                targetUserId: candidate.sourceUserId,
              });
            }
          }
          break;
        case "place":
          if (candidate.ref.placeId) {
            if (action === "skip") {
              await recordSkip(supabase, userId, candidate.ref.placeId, "place");
            } else {
              await recordInteraction(supabase, userId, {
                itemId: candidate.ref.placeId,
                mediaType: "place",
                interactionType: action,
                targetUserId: candidate.sourceUserId,
              });
            }
          }
          break;
        case "topf":
          // Kein Dislike-Table für Mein-Topf-Einträge -- siehe DiscoveryStream.
          break;
      }
    }
    setItems((prev) => prev.filter((item) => item.id !== candidate.id));
    setPendingId(null);
  };

  return (
    <div className="w-full flex flex-col gap-2.5">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <AnimatePresence mode="popLayout">
        {items.map((candidate) => (
          <DiscoveryListRow
            key={candidate.id}
            candidate={candidate}
            onLike={() => handleAction(candidate, "like")}
            onDislike={() => handleAction(candidate, "dislike")}
            onSkip={() => handleAction(candidate, "skip")}
            pending={pendingId === candidate.id}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
