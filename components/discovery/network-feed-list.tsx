"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { rateCandidate, type RatingDecision } from "@/lib/rating-engine";
import { ActivityFeedRow, type ActivityFeedEntry } from "@/components/discovery/activity-feed-row";
import { useToast, Toast } from "@/components/ui/toast";
import { registerNetworkRatingAndShouldToast } from "@/lib/network-activity-toast";
import type { DiscoveryCandidate } from "@/lib/discovery";
import type { NetworkActivityEvent } from "@/lib/network-activity";

const AGREEMENT_HINT_DURATION_MS = 1600;
const TOAST_MESSAGE = "Der Bereich wird immer wertvoller für dich, je mehr Freunde dabei sind.";

/**
 * Owns the merged, zeitlich sortierte Liste aus bewertbaren Freundes-
 * Kandidaten und reinen Aktivitätsmeldungen für "Neueste Bewertungen"
 * (Profil-Umbau §7+8) -- eine gemeinsame Zeile (ActivityFeedRow) statt
 * DiscoverySection+NetworkActivityFeed nebeneinander. Nach jeder Bewertung
 * bleibt die Zeile kurz stehen, damit der Übereinstimmungs-/Diskrepanz-
 * Hinweis sichtbar wird, bevor sie verschwindet.
 */
export function NetworkFeedList({
  candidates,
  events,
  userId,
}: {
  candidates: DiscoveryCandidate[];
  events: NetworkActivityEvent[];
  userId: string;
}) {
  const initialEntries: ActivityFeedEntry[] = [
    ...candidates.map((candidate) => ({ kind: "rating" as const, at: candidate.lastActivityAt, candidate })),
    ...events.map((event) => ({ kind: "activity" as const, at: event.createdAt, event })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const [entries, setEntries] = useState(initialEntries);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [justRated, setJustRated] = useState<{ id: string; decision: RatingDecision } | null>(null);
  const { message, showToast } = useToast();

  if (entries.length === 0) return null;

  const handleRate = async (candidate: DiscoveryCandidate, decision: RatingDecision) => {
    if (pendingId) return;
    setPendingId(candidate.id);
    const supabase = createClient();
    await rateCandidate(supabase, userId, candidate, decision);
    setJustRated({ id: candidate.id, decision });

    if (registerNetworkRatingAndShouldToast()) {
      showToast(TOAST_MESSAGE);
    }

    setTimeout(() => {
      setEntries((prev) => prev.filter((entry) => !(entry.kind === "rating" && entry.candidate.id === candidate.id)));
      setPendingId(null);
      setJustRated((current) => (current?.id === candidate.id ? null : current));
    }, AGREEMENT_HINT_DURATION_MS);
  };

  return (
    <>
      <div className="w-full flex flex-col gap-0.5">
        <AnimatePresence mode="popLayout">
          {entries.map((entry) => (
            <ActivityFeedRow
              key={entry.kind === "rating" ? entry.candidate.id : `${entry.event.kind}-${entry.event.actorUserId}-${entry.at}`}
              entry={entry}
              pending={entry.kind === "rating" && pendingId === entry.candidate.id}
              justRated={entry.kind === "rating" && justRated?.id === entry.candidate.id ? justRated.decision : null}
              onRate={entry.kind === "rating" ? (decision) => handleRate(entry.candidate, decision) : undefined}
            />
          ))}
        </AnimatePresence>
      </div>
      <Toast message={message} />
    </>
  );
}
