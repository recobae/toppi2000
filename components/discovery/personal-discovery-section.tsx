"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { likeAndSaveCandidate } from "@/lib/discovery-like";
import { dislikeCandidate } from "@/lib/discovery-dislike";
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

  const handleAction = async (candidate: DiscoveryCandidate, action: "like" | "dislike") => {
    if (pendingId) return;
    setPendingId(candidate.id);
    const supabase = createClient();
    if (action === "like") {
      await likeAndSaveCandidate(supabase, userId, candidate);
    } else {
      await dislikeCandidate(supabase, userId, candidate);
    }
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
            onLike={() => handleAction(candidate, "like")}
            onDislike={() => handleAction(candidate, "dislike")}
            pending={pendingId === candidate.id}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
