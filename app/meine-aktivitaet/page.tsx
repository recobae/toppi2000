"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Heart, Ban, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BackToProfileLink } from "@/components/profile/back-to-profile-link";
import { recordInteraction, removeInteraction, type InteractionMediaType } from "@/lib/interactions";

type ActivityItem = {
  id: string;
  itemId: string;
  mediaType: InteractionMediaType;
  interactionType: "like" | "dislike";
  createdAt: string;
  title: string;
  imageUrl: string | null;
};

function groupLabel(mediaType: InteractionMediaType): string {
  return mediaType === "place" ? "Orte" : "Filme & Serien";
}

export default function MeineAktivitaetPage() {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = async () => {
    const response = await fetch("/api/my-activity");
    if (!response.ok) {
      setItems([]);
      return;
    }
    const data: { items: ActivityItem[] } = await response.json();
    setItems(data.items);
  };

  useEffect(() => {
    load();
  }, []);

  const handleToggle = async (item: ActivityItem) => {
    if (pendingId) return;
    setPendingId(item.id);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const nextType = item.interactionType === "like" ? "dislike" : "like";
      const { error } = await recordInteraction(supabase, user.id, {
        itemId: item.itemId,
        mediaType: item.mediaType,
        interactionType: nextType,
      });
      if (!error) {
        setItems((prev) =>
          (prev ?? []).map((existing) =>
            existing.id === item.id ? { ...existing, interactionType: nextType } : existing,
          ),
        );
      }
    } finally {
      setPendingId(null);
    }
  };

  const handleRemove = async (item: ActivityItem) => {
    if (pendingId) return;
    setPendingId(item.id);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await removeInteraction(supabase, user.id, item.itemId, item.mediaType);
      if (!error) {
        setItems((prev) => (prev ?? []).filter((existing) => existing.id !== item.id));
      }
    } finally {
      setPendingId(null);
    }
  };

  const groups = new Map<InteractionMediaType, ActivityItem[]>();
  for (const item of items ?? []) {
    const key: InteractionMediaType = item.mediaType === "place" ? "place" : "movie";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-6 max-w-2xl p-5 pt-8">
        <div className="w-full flex flex-col gap-2">
          <BackToProfileLink />
          <h1 className="font-medium text-xl">Meine Aktivität</h1>
        </div>

        {items === null ? (
          <p className="text-sm text-muted-foreground">Lädt…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Du hast noch keine Bewertungen abgegeben.
          </p>
        ) : (
          [...groups.entries()].map(([mediaType, groupItems]) => (
            <div key={mediaType} className="w-full flex flex-col gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                {groupLabel(mediaType)}
              </h2>
              <div className="w-full flex flex-col gap-2">
                {groupItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg border p-2"
                  >
                    <div className="relative w-10 aspect-[2/3] shrink-0 rounded overflow-hidden bg-muted">
                      {item.imageUrl && (
                        <Image
                          src={item.imageUrl}
                          alt={item.title}
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <p className="flex-1 min-w-0 text-sm font-medium leading-tight line-clamp-2">
                      {item.title}
                    </p>
                    <button
                      type="button"
                      disabled={pendingId === item.id}
                      onClick={() => handleToggle(item)}
                      aria-label={
                        item.interactionType === "like"
                          ? "Zu Nicht gemocht ändern"
                          : "Zu Gefällt mir ändern"
                      }
                      className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ${
                        item.interactionType === "like"
                          ? "border-green-600 text-green-600"
                          : "border-destructive text-destructive"
                      }`}
                    >
                      {item.interactionType === "like" ? (
                        <Heart className="size-4 fill-current" />
                      ) : (
                        <Ban className="size-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={pendingId === item.id}
                      onClick={() => handleRemove(item)}
                      aria-label="Bewertung entfernen"
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-input text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
