"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, ThumbsUp, ThumbsDown, GripVertical, Plus } from "lucide-react";
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
import type { WatchProviderGroups } from "@/lib/tmdb";

export type ListItem = {
  id: string;
  external_id: number | string;
  title: string;
  image_url: string | null;
  list_id: string;
  position: number;
  metadata: { year?: string | null; type?: "movie" | "tv" } | null;
  watchProviders: WatchProviderGroups;
};

type VoteState = {
  up: number;
  down: number;
  myVoteId: string | null;
  myVote: boolean | null;
};

type OthersVoteCount = {
  up: number;
  down: number;
};

const EMPTY_VOTE_STATE: VoteState = {
  up: 0,
  down: 0,
  myVoteId: null,
  myVote: null,
};

const EMPTY_OTHERS_COUNT: OthersVoteCount = { up: 0, down: 0 };

function GuestVotePromptModal({
  ownerUsername,
  listId,
  onClose,
}: {
  ownerUsername: string;
  listId: string;
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const next = encodeURIComponent(`/lists/${listId}`);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-lg bg-background border p-5 flex flex-col gap-4"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-sm">
          Melde dich an, um {ownerUsername}s Liste zu bewerten, eigene Listen
          zu erstellen, direkt zu sehen wo Filme gerade laufen, und
          Film-Inspirationen für heute Abend zu entdecken.
        </p>
        <div className="flex flex-col gap-2">
          <Link
            href={`/auth/sign-up?next=${next}`}
            className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:bg-primary/90 transition-colors min-h-11"
          >
            Jetzt registrieren
          </Link>
          <Link
            href={`/auth/login?next=${next}`}
            className="text-center text-xs text-muted-foreground hover:underline"
          >
            Bereits registriert? Anmelden
          </Link>
        </div>
      </div>
    </div>
  );
}

