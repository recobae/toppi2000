import { Globe, Phone, Star } from "lucide-react";
import { PRICE_LEVEL_LABELS, type PlacePriceLevel } from "@/lib/places";
import type { OpeningStatus } from "@/lib/opening-hours";

export function PlaceDetailsRow({
  rating,
  userRatingCount,
  openingStatus,
  priceLevel,
  phoneNumber,
  websiteUri,
  size = "compact",
}: {
  rating?: number | null;
  userRatingCount?: number | null;
  openingStatus?: OpeningStatus | null;
  priceLevel?: PlacePriceLevel | null;
  phoneNumber?: string | null;
  websiteUri?: string | null;
  size?: "compact" | "default";
}) {
  const hasContent =
    rating != null || openingStatus != null || priceLevel != null || phoneNumber || websiteUri;
  if (!hasContent) return null;

  const textSize = size === "compact" ? "text-[11px]" : "text-xs";
  const iconSize = size === "compact" ? "size-3" : "size-3.5";

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${textSize} text-muted-foreground`}>
      {rating != null && (
        <span className="inline-flex items-center gap-0.5 font-medium text-foreground">
          <Star className={`${iconSize} fill-current text-yellow-500`} />
          {rating.toFixed(1)}
          {userRatingCount != null && (
            <span className="font-normal text-muted-foreground">
              ({userRatingCount.toLocaleString("de-DE")})
            </span>
          )}
        </span>
      )}
      {openingStatus && (
        <span
          className={
            openingStatus.openNow ? "text-green-600" : "text-destructive"
          }
        >
          {openingStatus.openNow ? "Jetzt geöffnet" : "Geschlossen"}
          {openingStatus.changeLabel && ` · ${openingStatus.changeLabel}`}
        </span>
      )}
      {priceLevel && <span>{PRICE_LEVEL_LABELS[priceLevel]}</span>}
      {phoneNumber && (
        <a
          href={`tel:${phoneNumber}`}
          onClick={(event) => event.stopPropagation()}
          aria-label="Anrufen"
          className="inline-flex items-center justify-center rounded p-0.5 hover:text-foreground hover:bg-accent transition-colors"
        >
          <Phone className={iconSize} />
        </a>
      )}
      {websiteUri && (
        <a
          href={websiteUri}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          aria-label="Website öffnen"
          className="inline-flex items-center justify-center rounded p-0.5 hover:text-foreground hover:bg-accent transition-colors"
        >
          <Globe className={iconSize} />
        </a>
      )}
    </div>
  );
}
