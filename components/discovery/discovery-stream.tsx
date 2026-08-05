"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { recordInteraction } from "@/lib/interactions";
import { recordSkip } from "@/lib/item-skips";
import { DiscoveryCard, DiscoveryCardActions } from "@/components/discovery/discovery-card";
import type { DiscoveryCandidate } from "@/lib/discovery";

const REFILL_THRESHOLD = 3;
const EXIT_ANIMATION_MS = 350;

type FeedResponse = { results: DiscoveryCandidate[]; exhausted: boolean };

export function DiscoveryStream({ userId }: { userId: string }) {
  const [items, setItems] = useState<DiscoveryCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [pending, setPending] = useState(false);
  const [exitDirection, setExitDirection] = useState<"left" | "right" | null>(null);
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

  const dismissCurrent = () => setItems((prev) => prev.slice(1));

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
    if (pending) return;
    setPending(true);
    await persistDecision(candidate, action);
    dismissCurrent();
    setPending(false);
  };

  const handleGesture = (candidate: DiscoveryCandidate, action: "like" | "dislike") => {
    if (pending) return;
    handleAction(candidate, action);
  };

  const handleButtonAction = (candidate: DiscoveryCandidate, action: "like" | "dislike" | "skip") => {
    if (pending) return;
    setExitDirection(action === "dislike" ? "left" : "right");
    setTimeout(() => {
      handleAction(candidate, action);
      setExitDirection(null);
    }, EXIT_ANIMATION_MS);
  };

  const current = items[0];
  const next = items[1];

  return (
    <div className="w-full flex-1 min-h-0 flex flex-col items-center gap-4">
      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div className="relative h-full max-h-[560px] aspect-[3/5] max-w-full">
          {isLoading ? (
            <div className="flex h-full w-full items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">
              Lädt…
            </div>
          ) : current ? (
            <>
              {next && (
                <div className="absolute inset-0 scale-[0.96] opacity-60 pointer-events-none">
                  <DiscoveryCard candidate={next} onLike={() => {}} onDislike={() => {}} disabled />
                </div>
              )}
              <DiscoveryCard
                key={current.id}
                candidate={current}
                onLike={() => handleGesture(current, "like")}
                onDislike={() => handleGesture(current, "dislike")}
                disabled={pending || exitDirection !== null}
                exitDirection={exitDirection}
              />
            </>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-center px-6">
              <p className="text-sm font-medium">Für den Moment alles gesehen</p>
              <p className="text-xs text-muted-foreground">
                Schau bald wieder vorbei -- neue Aktivität aus deinem Netzwerk landet direkt hier.
              </p>
            </div>
          )}
        </div>
      </div>

      {current && (
        <DiscoveryCardActions
          onDislike={() => handleButtonAction(current, "dislike")}
          onSkip={() => handleButtonAction(current, "skip")}
          onLike={() => handleButtonAction(current, "like")}
          disabled={pending || exitDirection !== null}
        />
      )}
    </div>
  );
}
