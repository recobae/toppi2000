"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { recordInteraction } from "@/lib/interactions";
import { recordSkip } from "@/lib/item-skips";
import { DiscoveryListRow } from "@/components/discovery/discovery-list-row";
import type { DiscoveryCandidate } from "@/lib/discovery";

const REFILL_THRESHOLD = 3;
const VISIBLE_COUNT = 8;

type FeedResponse = { results: DiscoveryCandidate[]; exhausted: boolean };

/**
 * Main "Für Dich" stream -- a live, self-refilling list (not a swipe deck):
 * every visible row has its own Like/Dislike/Skip, and acting on ANY row
 * removes just that one and the next candidate takes its place at the
 * bottom of the visible set. Refills from the API once the buffer runs low
 * so the list never bottoms out.
 */
export function DiscoveryStream({ userId }: { userId: string }) {
  const [items, setItems] = useState<DiscoveryCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const fetchFeed = useCallback(async (): Promise<FeedResponse | null> => {
    const exclude = [...seenIdsRef.current].join(",");
    const response = await fetch(`/api/discovery-feed?exclude=${encodeURIComponent(exclude)}`);
    if (!response.ok) return null;
    return response.json();
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const data = await fetchFeed();
      if (data) {
        for (const item of data.results) seenIdsRef.current.add(item.id);
        setItems(data.results);
        setExhausted(data.exhausted);
      }
      setIsLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || exhausted) return;
    setIsLoadingMore(true);
    const data = await fetchFeed();
    if (data) {
      const fresh = data.results.filter((item) => !seenIdsRef.current.has(item.id));
      for (const item of fresh) seenIdsRef.current.add(item.id);
      setItems((prev) => [...prev, ...fresh]);
      if (data.exhausted && fresh.length === 0) setExhausted(true);
    }
    setIsLoadingMore(false);
  }, [fetchFeed, isLoadingMore, exhausted]);

  useEffect(() => {
    if (isLoading || isLoadingMore || exhausted) return;
    if (items.length < REFILL_THRESHOLD) loadMore();
  }, [items.length, isLoading, isLoadingMore, exhausted, loadMore]);

  const persistDecision = async (candidate: DiscoveryCandidate, action: "like" | "dislike" | "skip") => {
    const supabase = createClient();
    switch (candidate.sourceType) {
      case "movie":
      case "tv": {
        if (!candidate.ref.tmdbId) return;
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
        return;
      }
      case "place": {
        if (!candidate.ref.placeId) return;
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
        return;
      }
      case "topf":
        // Mein-Topf-Einträge haben keine eigene Like/Dislike-Tabelle wie
        // Filme/Orte (nur "bedanken", siehe lib/topf.ts) -- die Entscheidung
        // hier ist deshalb bewusst nur eine Sitzungs-Auswahl (blendet die
        // Karte aus dem aktuellen Stream aus), ohne Datenbank-Schreibzugriff.
        return;
    }
  };

  const handleAction = async (candidate: DiscoveryCandidate, action: "like" | "dislike" | "skip") => {
    if (pendingId) return;
    setPendingId(candidate.id);
    await persistDecision(candidate, action);
    setItems((prev) => prev.filter((item) => item.id !== candidate.id));
    setPendingId(null);
  };

  const visible = items.slice(0, VISIBLE_COUNT);

  return (
    <div className="w-full flex flex-col gap-2.5">
      {isLoading ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
          Lädt…
        </div>
      ) : visible.length > 0 ? (
        <AnimatePresence mode="popLayout">
          {visible.map((candidate) => (
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
      ) : (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">Für den Moment alles gesehen</p>
          <p className="text-xs text-muted-foreground">
            Schau bald wieder vorbei -- neue Aktivität aus deinem Netzwerk landet direkt hier.
          </p>
        </div>
      )}
    </div>
  );
}
