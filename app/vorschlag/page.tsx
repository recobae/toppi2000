"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SwipeCard } from "@/components/vorschlag/swipe-card";
import type { SearchResult } from "@/lib/tmdb";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w342";
const LIKES_LIST_TITLE = "Gefällt mir";
const PRELOAD_THRESHOLD = 3;
const VISIBLE_STACK_SIZE = 3;

const MOOD_OPTIONS: { key: string; label: string }[] = [
  { key: "lustig", label: "Lustig & leicht" },
  { key: "spannend", label: "Spannend & mitreißend" },
  { key: "gruselig", label: "Gruselig" },
  { key: "herzerwaermend", label: "Herzerwärmend" },
  { key: "nachdenken", label: "Zum Nachdenken" },
  { key: "episch", label: "Episch & großartig" },
];

type Toast = { id: number; message: string };

type MyLists = {
  movieListId: string | null;
  tvListId: string | null;
  watchlistId: string | null;
  likesListId: string | null;
};

const EMPTY_MY_LISTS: MyLists = {
  movieListId: null,
  tvListId: null,
  watchlistId: null,
  likesListId: null,
};

function resultKey(result: SearchResult) {
  return `${result.mediaType}-${result.id}`;
}

export default function VorschlagPage() {
  const [mood, setMood] = useState<string | null>(null);
  const [cards, setCards] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [myLists, setMyLists] = useState<MyLists>(EMPTY_MY_LISTS);

  const pageRef = useRef(1);
  const seenKeys = useRef<Set<string>>(new Set());
  const isFetchingRef = useRef(false);

  const showToast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const loadMyLists = useCallback(async () => {
    try {
      const response = await fetch("/api/my-lists");
      if (!response.ok) return;
      const data: MyLists = await response.json();
      setMyLists(data);
    } catch {
      // keep defaults; individual actions will surface errors via toast
    }
  }, []);

  useEffect(() => {
    loadMyLists();
  }, [loadMyLists]);

  const fetchCards = useCallback(
    async (targetPage: number, replace: boolean, activeMood: string | null) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      if (replace) setIsLoading(true);

      try {
        const params = new URLSearchParams({ page: String(targetPage) });
        if (activeMood) params.set("mood", activeMood);

        const response = await fetch(`/api/discover?${params.toString()}`);
        if (!response.ok) throw new Error("Discover request failed");

        const data: { results: SearchResult[] } = await response.json();
        const fresh = data.results.filter((result) => {
          const key = resultKey(result);
          if (seenKeys.current.has(key)) return false;
          seenKeys.current.add(key);
          return true;
        });

        setCards((prev) => (replace ? fresh : [...prev, ...fresh]));
      } catch {
        // leave the stack as-is; the user can still act on remaining cards
      } finally {
        isFetchingRef.current = false;
        if (replace) setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    seenKeys.current = new Set();
    pageRef.current = 1;
    setCards([]);
    fetchCards(1, true, mood);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood]);

  useEffect(() => {
    if (!isLoading && cards.length > 0 && cards.length <= PRELOAD_THRESHOLD) {
      pageRef.current += 1;
      fetchCards(pageRef.current, false, mood);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.length, isLoading]);

  const addToList = useCallback(
    async (result: SearchResult, listId: string, successMessage: string) => {
      try {
        const imageUrl = result.posterPath
          ? `${POSTER_BASE_URL}${result.posterPath}`
          : null;

        const response = await fetch("/api/list-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listId,
            externalId: result.id,
            title: result.title,
            imageUrl,
            mediaType: result.mediaType,
            year: result.year,
          }),
        });
        const data: { error?: string } = await response.json();

        if (!response.ok) {
          showToast(data.error ?? "Aktion fehlgeschlagen");
          return;
        }
        showToast(successMessage);
      } catch {
        showToast("Aktion fehlgeschlagen");
      }
    },
    [showToast],
  );

  const ensureLikesListId = useCallback(async (): Promise<string | null> => {
    if (myLists.likesListId) return myLists.likesListId;

    try {
      const response = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: LIKES_LIST_TITLE }),
      });
      const data: { id?: string; error?: string } = await response.json();
      if (!response.ok || !data.id) return null;

      setMyLists((prev) => ({ ...prev, likesListId: data.id ?? null }));
      return data.id;
    } catch {
      return null;
    }
  }, [myLists.likesListId]);

  const removeCard = useCallback((result: SearchResult) => {
    setCards((prev) => prev.filter((card) => resultKey(card) !== resultKey(result)));
  }, []);

  const handleSwipeLeft = useCallback(
    (result: SearchResult) => {
      removeCard(result);
    },
    [removeCard],
  );

  const handleSwipeRight = useCallback(
    async (result: SearchResult) => {
      removeCard(result);
      const listId = await ensureLikesListId();
      if (!listId) {
        showToast("Liste konnte nicht erstellt werden");
        return;
      }
      await addToList(result, listId, "Zu Gefällt mir hinzugefügt");
    },
    [removeCard, ensureLikesListId, addToList, showToast],
  );

  const handleSwipeUp = useCallback(
    async (result: SearchResult) => {
      removeCard(result);
      const listId =
        result.mediaType === "movie" ? myLists.movieListId : myLists.tvListId;
      if (!listId) {
        showToast("Keine passende Liste gefunden");
        return;
      }
      await addToList(
        result,
        listId,
        result.mediaType === "movie"
          ? "Zu Lieblingsfilme hinzugefügt"
          : "Zu Lieblingsserien hinzugefügt",
      );
    },
    [removeCard, myLists, addToList, showToast],
  );

  const handleAddToWatchlist = useCallback(
    async (result: SearchResult) => {
      if (!myLists.watchlistId) {
        showToast("Keine Watchlist gefunden");
        return;
      }
      await addToList(result, myLists.watchlistId, "Zur Watchlist hinzugefügt");
    },
    [myLists.watchlistId, addToList, showToast],
  );

  const visibleCards = cards.slice(0, VISIBLE_STACK_SIZE);

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg"
          >
            {toast.message}
          </div>
        ))}
      </div>

      <div className="flex-1 w-full flex flex-col items-center gap-4 max-w-md p-5 pt-8">
        <h1 className="font-medium text-xl">Inspiration</h1>

        <div className="w-full flex flex-wrap gap-2 justify-center">
          {MOOD_OPTIONS.map((option) => {
            const isActive = mood === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setMood(isActive ? null : option.key)}
                className={`min-h-9 px-3 rounded-full border text-xs font-medium transition-colors ${
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input hover:bg-accent"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full aspect-[2/3] max-w-sm mt-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center pt-20">
              Lade Vorschläge…
            </p>
          ) : visibleCards.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center pt-20">
              Keine weiteren Vorschläge gefunden.
            </p>
          ) : (
            [...visibleCards].reverse().map((result) => {
              const stackIndex = visibleCards.findIndex(
                (card) => resultKey(card) === resultKey(result),
              );
              return (
                <SwipeCard
                  key={resultKey(result)}
                  result={result}
                  stackIndex={stackIndex}
                  isTop={stackIndex === 0}
                  onSwipeLeft={() => handleSwipeLeft(result)}
                  onSwipeRight={() => handleSwipeRight(result)}
                  onSwipeUp={() => handleSwipeUp(result)}
                  onAddToWatchlist={() => handleAddToWatchlist(result)}
                />
              );
            })
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Rechts wischen = Gefällt mir · Links wischen = Kein Interesse · Hoch
          wischen = Lieblingsliste
        </p>
      </div>
    </main>
  );
}
