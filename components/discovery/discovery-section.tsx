"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { rateCandidate, type RatingDecision } from "@/lib/rating-engine";
import { DiscoveryListRow } from "@/components/discovery/discovery-list-row";
import type { DiscoveryCandidate } from "@/lib/discovery";

/**
 * One supplementary section under the main stream ("Gerade neu von
 * Freunden", "Beliebt im Netzwerk", ...). Same row component and same
 * Gefällt-mir/Nix-für-mich write-through as the main stream, but purely
 * local list state -- no live refill, since these are meant as a deeper,
 * finite dip into the network rather than an endless queue.
 */
export function DiscoverySection({
  title,
  candidates,
  userId,
  emphasize,
}: {
  title: string;
  candidates: DiscoveryCandidate[];
  userId: string;
  /** Für Dich's top "Neue Bewertungen von Freunden" header is prominent, not a quiet muted-foreground label like every other section here. */
  emphasize?: boolean;
}) {
  const [items, setItems] = useState(candidates);
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (items.length === 0) return null;

  const handleAction = async (candidate: DiscoveryCandidate, decision: RatingDecision) => {
    if (pendingId) return;
    setPendingId(candidate.id);
    const supabase = createClient();
    await rateCandidate(supabase, userId, candidate, decision);
    setItems((prev) => prev.filter((item) => item.id !== candidate.id));
    setPendingId(null);
  };

  return (
    <div className="w-full flex flex-col gap-2.5">
      <h2 className={emphasize ? "text-lg font-semibold" : "text-sm font-medium text-muted-foreground"}>{title}</h2>
      <AnimatePresence mode="popLayout">
        {items.map((candidate) => (
          <DiscoveryListRow
            key={candidate.id}
            candidate={candidate}
            onRate={(decision) => handleAction(candidate, decision)}
            pending={pendingId === candidate.id}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
