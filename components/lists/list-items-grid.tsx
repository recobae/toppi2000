"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { MovieItemRow } from "@/components/items/list-item-row";
import { MovieDetailModal } from "@/components/movie-info";
import { GuestSignupModal } from "@/components/guest-signup-modal";
import {
  removeFromCategory,
  saveToCategory,
  setFavorite,
  updateNote,
} from "@/lib/saved-items";
import { setInteractionWithCredits, recordInspiredCredits } from "@/lib/interaction-credits";
import { postWatchlistTransitionStoryEvent, type WatchlistTransition } from "@/lib/story-events";
import { CATEGORY_LABELS, type SavedCategory } from "@/lib/categories";
import { NOTE_PLACEHOLDERS } from "@/lib/notes";
import { NoteModal } from "@/components/lists/note-modal";
import { useSocialProof, getSocialProofBreakdown } from "@/lib/hooks/use-social-proof";
import type { WatchProviderGroups, MovieDetails, SearchResult } from "@/lib/tmdb";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w342";

export type CategoryListItem = {
  id: string;
  itemId: number;
  mediaType: "movie" | "tv";
  title: string;
  imageUrl: string | null;
  year: string | null;
  note: string | null;
  watchProviders: WatchProviderGroups;
  movieDetails: MovieDetails;
  isFavorite: boolean;
};

function AddItemRow({ category }: { category: SavedCategory }) {
  return (
    <Link
      href={`/inspiration?addTo=${category}`}
      className="flex items-center justify-center gap-2 h-14 w-full rounded-lg border-2 border-dashed border-input text-muted-foreground hover:border-primary hover:text-primary transition-colors"
    >
      <Plus className="size-5" />
      <span className="text-sm font-medium">Hinzufügen</span>
    </Link>
  );
}

/**
 * Compact suggestion strip under the owner's own Empfohlen-list, fed by the
 * same shared engine (lib/recommendations.ts) as the Inspiration page --
 * here specifically the genre-profile variant, derived from what the user
 * already rated/liked. Same ListItemRow "rate" bar (Ja/Nein/Watchlist) as
 * everywhere else, just visually set apart with a dashed border.
 */
