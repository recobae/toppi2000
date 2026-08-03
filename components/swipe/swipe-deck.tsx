"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveToCategory, type SavableItem } from "@/lib/saved-items";
import { recordSkip } from "@/lib/item-skips";
import { recordSwipeCardAction } from "@/lib/swipe-deck";
import { useSocialProof, getSocialProofBreakdown } from "@/lib/hooks/use-social-proof";
import { SwipeCard } from "@/components/swipe/swipe-card";
import { MovieDetailModal } from "@/components/movie-info";
import type { SearchResult } from "@/lib/tmdb";
import type { SavedCategory } from "@/lib/categories";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w500";
const REFILL_THRESHOLD = 3;
const EXIT_ANIMATION_MS = 350;

type DeckResponse = {
  results: SearchResult[];
  exhausted: boolean;
  remaining: number | null;
};

function itemKey(item: SearchResult): string {
  return `${item.mediaType}-${item.id}`;
}

export function SwipeDeck({ userId }: { userId: string }) {
  const [items, setItems] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [pending, setPending] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showDetailsFor, setShowDetailsFor] = useState<SearchResult | null>(null);
  const [exitDirection, setExitDirection] = useState<"left" | "right" | null>(null);
  const pageRef = useRef(1);
  const seenKeysRef = useRef<Set<string>>(new Set());

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const fetchPage = useCallback(async (page: number): Promise<DeckResponse | null> => {
    const response = await fetch(`/api/swipe-deck?page=${page}`);
    if (!response.ok) return null;
    return response.json();
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const data = await fetchPage(1);
      if (data) {
        const fresh = data.results.filter((item) => {
          const key = itemKey(item);
          if (seenKeysRef.current.has(key)) return false;
          seenKeysRef.current.add(key);
          return true;
        });
        setItems(fresh);
        setRemaining(data.remaining);
        setExhausted(data.exhausted);
      }
      setIsLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || exhausted || remaining === 0) return;
    setIsLoadingMore(true);
    const nextPage = pageRef.current + 1;
    const data = await fetchPage(nextPage);
    if (data) {
      pageRef.current = nextPage;
      const fresh = data.results.filter((item) => {
        const key = itemKey(item);
        if (seenKeysRef.current.has(key)) return false;
        seenKeysRef.current.add(key);
        return true;
      });
      setItems((prev) => [...prev, ...fresh]);
      setRemaining(data.remaining);
      if (data.exhausted) setExhausted(true);
    }
    setIsLoadingMore(false);
  }, [fetchPage, isLoadingMore, exhausted, remaining]);

  useEffect(() => {
    if (isLoading || isLoadingMore || exhausted) return;
    if (remaining === 0) return;
    if (items.length < REFILL_THRESHOLD) loadMore();
  }, [items.length, isLoading, isLoadingMore, exhausted, remaining, loadMore]);

  const dismissCurrent = () => {
    setItems((prev) => prev.slice(1));
    setRemaining((prev) => (prev === null ? null : Math.max(0, prev - 1)));
  };

  const handleAction = async (item: SearchResult, target: SavedCategory | "skip") => {
    if (pending) return;
    setPending(true);
    const supabase = createClient();

    let error: { message: string } | null = null;
    if (target === "skip") {
      ({ error } = await recordSkip(supabase, userId, String(item.id), item.mediaType));
    } else {
      const posterUrl = item.posterPath ? `${POSTER_BASE_URL}${item.posterPath}` : null;
      const savableItem: SavableItem = {
        itemId: item.id,
        mediaType: item.mediaType,
        title: item.title,
        imageUrl: posterUrl,
        year: item.year,
      };
      ({ error } = await saveToCategory(supabase, target, userId, savableItem));
    }

    if (error) {
      showToast("Konnte nicht gespeichert werden, versuch's nochmal");
      setPending(false);
      return;
    }

    const { error: trackingError } = await recordSwipeCardAction(supabase, userId);
    if (trackingError) {
      // Quota tracking is supplementary -- the actual save above already
      // succeeded, so this must never block or roll back the swipe itself.
      console.error("swipe card tracking failed", trackingError);
    }

    // Positive framing (Punkt 6): a skip is a personalization signal, not a
    // rejection -- Like/Dislike stay silent/honest, this is skip-only.
    if (target === "skip") {
      showToast("Hilft uns, dich besser zu verstehen");
    }

    dismissCurrent();
    setPending(false);
  };

  /**
   * Detail-view-only decisions (Skip/Watchlist): close the modal, play the
   * same swipe-away exit the card would show for a gesture-completed
   * decision, and only persist + advance once that's finished -- so it's
   * never abrupt, and there's no way back to the just-decided card either
   * way a decision gets made.
   */
  const handleDetailAction = (target: "skip" | "watchlist") => {
    if (!current || pending) return;
    setShowDetailsFor(null);
    setExitDirection(target === "skip" ? "left" : "right");
    setTimeout(() => {
      handleAction(current, target);
      setExitDirection(null);
    }, EXIT_ANIMATION_MS);
  };

  const current = items[0];
  const next = items[1];

  // Same batched friend-like lookup already used across Inspiration/lists
  // (lib/hooks/use-social-proof.ts) -- the swipe deck just wasn't calling it
  // before, so "does a friend already like this" never reached these cards.
  const socialProofMap = useSocialProof(
    items.map((item) => ({ id: item.id, mediaType: item.mediaType })),
  );
  const currentProof = current
    ? getSocialProofBreakdown(socialProofMap, current.id, current.mediaType)
    : undefined;

  return (
    <div className="w-full flex-1 min-h-0 flex flex-col items-center gap-4">
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg">
            {toastMessage}
          </div>
        </div>
      )}

      {/*
        Height-driven, not width-driven: the outer row gets the flexible
        (viewport-dependent) dimension via flex-1/min-h-0, and the card
        itself sizes off height (h-full) with aspect-ratio deriving width --
        the reverse of a fixed aspect-[3/5] box, which would overflow a
        short viewport (small iPhone + collapsed/expanded Safari address
        bar) instead of shrinking to fit.
      */}
      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div className="relative h-full max-h-[640px] aspect-[3/5] max-w-full">
          {isLoading ? (
            <div className="flex h-full w-full items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">
              Lädt…
            </div>
          ) : current ? (
            <>
              {next && (
                <div className="absolute inset-0 scale-[0.96] opacity-60 pointer-events-none">
                  <SwipeCard
                    item={next}
                    onLike={() => {}}
                    onDislike={() => {}}
                    onOpenDetails={() => {}}
                    disabled
                  />
                </div>
              )}
              <SwipeCard
                key={itemKey(current)}
                item={current}
                onLike={() => handleAction(current, "top_list")}
                onDislike={() => handleAction(current, "dont_watch")}
                onOpenDetails={() => setShowDetailsFor(current)}
                disabled={pending || exitDirection !== null}
                exitDirection={exitDirection}
                friendLikes={currentProof?.positive.usernames}
              />
            </>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-center px-6">
              <p className="text-sm font-medium">
                {exhausted ? "Tages-Limit erreicht" : "Keine weiteren Vorschläge"}
              </p>
              <p className="text-xs text-muted-foreground">
                {exhausted
                  ? "Morgen geht's weiter -- dann warten wieder 20 neue Titel auf dich."
                  : "Schau später nochmal vorbei."}
              </p>
            </div>
          )}
        </div>
      </div>

      {current && (
        <p className="text-xs text-muted-foreground shrink-0">
          ← Nicht mein Fall &nbsp;·&nbsp; Gefällt mir →
        </p>
      )}

      {showDetailsFor && (
        <MovieDetailModal
          title={showDetailsFor.title}
          posterUrl={showDetailsFor.posterPath ? `${POSTER_BASE_URL}${showDetailsFor.posterPath}` : null}
          year={showDetailsFor.year}
          details={showDetailsFor.movieDetails}
          tmdbId={showDetailsFor.id}
          mediaType={showDetailsFor.mediaType}
          watchProviders={showDetailsFor.watchProviders}
          socialProof={getSocialProofBreakdown(
            socialProofMap,
            showDetailsFor.id,
            showDetailsFor.mediaType,
          )}
          onClose={() => setShowDetailsFor(null)}
          onSkip={() => handleDetailAction("skip")}
          onWatchlist={() => handleDetailAction("watchlist")}
        />
      )}
    </div>
  );
}
