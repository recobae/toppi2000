"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Pencil, ThumbsDown, ThumbsUp, GripVertical, Plus, X } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { WatchProviderBadges } from "@/components/watch-provider-badges";
import { GuestSignupModal } from "@/components/guest-signup-modal";
import { MovieMetaBadges, MovieDetailModal } from "@/components/movie-info";
import { SearchResultCard } from "@/components/search/search-result-card";
import { removeFromCategory, updateNote } from "@/lib/saved-items";
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

function OwnerListItemCard({
  item,
  category,
  userId,
  onRemove,
  isRemoving,
  onNoteSaved,
}: {
  item: CategoryListItem;
  category: SavedCategory;
  userId: string;
  onRemove: (item: CategoryListItem) => void;
  isRemoving: boolean;
  onNoteSaved: (item: CategoryListItem, note: string | null) => void;
}) {
  const sortable = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };
  const [showDetails, setShowDetails] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);

  const handleSaveNote = async (note: string | null) => {
    const supabase = createClient();
    const { error } = await updateNote(
      supabase,
      category,
      userId,
      item.itemId,
      item.mediaType,
      note,
    );
    if (!error) onNoteSaved(item, note);
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={sortable.isDragging ? "opacity-40" : ""}
    >
      <Card className="overflow-hidden flex flex-col">
        <div className="relative aspect-[2/3] w-full bg-muted">
          <button
            type="button"
            aria-label="Ziehen zum Sortieren"
            className="absolute top-2 left-2 z-10 flex h-11 w-11 items-center justify-center rounded-md bg-background/80 backdrop-blur touch-none cursor-grab active:cursor-grabbing"
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <GripVertical className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => setShowDetails(true)}
            aria-label={`Details zu ${item.title} anzeigen`}
            className="absolute inset-0"
          >
            {item.imageUrl ? (
              <Image
                src={item.imageUrl}
                alt={item.title}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground p-2 text-center">
                Kein Poster
              </div>
            )}
          </button>
        </div>
        <CardContent className="p-3 flex-1 flex flex-col gap-2">
          <div>
            <p className="text-sm font-medium leading-tight line-clamp-2">
              {item.title}
            </p>
            <MovieMetaBadges details={item.movieDetails} year={item.year} />
            {item.note && (
              <p className="mt-1 text-[11px] italic text-muted-foreground line-clamp-2">
                „{truncateNote(item.note)}“
              </p>
            )}
          </div>
          <WatchProviderBadges
            providers={item.watchProviders}
            title={item.title}
          />
          <div className="mt-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={isRemoving}
              onClick={() => onRemove(item)}
            >
              <X />
              {isRemoving ? "Wird entfernt…" : "Entfernen"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label={item.note ? "Notiz bearbeiten" : "Notiz hinzufügen"}
              onClick={() => setShowNoteModal(true)}
            >
              <Pencil />
            </Button>
          </div>
        </CardContent>
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
    </div>
  );
}

function AddItemTile({ category }: { category: SavedCategory }) {
  return (
    <Link
      href={`/search?addTo=${category}`}
      className="flex flex-col items-center justify-center gap-2 aspect-[2/3] w-full rounded-lg border-2 border-dashed border-input text-muted-foreground hover:border-primary hover:text-primary transition-colors"
    >
      <Plus className="size-8" />
      <span className="text-xs font-medium">Hinzufügen</span>
    </Link>
  );
}

function OwnerCategoryGrid({
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );

  const handleRemove = async (item: CategoryListItem) => {
    setRemovingId(item.id);
    const supabase = createClient();
    const { error } = await removeFromCategory(
      supabase,
      category,
      userId,
      item.itemId,
      item.mediaType,
    );

    if (!error) {
      setItems((prev) => prev.filter((existing) => existing.id !== item.id));
    }
    setRemovingId(null);
  };

  const persistOrder = async (reordered: CategoryListItem[]) => {
    const supabase = createClient();
    try {
      await Promise.all(
        reordered.map((item, index) =>
          supabase.from(category).update({ position: index }).eq("id", item.id),
        ),
      );
    } catch {
      // reorder failed to persist; local order stays as the optimistic result
    }
  };

  const handleNoteSaved = (item: CategoryListItem, note: string | null) => {
    setItems((prev) =>
      prev.map((existing) =>
        existing.id === item.id ? { ...existing, note } : existing,
      ),
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setItems((prev) => {
      const oldIndex = prev.findIndex((item) => item.id === active.id);
      const newIndex = prev.findIndex((item) => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const reordered = arrayMove(prev, oldIndex, newIndex);
      persistOrder(reordered);
      return reordered;
    });
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {items.length === 0 && (
        <p className="w-full text-sm text-muted-foreground">
          {CATEGORY_LABELS[category]} enthält noch keine Einträge.
        </p>
      )}
      <DndContext
        id="category-items-dnd-context"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items.map((item) => item.id)} strategy={rectSortingStrategy}>
          <div className="w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {items.map((item) => (
              <OwnerListItemCard
                key={item.id}
                item={item}
                category={category}
                userId={userId}
                onRemove={handleRemove}
                isRemoving={removingId === item.id}
                onNoteSaved={handleNoteSaved}
              />
            ))}
            <AddItemTile category={category} />
          </div>
        </SortableContext>
      </DndContext>
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
      const { error } = await rateItem(
        supabase,
        ownerId,
        viewerId,
        itemId,
        mediaType,
        vote,
      );
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

function VisitorCategoryGrid({
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
    <div className="w-full flex flex-col gap-4">
      <ToastStack toasts={toasts} />
      <div className="w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {items.map((item) => {
          const result = itemToSearchResult(item);
          const counts = ratings[`${item.mediaType}-${item.itemId}`] ?? {
            up: 0,
            down: 0,
            myVote: null,
          };
          return (
            <SearchResultCard
              key={item.id}
              result={result}
              isLoggedIn={!!user}
              userId={user?.id}
              savedState={getSavedState(stateMap, item.itemId, item.mediaType)}
              onSavedChange={(category, value) => {
                markSaved(item.itemId, item.mediaType, category, value);
                showToast(
                  value
                    ? `Zu ${CATEGORY_LABELS[category]} hinzugefügt`
                    : `Aus ${CATEGORY_LABELS[category]} entfernt`,
                );
                if (value && !SKIP_ADD_NOTE_PROMPT.includes(category)) {
                  setNotePrompt({ result, category });
                }
              }}
              onGuestClick={() => setShowGuestPrompt(true)}
              socialProof={getSocialProofBreakdown(
                socialProofMap,
                item.itemId,
                item.mediaType,
              )}
              note={item.note}
              extraFooter={
                user ? (
                  <RatingButtons
                    ownerId={ownerId}
                    viewerId={user.id}
                    itemId={item.itemId}
                    mediaType={item.mediaType}
                    counts={counts}
                    onVoted={(vote) => {
                      setRatings((prev) => {
                        const key = `${item.mediaType}-${item.itemId}`;
                        const prevCounts = prev[key] ?? {
                          up: 0,
                          down: 0,
                          myVote: null,
                        };
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
                ) : undefined
              }
            />
          );
        })}
      </div>

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
    <OwnerCategoryGrid initialItems={items} category={category} userId={ownerId} />
  ) : (
    <VisitorCategoryGrid
      initialItems={items}
      ownerId={ownerId}
      ownerUsername={username}
    />
  );
}
