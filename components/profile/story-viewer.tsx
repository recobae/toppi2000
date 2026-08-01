"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Trash2, X } from "lucide-react";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { ActionBar, type ListItemRowActions } from "@/components/items/list-item-row";
import { createClient } from "@/lib/supabase/client";
import { removeFromCategory, saveToCategory } from "@/lib/saved-items";
import { removePlace } from "@/lib/place-items";
import { setInteractionWithCredits, recordInspiredCredits } from "@/lib/interaction-credits";
import type { StoryUpdate } from "@/app/api/story-updates/route";

const SLIDE_DURATION_MS = 4000;

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 1) return "gerade eben";
  if (hours === 1) return "vor 1 Std.";
  return `vor ${hours} Std.`;
}

export function StoryViewer({
  username,
  allowDelete = false,
  onClose,
  onNext,
}: {
  username: string;
  allowDelete?: boolean;
  onClose: () => void;
  /** Called instead of onClose when the last slide finishes naturally (timeout or tap-past-end) -- lets the caller advance to the next person's story, Instagram-style. Falls back to onClose when omitted. */
  onNext?: () => void;
}) {
  const [updates, setUpdates] = useState<StoryUpdate[] | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") setIndex((i) => i + 1);
      if (event.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setViewerId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch(
        `/api/story-updates?username=${encodeURIComponent(username)}`,
      );
      if (!response.ok || cancelled) return;
      const data: { updates: StoryUpdate[]; ownerId: string } = await response.json();
      if (!cancelled) {
        setUpdates(data.updates);
        setOwnerId(data.ownerId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  useEffect(() => {
    if (!updates || updates.length === 0) return;
    if (index >= updates.length) {
      (onNext ?? onClose)();
      return;
    }
    const timeout = setTimeout(() => setIndex((i) => i + 1), SLIDE_DURATION_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, updates]);

  const current = updates?.[index];

  const handleDelete = async () => {
    if (!current || deleting) return;
    setDeleting(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      if (current.category === "places" && current.placeId) {
        await removePlace(supabase, user.id, current.placeId);
      } else if (
        current.category !== "places" &&
        current.category !== "watchlist_transition" &&
        current.itemId != null &&
        current.mediaType
      ) {
        await removeFromCategory(supabase, current.category, user.id, current.itemId, current.mediaType);
      }
      setUpdates((prev) => (prev ?? []).filter((_, i) => i !== index));
    } finally {
      setDeleting(false);
    }
  };

  // Viewers rate a movie/tv slide directly from the story, same as anywhere
  // else -- writes go to the viewer's own lists, crediting the story owner.
  const isMovieSlide =
    current && current.category !== "places" && current.itemId != null && !!current.mediaType;
  const canRateFromStory = isMovieSlide && !allowDelete && viewerId && ownerId;

  const handleStoryLike = async () => {
    if (!current || !current.itemId || !current.mediaType || !viewerId || !ownerId) return;
    setActionPending(true);
    const supabase = createClient();
    const item = { itemId: String(current.itemId), mediaType: current.mediaType };
    await setInteractionWithCredits(supabase, viewerId, item, "like", [ownerId]);
    const { error } = await saveToCategory(
      supabase,
      "top_list",
      viewerId,
      { itemId: current.itemId, mediaType: current.mediaType, title: current.title, imageUrl: current.imageUrl, year: null },
      ownerId,
    );
    if (!error) await recordInspiredCredits(supabase, viewerId, [ownerId], item);
    setActionPending(false);
    setIndex((i) => i + 1);
  };

  const handleStoryDislike = async () => {
    if (!current || !current.itemId || !current.mediaType || !viewerId || !ownerId) return;
    setActionPending(true);
    const supabase = createClient();
    await setInteractionWithCredits(
      supabase,
      viewerId,
      { itemId: String(current.itemId), mediaType: current.mediaType },
      "dislike",
      [ownerId],
    );
    setActionPending(false);
    setIndex((i) => i + 1);
  };

  const handleStoryWatchlist = async () => {
    if (!current || !current.itemId || !current.mediaType || !viewerId || !ownerId) return;
    setActionPending(true);
    const supabase = createClient();
    const { error } = await saveToCategory(
      supabase,
      "watchlist",
      viewerId,
      { itemId: current.itemId, mediaType: current.mediaType, title: current.title, imageUrl: current.imageUrl, year: null },
      ownerId,
    );
    if (!error) {
      await recordInspiredCredits(supabase, viewerId, [ownerId], {
        itemId: String(current.itemId),
        mediaType: current.mediaType,
      });
    }
    setActionPending(false);
    setIndex((i) => i + 1);
  };

  const storyActions: ListItemRowActions = {
    variant: "rate",
    pending: actionPending,
    onLike: handleStoryLike,
    onDislike: handleStoryDislike,
    onAdd: handleStoryWatchlist,
    addLabel: "Watchlist",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={`Updates von ${username}`}
    >
      <div className="relative w-full max-w-sm h-full sm:h-[85vh] sm:rounded-lg overflow-hidden bg-neutral-900">
        {updates && updates.length > 0 && (
          <div className="absolute top-2 left-2 right-2 z-20 flex gap-1">
            {updates.map((_, i) => (
              <div key={i} className="h-0.5 flex-1 rounded-full bg-white/30 overflow-hidden">
                <div
                  className={`h-full bg-white transition-all ${
                    i < index ? "w-full" : i === index ? "w-full duration-[4000ms] ease-linear" : "w-0"
                  }`}
                />
              </div>
            ))}
          </div>
        )}

        <div className="absolute top-5 left-3 right-3 z-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link
              href={`/u/${username}`}
              onClick={onClose}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <ProfileAvatar username={username} imageUrl={null} size="sm" />
              <span className="text-sm font-medium text-white">{username}</span>
            </Link>
            {current && (
              <span className="text-xs text-white/70">{timeAgo(current.createdAt)}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {allowDelete && current && (
              <button
                type="button"
                aria-label="Update löschen"
                disabled={deleting}
                onClick={handleDelete}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50 disabled:opacity-50"
              >
                <Trash2 className="size-4" />
              </button>
            )}
            <button
              type="button"
              aria-label="Schließen"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Tap zones for prev/next, Instagram-style */}
        {updates && updates.length > 0 && (
          <>
            <button
              type="button"
              aria-label="Vorheriges Update"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              className="absolute left-0 top-0 h-full w-1/3 z-10"
            />
            <button
              type="button"
              aria-label="Nächstes Update"
              onClick={() => setIndex((i) => i + 1)}
              className="absolute right-0 top-0 h-full w-1/3 z-10"
            />
          </>
        )}

        <div className="flex h-full w-full items-center justify-center p-6">
          {!updates ? (
            <p className="text-sm text-white/70">Lädt…</p>
          ) : updates.length === 0 ? (
            <p className="text-sm text-white/70">Keine aktuellen Updates.</p>
          ) : current ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="relative w-40 aspect-[2/3] rounded-lg overflow-hidden bg-neutral-800">
                {current.imageUrl && (
                  <Image
                    src={current.imageUrl}
                    alt={current.title}
                    fill
                    sizes="160px"
                    className="object-cover"
                  />
                )}
              </div>
              <p className="text-white text-base font-medium">
                {current.message ?? (
                  <>
                    {username} hat <span className="font-semibold">{current.title}</span> zu{" "}
                    {current.categoryLabel} hinzugefügt
                  </>
                )}
              </p>
            </div>
          ) : null}
        </div>

        {canRateFromStory && (
          <div
            className="absolute bottom-5 left-3 right-3 z-30 rounded-lg bg-white/95 p-2"
            onClick={(event) => event.stopPropagation()}
          >
            <ActionBar actions={storyActions} guard={(fn) => fn()} />
          </div>
        )}
      </div>
    </div>
  );
}
