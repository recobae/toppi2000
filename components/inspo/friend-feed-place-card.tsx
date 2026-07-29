"use client";

import { useState } from "react";
import Image from "next/image";
import { Ban, Check, Heart, SkipForward } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PLACE_CATEGORY_ICONS, PLACE_CATEGORY_LABELS, type PlaceCategory } from "@/lib/places";

export type FriendFeedPlaceItem = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  photoUrl: string | null;
  regionName: string;
  addedAt: string;
  recommended: { count: number; names: string[]; userIds: string[] };
  liked: { count: number; names: string[]; userIds: string[] };
  disliked: { count: number; names: string[]; userIds: string[] };
};

function AttributionLine({
  label,
  group,
  className,
}: {
  label: string;
  group: { count: number; names: string[] };
  className?: string;
}) {
  if (group.count === 0) return null;
  return (
    <p className={`text-[11px] text-muted-foreground ${className ?? ""}`}>
      <span className="font-medium text-foreground">{label}:</span> {group.names.join(", ")}
    </p>
  );
}

export function FriendFeedPlaceCard({
  item,
  isLoggedIn,
  onInteraction,
  onUebernehmen,
  onGuestClick,
}: {
  item: FriendFeedPlaceItem;
  isLoggedIn: boolean;
  onInteraction: (type: "like" | "dislike" | "skip") => void;
  onUebernehmen: () => void;
  onGuestClick: () => void;
}) {
  const [pending, setPending] = useState(false);
  const Icon = PLACE_CATEGORY_ICONS[item.category];

  const guarded = (fn: () => void) => {
    if (!isLoggedIn) {
      onGuestClick();
      return;
    }
    fn();
  };

  const handleInteraction = (type: "like" | "dislike" | "skip") => {
    if (pending) return;
    setPending(true);
    onInteraction(type);
  };

  return (
    <Card className="overflow-hidden flex gap-3 p-3">
      <div className="relative w-16 aspect-[4/3] shrink-0 rounded-md overflow-hidden bg-muted">
        {item.photoUrl ? (
          <Image src={item.photoUrl} alt={item.name} fill sizes="64px" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Icon className="size-5" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <p className="text-sm font-medium leading-tight line-clamp-2">{item.name}</p>
        <span className="inline-flex w-fit items-center gap-1 text-[10px] font-medium rounded bg-secondary text-secondary-foreground px-1.5 py-0.5">
          <Icon className="size-3" />
          {PLACE_CATEGORY_LABELS[item.category]} · {item.regionName}
        </span>
        <AttributionLine label="Empfohlen von" group={item.recommended} />
        <AttributionLine label="Geliked von" group={item.liked} className="text-green-600" />
        <AttributionLine label="Nicht gemocht von" group={item.disliked} className="text-destructive" />

        <div className="mt-auto pt-2 flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Gefällt mir"
            disabled={pending}
            onClick={() => guarded(() => handleInteraction("like"))}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-input text-green-600 hover:bg-green-600/10 transition-colors disabled:opacity-50"
          >
            <Heart className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Nicht mein Geschmack"
            disabled={pending}
            onClick={() => guarded(() => handleInteraction("dislike"))}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-input text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
          >
            <Ban className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Überspringen"
            disabled={pending}
            onClick={() => guarded(() => handleInteraction("skip"))}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-input text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            <SkipForward className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => guarded(onUebernehmen)}
            className="ml-auto flex items-center gap-1 h-8 px-2.5 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Check className="size-3.5" />
            Übernehmen
          </button>
        </div>
      </div>
    </Card>
  );
}
