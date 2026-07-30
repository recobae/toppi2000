"use client";

import { useState } from "react";
import Image from "next/image";
import { Ban, Check, Plus } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlaceDetailModal } from "@/components/orte/place-detail-modal";
import { PlaceDetailsRow } from "@/components/orte/place-details-row";
import { PLACE_CATEGORY_ICONS, PLACE_CATEGORY_LABELS, type PlaceCategory, type PlacePriceLevel } from "@/lib/places";
import { truncateNote } from "@/lib/notes";
import type { OpeningStatus } from "@/lib/opening-hours";

export type PlaceCardData = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  photoUrl: string | null;
  googleMapsUri?: string | null;
  rating?: number | null;
  userRatingCount?: number | null;
  priceLevel?: PlacePriceLevel | null;
  phoneNumber?: string | null;
  websiteUri?: string | null;
  openingStatus?: OpeningStatus | null;
};

export function PlaceResultCard({
  place,
  isLoggedIn,
  isSaved,
  isSaving,
  onToggleSave,
  onGuestClick,
  note,
  onDislike,
}: {
  place: PlaceCardData;
  isLoggedIn: boolean;
  isSaved: boolean;
  isSaving?: boolean;
  onToggleSave: () => void;
  onGuestClick?: () => void;
  note?: string | null;
  /** "Nein" -- records a dislike (item_interactions), used on suggestion feeds. */
  onDislike?: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const Icon = PLACE_CATEGORY_ICONS[place.category];

  const handleSaveClick = () => {
    if (!isLoggedIn) {
      onGuestClick?.();
      return;
    }
    onToggleSave();
  };

  return (
    <Card className="overflow-hidden flex flex-col">
      <button
        type="button"
        onClick={() => setShowDetails(true)}
        className="relative aspect-[4/3] w-full bg-muted text-left"
        aria-label={`Details zu ${place.name} anzeigen`}
      >
        {place.photoUrl ? (
          <Image
            src={place.photoUrl}
            alt={place.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Icon className="size-8" />
          </div>
        )}
      </button>
      <CardContent className="p-3 flex-1 flex flex-col gap-1">
        <p className="text-sm font-medium leading-tight line-clamp-2">
          {place.name}
        </p>
        <span className="inline-flex w-fit items-center gap-1 text-[10px] font-medium rounded bg-secondary text-secondary-foreground px-1.5 py-0.5">
          <Icon className="size-3" />
          {PLACE_CATEGORY_LABELS[place.category]}
        </span>
        <p className="text-[11px] text-muted-foreground line-clamp-1">
          {place.address}
        </p>
        <PlaceDetailsRow
          rating={place.rating}
          userRatingCount={place.userRatingCount}
          openingStatus={place.openingStatus}
          priceLevel={place.priceLevel}
          phoneNumber={place.phoneNumber}
          websiteUri={place.websiteUri}
        />
        {note && (
          <p className="text-[11px] italic text-muted-foreground line-clamp-2">
            „{truncateNote(note)}“
          </p>
        )}
      </CardContent>
      <CardFooter className="p-3 pt-0 flex items-center gap-1.5">
        {onDislike && !isSaved && (
          <button
            type="button"
            aria-label="Nicht mein Geschmack"
            onClick={() => {
              if (!isLoggedIn) {
                onGuestClick?.();
                return;
              }
              onDislike();
            }}
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-input text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Ban className="size-4" />
          </button>
        )}
        <Button
          variant={isSaved ? "outline" : "default"}
          size="sm"
          className="flex-1"
          disabled={isSaving}
          onClick={handleSaveClick}
        >
          {isSaved ? <Check /> : <Plus />}
          {isSaved ? "Gespeichert" : "Hinzufügen"}
        </Button>
      </CardFooter>

      {showDetails && (
        <PlaceDetailModal
          name={place.name}
          address={place.address}
          category={place.category}
          photoUrl={place.photoUrl}
          lat={place.lat}
          lng={place.lng}
          googleMapsUri={place.googleMapsUri}
          rating={place.rating}
          userRatingCount={place.userRatingCount}
          priceLevel={place.priceLevel}
          phoneNumber={place.phoneNumber}
          websiteUri={place.websiteUri}
          openingStatus={place.openingStatus}
          note={note}
          onClose={() => setShowDetails(false)}
        />
      )}
    </Card>
  );
}
