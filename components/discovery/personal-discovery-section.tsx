"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { rateCandidate, type RatingDecision } from "@/lib/rating-engine";
import { DiscoveryListRow } from "@/components/discovery/discovery-list-row";
import type { DiscoveryCandidate } from "@/lib/discovery";

/**
 * Für Dich, Abschnitt 2 "Persönliche Entdeckung" -- genau EIN primärer,
 * datenbasierter Kontext-Impuls (lib/fuer-dich-personalization.ts) als
 * prominente Überschrift, direkt gefolgt von den passenden Vorschlägen
 * selbst -- der Klick auf den Impuls braucht keine eigene Navigation, die
 * "gefilterte Liste" steht schon direkt darunter.
 */
export function PersonalDiscoverySection({
  message,
  candidates,
  userId,
}: {
  message: string;
  candidates: DiscoveryCandidate[];
  userId: string;
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
      <h2 className="text-lg font-semibold">{message}</h2>
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
