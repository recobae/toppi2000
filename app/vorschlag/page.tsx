"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { SwipeCard } from "@/components/vorschlag/swipe-card";
import { GuestSignupModal } from "@/components/guest-signup-modal";
import { BackToProfileLink } from "@/components/profile/back-to-profile-link";
import { useSocialProof, getSocialProofBreakdown } from "@/lib/hooks/use-social-proof";
import { saveLike, saveToCategory } from "@/lib/saved-items";
import { CATEGORY_ACTION_LABELS, type SavedCategory } from "@/lib/categories";
import type { SearchResult } from "@/lib/tmdb";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w342";
const PRELOAD_THRESHOLD = 3;
const VISIBLE_STACK_SIZE = 3;
const GUEST_SWIPE_LIMIT = 3;
const GUEST_LIMIT_MESSAGE = "Für mehr Inspiration melde dich kurz an.";
const GUEST_SAVE_MESSAGE =
  "Melde dich an, um diesen Titel zu deinen Listen hinzuzufügen.";

const MOOD_OPTIONS: { key: string; label: string }[] = [
  { key: "lustig", label: "Lustig & leicht" },
  { key: "spannend", label: "Spannend & mitreißend" },
  { key: "gruselig", label: "Gruselig" },
  { key: "herzerwaermend", label: "Herzerwärmend" },
  { key: "nachdenken", label: "Zum Nachdenken" },
  { key: "episch", label: "Episch & großartig" },
];

type Toast = { id: number; message: string };

function resultKey(result: SearchResult) {
  return `${result.mediaType}-${result.id}`;
}

export default function VorschlagPage() {
  const [mood, setMood] = useState<string | null>(null);
  const [cards, setCards] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [guestSwipeCount, setGuestSwipeCount] = useState(0);
  const [guestModalMessage, setGuestModalMessage] = useState<string | null>(
    null,
  );

  const pageRef = useRef(1);
  const seenKeys = useRef<Set<string>>(new Set());
  const isFetchingRef = useRef(false);

  const isLoggedIn = !!user;
  const guestLimitReached = !isLoggedIn && guestSwipeCount >= GUEST_SWIPE_LIMIT;

  const showToast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const incrementGuestSwipes = useCallback(() => {
    setGuestSwipeCount((prev) => {
      const next = prev + 1;
      if (next >= GUEST_SWIPE_LIMIT) {
        setGuestModalMessage(GUEST_LIMIT_MESSAGE);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setUser(currentUser);
    })();
  }, []);

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

  const removeCard = useCallback((result: SearchResult) => {
    setCards((prev) => prev.filter((card) => resultKey(card) !== resultKey(result)));
  }, []);

  const logSwipe = useCallback(async (result: SearchResult) => {
    try {
      await fetch("/api/swipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tmdbId: result.id,
          mediaType: result.mediaType,
        }),
      });
    } catch {
      // best-effort logging; missing an entry just means the title can resurface sooner
    }
  }, []);

  const handleSwipeLeft = useCallback(
    (result: SearchResult) => {
      removeCard(result);
      if (isLoggedIn) {
        logSwipe(result);
      } else {
        incrementGuestSwipes();
      }
    },
    [removeCard, logSwipe, isLoggedIn, incrementGuestSwipes],
  );

  const handleSwipeRight = useCallback(
    async (result: SearchResult) => {
      removeCard(result);

      if (!user) {
        incrementGuestSwipes();
        setGuestModalMessage(GUEST_SAVE_MESSAGE);
        return;
      }

      const supabase = createClient();
      const posterUrl = result.posterPath
        ? `${POSTER_BASE_URL}${result.posterPath}`
        : null;
      const { error } = await saveLike(supabase, user.id, {
        itemId: result.id,
        mediaType: result.mediaType,
        title: result.title,
        imageUrl: posterUrl,
        year: result.year,
      });
      if (error) {
        showToast("Aktion fehlgeschlagen");
        return;
      }
      showToast("Gefällt mir gemerkt");
    },
    [removeCard, user, incrementGuestSwipes, showToast],
  );

  const handleCategorySelect = useCallback(
    async (result: SearchResult, category: SavedCategory) => {
      removeCard(result);

      if (!user) {
        incrementGuestSwipes();
        setGuestModalMessage(GUEST_SAVE_MESSAGE);
        return;
      }

      logSwipe(result);
      const supabase = createClient();
      const posterUrl = result.posterPath
        ? `${POSTER_BASE_URL}${result.posterPath}`
        : null;
      const { error } = await saveToCategory(supabase, category, user.id, {
        itemId: result.id,
        mediaType: result.mediaType,
        title: result.title,
        imageUrl: posterUrl,
        year: result.year,
      });
      if (error) {
        showToast("Aktion fehlgeschlagen");
        return;
      }
      showToast(`Zu ${CATEGORY_ACTION_LABELS[category]} hinzugefügt`);
    },
    [removeCard, user, incrementGuestSwipes, logSwipe, showToast],
  );

  const visibleCards = guestLimitReached ? [] : cards.slice(0, VISIBLE_STACK_SIZE);
  const visibleCardsSocialProof = useSocialProof(
    visibleCards.map((card) => ({ id: card.id, mediaType: card.mediaType })),
  );

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
        <div className="w-full flex flex-col gap-2">
          <BackToProfileLink />
          <h1 className="font-medium text-xl">Entdecke und empfehle neue Titel</h1>
        </div>

        <div className="w-full flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {MOOD_OPTIONS.map((option) => {
            const isActive = mood === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setMood(isActive ? null : option.key)}
                className={`shrink-0 whitespace-nowrap h-6 px-2.5 rounded-full border text-[11px] font-medium transition-colors ${
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
          ) : guestLimitReached ? (
            <div className="flex flex-col items-center gap-3 pt-16 text-center px-4">
              <p className="text-sm text-muted-foreground">
                {GUEST_LIMIT_MESSAGE}
              </p>
              <Link
                href={`/auth/sign-up?next=${encodeURIComponent("/vorschlag")}`}
                className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:bg-primary/90 transition-colors min-h-11"
              >
                Jetzt registrieren
              </Link>
            </div>
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
                  isLoggedIn={isLoggedIn}
                  onSwipeLeft={() => handleSwipeLeft(result)}
                  onSwipeRight={() => handleSwipeRight(result)}
                  onCategorySelect={(category) =>
                    handleCategorySelect(result, category)
                  }
                  onGuestClick={() => setGuestModalMessage(GUEST_SAVE_MESSAGE)}
                  socialProof={getSocialProofBreakdown(
                    visibleCardsSocialProof,
                    result.id,
                    result.mediaType,
                  )}
                />
              );
            })
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-10">
          Tippe auf das Poster für Details · Buttons in der Karte = direkt in
          eine Liste einsortieren
        </p>
      </div>

      {guestModalMessage && (
        <GuestSignupModal
          message={guestModalMessage}
          next="/vorschlag"
          onClose={() => setGuestModalMessage(null)}
        />
      )}
    </main>
  );
}