function ListItemCard({
  item,
  isOwner,
  isDragOverlay,
  voteState,
  othersVoteCount,
  isLoggedIn,
  onVote,
  onRequireLogin,
  onRemove,
  isRemoving,
}: {
  item: ListItem;
  isOwner: boolean;
  isDragOverlay?: boolean;
  voteState: VoteState;
  othersVoteCount: OthersVoteCount;
  isLoggedIn: boolean;
  onVote: (itemId: string, voteValue: boolean) => void;
  onRequireLogin: () => void;
  onRemove: (itemId: string) => void;
  isRemoving: boolean;
}) {
  const sortable = useSortable({ id: item.id, disabled: !isOwner });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={sortable.isDragging && !isDragOverlay ? "opacity-40" : ""}
    >
      <Card className="overflow-hidden flex flex-col">
        <div className="relative aspect-[2/3] w-full bg-muted">
          {isOwner && (
            <button
              type="button"
              aria-label="Ziehen zum Sortieren"
              className="absolute top-2 left-2 z-10 flex h-11 w-11 items-center justify-center rounded-md bg-background/80 backdrop-blur touch-none cursor-grab active:cursor-grabbing"
              {...sortable.attributes}
              {...sortable.listeners}
            >
              <GripVertical className="size-5" />
            </button>
          )}
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
        </div>
        <CardContent className="p-3 flex-1 flex flex-col gap-2">
          <div>
            <p className="text-sm font-medium leading-tight line-clamp-2">
              {item.title}
            </p>
            <p className="text-xs text-muted-foreground">
              {item.metadata?.year ?? "—"}
            </p>
          </div>
          <WatchProviderBadges
            providers={item.watchProviders}
            title={item.title}
          />
          {isOwner ? (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>👍 {othersVoteCount.up}</span>
              <span>👎 {othersVoteCount.down}</span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <Button
                  variant={voteState.myVote === true ? "default" : "outline"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() =>
                    isLoggedIn ? onVote(item.id, true) : onRequireLogin()
                  }
                  aria-label="Daumen hoch"
                >
                  <ThumbsUp className="size-3.5" />
                </Button>
                <span className="text-xs text-muted-foreground w-4 text-center">
                  {voteState.up}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant={voteState.myVote === false ? "default" : "outline"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() =>
                    isLoggedIn ? onVote(item.id, false) : onRequireLogin()
                  }
                  aria-label="Daumen runter"
                >
                  <ThumbsDown className="size-3.5" />
                </Button>
                <span className="text-xs text-muted-foreground w-4 text-center">
                  {voteState.down}
                </span>
              </div>
            </div>
          )}
          {isOwner && (
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
          )}
        </CardContent>
      </Card>
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
  const [items, setItems] = useState(initialItems);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [votes, setVotes] = useState<Record<string, VoteState>>({});
  const [othersVotes, setOthersVotes] = useState<
    Record<string, OthersVoteCount>
  >({});
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);
  const router = useRouter();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setUser(currentUser);

      if (items.length === 0) return;

      const itemIds = items.map((item) => item.id);
      const { data, error } = await supabase
        .from("item_votes")
        .select("id, list_item_id, user_id, vote")
        .in("list_item_id", itemIds);

      if (error || !data) return;

      const next: Record<string, VoteState> = {};
      const nextOthers: Record<string, OthersVoteCount> = {};
      for (const item of items) {
        next[item.id] = { ...EMPTY_VOTE_STATE };
        nextOthers[item.id] = { ...EMPTY_OTHERS_COUNT };
      }
      for (const row of data) {
        const state = next[row.list_item_id];
        if (!state) continue;
        if (row.vote) state.up += 1;
        else state.down += 1;
        if (currentUser && row.user_id === currentUser.id) {
          state.myVoteId = row.id;
          state.myVote = row.vote;
        } else {
          const othersState = nextOthers[row.list_item_id];
          if (othersState) {
            if (row.vote) othersState.up += 1;
            else othersState.down += 1;
          }
        }
      }
      setVotes(next);
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

  const handleVote = async (itemId: string, voteValue: boolean) => {
    if (!user) {
      setShowGuestPrompt(true);
      return;
    }
    const supabase = createClient();
    const current = votes[itemId];

    try {
      if (current?.myVoteId) {
        const { error } = await supabase
          .from("item_votes")
          .update({ vote: voteValue })
          .eq("id", current.myVoteId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("item_votes").insert({
          list_item_id: itemId,
          user_id: user.id,
          vote: voteValue,
        });
        if (error) throw error;
      }

      const { data, error: refetchError } = await supabase
        .from("item_votes")
        .select("id, user_id, vote")
        .eq("list_item_id", itemId);

      if (!refetchError && data) {
        const next: VoteState = { ...EMPTY_VOTE_STATE };
        for (const row of data) {
          if (row.vote) next.up += 1;
          else next.down += 1;
          if (row.user_id === user.id) {
            next.myVoteId = row.id;
            next.myVote = row.vote;
          }
        }
        setVotes((prev) => ({ ...prev, [itemId]: next }));
      }
    } catch {
      // vote failed, leave state unchanged
    }
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
    if (!isOwner || !over || active.id === over.id) return;

    setItems((prev) => {
      const oldIndex = prev.findIndex((item) => item.id === active.id);
      const newIndex = prev.findIndex((item) => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const reordered = arrayMove(prev, oldIndex, newIndex);
      persistOrder(reordered);
      return reordered;
    });
  };

  if (items.length === 0 && !isOwner) {
    return (
      <p className="w-full text-sm text-muted-foreground">
        Diese Liste enthält noch keine Einträge.
      </p>
    );
  }

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
              <ListItemCard
                key={item.id}
                item={item}
                isOwner={isOwner}
                voteState={votes[item.id] ?? EMPTY_VOTE_STATE}
                othersVoteCount={othersVotes[item.id] ?? EMPTY_OTHERS_COUNT}
                isLoggedIn={!!user}
                onVote={handleVote}
                onRequireLogin={() => setShowGuestPrompt(true)}
                onRemove={handleRemove}
                isRemoving={removingId === item.id}
              />
            ))}
            {isOwner && <AddItemTile listId={listId} />}
          </div>
        </SortableContext>
      </DndContext>
      {showGuestPrompt && (
        <GuestVotePromptModal
          ownerUsername={ownerUsername}
          listId={listId}
          onClose={() => setShowGuestPrompt(false)}
        />
      )}
    </div>
  );
}
