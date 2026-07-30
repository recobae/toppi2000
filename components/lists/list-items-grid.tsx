"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Pencil, Plus, Star, ThumbsDown, ThumbsUp, X } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { WatchProviderBadges } from "@/components/watch-provider-badges";
import { GuestSignupModal } from "@/components/guest-signup-modal";
import { MovieMetaBadges, MovieDetailModal, SocialProofIcons } from "@/components/movie-info";
import { SaveButtons } from "@/components/search/save-buttons";
import { removeFromCategory, setFavorite, updateNote } from "@/lib/saved-items";
import { CATEGORY_LABELS, type SavedCategory } from "@/lib/categories";
import { NOTE_PLACEHOLDERS, SKIP_ADD_NOTE_PROMPT, truncateNote } from "@/lib/notes";
import { NoteModal } from "@/components/lists/note-modal";
import { useSavedState, getSavedState } from "@/lib/hooks/use-saved-state";
import { useSocialProof, getSocialProofBreakdown } from "@/lib/hooks/use-social-proof";
import { getItemRatings, rateItem } from "@/lib/item-ratings";
import type { WatchProviderGroups, MovieDetails, SearchResult } from "@/lib/tmdb";

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

type Toast = { id: number; message: string };

function itemToSearchResult(item: CategoryListItem): SearchResult {
  return {
    id: item.itemId,
    mediaType: item.mediaType,
    title: item.title,
    year: item.year,
    posterPath: null,
    overview: item.movieDetails.overview,
    watchProviders: item.watchProviders,
    movieDetails: item.movieDetails,
  };
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
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
  );
}

/**
 * Row layout shared by every list surface (Empfohlen/Watchlist and, via
 * region-items-grid.tsx, Orte) -- reference layout is the friend-feed cards
 * under "Von deinen Freunden". Poster thumbnail left, info + actions right.
 */