function MovieSuggestionsStrip({ userId }: { userId: string }) {
  const [suggestions, setSuggestions] = useState<SearchResult[] | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const isReloadingRef = useRef(false);

  const loadSuggestions = useCallback(async () => {
    const response = await fetch("/api/movie-suggestions");
    if (!response.ok) return null;
    const data: { results: SearchResult[] } = await response.json();
    setSuggestions(data.results);
    return data.results;
  }, []);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  // Every visible suggestion rated -> automatically fetch a fresh batch
  // (exclusion already keeps rated titles out server-side) instead of
  // leaving the strip empty; once a reload comes back empty too, hide it.
  useEffect(() => {
    if (!suggestions || suggestions.length > 0 || exhausted || isReloadingRef.current) return;
    isReloadingRef.current = true;
    loadSuggestions().then((fresh) => {
      if (!fresh || fresh.length === 0) setExhausted(true);
      isReloadingRef.current = false;
    });
  }, [suggestions, exhausted, loadSuggestions]);

  const socialProofMap = useSocialProof(
    (suggestions ?? []).map((r) => ({ id: r.id, mediaType: r.mediaType })),
  );

  const removeSuggestion = (result: SearchResult) => {
    setSuggestions((prev) =>
      (prev ?? []).filter((r) => !(r.id === result.id && r.mediaType === result.mediaType)),
    );
  };

  const handleAdd = async (result: SearchResult, category: SavedCategory) => {
    const key = `${result.mediaType}-${result.id}`;
    setPendingKey(key);
    const supabase = createClient();
    const { error } = await saveToCategory(supabase, category, userId, {
      itemId: result.id,
      mediaType: result.mediaType,
      title: result.title,
      imageUrl: result.posterPath ? `${POSTER_BASE_URL}${result.posterPath}` : null,
      year: result.year,
    });
    if (!error) removeSuggestion(result);
    setPendingKey(null);
  };

  const handleDislike = async (result: SearchResult) => {
    const key = `${result.mediaType}-${result.id}`;
    setPendingKey(key);
    const supabase = createClient();
    await setInteractionWithCredits(
      supabase,
      userId,
      { itemId: String(result.id), mediaType: result.mediaType },
      "dislike",
    );
    removeSuggestion(result);
    setPendingKey(null);
  };

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-3 mt-2 pt-4 border-t border-dashed">
      <h2 className="text-xs font-medium text-muted-foreground">
        Passend zu deinem Geschmack
      </h2>
      <div className="w-full flex flex-col gap-3">
        {suggestions.map((result) => {
          const key = `${result.mediaType}-${result.id}`;
          return (
            <MovieItemRow
              key={key}
              imageUrl={result.posterPath ? `${POSTER_BASE_URL}${result.posterPath}` : null}
              title={result.title}
              year={result.year}
              movieDetails={result.movieDetails}
              watchProviders={result.watchProviders}
              socialProof={getSocialProofBreakdown(socialProofMap, result.id, result.mediaType)}
              actions={{
                variant: "rate",
                pending: pendingKey === key,
                onLike: () => handleAdd(result, "top_list"),
                onDislike: () => handleDislike(result),
                onAdd: () => handleAdd(result, "watchlist"),
                addLabel: "Watchlist",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function OwnerCategoryList({
  initialItems,
  category,
  userId,
}: {
  initialItems: CategoryListItem[];
  category: SavedCategory;
  userId: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [showNoteModalFor, setShowNoteModalFor] = useState<CategoryListItem | null>(null);
  const [showDetailsFor, setShowDetailsFor] = useState<CategoryListItem | null>(null);
  const [favoritePendingId, setFavoritePendingId] = useState<string | null>(null);
  const [transitionPendingId, setTransitionPendingId] = useState<string | null>(null);

  const handleRemove = async (item: CategoryListItem) => {
    setRemovingId(item.id);
    const supabase = createClient();
    const { error } = await removeFromCategory(supabase, category, userId, item.itemId, item.mediaType);
    if (!error) {
      setItems((prev) => prev.filter((existing) => existing.id !== item.id));
    }
    setRemovingId(null);
  };

  // Watchlist-only: switch straight to Like/Dislike without removing first,
  // then post the "Watchlist -> Gefällt mir(nicht)" story event.
  const handleStatusTransition = async (item: CategoryListItem, transition: WatchlistTransition) => {
    setTransitionPendingId(item.id);
    const supabase = createClient();
    const { error } = await removeFromCategory(supabase, "watchlist", userId, item.itemId, item.mediaType);
    if (!error) {
      if (transition === "like") {
        await saveToCategory(supabase, "top_list", userId, {
          itemId: item.itemId,
          mediaType: item.mediaType,
          title: item.title,
          imageUrl: item.imageUrl,
          year: item.year,
        });
      } else {
        await setInteractionWithCredits(
          supabase,
          userId,
          { itemId: String(item.itemId), mediaType: item.mediaType },
          "dislike",
        );
      }
      await postWatchlistTransitionStoryEvent(supabase, userId, transition, {
        itemId: item.itemId,
        mediaType: item.mediaType,
        title: item.title,
        imageUrl: item.imageUrl,
      });
      setItems((prev) => prev.filter((existing) => existing.id !== item.id));
    }
    setTransitionPendingId(null);
  };

  const handleSaveNote = async (item: CategoryListItem, note: string | null) => {
    const supabase = createClient();
    const { error } = await updateNote(supabase, category, userId, item.itemId, item.mediaType, note);
    if (!error) {
      setItems((prev) => prev.map((existing) => (existing.id === item.id ? { ...existing, note } : existing)));
    }
  };

  const handleToggleFavorite = async (item: CategoryListItem) => {
    setFavoritePendingId(item.id);
    const supabase = createClient();
    const nextFavorite = !item.isFavorite;
    const { error } = await setFavorite(supabase, userId, item.itemId, item.mediaType, nextFavorite);
    if (!error) {
      setItems((prev) => {
        const updated = prev.map((existing) =>
          existing.id === item.id ? { ...existing, isFavorite: nextFavorite } : existing,
        );
        // Mirrors the server sort (favorites first, newest star on top) so
        // the row jumps immediately instead of waiting for a refetch.
        return [...updated].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));
      });
    }
    setFavoritePendingId(null);
  };

  const socialProofMap = useSocialProof(items.map((item) => ({ id: item.itemId, mediaType: item.mediaType })));

  return (
    <div className="w-full flex flex-col gap-3">
      {items.length === 0 && (
        <p className="w-full text-sm text-muted-foreground">
          {CATEGORY_LABELS[category]} enthält noch keine Einträge.
        </p>
      )}
      {items.map((item) => (
        <MovieItemRow
          key={item.id}
          imageUrl={item.imageUrl}
          title={item.title}
          year={item.year}
          movieDetails={item.movieDetails}
          watchProviders={item.watchProviders}
          note={item.note}
          socialProof={getSocialProofBreakdown(socialProofMap, item.itemId, item.mediaType)}
          onOpenDetails={() => setShowDetailsFor(item)}
          actions={{
            variant: "owned",
            onEditNote: () => setShowNoteModalFor(item),
            onRemove: () => handleRemove(item),
            isRemoving: removingId === item.id,
            favorite:
              category === "top_list"
                ? {
                    isFavorite: item.isFavorite,
                    onToggle: () => handleToggleFavorite(item),
                    pending: favoritePendingId === item.id,
                  }
                : undefined,
            statusTransition:
              category === "watchlist"
                ? {
                    onLike: () => handleStatusTransition(item, "like"),
                    onDislike: () => handleStatusTransition(item, "dislike"),
                    pending: transitionPendingId === item.id,
                  }
                : undefined,
          }}
        />
      ))}
      <AddItemRow category={category} />
      {category === "top_list" && <MovieSuggestionsStrip userId={userId} />}

      {showDetailsFor && (
        <MovieDetailModal
          title={showDetailsFor.title}
          posterUrl={showDetailsFor.imageUrl}
          year={showDetailsFor.year}
          details={showDetailsFor.movieDetails}
          tmdbId={showDetailsFor.itemId}
          mediaType={showDetailsFor.mediaType}
          note={showDetailsFor.note}
          onClose={() => setShowDetailsFor(null)}
        />
      )}

      {showNoteModalFor && (
        <NoteModal
          title={showNoteModalFor.title}
          posterUrl={showNoteModalFor.imageUrl}
          initialNote={showNoteModalFor.note}
          placeholder={NOTE_PLACEHOLDERS[category]}
          onSave={(note) => handleSaveNote(showNoteModalFor, note)}
          onClose={() => setShowNoteModalFor(null)}
        />
      )}
    </div>
  );
}

function VisitorCategoryList({
  initialItems,
  ownerId,
  ownerUsername,
}: {
  initialItems: CategoryListItem[];
  ownerId: string;
  ownerUsername: string;
}) {
  const items = initialItems;
  const [user, setUser] = useState<User | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [notePrompt, setNotePrompt] = useState<{ item: CategoryListItem; category: SavedCategory } | null>(null);
  const [showDetailsFor, setShowDetailsFor] = useState<CategoryListItem | null>(null);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  const socialProofMap = useSocialProof(items.map((item) => ({ id: item.itemId, mediaType: item.mediaType })));

  // Rating a title on someone else's list behaves exactly like rating an
  // unrated feed item -- Ja/Nein/Watchlist -- except the write target and
  // credited owner are this list's owner instead of nobody.
  const handleLike = async (item: CategoryListItem) => {
    if (!user) return;
    const key = `${item.mediaType}-${item.itemId}`;
    setPendingKey(key);
    const supabase = createClient();
    await setInteractionWithCredits(
      supabase,
      user.id,
      { itemId: String(item.itemId), mediaType: item.mediaType },
      "like",
      [ownerId],
    );
    const { error } = await saveToCategory(
      supabase,
      "top_list",
      user.id,
      { itemId: item.itemId, mediaType: item.mediaType, title: item.title, imageUrl: item.imageUrl, year: item.year },
      ownerId,
    );
    if (!error) {
      await recordInspiredCredits(supabase, user.id, [ownerId], {
        itemId: String(item.itemId),
        mediaType: item.mediaType,
      });
      showToast(`Zu ${CATEGORY_LABELS.top_list} hinzugefügt`);
      setNotePrompt({ item, category: "top_list" });
    }
    setPendingKey(null);
  };

  const handleDislike = async (item: CategoryListItem) => {
    if (!user) return;
    const key = `${item.mediaType}-${item.itemId}`;
    setPendingKey(key);
    const supabase = createClient();
    await setInteractionWithCredits(
      supabase,
      user.id,
      { itemId: String(item.itemId), mediaType: item.mediaType },
      "dislike",
      [ownerId],
    );
    setPendingKey(null);
  };

  const handleWatchlist = async (item: CategoryListItem) => {
    if (!user) return;
    const key = `${item.mediaType}-${item.itemId}`;
    setPendingKey(key);
    const supabase = createClient();
    const { error } = await saveToCategory(
      supabase,
      "watchlist",
      user.id,
      { itemId: item.itemId, mediaType: item.mediaType, title: item.title, imageUrl: item.imageUrl, year: item.year },
      ownerId,
    );
    if (!error) {
      await recordInspiredCredits(supabase, user.id, [ownerId], {
        itemId: String(item.itemId),
        mediaType: item.mediaType,
      });
      showToast(`Zu ${CATEGORY_LABELS.watchlist} hinzugefügt`);
      setNotePrompt({ item, category: "watchlist" });
    }
    setPendingKey(null);
  };

  if (items.length === 0) {
    return (
      <p className="w-full text-sm text-muted-foreground">
        Diese Liste enthält noch keine Einträge.
      </p>
    );
  }

  return (
    <div className="w-full flex flex-col gap-3">
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg">
            {toastMessage}
          </div>
        </div>
      )}
      {items.map((item) => (
        <MovieItemRow
          key={item.id}
          imageUrl={item.imageUrl}
          title={item.title}
          year={item.year}
          movieDetails={item.movieDetails}
          watchProviders={item.watchProviders}
          note={item.note}
          socialProof={getSocialProofBreakdown(socialProofMap, item.itemId, item.mediaType)}
          onOpenDetails={() => setShowDetailsFor(item)}
          isLoggedIn={!!user}
          onGuestClick={() => setShowGuestPrompt(true)}
          actions={{
            variant: "rate",
            pending: pendingKey === `${item.mediaType}-${item.itemId}`,
            onLike: () => handleLike(item),
            onDislike: () => handleDislike(item),
            onAdd: () => handleWatchlist(item),
            addLabel: "Watchlist",
          }}
        />
      ))}

      {showDetailsFor && (
        <MovieDetailModal
          title={showDetailsFor.title}
          posterUrl={showDetailsFor.imageUrl}
          year={showDetailsFor.year}
          details={showDetailsFor.movieDetails}
          tmdbId={showDetailsFor.itemId}
          mediaType={showDetailsFor.mediaType}
          note={showDetailsFor.note}
          onClose={() => setShowDetailsFor(null)}
        />
      )}

      {showGuestPrompt && (
        <GuestSignupModal
          message={`Melde dich an, um Titel zu deinen eigenen Listen hinzuzufügen, ${ownerUsername}s Liste zu entdecken, direkt zu sehen wo Titel gerade laufen, und Inspirationen für heute Abend zu entdecken.`}
          next={`/u/${ownerUsername}`}
          onClose={() => setShowGuestPrompt(false)}
        />
      )}

      {notePrompt && user && (
        <NoteModal
          title={notePrompt.item.title}
          posterUrl={notePrompt.item.imageUrl}
          initialNote={null}
          placeholder={NOTE_PLACEHOLDERS[notePrompt.category]}
          onSave={async (note) => {
            const supabase = createClient();
            await updateNote(
              supabase,
              notePrompt.category,
              user.id,
              notePrompt.item.itemId,
              notePrompt.item.mediaType,
              note,
            );
          }}
          onClose={() => setNotePrompt(null)}
        />
      )}
    </div>
  );
}

export function CategoryItemsGrid({
  username,
  category,
  ownerId,
  currentUserId,
}: {
  username: string;
  category: SavedCategory;
  ownerId: string;
  currentUserId?: string | null;
}) {
  const [items, setItems] = useState<CategoryListItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    (async () => {
      const response = await fetch(
        `/api/category-items?username=${encodeURIComponent(username)}&category=${category}`,
      );
      if (!response.ok || cancelled) return;
      const data: { items: CategoryListItem[] } = await response.json();
      if (!cancelled) setItems(data.items);
    })();
    return () => {
      cancelled = true;
    };
  }, [username, category]);

  if (items === null) {
    return <p className="text-sm text-muted-foreground">Lädt…</p>;
  }

  const isOwner = currentUserId === ownerId;

  return isOwner ? (
    <OwnerCategoryList initialItems={items} category={category} userId={ownerId} />
  ) : (
    <VisitorCategoryList
      initialItems={items}
      ownerId={ownerId}
      ownerUsername={username}
    />
  );
}
