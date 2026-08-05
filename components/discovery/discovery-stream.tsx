"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { recordInteraction } from "@/lib/interactions";
import { recordSkip } from "@/lib/item-skips";
import { likeAndSaveCandidate } from "@/lib/discovery-like";
import { DiscoveryListRow } from "@/components/discovery/discovery-list-row";
import type { DiscoveryCandidate } from "@/lib/discovery";

const REFILL_THRESHOLD = 3;

type FeedResponse = { results: DiscoveryCandidate[]; exhausted: boolean };

/**
 * Main "Für Dich" stream -- one card at a time, in place, not a growing
 * downward list: acting on the current candidate removes it and the next
 * one in the queue takes its exact spot. Refills from the API once the
 * buffer runs low so it never bottoms out mid-session.
 */
export function DiscoveryStream({ userId }: { userId: string }) {
  const [items, setItems] = useState<DiscoveryCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
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
    if (action === "like") {
      await likeAndSaveCandidate(supabase, userId, candidate);
      return;
    }
    switch (candidate.sourceType) {
      case "movie":
      case "tv": {
        if (candidate.ref.tmdbId === undefined) return;
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
        // Mein-Topf-Einträge haben keine eigene Dislike-Tabelle wie Filme/
        // Orte -- eine Ablehnung hier ist deshalb bewusst nur eine Sitzungs-
        // Auswahl (blendet die Karte aus dem aktuellen Stream aus), ohne
        // Datenbank-Schreibzugriff.
        return;
    }
  };

  const handleAction = async (candidate: DiscoveryCandidate, action: "like" | "dislike" | "skip") => {
    if (pending) return;
    setPending(true);
    await persistDecision(candidate, action);
    setItems((prev) => prev.filter((item) => item.id !== candidate.id));
    setPending(false);
    // Einzige "Erklärung" fürs neue Like-Verhalten: eine kurze Bestätigung
    // NACH der Aktion statt Vorab-Text -- die Karte selbst muss nicht
    // erklärt werden, aber dass Like jetzt direkt speichert, darf sichtbar
    // sein.
    if (action === "like") {
      setToast("✓ Auf deine Liste gespeichert");
      setTimeout(() => setToast(null), 2200);
    }
  };

  const current = items[0];

  return (
    <div className="w-full flex flex-col gap-2.5">
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50">
          <div className="rounded-full bg-foreground text-background px-4 py-2 text-xs font-medium shadow-lg">
            {toast}
          </div>
        </div>
      )}
      {isLoading ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
          Lädt…
        </div>
      ) : current ? (
        <AnimatePresence mode="popLayout">
          <DiscoveryListRow
            key={current.id}
            candidate={current}
            onLike={() => handleAction(current, "like")}
            onDislike={() => handleAction(current, "dislike")}
            onSkip={() => handleAction(current, "skip")}
            pending={pending}
          />
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
