"use client";

import { useEffect } from "react";
import Image from "next/image";
import { ExternalLink, X } from "lucide-react";
import { PLACE_CATEGORY_ICONS, PLACE_CATEGORY_LABELS, type PlaceCategory } from "@/lib/places";

export function PlaceDetailModal({
  name,
  address,
  category,
  photoUrl,
  lat,
  lng,
  note,
  onClose,
}: {
  name: string;
  address: string;
  category: PlaceCategory;
  photoUrl: string | null;
  lat: number;
  lng: number;
  note?: string | null;
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

  const Icon = PLACE_CATEGORY_ICONS[category];
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={name}
    >
      <div
        className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-lg bg-background border p-4 flex flex-col gap-4"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Schließen"
          onClick={onClose}
          className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
        >
          <X className="size-4" />
        </button>

        <div className="flex gap-3 pr-8">
          <div className="relative w-24 aspect-[4/3] shrink-0 rounded-md overflow-hidden bg-muted">
            {photoUrl ? (
              <Image src={photoUrl} alt={name} fill sizes="96px" className="object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Icon className="size-6" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5 min-w-0">
            <p className="text-sm font-semibold leading-tight">{name}</p>
            <span className="inline-flex w-fit items-center gap-1 rounded bg-secondary text-secondary-foreground px-1.5 py-0.5 text-[10px] font-medium">
              <Icon className="size-3" />
              {PLACE_CATEGORY_LABELS[category]}
            </span>
            <p className="text-xs text-muted-foreground">{address}</p>
          </div>
        </div>

        {note && (
          <p className="text-sm italic text-muted-foreground">„{note}“</p>
        )}

        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-md border border-input text-sm font-medium px-4 py-2 hover:bg-accent transition-colors min-h-11"
        >
          <ExternalLink className="size-4" />
          In Google Maps öffnen
        </a>
      </div>
    </div>
  );
}
