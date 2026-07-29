"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { SwipeCard } from "@/components/vorschlag/swipe-card";
import { FriendFeedMovieCard, type FriendFeedMovieItem } from "@/components/inspo/friend-feed-movie-card";
import { GuestSignupModal } from "@/components/guest-signup-modal";
import { useSocialProof, getSocialProofBreakdown } from "@/lib/hooks/use-social-proof";
import { saveToCategory, updateNote } from "@/lib/saved-items";
import { recordInteraction } from "@/lib/interactions";
import { setInteractionWithCredits, recordInspiredCredits } from "@/lib/interaction-credits";
import { CATEGORY_ACTION_LABELS, type SavedCategory } from "@/lib/categories";
import { NOTE_PLACEHOLDERS, SKIP_ADD_NOTE_PROMPT } from "@/lib/notes";
import { NoteModal } from "@/components/lists/note-modal";
import type { SearchResult } from "@/lib/tmdb";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w342";
const PRELOAD_THRESHOLD = 3;
const VISIBLE_STACK_SIZE = 3;
const GUEST_SWIPE_LIMIT = 3;
const GUEST_LIMIT_MESSAGE = "Für mehr Inspiration melde dich kurz an.";
const GUEST_SAVE_MESSAGE = "Melde dich an, um diesen Titel zu deinen Listen hinzuzufügen.";

const MOOD_OPTIONS: { key: string; label: string }[] = [
  { key: "lustig", label: "Lustig & leicht" },
  { key: "spannend", label: "Spannend & mitreißend" },
  { key: "gruselig", label: "Gruselig" },
  { key: "herzerwaermend", label: "Herzerwärmend" },
  { key: "nachdenken", label: "Zum Nachdenken" },
  { key: "episch", label: "Episch & großartig" },
];

function resultKey(result: SearchResult) {
  return `${result.mediaType}-${result.id}`;
}

