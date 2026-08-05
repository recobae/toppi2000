"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Heart, Ban, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { InteractionMediaType } from "@/lib/interactions";
import { setInteractionWithCredits, removeInteractionWithCredits } from "@/lib/interaction-credits";

type FilterCategory = "movies" | "places" | "other";

const FILTERS: { key: FilterCategory; label: string }[] = [
  { key: "movies", label: "Filme & Serien" },
  { key: "places", label: "Orte" },
  { key: "other", label: "Sonstiges" },
];

// Only "movie"/"tv"/"place" exist on item_interactions today -- "other"
// matches nothing yet, kept as a real filter option for whatever media
// type lands here next instead of hardcoding just the two that exist now.
function categoryOf(mediaType: InteractionMediaType): FilterCategory {
  if (mediaType === "place") return "places";
  if (mediaType === "movie" || mediaType === "tv") return "movies";
  return "other";
}

type ActivityItem = {
  id: string;
  itemId: string;
  mediaType: InteractionMediaType;
  interactionType: "like" | "dislike";
  createdAt: string;
  title: string;
  imageUrl: string | null;
};

export default function MeineAktivitaetPage() {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<FilterCategory>("movies");

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
      // No owner ids known here -- this only ever toggles the actor's own
      // stance, it never (re-)creates new like credits for anyone.
      const { error } = await setInteractionWithCredits(
        supabase,
        user.id,
        { itemId: item.itemId, mediaType: item.mediaType },
        nextType,
      );
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
      await removeInteractionWithCredits(supabase, user.id, {
        itemId: item.itemId,
        mediaType: item.mediaType,
      });
      setItems((prev) => (prev ?? []).filter((existing) => existing.id !== item.id));
    } finally {
      setPendingId(null);
    }
  };

  const filteredItems = (items ?? []).filter((item) => categoryOf(item.mediaType) === selectedFilter);

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-4 max-w-2xl p-5 pt-8">
        {/*
          Kein eigener BackToProfileLink-Text mehr hier -- der floatende
          SiteHeader-Avatar (oben links, auf jeder Nicht-Profilseite sichtbar,
          jetzt mit Rückpfeil-Badge) deckt "zurück zum Profil" bereits ab.
          Titel zentriert, damit er nicht mit diesem Avatar kollidiert.
        */}
        <h1 className="w-full text-center font-medium text-xl">Meine Aktivität</h1>

        <div className="w-full flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setSelectedFilter(filter.key)}
              className={`shrink-0 whitespace-nowrap h-8 px-3 rounded-full border text-xs font-medium transition-colors ${
                selectedFilter === filter.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-input text-muted-foreground hover:bg-accent"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {items === null ? (
          <p className="text-sm text-muted-foreground">Lädt…</p>
        ) : filteredItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {items.length === 0
              ? "Du hast noch keine Bewertungen abgegeben."
              : "Keine Bewertungen in dieser Kategorie."}
          </p>
        ) : (
          <div className="w-full flex flex-col gap-2">
            {filteredItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-lg border p-2">
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
        )}
      </div>
    </main>
  );
}
