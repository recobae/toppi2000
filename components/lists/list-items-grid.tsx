"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, GripVertical, Plus } from "lucide-react";
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
import { type ListSummary } from "@/components/search/add-to-list-menu";
import type { WatchProviderGroups, MovieDetails, SearchResult } from "@/lib/tmdb";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w342";

export type ListItem = {
  id: string;
  external_id: number | string;
  title: string;
  image_url: string | null;
  list_id: string;
  position: number;
  metadata: { year?: string | null; type?: "movie" | "tv" } | null;
  watchProviders: WatchProviderGroups;
  movieDetails: MovieDetails;
};

type OthersVoteCount = {
  up: number;
  down: number;
};

const EMPTY_OTHERS_COUNT: OthersVoteCount = { up: 0, down: 0 };

type Toast = { id: number; message: string };
type AddingState = { resultKey: string; listId: string } | null;

function itemToSearchResult(item: ListItem): SearchResult {
  const mediaType = item.metadata?.type ?? "movie";
  const posterPath = item.image_url?.startsWith(POSTER_BASE_URL)
    ? item.image_url.slice(POSTER_BASE_URL.length)
    : null;

  return {
    id: Number(item.external_id),
    mediaType,
    title: item.title,
    year: item.metadata?.year ?? null,
    posterPath,
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
  othersVoteCount,
  onRemove,
  isRemoving,
  isDragOverlay,
}: {
  item: ListItem;
  othersVoteCount: OthersVoteCount;
  onRemove: (itemId: string) => void;
  isRemoving: boolean;
  isDragOverlay?: boolean;
}) {
  const sortable = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={sortable.isDragging && !isDragOverlay ? "opacity-40" : ""}
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
            {item.image_url ? (
              <Image
                src={item.image_url}
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
            <MovieMetaBadges
              details={item.movieDetails}
              year={item.metadata?.year ?? null}
            />
          </div>
          <WatchProviderBadges
            providers={item.watchProviders}
            title={item.title}
          />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>👍 {othersVoteCount.up}</span>
            <span>👎 {othersVoteCount.down}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-auto"
            disabled={isRemoving}
            onClick={() => onRemove(item.id)}
          >
            <X />
            {isRemoving ? "Wird entfernt…" : "Entfernen"}
          </Button>
        </CardContent>
      </Card>

      {showDetails && (
        <MovieDetailModal
          title={item.title}
          posterUrl={item.image_url}
          year={item.metadata?.year ?? null}
          details={item.movieDetails}
          tmdbId={Number(item.external_id)}
          mediaType={item.metadata?.type ?? "movie"}
          onClose={() => setShowDetails(false)}
        />
      )}
    </div>
  );
}

function AddItemTile({ listId }: { listId: string }) {
  return (
    <Link
      href={`/search?addToList=${listId}`}
      className="flex flex-col items-center justify-center gap-2 aspect-[2/3] w-full rounded-lg border-2 border-dashed border-input text-muted-foreground hover:border-primary hover:text-primary transition-colors"
    >
      <Plus className="size-8" />
      <span className="text-xs font-medium">Hinzufügen</span>
    </Link>
  );
}

function OwnerListGrid({
  initialItems,
  listId,
}: {
  initialItems: ListItem[];
  listId: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [othersVotes, setOthersVotes] = useState<
    Record<string, OthersVoteCount>
  >({});
  const router = useRouter();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );

  useEffect(() => {
    if (items.length === 0) return;

    const supabase = createClient();
    (async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      const itemIds = items.map((item) => item.id);
      const { data, error } = await supabase
        .from("item_votes")
        .select("id, list_item_id, user_id, vote")
        .in("list_item_id", itemIds);

      if (error || !data) return;

      const nextOthers: Record<string, OthersVoteCount> = {};
      for (const item of items) {
        nextOthers[item.id] = { ...EMPTY_OTHERS_COUNT };
      }
      for (const row of data) {
        if (currentUser && row.user_id === currentUser.id) continue;
        const othersState = nextOthers[row.list_item_id];
        if (!othersState) continue;
        if (row.vote) othersState.up += 1;
        else othersState.down += 1;
      }
      setOthersVotes(nextOthers);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRemove = async (itemId: string) => {
    setRemovingId(itemId);
    const supabase = createClient();

    const { error } = await supabase
      .from("list_items")
      .delete()
      .eq("id", itemId);

    if (!error) {
      setItems((prev) => prev.filter((item) => item.id !== itemId));
      router.refresh();
    }
    setRemovingId(null);
  };

  const persistOrder = async (reordered: ListItem[]) => {
    const supabase = createClient();
    try {
      await Promise.all(
        reordered.map((item, index) =>
          supabase
            .from("list_items")
            .update({ position: index + 1 })
            .eq("id", item.id),
        ),
      );
      router.refresh();
    } catch {
      // reorder failed to persist; local order stays as the optimistic result
    }
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
          Diese Liste enthält noch keine Einträge.
        </p>
      )}
      <DndContext
        id="list-items-dnd-context"
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
                othersVoteCount={othersVotes[item.id] ?? EMPTY_OTHERS_COUNT}
                onRemove={handleRemove}
                isRemoving={removingId === item.id}
              />
            ))}
            <AddItemTile listId={listId} />
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function VisitorListGrid({
  initialItems,
  listId,
  ownerUsername,
}: {
  initialItems: ListItem[];
  listId: string;
  ownerUsername: string;
}) {
  const items = initialItems;
  const [user, setUser] = useState<User | null>(null);
  const [myLists, setMyLists] = useState<ListSummary[]>([]);
  const [isLoadingLists, setIsLoadingLists] = useState(true);
  const [adding, setAdding] = useState<AddingState>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);

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

      if (!currentUser) {
        setIsLoadingLists(false);
        return;
      }

      const { data, error } = await supabase
        .from("lists")
        .select("id, title, category")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: true });

      if (!error && data) setMyLists(data);
      setIsLoadingLists(false);
    })();
  }, []);

  const handleAddToList = useCallback(
    async (item: ListItem, targetList: ListSummary) => {
      const resultKey = `${item.metadata?.type ?? "movie"}-${item.external_id}`;
      setAdding({ resultKey, listId: targetList.id });

      try {
        const response = await fetch("/api/list-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listId: targetList.id,
            externalId: item.external_id,
            title: item.title,
            imageUrl: item.image_url,
            mediaType: item.metadata?.type ?? "movie",
            year: item.metadata?.year ?? null,
          }),
        });
        const data: { error?: string } = await response.json();

        if (!response.ok) {
          showToast(data.error ?? "Hinzufügen fehlgeschlagen");
          return;
        }
        showToast(`Zu ${targetList.title} hinzugefügt`);
      } catch {
        showToast("Hinzufügen fehlgeschlagen");
      } finally {
        setAdding(null);
      }
    },
    [showToast],
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
          const resultKey = `${result.mediaType}-${result.id}`;
          return (
            <SearchResultCard
              key={item.id}
              result={result}
              isLoggedIn={!!user}
              isLoadingLists={isLoadingLists}
              lists={myLists}
              addingListId={adding?.resultKey === resultKey ? adding.listId : null}
              onAdd={(list) => handleAddToList(item, list)}
              onGuestClick={() => setShowGuestPrompt(true)}
            />
          );
        })}
      </div>

      {showGuestPrompt && (
        <GuestSignupModal
          message={`Melde dich an, um Filme zu deinen eigenen Listen hinzuzufügen, ${ownerUsername}s Liste zu entdecken, direkt zu sehen wo Filme gerade laufen, und Film-Inspirationen für heute Abend zu entdecken.`}
          next={`/lists/${listId}`}
          onClose={() => setShowGuestPrompt(false)}
        />
      )}
    </div>
  );
}

export function ListItemsGrid({
  initialItems,
  isOwner,
  listId,
  ownerUsername,
}: {
  initialItems: ListItem[];
  isOwner: boolean;
  listId: string;
  ownerUsername: string;
}) {
  if (isOwner) {
    return <OwnerListGrid initialItems={initialItems} listId={listId} />;
  }

  return (
    <VisitorListGrid
      initialItems={initialItems}
      listId={listId}
      ownerUsername={ownerUsername}
    />
  );
}