export function MoviesInspoTab({
  user,
  showToast,
}: {
  user: User | null;
  showToast: (message: string) => void;
}) {
  // ---- Zone 1: friend feed ----
  const [feedItems, setFeedItems] = useState<FriendFeedMovieItem[] | null>(null);

  const loadFeed = useCallback(async () => {
    const response = await fetch("/api/friend-feed?type=movies");
    if (!response.ok) return;
    const data: { items: FriendFeedMovieItem[] } = await response.json();
    setFeedItems(data.items);
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const removeFeedItem = (itemId: string, mediaType: string) => {
    setFeedItems((prev) =>
      (prev ?? []).filter((item) => !(item.itemId === itemId && item.mediaType === mediaType)),
    );
  };

  const handleFeedInteraction = async (
    item: FriendFeedMovieItem,
    type: "like" | "dislike" | "skip",
  ) => {
    if (!user) return;
    removeFeedItem(item.itemId, item.mediaType);
    const supabase = createClient();
    const ownerUserIds = item.topList.userIds;
    await setInteractionWithCredits(
      supabase,
      user.id,
      { itemId: item.itemId, mediaType: item.mediaType },
      type,
      ownerUserIds,
    );
    if (type === "like") showToast("Gefällt mir gemerkt");
    if (type === "dislike") showToast("Nicht dein Geschmack? Notiert.");
  };

  const handleFeedAdd = async (item: FriendFeedMovieItem, category: SavedCategory) => {
    if (!user) return;
    removeFeedItem(item.itemId, item.mediaType);
    const supabase = createClient();
    const ownerUserIds = item.topList.userIds;
    const { error } = await saveToCategory(
      supabase,
      category,
      user.id,
      {
        itemId: Number(item.itemId),
        mediaType: item.mediaType,
        title: item.title,
        imageUrl: item.imageUrl,
        year: item.year,
      },
      ownerUserIds[0] ?? null,
    );
    if (error) {
      showToast("Aktion fehlgeschlagen");
      return;
    }
    await recordInspiredCredits(supabase, user.id, ownerUserIds, {
      itemId: item.itemId,
      mediaType: item.mediaType,
    });
    showToast(`Zu ${CATEGORY_ACTION_LABELS[category]} hinzugefügt`);
  };

  // ---- Zone 2: algorithmic fallback (existing swipe deck) ----
  const [mood, setMood] = useState<string | null>(null);
  const [cards, setCards] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [guestSwipeCount, setGuestSwipeCount] = useState(0);
  const [guestModalMessage, setGuestModalMessage] = useState<string | null>(null);
  const [notePrompt, setNotePrompt] = useState<{
    result: SearchResult;
    category: SavedCategory;
  } | null>(null);

  const pageRef = useRef(1);
  const seenKeys = useRef<Set<string>>(new Set());
  const isFetchingRef = useRef(false);

  const isLoggedIn = !!user;
  const guestLimitReached = !isLoggedIn && guestSwipeCount >= GUEST_SWIPE_LIMIT;

  const incrementGuestSwipes = useCallback(() => {
    setGuestSwipeCount((prev) => {
      const next = prev + 1;
      if (next >= GUEST_SWIPE_LIMIT) setGuestModalMessage(GUEST_LIMIT_MESSAGE);
      return next;
    });
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

  const handleSwipeLeft = useCallback(
    async (result: SearchResult) => {
      removeCard(result);
      if (isLoggedIn && user) {
        const supabase = createClient();
        await recordInteraction(supabase, user.id, {
          itemId: String(result.id),
          mediaType: result.mediaType,
          interactionType: "skip",
        });
      } else {
        incrementGuestSwipes();
      }
    },
    [removeCard, isLoggedIn, user, incrementGuestSwipes],
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
      const { error } = await recordInteraction(supabase, user.id, {
        itemId: String(result.id),
        mediaType: result.mediaType,
        interactionType: "like",
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

      const supabase = createClient();
      const posterUrl = result.posterPath ? `${POSTER_BASE_URL}${result.posterPath}` : null;
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
      if (!SKIP_ADD_NOTE_PROMPT.includes(category)) {
        setNotePrompt({ result, category });
      }
    },
    [removeCard, user, incrementGuestSwipes, showToast],
  );

  const visibleCards = guestLimitReached ? [] : cards.slice(0, VISIBLE_STACK_SIZE);
  const visibleCardsSocialProof = useSocialProof(
    visibleCards.map((card) => ({ id: card.id, mediaType: card.mediaType })),
  );

  const hasFeedItems = (feedItems?.length ?? 0) > 0;

  return (
    <div className="w-full flex flex-col gap-4">
      {feedItems === null ? null : hasFeedItems ? (
        <div className="w-full flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Von deinen Freunden</h2>
          <div className="w-full flex flex-col gap-3">
            {feedItems.map((item) => (
              <FriendFeedMovieCard
                key={`${item.mediaType}-${item.itemId}`}
                item={item}
                isLoggedIn={isLoggedIn}
                onInteraction={(type) => handleFeedInteraction(item, type)}
                onAdd={(category) => handleFeedAdd(item, category)}
                onGuestClick={() => setGuestModalMessage(GUEST_SAVE_MESSAGE)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="w-full flex flex-col gap-1 border-t pt-4">
        <p className="text-sm text-muted-foreground text-center">
          {hasFeedItems
            ? "Das war's von deinen Freunden – hier ein paar populäre Vorschläge"
            : user
              ? "Noch nichts Neues von deinen Freunden – hier ein paar populäre Vorschläge"
              : "Populäre Vorschläge"}
        </p>
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

      <div className="relative w-full aspect-[2/3] max-w-sm mt-2 self-center">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center pt-20">Lade Vorschläge…</p>
        ) : guestLimitReached ? (
          <div className="flex flex-col items-center gap-3 pt-16 text-center px-4">
            <p className="text-sm text-muted-foreground">{GUEST_LIMIT_MESSAGE}</p>
            <Link
              href={`/auth/sign-up?next=${encodeURIComponent("/inspo")}`}
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
                onCategorySelect={(category) => handleCategorySelect(result, category)}
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
        Tippe auf das Poster für Details · Buttons in der Karte = direkt in eine Liste
        einsortieren
      </p>

      {guestModalMessage && (
        <GuestSignupModal
          message={guestModalMessage}
          next="/inspo"
          onClose={() => setGuestModalMessage(null)}
        />
      )}

      {notePrompt && user && (
        <NoteModal
          title={notePrompt.result.title}
          posterUrl={
            notePrompt.result.posterPath ? `${POSTER_BASE_URL}${notePrompt.result.posterPath}` : null
          }
          initialNote={null}
          placeholder={NOTE_PLACEHOLDERS[notePrompt.category]}
          onSave={async (note) => {
            const supabase = createClient();
            await updateNote(
              supabase,
              notePrompt.category,
              user.id,
              notePrompt.result.id,
              notePrompt.result.mediaType,
              note,
            );
          }}
          onClose={() => setNotePrompt(null)}
        />
      )}
    </div>
  );
}
