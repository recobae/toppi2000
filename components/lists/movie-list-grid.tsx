"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { MovieItemRow } from "@/components/items/list-item-row";
import { MovieDetailModal } from "@/components/movie-info";
import { GuestSignupModal } from "@/components/guest-signup-modal";
import { MovieSuggestionsStrip } from "@/components/lists/list-items-grid";
import {
  removeFromCategory,
  saveToCategory,
  setFavorite,
  updateNote,
} from "@/lib/saved-items";
import { applyItemRating, addItemToOwnList } from "@/lib/rating-engine";
import { postWatchlistTransitionStoryEvent, type WatchlistTransition } from "@/lib/story-events";
import { CATEGORY_LABELS } from "@/lib/categories";
import { NOTE_PLACEHOLDERS } from "@/lib/notes";
import { NoteModal } from "@/components/lists/note-modal";
import { useSocialProof, getSocialProofBreakdown } from "@/lib/hooks/use-social-proof";
import { useOwnInteractions, type OwnInteractionEntry } from "@/lib/hooks/use-own-interactions";
import { useOtherRaters } from "@/lib/hooks/use-other-raters";
import type { WatchProviderGroups, MovieDetails } from "@/lib/tmdb";

export type MovieListStatus = "top_list" | "watchlist";

export type MovieListItem = {
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
  status: MovieListStatus;
  createdAt: string;
};

const STATUS_FILTERS: { key: MovieListStatus | null; label: string }[] = [
  { key: null, label: "Alle" },
  { key: "top_list", label: "Empfohlen" },
  { key: "watchlist", label: "Watchlist" },
];

// Matched against WatchProviderGroups.flatrate[].name (TMDB's German-region
// provider names) rather than hardcoded provider IDs, which drift across
// TMDB catalogue changes far more than the display name does.
const AVAILABILITY_FILTERS: { key: string; label: string; match: (name: string) => boolean }[] = [
  { key: "netflix", label: "Netflix", match: (n) => n.toLowerCase().includes("netflix") },
  { key: "prime", label: "Prime Video", match: (n) => n.toLowerCase().includes("prime video") },
  { key: "disney", label: "Disney+", match: (n) => n.toLowerCase().includes("disney") },
  { key: "appletv", label: "Apple TV+", match: (n) => n.toLowerCase().includes("apple tv") },
  { key: "wow", label: "WOW/Sky", match: (n) => n.toLowerCase().includes("wow") || n.toLowerCase().includes("sky") },
];

type SortKey = "favorite" | "newest" | "alphabetical" | "taste_match";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "favorite", label: "Top Filme" },
  { key: "newest", label: "Neueste" },
  { key: "alphabetical", label: "A-Z" },
  { key: "taste_match", label: "Taste-Match" },
];

function sortItems(
  items: MovieListItem[],
  sortBy: SortKey,
  socialProofMap: Record<string, ReturnType<typeof getSocialProofBreakdown>>,
): MovieListItem[] {
  const sorted = [...items];
  const byNewest = (a: MovieListItem, b: MovieListItem) => (a.createdAt < b.createdAt ? 1 : -1);

  if (sortBy === "favorite") {
    sorted.sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || byNewest(a, b));
  } else if (sortBy === "alphabetical") {
    sorted.sort((a, b) => a.title.localeCompare(b.title, "de"));
  } else if (sortBy === "taste_match") {
    sorted.sort((a, b) => {
      const aScore = getSocialProofBreakdown(socialProofMap, a.itemId, a.mediaType).positive.total;
      const bScore = getSocialProofBreakdown(socialProofMap, b.itemId, b.mediaType).positive.total;
      return bScore - aScore || byNewest(a, b);
    });
  } else {
    sorted.sort(byNewest);
  }
  return sorted;
}