function OwnerListItemRow({
  item,
  category,
  userId,
  onRemove,
  isRemoving,
  onNoteSaved,
  onFavoriteToggled,
}: {
  item: CategoryListItem;
  category: SavedCategory;
  userId: string;
  onRemove: (item: CategoryListItem) => void;
  isRemoving: boolean;
  onNoteSaved: (item: CategoryListItem, note: string | null) => void;
  onFavoriteToggled: (item: CategoryListItem, isFavorite: boolean) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [togglingFavorite, setTogglingFavorite] = useState(false);

  const handleSaveNote = async (note: string | null) => {
    const supabase = createClient();
    const { error } = await updateNote(supabase, category, userId, item.itemId, item.mediaType, note);
    if (!error) onNoteSaved(item, note);
  };

  const handleToggleFavorite = async () => {
    if (togglingFavorite) return;
    setTogglingFavorite(true);
    try {
      const supabase = createClient();
      const nextFavorite = !item.isFavorite;
      const { error } = await setFavorite(supabase, userId, item.itemId, item.mediaType, nextFavorite);
      if (!error) onFavoriteToggled(item, nextFavorite);
    } finally {
      setTogglingFavorite(false);
    }
  };

  return (
    <>
      <Card className="overflow-hidden flex gap-3 p-3">
        <button
          type="button"
          onClick={() => setShowDetails(true)}
          aria-label={`Details zu ${item.title} anzeigen`}
          className="relative w-16 aspect-[2/3] shrink-0 rounded-md overflow-hidden bg-muted"
        >
          {item.imageUrl ? (
            <Image src={item.imageUrl} alt={item.title} fill sizes="64px" className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground p-1 text-center">
              Kein Poster
            </div>
          )}
        </button>
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <p className="text-sm font-medium leading-tight line-clamp-2">
            {item.title}
          </p>
          <MovieMetaBadges details={item.movieDetails} year={item.year} />
          {item.note && (
            <p className="text-[11px] italic text-muted-foreground line-clamp-2">
              „{truncateNote(item.note)}“
            </p>
          )}
          <WatchProviderBadges providers={item.watchProviders} title={item.title} />
          <div className="mt-auto pt-2 flex items-center gap-1.5">
            {category === "top_list" && (
              <button
                type="button"
                aria-label={item.isFavorite ? "Favorit entfernen" : "Als Favorit markieren"}
                disabled={togglingFavorite}
                onClick={handleToggleFavorite}
                className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ${
                  item.isFavorite
                    ? "border-amber-500 text-amber-500"
                    : "border-input text-muted-foreground hover:bg-accent"
                }`}
              >
                <Star className={`size-4 ${item.isFavorite ? "fill-current" : ""}`} />
              </button>
            )}
            <Button
              variant="outline"
              size="sm"
              aria-label={item.note ? "Notiz bearbeiten" : "Notiz hinzufügen"}
              onClick={() => setShowNoteModal(true)}
            >
              <Pencil />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              disabled={isRemoving}
              onClick={() => onRemove(item)}
            >
              <X />
              {isRemoving ? "Wird entfernt…" : "Entfernen"}
            </Button>
          </div>
        </div>
      </Card>

      {showDetails && (
        <MovieDetailModal
          title={item.title}
          posterUrl={item.imageUrl}
          year={item.year}
          details={item.movieDetails}
          tmdbId={item.itemId}
          mediaType={item.mediaType}
          note={item.note}
          onClose={() => setShowDetails(false)}
        />
      )}

      {showNoteModal && (
        <NoteModal
          title={item.title}
          posterUrl={item.imageUrl}
          initialNote={item.note}
          placeholder={NOTE_PLACEHOLDERS[category]}
          onSave={handleSaveNote}
          onClose={() => setShowNoteModal(false)}
        />
      )}
    </>
  );
}

function AddItemRow({ category }: { category: SavedCategory }) {
  return (
    <Link
      href={`/search?addTo=${category}`}
      className="flex items-center justify-center gap-2 h-14 w-full rounded-lg border-2 border-dashed border-input text-muted-foreground hover:border-primary hover:text-primary transition-colors"
    >
      <Plus className="size-5" />
      <span className="text-sm font-medium">Hinzufügen</span>
    </Link>
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

  const handleRemove = async (item: CategoryListItem) => {
    setRemovingId(item.id);
    const supabase = createClient();
    const { error } = await removeFromCategory(supabase, category, userId, item.itemId, item.mediaType);

    if (!error) {
      setItems((prev) => prev.filter((existing) => existing.id !== item.id));
    }
    setRemovingId(null);
  };

  const handleNoteSaved = (item: CategoryListItem, note: string | null) => {
    setItems((prev) =>
      prev.map((existing) => (existing.id === item.id ? { ...existing, note } : existing)),
    );
  };

  const handleFavoriteToggled = (item: CategoryListItem, isFavorite: boolean) => {
    setItems((prev) => {
      const updated = prev.map((existing) =>
        existing.id === item.id ? { ...existing, isFavorite } : existing,
      );
      // Mirrors the server sort (favorites first, newest star on top) so the
      // row jumps immediately instead of waiting for a refetch.
      return [...updated].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));
    });
  };

  return (
    <div className="w-full flex flex-col gap-3">
      {items.length === 0 && (
        <p className="w-full text-sm text-muted-foreground">
          {CATEGORY_LABELS[category]} enthält noch keine Einträge.
        </p>
      )}
      {items.map((item) => (
        <OwnerListItemRow
          key={item.id}
          item={item}
          category={category}
          userId={userId}
          onRemove={handleRemove}
          isRemoving={removingId === item.id}
          onNoteSaved={handleNoteSaved}
          onFavoriteToggled={handleFavoriteToggled}
        />
      ))}
      <AddItemRow category={category} />
    </div>
  );
}

function RatingButtons({
  ownerId,
  viewerId,
  itemId,
  mediaType,
  counts,
  onVoted,
}: {
  ownerId: string;
  viewerId: string | null;
  itemId: number;
  mediaType: "movie" | "tv";
  counts: { up: number; down: number; myVote: boolean | null };
  onVoted: (vote: boolean) => void;
}) {
  const [pending, setPending] = useState(false);

  const handleVote = async (vote: boolean) => {
    if (!viewerId || pending) return;
    setPending(true);
    try {
      const supabase = createClient();
      const { error } = await rateItem(supabase, ownerId, viewerId, itemId, mediaType, vote);
      if (!error) onVoted(vote);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <button
        type="button"
        disabled={pending}
        onClick={() => handleVote(true)}
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
          counts.myVote === true ? "text-green-600 font-medium" : "hover:text-foreground"
        }`}
      >
        <ThumbsUp className="size-3.5" />
        {counts.up}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => handleVote(false)}
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
          counts.myVote === false ? "text-destructive font-medium" : "hover:text-foreground"
        }`}
      >
        <ThumbsDown className="size-3.5" />
        {counts.down}
      </button>
    </div>
  );
}

function VisitorListItemRow({
  item,
  ownerId,
  user,
  savedState,
  onSavedChange,
  onGuestClick,
  socialProof,
  ratingCounts,
  onVoted,
}: {
  item: CategoryListItem;
  ownerId: string;
  user: User | null;
  savedState: ReturnType<typeof getSavedState>;
  onSavedChange: (category: "top_list" | "watchlist" | "dont_watch", value: boolean) => void;
  onGuestClick: () => void;
  socialProof: ReturnType<typeof getSocialProofBreakdown>;
  ratingCounts: { up: number; down: number; myVote: boolean | null };
  onVoted: (vote: boolean) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <>
      <Card className="overflow-hidden flex gap-3 p-3">
        <button
          type="button"
          onClick={() => setShowDetails(true)}
          aria-label={`Details zu ${item.title} anzeigen`}
          className="relative w-16 aspect-[2/3] shrink-0 rounded-md overflow-hidden bg-muted"
        >
          {item.imageUrl ? (
            <Image src={item.imageUrl} alt={item.title} fill sizes="64px" className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground p-1 text-center">
              Kein Poster
            </div>
          )}
        </button>
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <p className="text-sm font-medium leading-tight line-clamp-2">
            {item.title}
          </p>
          <MovieMetaBadges details={item.movieDetails} year={item.year} />
          <SocialProofIcons breakdown={socialProof} onClick={() => setShowDetails(true)} className="mt-0.5" />
          {item.note && (
            <p className="text-[11px] italic text-muted-foreground line-clamp-2">
              „{truncateNote(item.note)}“
            </p>
          )}
          <WatchProviderBadges providers={item.watchProviders} title={item.title} />
          <div className="mt-auto pt-2 flex flex-wrap items-center gap-2">
            <SaveButtons
              isLoggedIn={!!user}
              userId={user?.id}
              item={{
                itemId: item.itemId,
                mediaType: item.mediaType,
                title: item.title,
                imageUrl: item.imageUrl,
                year: item.year,
              }}
              savedState={savedState}
              onChange={onSavedChange}
              onGuestClick={onGuestClick}
              size="compact"
            />
            {user && (
              <RatingButtons
                ownerId={ownerId}
                viewerId={user.id}
                itemId={item.itemId}
                mediaType={item.mediaType}
                counts={ratingCounts}
                onVoted={onVoted}
              />
            )}
          </div>
        </div>
      </Card>

      {showDetails && (
        <MovieDetailModal
          title={item.title}
          posterUrl={item.imageUrl}
          year={item.year}
          details={item.movieDetails}
          tmdbId={item.itemId}
          mediaType={item.mediaType}
          socialProof={socialProof}
          note={item.note}
          onClose={() => setShowDetails(false)}
        />
      )}
    </>
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
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);
  const [ratings, setRatings] = useState<
    Record<string, { up: number; down: number; myVote: boolean | null }>
  >({});
  const [notePrompt, setNotePrompt] = useState<{
    result: SearchResult;
    category: SavedCategory;
  } | null>(null);

  const showToast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setUser(currentUser);

      const ratingsMap = await getItemRatings(
        supabase,
        ownerId,
        currentUser?.id ?? null,
        items.map((item) => ({ itemId: item.itemId, mediaType: item.mediaType })),
      );
      setRatings(ratingsMap);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { stateMap, markSaved } = useSavedState(
    items.map((item) => ({ id: item.itemId, mediaType: item.mediaType })),
  );
  const socialProofMap = useSocialProof(
    items.map((item) => ({ id: item.itemId, mediaType: item.mediaType })),
  );

  if (items.length === 0) {
    return (
      <p className="w-full text-sm text-muted-foreground">
        Diese Liste enthält noch keine Einträge.
      </p>
    );
  }

  return (
    <div className="w-full flex flex-col gap-3">
      <ToastStack toasts={toasts} />
      {items.map((item) => {
        const counts = ratings[`${item.mediaType}-${item.itemId}`] ?? {
          up: 0,
          down: 0,
          myVote: null,
        };
        return (
          <VisitorListItemRow
            key={item.id}
            item={item}
            ownerId={ownerId}
            user={user}
            savedState={getSavedState(stateMap, item.itemId, item.mediaType)}
            onSavedChange={(category, value) => {
              markSaved(item.itemId, item.mediaType, category, value);
              showToast(
                value
                  ? `Zu ${CATEGORY_LABELS[category]} hinzugefügt`
                  : `Aus ${CATEGORY_LABELS[category]} entfernt`,
              );
              if (value && !SKIP_ADD_NOTE_PROMPT.includes(category)) {
                setNotePrompt({ result: itemToSearchResult(item), category });
              }
            }}
            onGuestClick={() => setShowGuestPrompt(true)}
            socialProof={getSocialProofBreakdown(socialProofMap, item.itemId, item.mediaType)}
            ratingCounts={counts}
            onVoted={(vote) => {
              setRatings((prev) => {
                const key = `${item.mediaType}-${item.itemId}`;
                const prevCounts = prev[key] ?? { up: 0, down: 0, myVote: null };
                const next = { ...prevCounts };
                if (prevCounts.myVote !== null) {
                  if (prevCounts.myVote) next.up -= 1;
                  else next.down -= 1;
                }
                if (vote) next.up += 1;
                else next.down += 1;
                next.myVote = vote;
                return { ...prev, [key]: next };
              });
            }}
          />
        );
      })}

      {showGuestPrompt && (
        <GuestSignupModal
          message={`Melde dich an, um Titel zu deinen eigenen Listen hinzuzufügen, ${ownerUsername}s Liste zu entdecken, direkt zu sehen wo Titel gerade laufen, und Inspirationen für heute Abend zu entdecken.`}
          next={`/u/${ownerUsername}`}
          onClose={() => setShowGuestPrompt(false)}
        />
      )}

      {notePrompt && user && (
        <NoteModal
          title={notePrompt.result.title}
          posterUrl={
            notePrompt.result.posterPath
              ? `https://image.tmdb.org/t/p/w342${notePrompt.result.posterPath}`
              : null
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
    <VisitorCategoryList initialItems={items} ownerId={ownerId} ownerUsername={username} />
  );
}