function FilterBar({
  statusFilter,
  onStatusChange,
  availabilityFilter,
  onAvailabilityChange,
  sortBy,
  onSortChange,
}: {
  statusFilter: MovieListStatus | null;
  onStatusChange: (status: MovieListStatus | null) => void;
  availabilityFilter: string | null;
  onAvailabilityChange: (key: string | null) => void;
  sortBy: SortKey;
  onSortChange: (key: SortKey) => void;
}) {
  return (
    <div className="w-full flex flex-col gap-2">
      <div className="w-full flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {STATUS_FILTERS.map((option) => {
          const isActive = statusFilter === option.key;
          return (
            <button
              key={option.label}
              type="button"
              onClick={() => onStatusChange(isActive ? null : option.key)}
              className={`shrink-0 whitespace-nowrap h-7 px-3 rounded-full border text-xs font-medium transition-colors ${
                isActive ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-accent"
              }`}
            >
              {option.label}
            </button>
          );
        })}
        <div className="w-px shrink-0 self-stretch bg-border" />
        {AVAILABILITY_FILTERS.map((option) => {
          const isActive = availabilityFilter === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onAvailabilityChange(isActive ? null : option.key)}
              className={`shrink-0 whitespace-nowrap h-7 px-3 rounded-full border text-xs font-medium transition-colors ${
                isActive ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-accent"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <div className="w-full flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="shrink-0 text-xs text-muted-foreground">Sortierung:</span>
        {SORT_OPTIONS.map((option) => {
          const isActive = sortBy === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onSortChange(option.key)}
              className={`shrink-0 whitespace-nowrap h-7 px-3 rounded-full border text-xs font-medium transition-colors ${
                isActive ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-accent"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AddItemRow() {
  return (
    <Link
      href="/hinzufuegen"
      className="flex items-center justify-center gap-2 h-14 w-full rounded-lg border-2 border-dashed border-input text-muted-foreground hover:border-primary hover:text-primary transition-colors"
    >
      <Plus className="size-5" />
      <span className="text-sm font-medium">Hinzufügen</span>
    </Link>
  );
}

function OwnerMovieList({
  initialItems,
  userId,
}: {
  initialItems: MovieListItem[];
  userId: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [statusFilter, setStatusFilter] = useState<MovieListStatus | null>(null);
  const [availabilityFilter, setAvailabilityFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("favorite");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [favoritePendingId, setFavoritePendingId] = useState<string | null>(null);
  const [transitionPendingId, setTransitionPendingId] = useState<string | null>(null);
  const [showNoteModalFor, setShowNoteModalFor] = useState<MovieListItem | null>(null);
  const [showDetailsFor, setShowDetailsFor] = useState<MovieListItem | null>(null);

  const socialProofMap = useSocialProof(items.map((item) => ({ id: item.itemId, mediaType: item.mediaType })));

  const handleRemove = async (item: MovieListItem) => {
    setRemovingId(item.id);
    const supabase = createClient();
    const { error } = await removeFromCategory(supabase, item.status, userId, item.itemId, item.mediaType);
    if (!error) {
      setItems((prev) => prev.filter((existing) => existing.id !== item.id));
    }
    setRemovingId(null);
  };

  const handleSaveNote = async (item: MovieListItem, note: string | null) => {
    const supabase = createClient();
    const { error } = await updateNote(supabase, item.status, userId, item.itemId, item.mediaType, note);
    if (!error) {
      setItems((prev) => prev.map((existing) => (existing.id === item.id ? { ...existing, note } : existing)));
    }
  };

  const handleToggleFavorite = async (item: MovieListItem) => {
    setFavoritePendingId(item.id);
    const supabase = createClient();
    const nextFavorite = !item.isFavorite;
    const { error } = await setFavorite(supabase, userId, item.itemId, item.mediaType, nextFavorite);
    if (!error) {
      setItems((prev) =>
        prev.map((existing) => (existing.id === item.id ? { ...existing, isFavorite: nextFavorite } : existing)),
      );
    }
    setFavoritePendingId(null);
  };

  // Watchlist-only: switch straight to Like/Dislike without removing first,
  // then post the "Watchlist -> Gefällt mir(nicht)" story event.
  const handleStatusTransition = async (item: MovieListItem, transition: WatchlistTransition) => {
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
        await applyItemRating(supabase, userId, { itemId: String(item.itemId), mediaType: item.mediaType }, "lohnt_sich_nicht");
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

  const statusFiltered = statusFilter ? items.filter((item) => item.status === statusFilter) : items;
  const availabilityOption = AVAILABILITY_FILTERS.find((option) => option.key === availabilityFilter);
  const availabilityFiltered = availabilityOption
    ? statusFiltered.filter((item) => item.watchProviders.flatrate.some((p) => availabilityOption.match(p.name)))
    : statusFiltered;
  const visibleItems = sortItems(availabilityFiltered, sortBy, socialProofMap);

  return (
    <div className="w-full flex flex-col gap-3">
      <FilterBar
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        availabilityFilter={availabilityFilter}
        onAvailabilityChange={setAvailabilityFilter}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      {items.length === 0 && (
        <p className="w-full text-sm text-muted-foreground">
          Noch keine Filme oder Serien gespeichert.
        </p>
      )}
      {items.length > 0 && visibleItems.length === 0 && (
        <p className="w-full text-sm text-muted-foreground">Keine Treffer für diese Filter.</p>
      )}

      {visibleItems.map((item) => (
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
              item.status === "top_list"
                ? {
                    isFavorite: item.isFavorite,
                    onToggle: () => handleToggleFavorite(item),
                    pending: favoritePendingId === item.id,
                  }
                : undefined,
            statusTransition:
              item.status === "watchlist"
                ? {
                    onLike: () => handleStatusTransition(item, "like"),
                    onDislike: () => handleStatusTransition(item, "dislike"),
                    pending: transitionPendingId === item.id,
                  }
                : undefined,
          }}
        />
      ))}
      <AddItemRow />
      <MovieSuggestionsStrip userId={userId} />

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
          placeholder={NOTE_PLACEHOLDERS[showNoteModalFor.status]}
          onSave={(note) => handleSaveNote(showNoteModalFor, note)}
          onClose={() => setShowNoteModalFor(null)}
        />
      )}
    </div>
  );
}

function VisitorMovieList({
  initialItems,
  ownerId,
  ownerUsername,
  initialOwnInteractions,
}: {
  initialItems: MovieListItem[];
  ownerId: string;
  ownerUsername: string;
  initialOwnInteractions?: OwnInteractionEntry[];
}) {
  const items = initialItems;
  const [statusFilter, setStatusFilter] = useState<MovieListStatus | null>(null);
  const [availabilityFilter, setAvailabilityFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("favorite");
  const [user, setUser] = useState<User | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [showDetailsFor, setShowDetailsFor] = useState<MovieListItem | null>(null);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  const socialProofMap = useSocialProof(items.map((item) => ({ id: item.itemId, mediaType: item.mediaType })));
  const { getOwn, markOwn } = useOwnInteractions(
    items.map((item) => ({ id: String(item.itemId), mediaType: item.mediaType })),
    initialOwnInteractions,
  );
  const { get: getOtherRaters } = useOtherRaters(
    items.map((item) => ({ id: String(item.itemId), mediaType: item.mediaType })),
  );

  // Rating a title on someone else's list behaves exactly like rating an
  // unrated feed item -- Ja/Nein/Watchlist -- except the write target and
  // credited owner are this list's owner instead of nobody.
  const handleLike = async (item: MovieListItem) => {
    if (!user) return;
    const key = `${item.mediaType}-${item.itemId}`;
    setPendingKey(key);
    const supabase = createClient();
    await applyItemRating(supabase, user.id, { itemId: String(item.itemId), mediaType: item.mediaType }, "lohnt_sich", [ownerId]);
    markOwn(String(item.itemId), item.mediaType, "like");
    const { error } = await addItemToOwnList(
      supabase,
      user.id,
      {
        kind: "movie",
        category: "top_list",
        item: { itemId: item.itemId, mediaType: item.mediaType, title: item.title, imageUrl: item.imageUrl, year: item.year },
      },
      [ownerId],
    );
    if (!error) {
      showToast(`Zu ${CATEGORY_LABELS.top_list} hinzugefügt`);
    }
    setPendingKey(null);
  };

  const handleDislike = async (item: MovieListItem) => {
    if (!user) return;
    const key = `${item.mediaType}-${item.itemId}`;
    setPendingKey(key);
    const supabase = createClient();
    const { error } = await applyItemRating(
      supabase,
      user.id,
      { itemId: String(item.itemId), mediaType: item.mediaType },
      "lohnt_sich_nicht",
      [ownerId],
    );
    if (error) {
      showToast("Konnte nicht gespeichert werden, versuch's nochmal");
    } else {
      markOwn(String(item.itemId), item.mediaType, "dislike");
    }
    setPendingKey(null);
  };

  const handleWatchlist = async (item: MovieListItem) => {
    if (!user) return;
    const key = `${item.mediaType}-${item.itemId}`;
    setPendingKey(key);
    const supabase = createClient();
    const { error } = await addItemToOwnList(
      supabase,
      user.id,
      {
        kind: "movie",
        category: "watchlist",
        item: { itemId: item.itemId, mediaType: item.mediaType, title: item.title, imageUrl: item.imageUrl, year: item.year },
      },
      [ownerId],
    );
    if (!error) {
      showToast(`Zu ${CATEGORY_LABELS.watchlist} hinzugefügt`);
    }
    setPendingKey(null);
  };

  const handleUnknown = async (item: MovieListItem) => {
    if (!user) return;
    const key = `${item.mediaType}-${item.itemId}`;
    setPendingKey(key);
    const supabase = createClient();
    const { error } = await applyItemRating(supabase, user.id, { itemId: String(item.itemId), mediaType: item.mediaType }, "kenne_ich_nicht");
    if (!error) markOwn(String(item.itemId), item.mediaType, "neutral");
    setPendingKey(null);
  };

  const statusFiltered = statusFilter ? items.filter((item) => item.status === statusFilter) : items;
  const availabilityOption = AVAILABILITY_FILTERS.find((option) => option.key === availabilityFilter);
  const availabilityFiltered = availabilityOption
    ? statusFiltered.filter((item) => item.watchProviders.flatrate.some((p) => availabilityOption.match(p.name)))
    : statusFiltered;
  const visibleItems = sortItems(availabilityFiltered, sortBy, socialProofMap);

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
      <FilterBar
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        availabilityFilter={availabilityFilter}
        onAvailabilityChange={setAvailabilityFilter}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      {visibleItems.length === 0 && (
        <p className="w-full text-sm text-muted-foreground">Keine Treffer für diese Filter.</p>
      )}

      {visibleItems.map((item) => (
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
            ownInteraction: getOwn(String(item.itemId), item.mediaType),
            otherRaters: getOtherRaters(String(item.itemId), item.mediaType),
            ownerUsername,
            onLike: () => handleLike(item),
            onDislike: () => handleDislike(item),
            onUnknown: () => handleUnknown(item),
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
    </div>
  );
}

export function MovieListGrid({
  username,
  ownerId,
  currentUserId,
  initialOwnInteractions,
}: {
  username: string;
  ownerId: string;
  currentUserId?: string | null;
  initialOwnInteractions?: OwnInteractionEntry[];
}) {
  const [items, setItems] = useState<MovieListItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    (async () => {
      const response = await fetch(`/api/movie-list-items?username=${encodeURIComponent(username)}`);
      if (!response.ok || cancelled) return;
      const data: { items: MovieListItem[] } = await response.json();
      if (!cancelled) setItems(data.items);
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (items === null) {
    return <p className="text-sm text-muted-foreground">Lädt…</p>;
  }

  const isOwner = currentUserId === ownerId;

  return isOwner ? (
    <OwnerMovieList initialItems={items} userId={ownerId} />
  ) : (
    <VisitorMovieList
      initialItems={items}
      ownerId={ownerId}
      ownerUsername={username}
      initialOwnInteractions={initialOwnInteractions}
    />
  );
}
